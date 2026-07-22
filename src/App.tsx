/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { WalletProvider, useSolanaWallet } from './components/WalletProvider';
import Disclaimer, { DisclaimerCard } from './components/Disclaimer';
import CoinPicker from './components/CoinPicker';
import ConvertModal from './components/ConvertModal';
import AllocationView from './components/AllocationView';
import PriceView from './components/PriceView';
import HistoryView from './components/HistoryView';
import ConfirmModal from './components/ConfirmModal';
import { PRESETS, Preset } from './presets';
import PresetVerifier from './components/PresetVerifier';
import TokenLogo from './components/TokenLogo';
import { Token, TokenBalance, BalanceSnapshot, LinkGroup, getGroupColorClasses, formatPrice, COIN_METADATA, DEFAULT_POPULAR_MINTS } from './types';
import { fetchPricesAndInfo, fetchQuote } from './jupiter';
import {
  Wallet,
  Settings,
  Plus,
  RefreshCw,
  ShieldCheck,
  TrendingUp,
  Sliders,
  Sparkles,
  Info,
  ChevronDown,
  Trash2,
  ArrowRight,
  CheckCircle2,
  Loader2,
  AlertTriangle,
  Coins,
  ArrowLeft,
  Check,
  Layers,
  Sparkle,
  MoreVertical,
  Lock,
  X
} from 'lucide-react';

const getNextGroupColor = (activeGroups: LinkGroup[]): string => {
  const colors = ['violet', 'amber', 'sky', 'rose', 'lime'];
  const usedColors = activeGroups.map((g) => g.color);
  const freeColor = colors.find((c) => !usedColors.includes(c));
  if (freeColor) return freeColor;
  return colors[activeGroups.length % colors.length];
};

const STANDARD_PUBLIC_RPCS = [
  'https://api.mainnet-beta.solana.com',
  'https://rpc.ankr.com/solana',
  'https://solana.public-rpc.com',
  'https://api.turing.solana.com'
];

