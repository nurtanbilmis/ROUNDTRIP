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
import { Token, TokenBalance, BalanceSnapshot, LinkGroup, getGroupColorClasses, formatPrice, COIN_METADATA, DEFAULT_POPULAR_MINTS } from './types';
import { fetchPricesAndInfo } from './jupiter';
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
  MoreVertical
} from 'lucide-react';

const getNextGroupColor = (activeGroups: LinkGroup[]): string => {
  const colors = ['violet', 'amber', 'sky', 'rose', 'lime'];
  const usedColors = activeGroups.map((g) => g.color);
  const freeColor = colors.find((c) => !usedColors.includes(c));
  if (freeColor) return freeColor;
  return colors[activeGroups.length % colors.length];
};

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
    rpcUrl,
    setRpcUrl,
    activeTrackingFraction,
    setActiveTrackingFraction,
  } = useSolanaWallet();

  // Multi-group state
  const [groups, setGroups] = useState<LinkGroup[]>(() => {
    const saved = localStorage.getItem('roundtrip_link_groups');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          return parsed;
        }
      } catch (e) {}
    }
    return [];
  });

  // Scoreboard snapshots (historical ledger)
  const [snapshots, setSnapshots] = useState<BalanceSnapshot[]>(() => {
    const loadedSnapshots: BalanceSnapshot[] = [];
    
    // Load group-specific snapshots
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith('roundtrip_snapshots_')) {
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

    // Backwards compatibility migration
    const oldSaved = localStorage.getItem('roundtrip_snapshots');
    if (oldSaved) {
      try {
        const parsed = JSON.parse(oldSaved);
        if (Array.isArray(parsed)) {
          const grouped: Record<string, BalanceSnapshot[]> = {};
          parsed.forEach((s) => {
            if (s && typeof s === 'object' && s.groupId) {
              if (!grouped[s.groupId]) grouped[s.groupId] = [];
              grouped[s.groupId].push(s);
            }
          });
          Object.entries(grouped).forEach(([gId, snaps]) => {
            localStorage.setItem(`roundtrip_snapshots_${gId}`, JSON.stringify(snaps));
          });
          parsed.forEach((item) => {
            if (item && typeof item === 'object') {
              loadedSnapshots.push(item);
            }
          });
          localStorage.removeItem('roundtrip_snapshots');
        }
      } catch (e) {}
    }

    // Ensure all loaded snapshots have completely unique IDs to prevent duplicate React keys
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

    return finalSnapshots;
  });

  // Master Token metadata dictionary (mint -> Token)
  const [tokenMetadata, setTokenMetadata] = useState<Record<string, Token>>({});
  const attemptedMintsRef = useRef<Set<string>>(new Set());
  const [prices, setPrices] = useState<Record<string, { price: number; change24h: number }>>({});
  const [loadingPrices, setLoadingPrices] = useState(false);

  // Nav routing states
  const [activeTab, setActiveTab] = useState<'wallet' | 'prices' | 'history'>('wallet');
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null); // Null means Screen 1, otherwise active Screen 2
  const [linkingGroupId, setLinkingGroupId] = useState<string | null>(null); // Group currently in Direct Link Mode

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

  // Persist state updates
  useEffect(() => {
    localStorage.setItem('roundtrip_link_groups', JSON.stringify(groups));
  }, [groups]);

  useEffect(() => {
    localStorage.setItem('roundtrip_snapshots', JSON.stringify(snapshots)); // fallback
    
    // Key by groupId
    const grouped: Record<string, BalanceSnapshot[]> = {};
    snapshots.forEach((s) => {
      if (s && s.groupId) {
        if (!grouped[s.groupId]) grouped[s.groupId] = [];
        grouped[s.groupId].push(s);
      }
    });

    Object.entries(grouped).forEach(([gId, snaps]) => {
      localStorage.setItem(`roundtrip_snapshots_${gId}`, JSON.stringify(snaps));
    });

    // Clean up empty/obsolete keys
    const activeGroupIds = new Set(
      snapshots
        .filter((s) => s && s.groupId)
        .map((s) => s.groupId)
    );
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const key = localStorage.key(i);
      if (key && key.startsWith('roundtrip_snapshots_')) {
        const gId = key.replace('roundtrip_snapshots_', '');
        if (!activeGroupIds.has(gId)) {
          localStorage.removeItem(key);
        }
      }
    }
  }, [snapshots]);

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
    const allMints = Array.from(new Set([...groupMints, ...balanceMints, ...popularMints]));

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

  // Auto-refresh rate ticker every 40 seconds
  useEffect(() => {
    if (!connected) return;
    const interval = setInterval(() => {
      refreshPrices();
    }, 40000);
    return () => clearInterval(interval);
  }, [connected, refreshPrices]);

  // Global calculations
  const getWalletBalances = (): TokenBalance[] => {
    const balanceMints = Object.keys(balances).filter((mint) => (balances[mint] || 0) > 0);

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
            onClick={() => connect('demo')}
            className="bg-emerald-600 hover:bg-emerald-500 text-slate-950 text-xs font-bold px-4 py-2 rounded-lg transition-all shadow-md shadow-emerald-900/20 flex items-center gap-1.5 cursor-pointer"
          >
            <Sparkles className="w-3.5 h-3.5" />
            Launch Demo Sandbox
          </button>
        </header>

        {/* Hero Area */}
        <main className="max-w-6xl mx-auto px-6 py-12 flex-grow flex flex-col justify-center space-y-12 w-full">
          <div className="text-center space-y-4">
            <span className="text-xs bg-slate-900 text-slate-450 border border-slate-800 px-3.5 py-1.5 rounded-full font-bold uppercase tracking-widest inline-block">
              100% Non-Custodial Multi-Group Rebalancer
            </span>
            <h2 className="text-4xl md:text-5xl font-black text-white tracking-tight leading-tight max-w-2xl mx-auto">
              Equal-Weight Rebalancing for <span className="text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 to-emerald-500">Solana Bag Holders</span>
            </h2>
            <p className="text-slate-400 text-sm max-w-xl mx-auto leading-relaxed">
              Nothing is ever deposited or withdrawn. Turn volatility into a direct compound loop with color-coded link-groups right inside your wallet.
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
                onClick={() => connect('real')}
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

              <div className="relative flex py-1 items-center">
                <div className="flex-grow border-t border-slate-800"></div>
                <span className="flex-shrink mx-3 text-slate-500 text-[10px] uppercase font-bold tracking-wider">or paper-trade</span>
                <div className="flex-grow border-t border-slate-800"></div>
              </div>

              <button
                onClick={() => connect('demo')}
                className="w-full bg-slate-950 border border-emerald-500/20 hover:bg-slate-900 text-emerald-400 text-xs font-bold py-3.5 rounded-xl transition-all flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <Sparkles className="w-3.5 h-3.5" />
                Launch Demo Sandbox
              </button>

              <div className="bg-slate-950 border border-slate-850 rounded-xl p-4 text-[11px] text-slate-500 leading-normal">
                <span className="text-slate-300 font-bold block mb-1">Simulated Sandbox includes:</span>
                • Fully simulated wallet inventory<br />
                • Interactive price movement & volatility drift<br />
                • Instant equal-weight rebalance swap simulations
              </div>
            </div>

          </div>

          <DisclaimerCard />
        </main>

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
                The preset link-group has been initialized and saved. Connect your wallet or launch the Demo Sandbox to start equal-weight tracking and volatility harvesting.
              </p>
              <div className="flex flex-col gap-2 pt-2">
                <button
                  onClick={() => {
                    setShowLandingSuccess(null);
                    connect('demo');
                  }}
                  className="w-full bg-emerald-500 hover:bg-emerald-450 text-slate-950 font-extrabold py-2.5 rounded-lg text-xs transition-colors cursor-pointer"
                >
                  Launch Demo Sandbox
                </button>
                <button
                  onClick={() => {
                    setShowLandingSuccess(null);
                    connect('real');
                  }}
                  className="w-full bg-slate-800 hover:bg-slate-700 text-white font-semibold py-2.5 rounded-lg text-xs transition-colors cursor-pointer"
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
        <div className="flex items-center gap-3">
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
              {rpcUrl === 'https://api.mainnet-beta.solana.com' && (
                <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 bg-amber-500 rounded-full" />
              )}
            </button>
            {showRpcSettings && (
              <div className="absolute right-0 top-11 w-64 bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-xl z-50 text-xs space-y-3">
                <h4 className="font-bold text-white uppercase tracking-wider">Node RPC Config</h4>
                <input
                  type="text"
                  value={rpcUrl}
                  onChange={(e) => setRpcUrl(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 font-mono text-[10px] text-white focus:outline-none"
                />
                <p className="text-[9px] text-slate-500">
                  Custom nodes bypass public Mainnet rate limits.
                </p>
                {rpcUrl === 'https://api.mainnet-beta.solana.com' && (
                  <div className="p-2.5 bg-amber-500/10 border border-amber-500/20 rounded-lg text-[9px] text-amber-400 leading-normal animate-in fade-in duration-200">
                    <strong>Notice:</strong> Using public Solana RPC node. Live Jupiter quoting & confirmations may be throttled. Custom node is recommended for optimal speed.
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Connection Pill */}
          <div className="flex items-center gap-4">
            <div className="flex flex-col items-end">
              <span className="text-[9px] text-slate-500 uppercase font-black tracking-wider">
                {type === 'demo' ? 'SANDBOX PROTOCOL' : 'CONNECTED WEB3'}
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
            <button
              onClick={() => setShowConvertModal(true)}
              className="comic-btn bg-emerald-500 hover:bg-emerald-450 text-slate-950 text-xs font-bold px-4 py-2 rounded-lg transition-all shadow-md shadow-emerald-500/10 flex items-center gap-1.5 cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              Convert & Link
            </button>
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
          />
        ) : (
          /* SCREEN 1: WALLET HOME VIEW */
          <>
            {activeTab === 'wallet' && (
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 animate-in fade-in duration-200">
                
                {/* Left Legend / Group List Sidebar */}
                <div className="space-y-6">
                  <div className="bg-slate-900 border border-slate-850 rounded-2xl p-6 shadow-xl space-y-4">
                    <div className="border-b border-slate-800 pb-3 flex justify-between items-center">
                      <h3 className="text-sm font-extrabold text-white flex items-center gap-1.5">
                        <Layers className="w-4 h-4 text-emerald-400" />
                        Link-Groups Legend
                      </h3>
                      
                      {!showCreateGroup && (
                        <button
                          onClick={() => setShowCreateGroup(true)}
                          className="comic-btn text-[10px] bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/20 px-2.5 py-1 rounded-lg font-bold cursor-pointer"
                        >
                          + New Group
                        </button>
                      )}
                    </div>

                    {/* Inline Group creation form */}
                    {showCreateGroup && (
                      <div className="bg-slate-950 p-4 border border-slate-850 rounded-xl space-y-3">
                        <span className="text-[10px] font-bold text-slate-450 uppercase block">Name Your Link-Group:</span>
                        <input
                          type="text"
                          value={newGroupName}
                          onChange={(e) => setNewGroupName(e.target.value)}
                          placeholder="e.g. AI & Tech"
                          className="w-full bg-slate-900 border border-slate-800 rounded-lg p-2 text-xs text-white focus:outline-none"
                        />
                        <div className="flex gap-2">
                          <button
                            onClick={handleCreateGroup}
                            className="comic-btn flex-grow bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold py-1.5 rounded text-[11px] cursor-pointer"
                          >
                            Create Group
                          </button>
                          <button
                            onClick={() => setShowCreateGroup(false)}
                            className="comic-btn bg-slate-850 text-slate-400 font-semibold px-3 py-1.5 rounded text-[11px] cursor-pointer"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Groups list */}
                    <div className="space-y-3">
                      {groups.length === 0 ? (
                        <div className="text-center py-6 text-slate-500 text-xs">
                          No active link-groups. Click "+ New Group" above to group your tokens.
                        </div>
                      ) : (
                        groups.map((g) => {
                          const gColors = getGroupColorClasses(g.color);
                          const gStats = getGroupStats(g);

                          return (
                            <div 
                              key={g.id}
                              className={`p-4 bg-slate-950 border ${linkingGroupId === g.id ? 'border-emerald-500 ring-1 ring-emerald-500/35' : 'border-slate-850'} rounded-xl transition-all relative flex flex-col gap-3 group`}
                            >
                              <div className="flex justify-between items-start">
                                <div 
                                  onClick={() => setSelectedGroupId(g.id)}
                                  className="space-y-1 cursor-pointer flex-grow"
                                >
                                  <div className="flex items-center gap-2">
                                    <span className="font-extrabold text-white text-xs hover:underline">{g.name}</span>
                                    <span className={`w-2 h-2 rounded-full ${gColors.bgSolid}`} />
                                  </div>
                                  <span className="text-[10px] text-slate-500 font-medium block">
                                    {g.memberMints.length} coins linked
                                  </span>
                                </div>

                                <div className="text-right">
                                  <div className="font-mono font-bold text-slate-200 text-xs">
                                    ${gStats.totalUsd.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                  </div>
                                  <button
                                    onClick={() => setSelectedGroupId(g.id)}
                                    className={`text-[9px] ${gColors.text} font-bold hover:underline`}
                                  >
                                    View details →
                                  </button>
                                  {g.memberMints.length === 0 && (
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setGroupToDelete(g);
                                      }}
                                      className="text-[9px] text-rose-400 font-bold hover:underline block mt-1 cursor-pointer"
                                    >
                                      Delete Empty Group
                                    </button>
                                  )}
                                </div>
                              </div>

                              {/* Action tools */}
                              <div className="flex justify-between items-center border-t border-slate-900 pt-3">
                                {gStats.isRebalanceAdvisable ? (
                                  <span className="text-[9px] bg-amber-500/10 text-amber-400 border border-amber-500/20 px-2 py-0.5 rounded-md font-bold">
                                    ⚠️ Rebalance advisable
                                  </span>
                                ) : (
                                  <span className="text-[9px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-2 py-0.5 rounded-md font-bold">
                                    ✓ Balanced
                                  </span>
                                )}

                                <button
                                  onClick={() => {
                                    if (linkingGroupId === g.id) {
                                      setLinkingGroupId(null);
                                    } else {
                                      setLinkingGroupId(g.id);
                                    }
                                  }}
                                  className="text-[10px] bg-slate-900 hover:bg-slate-850 text-slate-300 font-bold px-2.5 py-1 rounded-md border border-slate-800 cursor-pointer"
                                >
                                  {linkingGroupId === g.id ? 'Done Linking' : '🔗 Link Coins'}
                                </button>
                              </div>
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>

                  {/* Preset Group Spawn cards */}
                  <div className="bg-slate-900 border border-slate-850 rounded-2xl p-6 shadow-xl space-y-4">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                      <Sparkles className="w-4.5 h-4.5 text-emerald-400" />
                      Add Presets as New Groups
                    </h3>
                    
                    <div className="grid grid-cols-1 gap-2.5">
                      {PRESETS.map((p) => (
                        <button
                          key={p.name}
                          onClick={() => setSelectedPreset(p)}
                          className="w-full p-3 bg-slate-950 hover:bg-slate-850 border border-slate-850 hover:border-slate-800 rounded-xl flex items-center justify-between text-left transition-all cursor-pointer"
                        >
                          <div className="space-y-0.5">
                            <span className="font-extrabold text-white text-xs">{p.name}</span>
                            <span className="text-[10px] text-slate-500 block leading-tight">{p.riskLabel} Risk</span>
                          </div>
                          <ArrowRight className="w-3.5 h-3.5 text-emerald-400" />
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Right Wallet Grid (2 Cols) */}
                <div className="lg:col-span-2 space-y-4">
                  
                  {/* Direct Link mode notification banner */}
                  {linkingGroupId && (() => {
                    const groupToLink = groups.find((g) => g.id === linkingGroupId)!;
                    const gColors = getGroupColorClasses(groupToLink.color);
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

                  <div className="bg-slate-900 border border-slate-850 rounded-2xl p-6 shadow-xl relative overflow-hidden">
                    <h3 className="text-md font-bold text-white mb-4">On-Chain Wallet Inventory</h3>
                    
                    <div className="space-y-3">
                      {walletBalances.map((item) => {
                        const owningGroup = groups.find((g) => g.memberMints.includes(item.mint));
                        const isLinked = !!owningGroup;
                        const gColors = owningGroup ? getGroupColorClasses(owningGroup.color) : null;

                        const handleRowClick = () => {
                          if (linkingGroupId) {
                            handleToggleCoinLinking(item.mint);
                          } else if (owningGroup) {
                            setSelectedGroupId(owningGroup.id);
                          } else {
                            setConvertSuccessMessage(`This asset is currently unlinked. Click "Link Coins" on a group in the sidebar to add it to an equal-weight rebalancing basket.`);
                            setTimeout(() => setConvertSuccessMessage(null), 4500);
                          }
                        };

                        return (
                          <div
                            key={item.mint}
                            onClick={handleRowClick}
                            className={`p-4 rounded-xl border transition-all cursor-pointer flex justify-between items-center gap-3 relative ${
                              linkingGroupId 
                                ? 'hover:border-emerald-500' 
                                : isLinked 
                                ? `border-l-4 ${gColors?.borderL} bg-slate-950 border-slate-800` 
                                : 'bg-slate-950/60 border-slate-850 opacity-60 hover:opacity-100'
                            }`}
                          >
                            <div className="flex items-center gap-3">
                              <div className="space-y-1">
                                <div className="flex items-center gap-2">
                                  <strong className="text-white font-extrabold text-sm">{item.symbol}</strong>
                                  
                                  {owningGroup ? (
                                    <span 
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setOpenMenuMint(openMenuMint === item.mint ? null : item.mint);
                                      }}
                                      className={`text-[9px] uppercase font-extrabold tracking-widest px-2 py-0.5 rounded cursor-pointer hover:bg-slate-800 transition-colors ${gColors?.bg} ${gColors?.text}`}
                                    >
                                      {owningGroup.name}
                                    </span>
                                  ) : (
                                    <span 
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setOpenMenuMint(openMenuMint === item.mint ? null : item.mint);
                                      }}
                                      className="text-[9px] bg-slate-900 text-slate-500 font-extrabold px-2 py-0.5 rounded border border-slate-850 cursor-pointer hover:text-slate-300 transition-colors"
                                    >
                                      Unlinked
                                    </span>
                                  )}
                                </div>
                                {(item as any).loadingMetadata ? (
                                  <span className="text-[10px] text-amber-500 animate-pulse font-mono">
                                    metadata loading...
                                  </span>
                                ) : (
                                  <span className="text-[10px] text-slate-500 font-mono">
                                    {item.amountHuman.toLocaleString(undefined, { maximumFractionDigits: 6 })} units
                                  </span>
                                )}
                              </div>
                            </div>

                            <div className="flex items-center gap-4">
                              <div className="text-right flex flex-col justify-start items-end gap-1 text-xs">
                                <div className="font-mono font-black text-white">
                                  ${item.usdValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                </div>
                                <div className="text-[10px] text-slate-400 font-mono">
                                  Price: {formatPrice(item.price)}{' '}
                                  <span className={item.change24h >= 0 ? 'text-emerald-400' : 'text-rose-400'}>
                                    ({item.change24h >= 0 ? '+' : ''}{item.change24h.toFixed(1)}%)
                                  </span>
                                </div>
                              </div>

                              {/* Action Menu Trigger & Dropdown */}
                              {!linkingGroupId && (
                                <div className="relative z-10">
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setOpenMenuMint(openMenuMint === item.mint ? null : item.mint);
                                    }}
                                    className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-850 rounded-lg transition-colors cursor-pointer"
                                    title="Asset actions"
                                  >
                                    <MoreVertical className="w-4 h-4" />
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
                                        className="absolute right-0 mt-1 w-48 bg-slate-900 border border-slate-800 rounded-lg shadow-2xl z-50 py-1 text-left animate-in fade-in duration-100"
                                        onClick={(e) => e.stopPropagation()}
                                      >
                                        {isLinked ? (
                                          <>
                                            <button
                                              onClick={() => {
                                                setSelectedGroupId(owningGroup.id);
                                                setOpenMenuMint(null);
                                              }}
                                              className="w-full text-left px-3 py-2 text-xs text-slate-200 hover:bg-slate-800 font-medium cursor-pointer"
                                            >
                                              👁️ View Group
                                            </button>
                                            
                                            <button
                                              onClick={() => {
                                                setGroups((prev) => prev.map((g) => g.id === owningGroup.id ? { ...g, memberMints: g.memberMints.filter((m) => m !== item.mint) } : g));
                                                setOpenMenuMint(null);
                                              }}
                                              className="w-full text-left px-3 py-2 text-xs text-rose-400 hover:bg-slate-800 font-medium cursor-pointer border-b border-slate-850"
                                            >
                                              ✕ Unlink from Group
                                            </button>
                                            
                                            <div className="px-3 py-1.5 text-[9px] text-slate-500 font-bold uppercase tracking-wider">
                                              Move to Group
                                            </div>
                                            {groups.filter(g => g.id !== owningGroup.id).length === 0 ? (
                                              <div className="px-3 py-1 text-[10px] text-slate-500 italic">No other groups</div>
                                            ) : (
                                              groups.filter(g => g.id !== owningGroup.id).map(g => (
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
                                              ))
                                            )}
                                          </>
                                        ) : (
                                          <>
                                            <div className="px-3 py-1.5 text-[9px] text-slate-500 font-bold uppercase tracking-wider">
                                              Add to Group
                                            </div>
                                            {groups.length === 0 ? (
                                              <div className="px-3 py-1 text-[10px] text-slate-500 italic">No groups created yet</div>
                                            ) : (
                                              groups.map(g => (
                                                <button
                                                  key={g.id}
                                                  onClick={() => {
                                                    setGroups((prev) => prev.map((currentG) => currentG.id === g.id ? { ...currentG, memberMints: [...currentG.memberMints, item.mint] } : currentG));
                                                    setOpenMenuMint(null);
                                                  }}
                                                  className="w-full text-left px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-800 truncate flex items-center gap-1.5 cursor-pointer"
                                                >
                                                  <span className={`w-1.5 h-1.5 rounded-full ${getGroupColorClasses(g.color).bgSolid}`} />
                                                  {g.name}
                                                </button>
                                              ))
                                            )}
                                          </>
                                        )}
                                      </div>
                                    </>
                                  )}
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                </div>

              </div>
            )}

            {activeTab === 'prices' && (
              <PriceView
                balancesWithPrice={walletBalances}
                loadingPrices={loadingPrices}
                onRefreshPrices={refreshPrices}
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

            setConvertSuccessMessage("Conversion executed successfully! Your link-group assets have been funded and tracked.");
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
      {convertSuccessMessage && (
        <div className="fixed bottom-14 right-6 bg-slate-900 border border-slate-800 px-4 py-3 rounded-xl shadow-2xl flex items-center gap-2.5 max-w-sm z-50 animate-in slide-in-from-bottom-4 duration-350">
          <div className="w-5 h-5 bg-emerald-500/10 text-emerald-400 rounded-full flex items-center justify-center shrink-0">
            <Check className="w-3.5 h-3.5" />
          </div>
          <span className="text-xs text-slate-200 leading-normal">{convertSuccessMessage}</span>
        </div>
      )}

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
          <span>Round Trip Rebalancer — Non-Custodial Multi-Basket Architecture</span>
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