function Dashboard() {
  const {
    publicKey,
    type,
    connected,
    connecting,
    balances,
    connect,
    disconnect,
    refreshBalances,
    signAndExecuteSwap,
    closeEmptyAccount,
    convertToSol,
    getRentSol,
    getRentSolString,
    rpcUrl,
    setRpcUrl,
    slippageBps,
    setSlippageBps,
  } = useSolanaWallet();

  const [rpcWarningDismissed, setRpcWarningDismissed] = useState<boolean>(() => {
    return localStorage.getItem('roundtrip_rpc_warning_dismissed') === 'true';
  });

  // Confirm Action Modal for Rent Reclaim and Convert to SOL
  const [confirmActionModal, setConfirmActionModal] = useState<{
    isOpen: boolean;
    type: 'close_empty' | 'convert_sol' | 'burn_close' | null;
    item: TokenBalance | null;
    title: string;
    message: string;
    confirmText: string;
    cancelText?: string;
    isScary?: boolean;
  }>({
    isOpen: false,
    type: null,
    item: null,
    title: '',
    message: '',
    confirmText: 'Confirm',
  });

  const [actionStatusMsg, setActionStatusMsg] = useState<string | null>(null);

  const handleOpenCloseEmptyModal = (item: TokenBalance) => {
    const rentSolStr = getRentSolString(item.mint);
    setConfirmActionModal({
      isOpen: true,
      type: 'close_empty',
      item,
      title: 'Reclaim rent?',
      message: `This will close your empty ${item.symbol} token account and return ~${rentSolStr} SOL rent to your wallet.`,
      confirmText: 'Reclaim Rent',
      cancelText: 'Cancel',
      isScary: false,
    });
  };

  const handleInitiateConvert = async (item: TokenBalance) => {
    const rentSolStr = getRentSolString(item.mint);
    const SOL_MINT = 'So11111111111111111111111111111111111111112';

    setActionStatusMsg(`Checking market route for ${item.symbol}...`);
    try {
      const quote = await fetchQuote({
        inputMint: item.mint,
        outputMint: SOL_MINT,
        amount: item.amount.toString(),
        slippageBps,
      });

      if (quote && quote.outAmount && parseInt(quote.outAmount, 10) > 0) {
        setConfirmActionModal({
          isOpen: true,
          type: 'convert_sol',
          item,
          title: `Convert ${item.symbol} to SOL?`,
          message: `This will sell your full ${item.symbol} balance (${item.amountHuman.toLocaleString(undefined, { maximumFractionDigits: 6 })} units, ~$${item.usdValue.toFixed(2)}) for SOL via Jupiter, and then close the emptied token account to also return ~${rentSolStr} SOL rent to your wallet.`,
          confirmText: 'Convert & Reclaim Rent',
          cancelText: 'Cancel',
          isScary: false,
        });
      } else {
        setConfirmActionModal({
          isOpen: true,
          type: 'burn_close',
          item,
          title: `Burn & close ${item.symbol}?`,
          message: `⚠️ WARNING: No swap route was found for ${item.symbol} (~$${item.usdValue.toFixed(2)} value). Proceeding will PERMANENTLY DESTROY your ${item.amountHuman.toLocaleString(undefined, { maximumFractionDigits: 6 })} ${item.symbol} tokens and close the account to recover ~${rentSolStr} SOL rent.`,
          confirmText: 'Burn Tokens & Reclaim Rent',
          cancelText: 'Cancel',
          isScary: true,
        });
      }
    } catch (err) {
      setConfirmActionModal({
        isOpen: true,
        type: 'burn_close',
        item,
        title: `Burn & close ${item.symbol}?`,
        message: `⚠️ WARNING: No swap route was found for ${item.symbol} (~$${item.usdValue.toFixed(2)} value). Proceeding will PERMANENTLY DESTROY your ${item.amountHuman.toLocaleString(undefined, { maximumFractionDigits: 6 })} ${item.symbol} tokens and close the account to recover ~${rentSolStr} SOL rent.`,
        confirmText: 'Burn Tokens & Reclaim Rent',
        cancelText: 'Cancel',
        isScary: true,
      });
    } finally {
      setActionStatusMsg(null);
    }
  };

  const handleExecuteActionModal = async () => {
    const { type, item } = confirmActionModal;
    if (!item || !type) return;

    setConfirmActionModal((prev) => ({ ...prev, isOpen: false }));
    setActionStatusMsg(`Executing on-chain transaction for ${item.symbol}...`);

    try {
      if (type === 'close_empty') {
        const txId = await closeEmptyAccount(item.mint);
        setConvertSuccessMessage(`Successfully closed empty ${item.symbol} account and reclaimed ~${getRentSolString(item.mint)} SOL rent!`);
      } else if (type === 'convert_sol' || type === 'burn_close') {
        const res = await convertToSol(item.mint, item.decimals || 6);
        if (res.action === 'swap') {
          setConvertSuccessMessage(`Successfully converted ${item.symbol} to SOL and reclaimed account rent!`);
        } else {
          setConvertSuccessMessage(`Burned worthless ${item.symbol} tokens and reclaimed ~${getRentSolString(item.mint)} SOL rent!`);
        }
      }
      await refreshPrices();
    } catch (err: any) {
      console.error('Action failed:', err);
      setConvertSuccessMessage(`Action failed: ${err.message || 'Transaction rejected or failed on-chain.'}`);
    } finally {
      setActionStatusMsg(null);
      setTimeout(() => setConvertSuccessMessage(null), 5000);
    }
  };

  // Active namespace tracking
  const activeNamespace = publicKey || 'guest';
  const [hydratedNamespace, setHydratedNamespace] = useState<string | null>(null);

  // Multi-group state
  const [groups, setGroups] = useState<LinkGroup[]>([]);

  // Scoreboard snapshots (historical ledger)
  const [snapshots, setSnapshots] = useState<BalanceSnapshot[]>([]);

  // Load and migrate groups and snapshots for activeNamespace
  useEffect(() => {
    const ns = activeNamespace;
    let loadedGroups: LinkGroup[] = [];
    let loadedSnapshots: BalanceSnapshot[] = [];

    const savedGroupsKey = `roundtrip_link_groups__${ns}`;
    const savedGroups = localStorage.getItem(savedGroupsKey);

    if (savedGroups) {
      try {
        const parsed = JSON.parse(savedGroups);
        if (Array.isArray(parsed)) {
          loadedGroups = parsed;
        }
      } catch (e) {}

      // Load snapshots for this namespace
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith(`roundtrip_snapshots__${ns}__`)) {
          const saved = localStorage.getItem(key);
          if (saved) {
            try {
              const parsed = JSON.parse(saved);
              if (Array.isArray(parsed)) {
                parsed.forEach((item) => {
                  if (item && typeof item === 'object') {
                    loadedSnapshots.push(item);
                  }
                });
              }
            } catch (e) {}
          }
        }
      }
    } else {
      // No groups exist for this namespace.
      // Case A: A real wallet is connected, and we can check if we should adopt "guest" groups
      if (ns !== 'guest') {
        const guestGroupsKey = `roundtrip_link_groups__guest`;
        const guestGroupsStr = localStorage.getItem(guestGroupsKey);
        
        if (guestGroupsStr) {
          try {
            const parsedGuestGroups = JSON.parse(guestGroupsStr);
            if (Array.isArray(parsedGuestGroups) && parsedGuestGroups.length > 0) {
              loadedGroups = parsedGuestGroups;
              
              // Move snapshots from guest to real wallet namespace
              for (let i = 0; i < localStorage.length; i++) {
                const key = localStorage.key(i);
                if (key && key.startsWith(`roundtrip_snapshots__guest__`)) {
                  const saved = localStorage.getItem(key);
                  if (saved) {
                    try {
                      const parsed = JSON.parse(saved);
                      if (Array.isArray(parsed)) {
                        parsed.forEach((item) => {
                          if (item && typeof item === 'object') {
                            loadedSnapshots.push(item);
                          }
                        });
                      }
                    } catch (e) {}
                    // Delete guest snapshot key
                    localStorage.removeItem(key);
                  }
                }
              }
              
              // Clear guest groups
              localStorage.removeItem(guestGroupsKey);
              console.log(`Adopted guest groups into wallet ${ns}`);
            }
          } catch (e) {}
        }
      }

      // Case B: If still empty (e.g. no guest groups or it was guest namespace),
      // check for legacy migration (for whichever namespace is currently active,
      // e.g., if a user loads the app with or without connected wallet).
      if (loadedGroups.length === 0) {
        const legacyGroupsStr = localStorage.getItem('roundtrip_link_groups');
        if (legacyGroupsStr) {
          try {
            const parsedLegacyGroups = JSON.parse(legacyGroupsStr);
            if (Array.isArray(parsedLegacyGroups) && parsedLegacyGroups.length > 0) {
              loadedGroups = parsedLegacyGroups;
              
              // Move legacy snapshots: keys starts with 'roundtrip_snapshots_' (but not 'roundtrip_snapshots__')
              const legacySnapshotKeys: string[] = [];
              for (let i = 0; i < localStorage.length; i++) {
                const key = localStorage.key(i);
                if (key && key.startsWith('roundtrip_snapshots_') && !key.startsWith('roundtrip_snapshots__')) {
                  legacySnapshotKeys.push(key);
                }
              }

              legacySnapshotKeys.forEach((key) => {
                const saved = localStorage.getItem(key);
                if (saved) {
                  try {
                    const parsed = JSON.parse(saved);
                    if (Array.isArray(parsed)) {
                      parsed.forEach((item) => {
                        if (item && typeof item === 'object') {
                          loadedSnapshots.push(item);
                        }
                      });
                    }
                  } catch (e) {}
                  
                  // Clean up legacy snapshot keys
                  localStorage.removeItem(key);
                }
              });

              // Clean up legacy roundtrip_snapshots
              localStorage.removeItem('roundtrip_snapshots');
              // Clean up legacy link groups
              localStorage.removeItem('roundtrip_link_groups');
              console.log(`Migrated legacy groups into namespace ${ns}`);
            }
          } catch (e) {}
        }
      }
    }

    // Deduplicate and assign snapshot IDs
    const seenIds = new Set<string>();
    const finalSnapshots: BalanceSnapshot[] = [];
    loadedSnapshots.forEach((snap) => {
      if (snap && typeof snap === 'object') {
        if (!snap.id || seenIds.has(snap.id)) {
          snap.id = `Snapshot_${snap.timestamp || Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
        }
        seenIds.add(snap.id);
        finalSnapshots.push(snap);
      }
    });

    // Update states
    setGroups(loadedGroups);
    setSnapshots(finalSnapshots);
    
    // Set the loaded namespace state
    setHydratedNamespace(ns);
  }, [activeNamespace]);

  // Master Token metadata dictionary (mint -> Token)
  const [tokenMetadata, setTokenMetadata] = useState<Record<string, Token>>(() => {
    const initial: Record<string, Token> = {};
    Object.entries(COIN_METADATA).forEach(([mint, meta]) => {
      initial[mint] = {
        address: mint,
        symbol: meta.symbol,
        name: meta.name,
        decimals: meta.decimals,
        logoURI: meta.logoURI,
      };
    });
    return initial;
  });
  const attemptedMintsRef = useRef<Set<string>>(new Set());
  const [prices, setPrices] = useState<Record<string, { price: number; change24h: number }>>({});
  const [loadingPrices, setLoadingPrices] = useState(false);

  // Nav routing states
  const [activeTab, setActiveTab] = useState<'wallet' | 'prices' | 'history'>('wallet');
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null); // Null means Screen 1, otherwise active Screen 2
  const [linkingGroupId, setLinkingGroupId] = useState<string | null>(null); // Group currently in Direct Link Mode
  const [showHiddenTokens, setShowHiddenTokens] = useState(false);

  // Group creation state
  const [newGroupName, setNewGroupName] = useState('');
  const [showCreateGroup, setShowCreateGroup] = useState(false);
  const [groupToDelete, setGroupToDelete] = useState<LinkGroup | null>(null);

  // Modals overlays
  const [showConvertModal, setShowConvertModal] = useState(false);
  const [selectedPreset, setSelectedPreset] = useState<Preset | null>(null);
  const [showRpcSettings, setShowRpcSettings] = useState(false);
  const [showDisclaimerBanner, setShowDisclaimerBanner] = useState(true);

  // In-app interactive messages/modals replacing window popup/alerts
  const [convertSuccessMessage, setConvertSuccessMessage] = useState<string | null>(null);
  const [showLandingSuccess, setShowLandingSuccess] = useState<string | null>(null);
  const [pendingConfirmMove, setPendingConfirmMove] = useState<{
    mint: string;
    fromGroup: LinkGroup;
    toGroup: LinkGroup;
  } | null>(null);

  const [openMenuMint, setOpenMenuMint] = useState<string | null>(null);

  // Persist link groups for active namespace
  useEffect(() => {
    const ns = activeNamespace;
    if (hydratedNamespace !== activeNamespace) {
      // Race protection: skip saving if current in-memory state hasn't been loaded for the active namespace yet.
      return;
    }
    try {
      localStorage.setItem(`roundtrip_link_groups__${ns}`, JSON.stringify(groups));
    } catch (err) {
      console.warn('Failed to save link groups to localStorage:', err);
    }
  }, [groups, activeNamespace, hydratedNamespace]);

  // Persist snapshots for active namespace
  useEffect(() => {
    const ns = activeNamespace;
    if (hydratedNamespace !== activeNamespace) {
      // Race protection: skip saving if current in-memory state hasn't been loaded for the active namespace yet.
      return;
    }

    // Group snapshots by groupId
    const grouped: Record<string, BalanceSnapshot[]> = {};
    snapshots.forEach((s) => {
      if (s && s.groupId) {
        if (!grouped[s.groupId]) grouped[s.groupId] = [];
        grouped[s.groupId].push(s);
      }
    });

    const prunedSnapshotsList: BalanceSnapshot[] = [];
    
    // Process and prune each group
    Object.entries(grouped).forEach(([gId, snaps]) => {
      // Sort chronologically (oldest to newest)
      const sortedSnaps = [...snaps].sort((a, b) => a.timestamp - b.timestamp);
      // Keep only the latest 30 snapshots per group to avoid filling up localStorage
      const prunedSnaps = sortedSnaps.slice(-30);
      prunedSnapshotsList.push(...prunedSnaps);

      try {
        localStorage.setItem(`roundtrip_snapshots__${ns}__${gId}`, JSON.stringify(prunedSnaps));
      } catch (err) {
        console.warn(`Failed to save snapshots for group ${gId} due to quota limit:`, err);
        // Fallback: prune even more aggressively to keep the app working
        try {
          const aggressivePrune = prunedSnaps.slice(-10);
          localStorage.setItem(`roundtrip_snapshots__${ns}__${gId}`, JSON.stringify(aggressivePrune));
        } catch (innerErr) {
          console.error(`Failed to save snapshots for group ${gId} even with aggressive pruning:`, innerErr);
        }
      }
    });

    // Sync state if we pruned some snapshots
    if (prunedSnapshotsList.length < snapshots.length) {
      setSnapshots(prunedSnapshotsList);
    }

    // Clean up empty/obsolete keys for this namespace
    const activeGroupIds = new Set(
      prunedSnapshotsList
        .filter((s) => s && s.groupId)
        .map((s) => s.groupId)
    );
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const key = localStorage.key(i);
      if (key && key.startsWith(`roundtrip_snapshots__${ns}__`)) {
        const gId = key.replace(`roundtrip_snapshots__${ns}__`, '');
        if (!activeGroupIds.has(gId)) {
          localStorage.removeItem(key);
        }
      }
    }
  }, [snapshots, activeNamespace, hydratedNamespace]);

  // Monitor membership changes (coin added/removed/moved) to fire snapshots automatically
  const prevGroupsRef = useRef<LinkGroup[]>(groups);
  useEffect(() => {
    const prevGroups = prevGroupsRef.current;
    
    groups.forEach((grp) => {
      const prevGrp = prevGroups.find((g) => g.id === grp.id);
      
      const triggerMembershipSnapshot = (targetGrp: LinkGroup) => {
        const grpBalances = targetGrp.memberMints.map((mint) => {
          const meta = tokenMetadata[mint] || { symbol: mint.substring(0, 4), decimals: 9 };
          const priceInfo = prices[mint] || { price: 0, change24h: 0 };
          const rawBalance = balances[mint] || 0;
          const amountHuman = rawBalance / Math.pow(10, meta.decimals || 9);
          const usdValue = amountHuman * priceInfo.price;
          
          return {
            mint,
            symbol: meta.symbol,
            decimals: meta.decimals || 9,
            amount: rawBalance,
            amountHuman,
            price: priceInfo.price,
            usdValue,
            currentWeight: 0,
            targetWeight: 0,
            drift: 0,
            change24h: priceInfo.change24h,
          };
        });
        
        const grpTotalUsd = grpBalances.reduce((sum, b) => sum + b.usdValue, 0);
        handleSaveSnapshot(targetGrp.id, targetGrp.name, grpBalances, grpTotalUsd, 'membership');
      };

      if (!prevGrp) {
        // New group with member mints
        if (grp.memberMints.length > 0) {
          triggerMembershipSnapshot(grp);
        }
      } else {
        const prevMints = [...prevGrp.memberMints].sort().join(',');
        const currMints = [...grp.memberMints].sort().join(',');
        if (prevMints !== currMints) {
          // Membership changed (added/removed/moved)
          triggerMembershipSnapshot(grp);
        }
      }
    });

    prevGroupsRef.current = groups;
  }, [groups, tokenMetadata, prices, balances]);

  const handleCreateGroup = () => {
    if (!newGroupName.trim()) return;
    const nextColor = getNextGroupColor(groups);
    const newGroup: LinkGroup = {
      id: 'group_' + Date.now(),
      name: newGroupName.trim(),
      color: nextColor,
      memberMints: [],
    };
    setGroups((prev) => [...prev, newGroup]);
    setNewGroupName('');
    setShowCreateGroup(false);
    setLinkingGroupId(newGroup.id);
  };

  // Master Token metadata initializer
  useEffect(() => {
    async function syncMetadata() {
      const map: Record<string, Token> = {};

      // Set fallback known presets
      for (const key of Object.keys(COIN_METADATA)) {
        map[key] = {
          address: key,
          symbol: COIN_METADATA[key].symbol,
          name: COIN_METADATA[key].name,
          decimals: COIN_METADATA[key].decimals,
          logoURI: COIN_METADATA[key].logoURI,
        };
      }

      // Sync verified token list in background
      try {
        const { fetchVerifiedTokens } = await import('./jupiter');
        const verified = await fetchVerifiedTokens();
        for (const vt of verified) {
          map[vt.address] = {
            ...map[vt.address],
            ...vt,
          };
        }
      } catch (err) {
        console.error('Failed to query Jupiter verified registry:', err);
      }

      setTokenMetadata(map);
    }
    syncMetadata();
  }, []);

  // Load missing token metadata dynamically from Jupiter Token API
  useEffect(() => {
    const groupMints = groups.flatMap((g) => g.memberMints);
    const balanceMints = Object.keys(balances).filter((m) => (balances[m] || 0) > 0);
    const allMints = Array.from(new Set([...groupMints, ...balanceMints]));
    
    const missingMints = allMints.filter(
      (mint) => (!tokenMetadata[mint] || tokenMetadata[mint].decimals === undefined) && !attemptedMintsRef.current.has(mint)
    );

    if (missingMints.length === 0) return;

    // Mark missing mints as attempted immediately to avoid concurrent/infinite repeat fetches
    missingMints.forEach(mint => attemptedMintsRef.current.add(mint));

    let active = true;
    async function loadMissing() {
      const { fetchTokenMetadata } = await import('./jupiter');
      const fetchedMeta: Record<string, Token> = {};
      
      await Promise.all(
        missingMints.map(async (mint) => {
          try {
            const meta = await fetchTokenMetadata(mint);
            if (meta && active) {
              fetchedMeta[mint] = meta;
            } else if (active) {
              fetchedMeta[mint] = {
                address: mint,
                symbol: mint.slice(0, 4).toUpperCase(),
                name: 'Unknown Token',
                decimals: 9
              };
            }
          } catch (err) {
            console.error(`Failed to load dynamic metadata for ${mint}:`, err);
            if (active) {
              fetchedMeta[mint] = {
                address: mint,
                symbol: mint.slice(0, 4).toUpperCase(),
                name: 'Unknown Token',
                decimals: 9
              };
            }
          }
        })
      );

      if (active && Object.keys(fetchedMeta).length > 0) {
        setTokenMetadata((prev) => ({
          ...prev,
          ...fetchedMeta,
        }));
      }
    }

    loadMissing();
    return () => {
      active = false;
    };
  }, [groups, balances, tokenMetadata]);

  const groupMintsJoined = groups.flatMap((g) => g.memberMints).sort().join(',');
  const balanceMintsJoined = Object.keys(balances)
    .filter((m) => (balances[m] || 0) > 0)
    .sort()
    .join(',');

  // Prices syncer
  const refreshPrices = useCallback(async () => {
    const groupMints = groupMintsJoined ? groupMintsJoined.split(',') : [];
    const balanceMints = balanceMintsJoined ? balanceMintsJoined.split(',') : [];
    const popularMints = DEFAULT_POPULAR_MINTS;
    const indexMints = [
      'cbbtcf3aa214zXHbiAZQwf4122FBYbraNdFqgw4iMij',
      '7vfCXTUXx5WJV5JADk17DUJ4ksgau7utNKj4b963voxs',
      'So11111111111111111111111111111111111111112'
    ];
    const allMints = Array.from(new Set([...groupMints, ...balanceMints, ...popularMints, ...indexMints]));

    if (allMints.length === 0) return;
    setLoadingPrices(true);
    try {
      const fetched = await fetchPricesAndInfo(allMints);
      setPrices((prev) => ({
        ...prev,
        ...fetched,
      }));
    } catch (e) {
      console.error('Failed to sync market rates:', e);
    } finally {
      setLoadingPrices(false);
    }
  }, [balanceMintsJoined, groupMintsJoined]);

  // Handle wallet load
  useEffect(() => {
    if (connected) {
      refreshBalances();
      refreshPrices();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connected, groupMintsJoined, balanceMintsJoined]);

  // Auto-refresh rate ticker every 40 seconds when connected
  useEffect(() => {
    if (!connected) return;
    const interval = setInterval(() => {
      refreshPrices();
    }, 40000);
    return () => clearInterval(interval);
  }, [connected, refreshPrices]);

  // Auto-refresh rate ticker every 40 seconds when disconnected (to show live index teaser)
  useEffect(() => {
    if (connected) return;
    refreshPrices(); // initial landing load
    const interval = setInterval(() => {
      refreshPrices();
    }, 40000);
    return () => clearInterval(interval);
  }, [connected, refreshPrices]);

  // Global calculations
  const getWalletBalances = (): TokenBalance[] => {
    const balanceMints = Object.keys(balances).filter((mint) => balances[mint] !== undefined && balances[mint] !== null);

    return balanceMints.map((mint) => {
      const meta = tokenMetadata[mint];
      const priceInfo = prices[mint] || { price: 0, change24h: 0 };
      const rawBalance = balances[mint] || 0;

      if (!meta || meta.decimals === undefined) {
        return {
          mint,
          symbol: meta?.symbol || mint.substring(0, 4) + '...',
          decimals: undefined as any,
          amount: rawBalance,
          amountHuman: 0,
          price: priceInfo.price,
          usdValue: 0,
          currentWeight: 0,
          targetWeight: 0,
          drift: 0,
          change24h: priceInfo.change24h,
          loadingMetadata: true,
        };
      }

      const amountHuman = rawBalance / Math.pow(10, meta.decimals);
      const usdValue = amountHuman * priceInfo.price;

      return {
        mint,
        symbol: meta.symbol,
        decimals: meta.decimals,
        amount: rawBalance,
        amountHuman,
        price: priceInfo.price,
        usdValue,
        currentWeight: 0,
        targetWeight: 0,
        drift: 0,
        change24h: priceInfo.change24h,
      };
    });
  };

  const walletBalances = getWalletBalances();
  const totalWalletValue = walletBalances.reduce((sum, item) => sum + item.usdValue, 0);

  const isVerifiedCoin = (mint: string) => {
    if (COIN_METADATA[mint]) return true;
    const meta = tokenMetadata[mint];
    if (meta && meta.tags && meta.tags.includes('verified')) return true;
    return false;
  };

  // Group allocations mapping
  const getGroupStats = (g: LinkGroup) => {
    const members = g.memberMints;
    const items = members.map((mint) => {
      const meta = tokenMetadata[mint];
      if (!meta || meta.decimals === undefined) return 0;
      const priceInfo = prices[mint] || { price: 0 };
      const rawBalance = balances[mint] || 0;
      const amountHuman = rawBalance / Math.pow(10, meta.decimals);
      return amountHuman * priceInfo.price;
    });

    const totalGroupUsd = items.reduce((sum, val) => sum + val, 0);
    const targetWeight = members.length > 0 ? 100 / members.length : 0;

    let maxDrift = 0;
    members.forEach((mint, i) => {
      const meta = tokenMetadata[mint];
      if (!meta || meta.decimals === undefined) return;
      const usdVal = items[i];
      const currentWeight = totalGroupUsd > 0 ? (usdVal / totalGroupUsd) * 100 : 0;
      const drift = Math.abs(currentWeight - targetWeight);
      if (drift > maxDrift) {
        maxDrift = drift;
      }
    });

    return {
      totalUsd: totalGroupUsd,
      maxDrift,
      isRebalanceAdvisable: maxDrift >= 5.0,
    };
  };

  const totalLinkedValue = groups.reduce((sum, g) => sum + getGroupStats(g).totalUsd, 0);
  const unlinkedInventoryValue = Math.max(0, totalWalletValue - totalLinkedValue);

  // Group Details router resolver
  const activeGroup = groups.find((g) => g.id === selectedGroupId);

  // Save scoreboard snapshot logging
  const handleSaveSnapshot = (
    groupId: string,
    groupName: string,
    snapshotBalances: TokenBalance[],
    totalUsd: number,
    eventType: 'convert' | 'rebalance' | 'cashout' | 'membership' | 'manual' = 'manual'
  ) => {
    const newSnapshot: BalanceSnapshot = {
      id: 'Snapshot_' + Date.now() + '_' + Math.random().toString(36).substring(2, 9),
      groupId,
      groupName,
      eventType,
      timestamp: Date.now(),
      totalUsdValue: totalUsd,
      balances: snapshotBalances.map((b) => ({
        mint: b.mint,
        symbol: b.symbol,
        units: b.amountHuman, // units representation as requested
        amountHuman: b.amountHuman, // keep amountHuman for backwards compatibility
        price: b.price,
        usdValue: b.usdValue,
      })),
    };

    setSnapshots((prev) => {
      const DEBOUNCE_MS = 6000; // De-duplicate snapshots for the same group within 6 seconds
      const sameGroupSnaps = prev.filter((s) => s.groupId === groupId);
      if (sameGroupSnaps.length > 0) {
        const lastSnap = sameGroupSnaps[sameGroupSnaps.length - 1];
        if (Date.now() - lastSnap.timestamp < DEBOUNCE_MS) {
          const lastIdx = prev.indexOf(lastSnap);
          if (lastIdx !== -1) {
            const copy = [...prev];
            copy[lastIdx] = newSnapshot;
            return copy;
          }
        }
      }
      return [...prev, newSnapshot];
    });
  };

  const handleMoveToken = (mint: string, fromGroup: LinkGroup, toGroup: LinkGroup) => {
    setPendingConfirmMove({
      mint,
      fromGroup,
      toGroup,
    });
  };

  // Direct Toggles linking action
  const handleToggleCoinLinking = (mint: string) => {
    if (!linkingGroupId) return;
    const targetGroup = groups.find((g) => g.id === linkingGroupId);
    if (!targetGroup) return;

    const isAlreadyMember = targetGroup.memberMints.includes(mint);

    if (isAlreadyMember) {
      // Remove membership
      const updated = groups.map((g) => {
        if (g.id === linkingGroupId) {
          return {
            ...g,
            memberMints: g.memberMints.filter((m) => m !== mint),
          };
        }
        return g;
      });
      setGroups(updated);
    } else {
      // Check if coin is currently in another group
      const currentOwnerGroup = groups.find((g) => g.memberMints.includes(mint));
      
      if (currentOwnerGroup) {
        setPendingConfirmMove({
          mint,
          fromGroup: currentOwnerGroup,
          toGroup: targetGroup,
        });
      } else {
        // Simple add
        const updated = groups.map((g) => {
          if (g.id === linkingGroupId) {
            return {
              ...g,
              memberMints: [...g.memberMints, mint],
            };
          }
          return g;
        });
        setGroups(updated);
      }
    }
  };

  // Onboarding landing if not wallet connected
  if (!connected) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-200 flex flex-col justify-between selection:bg-emerald-500/30 font-sans">
        {/* Navigation Bar */}
        <header className="h-14 border-b border-slate-800 bg-slate-900/50 flex items-center justify-between px-6 shrink-0 w-full sticky top-0 z-40">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-emerald-500 rounded flex items-center justify-center">
              <div className="w-4 h-4 border-2 border-slate-900 rotate-45"></div>
            </div>
            <h1 className="font-extrabold text-xl tracking-tight text-white uppercase">Round Trip<span className="text-emerald-500">.</span></h1>
            <div className="ml-4 px-2 py-0.5 bg-slate-800 rounded text-[10px] font-mono text-slate-400 tracking-widest uppercase">v1.2.0</div>
          </div>

          <button
            onClick={() => connect()}
            className="bg-emerald-600 hover:bg-emerald-500 text-slate-950 text-xs font-bold px-4 py-2 rounded-lg transition-all shadow-md shadow-emerald-900/20 flex items-center gap-1.5 cursor-pointer"
          >
            <Wallet className="w-3.5 h-3.5 text-slate-950" />
            Connect Wallet
          </button>
        </header>

        {/* Tab navigation for landing page */}
        <div className="max-w-6xl mx-auto px-6 pt-6 w-full shrink-0">
          <div className="flex flex-wrap items-center justify-between gap-4 bg-slate-900 border border-slate-850 p-4 rounded-xl">
            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  setActiveTab('wallet');
                }}
                className={`px-4 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                  activeTab === 'wallet' ? 'bg-emerald-600 text-white' : 'text-slate-400 hover:text-white'
                }`}
              >
                <Wallet className="w-3.5 h-3.5" />
                Wallet Inventory
              </button>
              <button
                onClick={() => {
                  setActiveTab('prices');
                }}
                className={`px-4 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  activeTab === 'prices' ? 'bg-emerald-600 text-white' : 'text-slate-400 hover:text-white'
                }`}
              >
                Market Intel
              </button>
              <button
                onClick={() => {
                  setActiveTab('history');
                }}
                className={`px-4 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  activeTab === 'history' ? 'bg-emerald-600 text-white' : 'text-slate-400 hover:text-white'
                }`}
              >
                Historical ledger logs
              </button>
            </div>
          </div>
        </div>

        {/* Tab contents */}
        {activeTab === 'wallet' && (
          <main className="max-w-6xl mx-auto px-6 py-12 flex-grow flex flex-col justify-center space-y-12 w-full">
            <div className="text-center space-y-4">
              <span className="text-xs bg-slate-900 text-slate-450 border border-slate-800 px-3.5 py-1.5 rounded-full font-bold uppercase tracking-widest inline-block">
                100% Non-Custodial Multi-Group Rebalancer
              </span>
              <h2 className="text-4xl md:text-5xl font-black text-white tracking-tight leading-tight max-w-2xl mx-auto">
                Full Control Rebalancing for <span className="text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 to-emerald-500">Solana Bag Holders</span>
              </h2>
              <p className="text-slate-400 text-sm max-w-xl mx-auto leading-relaxed">
                Equal weight by default, set custom weights per coin whenever you want. Turn volatility into a direct compound loop with color-coded link-groups right inside your wallet.
              </p>
            </div>

            {/* Interactive Split Setup */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
              
              {/* Presets Grid */}
              <div className="lg:col-span-7 space-y-5">
                <div>
                  <h3 className="text-sm font-bold uppercase tracking-wider text-slate-400 flex items-center gap-2">
                    <Sparkle className="w-4 h-4 text-emerald-400" />
                    Explore Allocation Presets
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Presets act as templates: choosing one spawns a new color-coded group pre-filled with verified assets.
                  </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {PRESETS.map((p) => (
                    <div
                      key={p.name}
                      className="bg-slate-900 border border-slate-850 hover:border-slate-800 p-5 rounded-2xl flex flex-col justify-between min-h-[200px] transition-all relative group"
                    >
                      <div className="space-y-2.5">
                        <div className="flex items-center justify-between">
                          <span className="font-extrabold text-white text-sm">{p.name}</span>
                          <span className={`text-[9px] font-mono px-2 py-0.5 rounded-full border uppercase ${
                            p.riskLabel === 'Safe' 
                              ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' 
                              : p.riskLabel.includes('High')
                              ? 'bg-rose-500/10 text-rose-400 border-rose-500/20'
                              : 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                          }`}>
                            {p.riskLabel} Risk
                          </span>
                        </div>
                        <p className="text-xs text-slate-400 leading-relaxed font-sans line-clamp-3">
                          {p.description}
                        </p>
                        
                        <div className="flex flex-wrap gap-1 pt-1">
                          {p.tokens.map(t => (
                            <span key={t.expectedMint} className="text-[9px] bg-slate-950 border border-slate-850 text-slate-400 font-mono px-1.5 py-0.5 rounded">
                              {t.symbol}
                            </span>
                          ))}
                        </div>
                      </div>
                      
                      <button
                        onClick={() => setSelectedPreset(p)}
                        className="w-full mt-4 bg-slate-950 border border-emerald-500/10 group-hover:border-emerald-500/30 group-hover:bg-slate-850 text-emerald-400 hover:text-emerald-350 text-xs font-bold py-2.5 rounded-xl transition-all flex items-center justify-center gap-1 cursor-pointer"
                      >
                        Inspect Liquidity & Deploy
                        <ArrowRight className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              {/* Wallet Box */}
              <div className="lg:col-span-5 bg-slate-900 border border-slate-850 rounded-2xl p-6 sm:p-8 shadow-2xl space-y-6 relative overflow-hidden">
                <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/5 blur-2xl rounded-full"></div>
                
                <div className="space-y-2">
                  <h3 className="font-extrabold text-white text-lg flex items-center gap-2">
                    <Wallet className="w-5 h-5 text-emerald-400" />
                    Connect Wallet
                  </h3>
                  <p className="text-xs text-slate-400 leading-relaxed">
                    Connect your web3 Solana extension to access Round Trip in non-custodial custody. Funds never leave your wallet.
                  </p>
                </div>

                <button
                  onClick={() => connect()}
                  disabled={connecting}
                  className="w-full bg-emerald-500 hover:bg-emerald-450 text-slate-950 font-extrabold py-4 rounded-xl transition-all flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/10 cursor-pointer text-sm"
                >
                  {connecting ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin text-slate-950" />
                      Detecting wallets...
                    </>
                  ) : (
                    <>
                      <Wallet className="w-4.5 h-4.5 text-slate-950" />
                      Connect Solana Wallet
                    </>
                  )}
                </button>
              </div>

            </div>

            <DisclaimerCard />
          </main>
        )}

        {activeTab === 'prices' && (
          <main className="max-w-6xl mx-auto px-6 py-12 flex-grow flex flex-col justify-start space-y-6 w-full">
            <PriceView
              balancesWithPrice={[]}
              loadingPrices={loadingPrices}
              onRefreshPrices={refreshPrices}
              groups={groups}
              isVerifiedCoin={isVerifiedCoin}
              prices={prices}
              tokenMetadata={tokenMetadata}
              onSelectGroup={() => {}}
              onNavigateToWallet={() => {}}
              landingMode={true}
              onConnect={() => connect()}
            />
          </main>
        )}

        {activeTab === 'history' && (
          <main className="max-w-6xl mx-auto px-6 py-24 flex-grow flex flex-col justify-center items-center w-full">
            <div className="bg-slate-900 border border-slate-850 p-10 rounded-2xl shadow-2xl text-center space-y-5 max-w-md mx-auto relative overflow-hidden">
              <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/5 blur-2xl rounded-full"></div>
              <div className="w-16 h-16 bg-emerald-500/10 text-emerald-400 rounded-full flex items-center justify-center mx-auto">
                <Lock className="w-8 h-8" />
              </div>
              <div className="space-y-2">
                <h3 className="font-extrabold text-white text-xl">Your ledger is private</h3>
                <p className="text-slate-400 text-xs leading-relaxed">
                  Connect your wallet to view your rebalancing history and coin scoreboard.
                </p>
              </div>
              <button
                onClick={() => connect()}
                className="w-full bg-emerald-500 hover:bg-emerald-450 text-slate-950 font-extrabold py-3 rounded-xl transition-all flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/10 cursor-pointer text-xs"
              >
                <Wallet className="w-4 h-4 text-slate-950" />
                Connect Solana Wallet
              </button>
            </div>
          </main>
        )}

        {/* Footer */}
        <footer className="h-10 bg-slate-950 border-t border-slate-850 flex items-center justify-between px-6 shrink-0 text-[10px] text-slate-500">
          <div className="flex gap-4">
            <span>Mainnet-Beta</span>
            <span>|</span>
            <span>Jupiter Price V3 API: Connected</span>
          </div>
          <span>Round Trip Rebalancer v1.2.0</span>
        </footer>

        {/* Preset Verifier Overlay */}
        {selectedPreset && (
          <PresetVerifier
            preset={selectedPreset}
            groups={groups}
            onCancel={() => setSelectedPreset(null)}
            onApply={(tokens) => {
              const newColor = getNextGroupColor(groups);
              const newGroup: LinkGroup = {
                id: 'group_' + Date.now(),
                name: selectedPreset.name + ' Group',
                color: newColor,
                memberMints: tokens.map((t) => t.address),
              };
              setGroups((prev) => [...prev, newGroup]);
              setSelectedPreset(null);
              setShowLandingSuccess(newGroup.name);
            }}
          />
        )}

        {/* Landing success interactive popup prompt */}
        {showLandingSuccess && (
          <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-slate-900 border border-slate-800 rounded-xl w-full max-w-md p-6 flex flex-col space-y-4 shadow-2xl text-center">
              <div className="w-12 h-12 bg-emerald-500/10 text-emerald-400 rounded-full flex items-center justify-center mx-auto">
                <Check className="w-6 h-6" />
              </div>
              <h3 className="text-lg font-bold text-white">Group "{showLandingSuccess}" Created!</h3>
              <p className="text-sm text-slate-300 leading-relaxed">
                The preset link-group has been initialized and saved. Connect your wallet to start tracking and volatility harvesting.
              </p>
              <div className="flex flex-col gap-2 pt-2">
                <button
                  onClick={() => {
                    setShowLandingSuccess(null);
                    connect();
                  }}
                  className="w-full bg-emerald-500 hover:bg-emerald-450 text-slate-950 font-extrabold py-2.5 rounded-lg text-xs transition-colors cursor-pointer"
                >
                  Connect Real Wallet
                </button>
                <button
                  onClick={() => setShowLandingSuccess(null)}
                  className="w-full text-slate-500 hover:text-slate-300 py-1 text-xs font-medium cursor-pointer"
                >
                  Stay on Landing Page
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // Calculate unique tokens across all groups for History tab tracking
  const allUniqueGroupTokens = Array.from(new Set(groups.flatMap((g) => g.memberMints)))
    .map((mint) => tokenMetadata[mint])
    .filter(Boolean);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 flex flex-col justify-between selection:bg-emerald-500/30 font-sans">
      
      {/* Top Header */}
      <header className="h-14 border-b border-slate-800 bg-slate-900/50 flex items-center justify-between px-6 shrink-0 w-full sticky top-0 z-40">
        <div 
          onClick={() => {
            setSelectedGroupId(null);
            setActiveTab('wallet');
          }}
          className="flex items-center gap-3 cursor-pointer hover:opacity-90 transition-opacity"
          title="Go to Wallet Inventory"
        >
          <div className="w-8 h-8 bg-emerald-500 rounded flex items-center justify-center">
            <div className="w-4 h-4 border-2 border-slate-900 rotate-45"></div>
          </div>
          <h1 className="font-extrabold text-xl tracking-tight text-white uppercase">Round Trip<span className="text-emerald-500">.</span></h1>
          <div className="ml-4 px-2 py-0.5 bg-slate-800 rounded text-[10px] font-mono text-slate-400 tracking-widest uppercase">v1.2.0</div>
        </div>

        <div className="flex items-center gap-4">
          
          {/* Settings button */}
          <div className="relative">
            <button
              onClick={() => setShowRpcSettings(!showRpcSettings)}
              className="relative text-slate-400 hover:text-white p-2 rounded-lg hover:bg-slate-900 border border-slate-800 transition-all cursor-pointer"
              title="Settings & RPC"
            >
              <Settings className="w-4 h-4" />
              {STANDARD_PUBLIC_RPCS.includes(rpcUrl) && (
                <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 bg-amber-500 rounded-full" />
              )}
            </button>
            {showRpcSettings && (
              <div className="absolute right-0 top-11 w-68 bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-xl z-50 text-xs space-y-4">
                <div className="space-y-1.5">
                  <h4 className="font-bold text-white uppercase tracking-wider">Node RPC Config</h4>
                  <input
                    type="text"
                    value={rpcUrl}
                    onChange={(e) => setRpcUrl(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 font-mono text-[10px] text-white focus:outline-none focus:border-emerald-500"
                  />
                  <p className="text-[9px] text-slate-500 leading-normal">
                    Paste a private RPC URL (e.g. from Helius free tier). Never share this URL publicly.
                  </p>
                  {STANDARD_PUBLIC_RPCS.includes(rpcUrl) && (
                    <div className="p-2 bg-amber-500/10 border border-amber-500/20 rounded-lg text-[9px] text-amber-400 leading-normal animate-in fade-in duration-200">
                      <strong>Notice:</strong> Using public Solana RPC node. Live Jupiter quoting & confirmations may be throttled. Custom node is recommended for optimal speed.
                    </div>
                  )}
                </div>

                <hr className="border-slate-850" />

                <div className="space-y-2">
                  <div className="flex justify-between items-center">
                    <h4 className="font-bold text-white uppercase tracking-wider">Slippage Tolerance</h4>
                    <span className="text-xs font-mono font-extrabold text-emerald-400">{(slippageBps / 100).toFixed(1)}%</span>
                  </div>
                  <div className="grid grid-cols-4 gap-1">
                    {[50, 100, 200].map((bps) => (
                      <button
                        key={bps}
                        onClick={() => setSlippageBps(bps)}
                        className={`py-1 text-[10px] font-extrabold rounded border cursor-pointer transition-all ${
                          slippageBps === bps
                            ? 'bg-emerald-500 border-emerald-500 text-slate-950'
                            : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-white'
                        }`}
                      >
                        {bps / 100}%
                      </button>
                    ))}
                    <input
                      type="number"
                      step="0.1"
                      min="0.1"
                      max="5"
                      placeholder="Custom"
                      value={![50, 100, 200].includes(slippageBps) ? (slippageBps / 100).toString() : ''}
                      onChange={(e) => {
                        const val = parseFloat(e.target.value);
                        if (!isNaN(val)) {
                          const bps = Math.min(500, Math.max(5, Math.round(val * 100)));
                          setSlippageBps(bps);
                        }
                      }}
                      className={`py-1 px-1 text-center text-[10px] font-extrabold rounded border bg-slate-950 focus:outline-none ${
                        ![50, 100, 200].includes(slippageBps)
                          ? 'border-emerald-500 text-emerald-400'
                          : 'border-slate-800 text-slate-400'
                      }`}
                    />
                  </div>
                  {slippageBps > 300 && (
                    <div className="text-[9px] text-amber-400 leading-tight">
                      ⚠️ Higher slippage risks worse fills & front-running.
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Connection Pill */}
          <div className="flex items-center gap-4">
            <div className="flex flex-col items-end">
              <span className="text-[9px] text-slate-500 uppercase font-black tracking-wider">
                CONNECTED WEB3
              </span>
              <span className="font-mono text-xs text-emerald-400 font-extrabold">
                {publicKey ? `${publicKey.substring(0, 4)}...${publicKey.substring(publicKey.length - 4)}` : ''}
              </span>
            </div>
            <div className="w-9 h-9 rounded-full bg-slate-850 border border-slate-850 flex items-center justify-center relative group">
              <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 shadow-[0_0_8px_#10b981]" />
              <button
                onClick={disconnect}
                className="absolute inset-0 rounded-full bg-rose-950/90 text-rose-400 border border-rose-850 flex items-center justify-center text-[10px] font-bold opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
              >
                Exit
              </button>
            </div>
          </div>

        </div>
      </header>

      {/* Primary Layout Frame */}
      <main className="max-w-7xl mx-auto px-6 py-8 flex-grow w-full space-y-6">
        
        {!rpcWarningDismissed && STANDARD_PUBLIC_RPCS.includes(rpcUrl) && (
          <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-4 flex items-start gap-3 relative text-amber-400 animate-in fade-in duration-200">
            <span className="text-base">⚠️</span>
            <div className="flex-grow space-y-1 text-xs">
              <h4 className="font-extrabold text-white">Using Public Solana RPC</h4>
              <p className="text-slate-300 leading-relaxed">
                You're on a public Solana RPC, which is rate-limited and may cause failed balance loads or swaps. Add a private RPC (Helius, Triton, QuickNode) in Settings for reliable trading.
              </p>
            </div>
            <button
              onClick={() => {
                setRpcWarningDismissed(true);
                localStorage.setItem('roundtrip_rpc_warning_dismissed', 'true');
              }}
              className="text-slate-500 hover:text-slate-300 transition-colors p-1 rounded-lg cursor-pointer flex-shrink-0"
              title="Dismiss warning"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {showDisclaimerBanner && (
          <Disclaimer showDismissButton onDismiss={() => setShowDisclaimerBanner(false)} />
        )}

        {/* Global Statistics Grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-slate-900 border border-slate-850 p-4 rounded-xl space-y-1">
            <span className="text-[10px] font-bold uppercase text-slate-500 tracking-wider">Total Wallet Inventory</span>
            <div className="text-xl font-mono font-black text-white">
              ${totalWalletValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
          </div>

          <div className="bg-slate-900 border border-slate-850 p-4 rounded-xl space-y-1">
            <span className="text-[10px] font-bold uppercase text-slate-500 tracking-wider">Active Link-Groups</span>
            <div className="text-xl font-mono font-black text-white">{groups.length} active</div>
          </div>

          <div className="bg-slate-900 border border-slate-850 p-4 rounded-xl space-y-1">
            <span className="text-[10px] font-bold uppercase text-slate-500 tracking-wider">Total Linked Value</span>
            <div className="text-xl font-mono font-black text-emerald-400">
              ${totalLinkedValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
          </div>

          <div className="bg-slate-900 border border-slate-850 p-4 rounded-xl space-y-1">
            <span className="text-[10px] font-bold uppercase text-slate-500 tracking-wider">Unlinked Inventory</span>
            <div className="text-xl font-mono font-black text-slate-400">
              ${unlinkedInventoryValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
          </div>
        </div>

        {/* Action routing tab buttons */}
        <div className="flex flex-wrap items-center justify-between gap-4 bg-slate-900 border border-slate-850 p-4 rounded-xl">
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                setSelectedGroupId(null);
                setActiveTab('wallet');
              }}
              className={`px-4 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                activeTab === 'wallet' && !selectedGroupId ? 'bg-emerald-600 text-white' : 'text-slate-400 hover:text-white'
              }`}
            >
              <Wallet className="w-3.5 h-3.5" />
              Wallet Inventory
            </button>
            <button
              onClick={() => {
                setSelectedGroupId(null);
                setActiveTab('prices');
              }}
              className={`px-4 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                activeTab === 'prices' ? 'bg-emerald-600 text-white' : 'text-slate-400 hover:text-white'
              }`}
            >
              Market Intel
            </button>
            <button
              onClick={() => {
                setSelectedGroupId(null);
                setActiveTab('history');
              }}
              className={`px-4 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                activeTab === 'history' ? 'bg-emerald-600 text-white' : 'text-slate-400 hover:text-white'
              }`}
            >
              Historical ledger logs
            </button>
          </div>

          <div className="flex items-center gap-3">
          </div>
        </div>

        {/* SCREEN 2: GROUP DETAIL VIEW DETAIL OVERLAY */}
        {selectedGroupId && activeGroup ? (
          <AllocationView
            group={activeGroup}
            groups={groups}
            allBalances={balances}
            prices={prices}
            tokenMetadata={tokenMetadata}
            onBack={() => setSelectedGroupId(null)}
            onUpdateGroup={(updated) => {
              setGroups((prev) => prev.map((g) => (g.id === updated.id ? updated : g)));
            }}
            onDeleteGroup={(id) => {
              setGroups((prev) => prev.filter((g) => g.id !== id));
              setSelectedGroupId(null);
            }}
            onRefreshPrices={refreshPrices}
            onSaveSnapshot={handleSaveSnapshot}
            groupSnapshots={snapshots.filter((s) => s && s.groupId === activeGroup.id)}
            loadingPrices={loadingPrices}
            onMoveToken={handleMoveToken}
            onOpenAddBasket={() => setShowConvertModal(true)}
          />
        ) : (
          /* SCREEN 1: WALLET HOME VIEW */
          <>
            {activeTab === 'wallet' && (() => {
              const mainCoins = walletBalances.filter(item => {
                const isLinked = groups.some((g) => g.memberMints.includes(item.mint));
                const isVerified = isVerifiedCoin(item.mint);
                return (isLinked || isVerified || item.usdValue >= 0.01) && item.amount > 0;
              });

              const hiddenCoins = walletBalances.filter(item => {
                const isLinked = groups.some((g) => g.memberMints.includes(item.mint));
                const isVerified = isVerifiedCoin(item.mint);
                const showInMainList = (isLinked || isVerified || item.usdValue >= 0.01) && item.amount > 0;
                return !showInMainList;
              }).sort((a, b) => b.usdValue - a.usdValue);

              const clusteredBlocks = groups.map(g => {
                const coins = mainCoins.filter(item => g.memberMints.includes(item.mint));
                return { group: g, coins };
              }).filter(block => block.coins.length > 0);

              const unlinkedMainCoins = mainCoins
                .filter(item => !groups.some(g => g.memberMints.includes(item.mint)))
                .sort((a, b) => b.usdValue - a.usdValue);

              const renderDenseRow = (item: TokenBalance) => {
                const owningGroup = groups.find((g) => g.memberMints.includes(item.mint));
                const isLinked = !!owningGroup;
                const gColors = owningGroup ? getGroupColorClasses(owningGroup.color) : null;
                const groupStats = owningGroup ? getGroupStats(owningGroup) : null;
                const weightPercent = (groupStats && groupStats.totalUsd > 0)
                  ? (item.usdValue / groupStats.totalUsd) * 100
                  : 0;

                const handleRowClick = () => {
                  if (linkingGroupId) {
                    handleToggleCoinLinking(item.mint);
                  } else if (owningGroup) {
                    setSelectedGroupId(owningGroup.id);
                  } else {
                    setConvertSuccessMessage(`This asset is currently unlinked. Click a basket tile's "Link Coins" or use the asset action menu to add it to a rebalancing basket.`);
                    setTimeout(() => setConvertSuccessMessage(null), 4500);
                  }
                };

                return (
                  <div
                    key={item.mint}
                    onClick={handleRowClick}
                    className={`py-2.5 px-4 rounded-xl border transition-all cursor-pointer flex justify-between items-center gap-3 relative ${
                      linkingGroupId
                        ? 'hover:border-emerald-500 bg-slate-950/40 border-slate-850'
                        : isLinked
                        ? `border-l-4 ${gColors?.borderL} bg-slate-950 border-slate-850 hover:bg-slate-900`
                        : 'bg-slate-950/40 border-slate-850 hover:bg-slate-900'
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0 flex-grow">
                      <TokenLogo logoURI={tokenMetadata[item.mint]?.logoURI} symbol={item.symbol} size="sm" />
                      
                      <div className="flex items-center gap-2 flex-wrap min-w-0">
                        <strong className="text-white font-extrabold text-xs">{item.symbol}</strong>
                        
                        <span className="text-[10px] text-cyan-400/90 font-mono font-medium">
                          {item.amountHuman.toLocaleString(undefined, { maximumFractionDigits: 4 })} units
                        </span>

                        {owningGroup ? (
                          <span
                            onClick={(e) => {
                              e.stopPropagation();
                              setOpenMenuMint(openMenuMint === item.mint ? null : item.mint);
                            }}
                            className={`text-[8px] uppercase font-extrabold tracking-widest px-1.5 py-0.5 rounded cursor-pointer hover:opacity-80 transition-colors ${gColors?.bg} ${gColors?.text}`}
                          >
                            {owningGroup.name}
                          </span>
                        ) : (
                          <span
                            onClick={(e) => {
                              e.stopPropagation();
                              setOpenMenuMint(openMenuMint === item.mint ? null : item.mint);
                            }}
                            className="text-[8px] bg-slate-900 text-slate-500 font-extrabold px-1.5 py-0.5 rounded border border-slate-850 cursor-pointer hover:text-slate-300 transition-colors"
                          >
                            Unlinked
                          </span>
                        )}
                      </div>
                    </div>

                    {/* INLINE QUICK ACTIONS ON LIST VIEW ROW */}
                    {item.mint !== 'So11111111111111111111111111111111111111112' && !linkingGroupId && (
                      <div className="flex items-center gap-2 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
                        {item.amount === 0 ? (
                          <button
                            onClick={() => handleOpenCloseEmptyModal(item)}
                            className="bg-emerald-500/10 hover:bg-emerald-500/25 text-emerald-400 border border-emerald-500/30 hover:border-emerald-500/60 px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 hover:scale-[1.02] active:scale-[0.98] shadow-sm"
                            title={`Close empty account and reclaim ~${getRentSolString(item.mint)} SOL rent`}
                          >
                            <span>🧹 Reclaim Rent</span>
                            <span className="text-[10px] font-mono text-emerald-300 font-extrabold">~{getRentSolString(item.mint)} SOL</span>
                          </button>
                        ) : (
                          <button
                            onClick={() => handleInitiateConvert(item)}
                            className="bg-amber-500/10 hover:bg-amber-500/25 text-amber-300 border border-amber-500/30 hover:border-amber-500/60 px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 hover:scale-[1.02] active:scale-[0.98] shadow-sm"
                            title={`Convert ${item.symbol} to SOL via Jupiter & reclaim account rent`}
                          >
                            <span>⚡ Convert to SOL</span>
                          </button>
                        )}
                      </div>
                    )}

                    <div className="flex items-center gap-3 flex-shrink-0">
                      <div className="text-right flex items-center gap-2 font-mono">
                        <span className="font-bold text-white text-xs">
                          ${item.usdValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </span>
                        {isLinked && (
                          <span className="text-[10px] text-slate-500 font-extrabold">
                            {weightPercent.toFixed(1)}%
                          </span>
                        )}
                        <span className={`text-[10px] ${item.change24h >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                          {item.change24h >= 0 ? '+' : ''}{item.change24h.toFixed(1)}%
                        </span>
                      </div>

                      {/* Action Menu Trigger & Dropdown */}
                      {!linkingGroupId && (
                        <div className="relative z-10">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setOpenMenuMint(openMenuMint === item.mint ? null : item.mint);
                            }}
                            className="p-1 text-slate-400 hover:text-white hover:bg-slate-850 rounded-lg transition-colors cursor-pointer"
                            title="Asset actions"
                          >
                            <MoreVertical className="w-3.5 h-3.5" />
                          </button>
                          {openMenuMint === item.mint && (
                            <>
                              {/* Click-away backdrop */}
                              <div
                                className="fixed inset-0 z-40 cursor-default"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setOpenMenuMint(null);
                                }}
                              />
                              <div
                                className="absolute right-0 mt-1 w-56 bg-slate-900 border border-slate-850 rounded-lg shadow-2xl z-50 py-1 text-left animate-in fade-in duration-100"
                                onClick={(e) => e.stopPropagation()}
                              >
                                {isLinked ? (
                                  <>
                                    <button
                                      onClick={() => {
                                        setSelectedGroupId(owningGroup.id);
                                        setOpenMenuMint(null);
                                      }}
                                      className="w-full text-left px-3 py-1.5 text-xs text-slate-200 hover:bg-slate-800 font-medium cursor-pointer"
                                    >
                                      👁️ View Group
                                    </button>

                                    <button
                                      onClick={() => {
                                        setGroups((prev) =>
                                          prev.map((g) =>
                                            g.id === owningGroup.id
                                              ? { ...g, memberMints: g.memberMints.filter((m) => m !== item.mint) }
                                              : g
                                          )
                                        );
                                        setOpenMenuMint(null);
                                      }}
                                      className="w-full text-left px-3 py-1.5 text-xs text-rose-400 hover:bg-slate-800 font-medium cursor-pointer border-b border-slate-850"
                                    >
                                      ✕ Unlink from Group
                                    </button>

                                    <div className="px-3 py-1 text-[9px] text-slate-500 font-bold uppercase tracking-wider">
                                      Move to Group
                                    </div>
                                    {groups.filter((g) => g.id !== owningGroup.id).length === 0 ? (
                                      <div className="px-3 py-1 text-[10px] text-slate-500 italic border-b border-slate-850 pb-1">No other groups</div>
                                    ) : (
                                      <div className="border-b border-slate-850 pb-1">
                                        {groups
                                          .filter((g) => g.id !== owningGroup.id)
                                          .map((g) => (
                                            <button
                                              key={g.id}
                                              onClick={() => {
                                                handleMoveToken(item.mint, owningGroup, g);
                                                setOpenMenuMint(null);
                                              }}
                                              className="w-full text-left px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-800 truncate flex items-center gap-1.5 cursor-pointer"
                                            >
                                              <span className={`w-1.5 h-1.5 rounded-full ${getGroupColorClasses(g.color).bgSolid}`} />
                                              {g.name}
                                            </button>
                                          ))}
                                      </div>
                                    )}
                                  </>
                                ) : (
                                  <>
                                    <div className="px-3 py-1 text-[9px] text-slate-500 font-bold uppercase tracking-wider">
                                      Add to Group
                                    </div>
                                    {groups.length === 0 ? (
                                      <div className="px-3 py-1 text-[10px] text-slate-500 italic border-b border-slate-850 pb-1">No groups created yet</div>
                                    ) : (
                                      <div className="border-b border-slate-850 pb-1">
                                        {groups.map((g) => (
                                          <button
                                            key={g.id}
                                            onClick={() => {
                                              setGroups((prev) =>
                                                prev.map((currentG) =>
                                                  currentG.id === g.id
                                                    ? { ...currentG, memberMints: [...currentG.memberMints, item.mint] }
                                                    : currentG
                                                )
                                              );
                                              setOpenMenuMint(null);
                                            }}
                                            className="w-full text-left px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-800 truncate flex items-center gap-1.5 cursor-pointer"
                                          >
                                            <span className={`w-1.5 h-1.5 rounded-full ${getGroupColorClasses(g.color).bgSolid}`} />
                                            {g.name}
                                          </button>
                                        ))}
                                      </div>
                                    )}
                                  </>
                                )}

                                {/* Rent Reclaim / Convert Actions */}
                                {item.mint !== 'So11111111111111111111111111111111111111112' && (
                                  <div className="pt-1 mt-1">
                                    {item.amount === 0 ? (
                                      <button
                                        onClick={() => {
                                          setOpenMenuMint(null);
                                          handleOpenCloseEmptyModal(item);
                                        }}
                                        className="w-full text-left px-3 py-1.5 text-xs text-emerald-400 hover:bg-slate-800 font-medium cursor-pointer flex items-center justify-between gap-2"
                                      >
                                        <span>🧹 Reclaim Rent</span>
                                        <span className="text-[10px] text-emerald-500 font-mono">~{getRentSolString(item.mint)} SOL</span>
                                      </button>
                                    ) : (
                                      <>
                                        <button
                                          onClick={() => {
                                            setOpenMenuMint(null);
                                            handleInitiateConvert(item);
                                          }}
                                          className="w-full text-left px-3 py-1.5 text-xs text-amber-300 hover:bg-slate-800 font-medium cursor-pointer flex items-center justify-between gap-2"
                                        >
                                          <span>⚡ Convert to SOL</span>
                                          <span className="text-[9px] text-amber-400/70 font-mono">Sell + Reclaim</span>
                                        </button>

                                        <button
                                          disabled
                                          title="Close token account requires exactly 0 balance. Convert or transfer tokens out first."
                                          className="w-full text-left px-3 py-1.5 text-xs text-slate-600 font-medium cursor-not-allowed flex items-center justify-between gap-2 opacity-60"
                                        >
                                          <span>🧹 Close account</span>
                                          <span className="text-[9px] text-slate-600 font-mono">0 balance required</span>
                                        </button>
                                      </>
                                    )}
                                  </div>
                                )}
                              </div>
                            </>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                );
              };

              return (
                <div className="space-y-6 animate-in fade-in duration-200">
                  {/* Horizontal Strip / Grid of Basket Tiles + Create/Presets Tile */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4">
                    {groups.map((g) => {
                      const gColors = getGroupColorClasses(g.color);
                      const gStats = getGroupStats(g);
                      const memberSymbols = g.memberMints.map(mint => tokenMetadata[mint]?.symbol || mint.substring(0, 4).toUpperCase());

                      return (
                        <div 
                          key={g.id}
                          onClick={() => setSelectedGroupId(g.id)}
                          className={`p-4 bg-slate-900 border border-slate-850 hover:border-slate-700 hover:bg-slate-850/60 rounded-2xl transition-all cursor-pointer flex flex-col justify-between gap-3 shadow-xl group`}
                        >
                          <div className="flex justify-between items-start gap-2">
                            <div className="space-y-0.5 min-w-0">
                              <div className="flex items-center gap-1.5">
                                <span className="font-extrabold text-white text-xs hover:underline truncate max-w-[120px]">{g.name}</span>
                                <span className={`w-2 h-2 rounded-full flex-shrink-0 ${gColors.bgSolid}`} />
                              </div>
                              <div className="font-mono font-black text-slate-200 text-base">
                                ${gStats.totalUsd.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                              </div>
                            </div>

                            {gStats.isRebalanceAdvisable ? (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setSelectedGroupId(g.id);
                                }}
                                className="text-[9px] bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border border-amber-500/20 px-2 py-1 rounded-lg font-bold animate-pulse flex items-center gap-1 cursor-pointer flex-shrink-0"
                                title="Rebalance recommended"
                              >
                                ⚠ Rebalance advised
                              </button>
                            ) : (
                              <span className="text-[9px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-2 py-1 rounded-lg font-bold flex items-center gap-1 flex-shrink-0">
                                ✓ Balanced
                              </span>
                            )}
                          </div>

                          <div className="space-y-1">
                            <div className="flex flex-wrap gap-1 items-center">
                              {memberSymbols.slice(0, 4).map((symbol, idx) => (
                                <span key={idx} className="text-[8px] bg-slate-950 text-slate-400 border border-slate-800 px-1.5 py-0.5 rounded font-mono">
                                  {symbol}
                                </span>
                              ))}
                              {memberSymbols.length > 4 && (
                                <span className="text-[8px] text-slate-500 font-bold pl-0.5">
                                  +{memberSymbols.length - 4}
                                </span>
                              )}
                              <span className="text-[9px] text-slate-500 font-medium ml-auto">
                                {g.memberMints.length} coin{g.memberMints.length !== 1 ? 's' : ''}
                              </span>
                            </div>
                          </div>

                          {/* Quick link button inside if user wants */}
                          <div className="flex justify-between items-center border-t border-slate-850/60 pt-2 text-[10px]">
                            <span className={`${gColors.text} font-bold hover:underline`}>
                              View details →
                            </span>
                            {g.memberMints.length === 0 && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setGroupToDelete(g);
                                }}
                                className="text-rose-400 font-bold hover:underline cursor-pointer"
                              >
                                Delete Empty
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}

                    {/* CREATE & PRESETS TILE */}
                    <div className="p-4 bg-slate-900 border border-slate-800 rounded-2xl flex flex-col justify-between gap-3 shadow-xl">
                      <div className="space-y-1">
                        <h4 className="text-xs font-extrabold text-slate-350 uppercase tracking-wider flex items-center gap-1.5">
                          <Plus className="w-4 h-4 text-emerald-400" />
                          Create & Presets
                        </h4>
                        <p className="text-[10px] text-slate-450 leading-tight">
                          Build a custom basket or deploy a pre-configured investment strategy.
                        </p>
                      </div>

                      {showCreateGroup ? (
                        <div className="space-y-2">
                          <input
                            type="text"
                            value={newGroupName}
                            onChange={(e) => setNewGroupName(e.target.value)}
                            placeholder="Group Name (e.g. Blue Chips)"
                            className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-xs text-white focus:outline-none"
                          />
                          <div className="flex gap-1.5">
                            <button
                              onClick={handleCreateGroup}
                              className="flex-grow bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black py-1.5 rounded-lg text-[10px] transition-all cursor-pointer"
                            >
                              Create
                            </button>
                            <button
                              onClick={() => setShowCreateGroup(false)}
                              className="bg-slate-800 hover:bg-slate-750 text-slate-300 font-bold px-2.5 py-1.5 rounded-lg text-[10px] transition-all cursor-pointer"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="space-y-2">
                          <button
                            onClick={() => setShowCreateGroup(true)}
                            className="w-full bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/20 py-2 rounded-xl text-xs font-bold cursor-pointer transition-all flex items-center justify-center gap-1.5"
                          >
                            <Plus className="w-3.5 h-3.5" />
                            New Group
                          </button>
                          <div className="space-y-1">
                            <span className="text-[8px] font-semibold text-slate-550 uppercase tracking-wider block">Spawn Presets:</span>
                            <div className="flex flex-wrap gap-1">
                              {PRESETS.map((p) => (
                                <button
                                  key={p.name}
                                  onClick={() => setSelectedPreset(p)}
                                  className="text-[9px] bg-slate-950 hover:bg-slate-800 text-slate-300 border border-slate-850 px-2 py-0.5 rounded font-extrabold cursor-pointer transition-colors"
                                  title={`${p.riskLabel} Risk`}
                                >
                                  {p.name.split(' ')[0]}
                                </button>
                              ))}
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Direct Link mode notification banner */}
                  {linkingGroupId && (() => {
                    const groupToLink = groups.find((g) => g.id === linkingGroupId)!;
                    if (!groupToLink) return null;
                    return (
                      <div className={`p-4 bg-emerald-500/10 border border-emerald-500/35 rounded-2xl flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 text-xs text-slate-300`}>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-ping" />
                          <span>
                            🔗 Link Mode Active for <strong className="text-white">{groupToLink.name}</strong>. Simply tap any coin row below to link or unlink it.
                          </span>
                        </div>
                        <button
                          onClick={() => setLinkingGroupId(null)}
                          className="text-[10px] bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 font-black px-3.5 py-1.5 rounded-lg transition-colors cursor-pointer"
                        >
                          Done Linking
                        </button>
                      </div>
                    );
                  })()}

                  {/* Single Full-Width Inventory List Container */}
                  <div className="bg-slate-900 border border-slate-850 rounded-2xl p-6 shadow-xl space-y-4">
                    <div className="flex justify-between items-center mb-2">
                      <h3 className="text-md font-bold text-white">On-Chain Wallet Inventory</h3>
                      <span className="text-[10px] font-mono text-slate-500 uppercase tracking-wider">
                        {walletBalances.length} active assets
                      </span>
                    </div>

                    {/* MAIN TOKENS LIST */}
                    <div className="space-y-4">
                      {/* Clustered Linked Tokens per Group (rendered in a 2-column grid on desktop) */}
                      {clusteredBlocks.length > 0 && (
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                          {clusteredBlocks.map(({ group, coins }) => {
                            const gColors = getGroupColorClasses(group.color);
                            return (
                              <div key={group.id} className="space-y-2">
                                {/* Thin colored band header for group */}
                                <div className="flex items-center gap-2 border-b border-slate-800 pb-1.5">
                                  <span className={`w-1.5 h-3 rounded-sm ${gColors.bgSolid}`} />
                                  <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-350">
                                    {group.name} Basket
                                  </span>
                                  <span className="text-[9px] bg-slate-950 text-slate-500 font-mono px-1.5 py-0.5 rounded ml-auto">
                                    {coins.length} linked
                                  </span>
                                </div>
                                <div className="space-y-1.5">
                                  {coins.map(item => renderDenseRow(item))}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}

                      {/* Unlinked Coins Section */}
                      {unlinkedMainCoins.length > 0 && (
                        <div className="space-y-2">
                          <div className="flex items-center gap-2 border-b border-slate-800 pb-1.5">
                            <span className="w-1.5 h-3 rounded-sm bg-slate-700" />
                            <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400">
                              Unlinked Assets
                            </span>
                            <span className="text-[9px] bg-slate-950 text-slate-500 font-mono px-1.5 py-0.5 rounded ml-auto">
                              {unlinkedMainCoins.length} assets
                            </span>
                          </div>
                          <div className="space-y-1.5">
                            {unlinkedMainCoins.map(item => renderDenseRow(item))}
                          </div>
                        </div>
                      )}

                      {walletBalances.length === 0 && (
                        <div className="text-center py-8 text-slate-500 text-sm">
                          No assets found in your wallet. Connect a wallet with active Solana assets.
                        </div>
                      )}

                      {/* EXPANDER FOR HIDDEN LOW-VALUE TOKENS */}
                      {hiddenCoins.length > 0 && (
                        <div className="pt-2 border-t border-slate-850/60">
                          <button
                            onClick={() => setShowHiddenTokens(!showHiddenTokens)}
                            className="w-full flex items-center justify-between py-2 text-slate-400 hover:text-white transition-colors cursor-pointer text-xs font-bold"
                          >
                            <span className="flex items-center gap-1.5">
                              <Info className="w-3.5 h-3.5 text-slate-500" />
                              {hiddenCoins.length} hidden low-value tokens
                            </span>
                            <ChevronDown className={`w-4 h-4 transition-transform duration-200 ${showHiddenTokens ? 'rotate-180' : ''}`} />
                          </button>

                          {showHiddenTokens && (
                            <div className="mt-2 space-y-1.5 border-l border-slate-850 pl-3 py-1 animate-in slide-in-from-top-2 duration-200">
                              {hiddenCoins.map(item => renderDenseRow(item))}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })()}

            {activeTab === 'prices' && (
              <PriceView
                balancesWithPrice={walletBalances}
                loadingPrices={loadingPrices}
                onRefreshPrices={refreshPrices}
                groups={groups}
                isVerifiedCoin={isVerifiedCoin}
                prices={prices}
                tokenMetadata={tokenMetadata}
                onSelectGroup={(groupId) => {
                  setSelectedGroupId(groupId);
                }}
                onNavigateToWallet={() => {
                  setSelectedGroupId(null);
                  setActiveTab('wallet');
                }}
              />
            )}

            {activeTab === 'history' && (
              <HistoryView
                groups={groups}
                snapshots={snapshots}
                allBalances={balances}
                tokenMetadata={tokenMetadata}
                prices={prices}
                onClearHistory={() => setSnapshots([])}
              />
            )}
          </>
        )}

      </main>

      {/* Preset Verifier Overlay */}
      {selectedPreset && (
        <PresetVerifier
          preset={selectedPreset}
          groups={groups}
          onCancel={() => setSelectedPreset(null)}
          onApply={(tokens) => {
            const newColor = getNextGroupColor(groups);
            const newGroup: LinkGroup = {
              id: 'group_' + Date.now(),
              name: selectedPreset.name + ' Group',
              color: newColor,
              memberMints: tokens.map((t) => t.address),
            };
            setGroups((prev) => [...prev, newGroup]);
            setSelectedPreset(null);
            setSelectedGroupId(newGroup.id); // Open Screen 2 for the newly generated group!
          }}
        />
      )}

      {/* Convert & Link modal */}
      {showConvertModal && (
        <ConvertModal
          groups={groups}
          activeGroupId={selectedGroupId}
          tokenMetadata={tokenMetadata}
          prices={prices}
          onClose={() => setShowConvertModal(false)}
          onSuccess={async (groupId, freshBalances) => {
            setShowConvertModal(false);
            await refreshBalances();
            await refreshPrices();

            // Log snapshot for the funded group using freshBalances
            const grp = groups.find((g) => g.id === groupId);
            if (grp) {
              const grpBalances = grp.memberMints.map((mint) => {
                const meta = tokenMetadata[mint] || { symbol: mint.substring(0, 4), decimals: 9 };
                const priceInfo = prices[mint] || { price: 0, change24h: 0 };
                const rawBalance = freshBalances[mint] !== undefined ? freshBalances[mint] : (balances[mint] || 0);
                const amountHuman = rawBalance / Math.pow(10, meta.decimals || 9);
                const usdValue = amountHuman * priceInfo.price;
                
                return {
                  mint,
                  symbol: meta.symbol,
                  decimals: meta.decimals || 9,
                  amount: rawBalance,
                  amountHuman,
                  price: priceInfo.price,
                  usdValue,
                  currentWeight: 0,
                  targetWeight: 0,
                  drift: 0,
                  change24h: priceInfo.change24h,
                };
              });
              const grpTotalUsd = grpBalances.reduce((sum, b) => sum + b.usdValue, 0);
              handleSaveSnapshot(grp.id, grp.name, grpBalances, grpTotalUsd, 'convert');
            }

            setConvertSuccessMessage("Split swaps executed successfully! Your basket assets have been funded and tracked.");
            setTimeout(() => setConvertSuccessMessage(null), 4500);
          }}
        />
      )}

      {/* State-driven interactive Move Confirmation Dialog */}
      {pendingConfirmMove && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-xl w-full max-w-md p-6 flex flex-col space-y-4 shadow-2xl">
            <div className="w-12 h-12 bg-amber-500/10 text-amber-400 rounded-full flex items-center justify-center">
              <AlertTriangle className="w-6 h-6" />
            </div>
            <h3 className="text-lg font-bold text-white">Move Link Ownership?</h3>
            <p className="text-xs text-slate-300 leading-relaxed">
              The token <strong className="text-white">{tokenMetadata[pendingConfirmMove.mint]?.symbol || 'this coin'}</strong> is already linked to the group <strong className="text-white">"{pendingConfirmMove.fromGroup.name}"</strong>.
              Moving it will re-route its weight and tracking metrics to the group <strong className="text-white">"{pendingConfirmMove.toGroup.name}"</strong>.
            </p>
            <div className="flex gap-3 pt-2">
              <button
                onClick={() => setPendingConfirmMove(null)}
                className="flex-1 bg-slate-800 hover:bg-slate-700 text-white font-semibold py-2 rounded-lg text-xs transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  const { mint, fromGroup, toGroup } = pendingConfirmMove;
                  const updated = groups.map((g) => {
                    if (g.id === fromGroup.id) {
                      return {
                        ...g,
                        memberMints: g.memberMints.filter((m) => m !== mint),
                      };
                    }
                    if (g.id === toGroup.id) {
                      return {
                        ...g,
                        memberMints: [...g.memberMints, mint],
                      };
                    }
                    return g;
                  });
                  setGroups(updated);
                  setPendingConfirmMove(null);
                  setConvertSuccessMessage(`Successfully moved link-owner to "${toGroup.name}".`);
                  setTimeout(() => setConvertSuccessMessage(null), 3000);
                }}
                className="flex-1 bg-emerald-500 hover:bg-emerald-450 text-slate-950 font-extrabold py-2 rounded-lg text-xs transition-colors cursor-pointer"
              >
                Confirm Move
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Floating Success Notification Toast */}
      {actionStatusMsg && (
        <div className="fixed bottom-14 right-6 bg-slate-900 border border-slate-800 px-4 py-3 rounded-xl shadow-2xl flex items-center gap-2.5 max-w-sm z-50 animate-in slide-in-from-bottom-4 duration-350">
          <div className="w-4 h-4 border-2 border-emerald-400 border-t-transparent rounded-full animate-spin shrink-0" />
          <span className="text-xs text-slate-200 font-medium">{actionStatusMsg}</span>
        </div>
      )}

      {convertSuccessMessage && (
        <div className="fixed bottom-14 right-6 bg-slate-900 border border-slate-800 px-4 py-3 rounded-xl shadow-2xl flex items-center gap-2.5 max-w-sm z-50 animate-in slide-in-from-bottom-4 duration-350">
          <div className="w-5 h-5 bg-emerald-500/10 text-emerald-400 rounded-full flex items-center justify-center shrink-0">
            <Check className="w-3.5 h-3.5" />
          </div>
          <span className="text-xs text-slate-200 leading-normal">{convertSuccessMessage}</span>
        </div>
      )}

      {/* Action Modal for Close Empty / Convert to SOL / Burn Fallback */}
      <ConfirmModal
        isOpen={confirmActionModal.isOpen}
        title={confirmActionModal.title}
        message={confirmActionModal.message}
        confirmText={confirmActionModal.confirmText}
        cancelText={confirmActionModal.cancelText || 'Cancel'}
        isScary={confirmActionModal.isScary}
        badgeText={confirmActionModal.isScary ? '🔥 BURN WARNING' : '🧹 RECLAIM RENT'}
        onConfirm={handleExecuteActionModal}
        onCancel={() => setConfirmActionModal((prev) => ({ ...prev, isOpen: false }))}
      />

      {/* Sidebar Delete Group Confirm */}
      <ConfirmModal
        isOpen={!!groupToDelete}
        title="Delete empty group?"
        message={`Are you sure you want to delete the empty group "${groupToDelete?.name}"? This will stop tracking it in your active dashboards.`}
        confirmText="Yes, Delete it"
        cancelText="Cancel"
        onConfirm={() => {
          if (groupToDelete) {
            setGroups((prev) => prev.filter((g) => g.id !== groupToDelete.id));
            if (selectedGroupId === groupToDelete.id) {
              setSelectedGroupId(null);
            }
          }
          setGroupToDelete(null);
        }}
        onCancel={() => setGroupToDelete(null)}
      />

      {/* Page Footer */}
      <footer className="h-10 bg-slate-950 border-t border-slate-850 flex items-center justify-between px-6 shrink-0 w-full mt-10">
        <div className="flex gap-6 items-center">
          <div className="flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
            <span className="text-[10px] text-slate-500 uppercase font-bold tracking-widest">Mainnet-Beta</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-slate-500 uppercase font-bold tracking-widest">Jupiter Routing: <span className="text-emerald-400">Connected</span></span>
          </div>
        </div>
        <div className="flex gap-4 text-[10px] text-slate-500">
          <span>Round Trip Rebalancer · Non-Custodial Multi-Basket Architecture</span>
        </div>
      </footer>
    </div>
  );
}

export default function App() {
  return (
    <WalletProvider>
      <Dashboard />
    </WalletProvider>
  );
}
