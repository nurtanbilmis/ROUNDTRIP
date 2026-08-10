import React, { useState, useEffect } from 'react';
import { 
  ArrowUpDown, 
  RefreshCw, 
  AlertTriangle, 
  ShieldCheck, 
  Check, 
  Info, 
  Trash2, 
  HelpCircle, 
  AlertCircle, 
  Loader2, 
  ArrowLeft, 
  TrendingUp, 
  Play, 
  Plus, 
  Coins, 
  FileText, 
  Calendar, 
  Award,
  Sparkles,
  Edit2,
  Settings
} from 'lucide-react';
import { Token, TokenBalance, RebalanceSwap, LinkGroup, getGroupColorClasses, formatPrice, COIN_LINE_COLORS } from '../types';
import { useSolanaWallet } from './WalletProvider';
import { fetchQuote, fetchVerifiedTokens } from '../jupiter';
import ScoreboardView from './ScoreboardView';
import ConfirmModal from './ConfirmModal';
import WithdrawModal from './WithdrawModal';
import { 
  ResponsiveContainer, 
  LineChart, 
  Line, 
  XAxis, 
  YAxis, 
  Tooltip as RechartsTooltip, 
  CartesianGrid 
} from 'recharts';

// Constants
const DRIFT_THRESHOLD = 5.0; // percentage points
const MIN_TRADE_FLOOR_USD = 1.50; // Skip trades under $1.50 USD
const CRASH_THRESHOLD_24H = -40.0; // Drop representing crash case

interface AllocationViewProps {
  group: LinkGroup;
  groups: LinkGroup[];
  allBalances: Record<string, number>; // mint -> base units
  prices: Record<string, { price: number; change24h: number }>;
  tokenMetadata: Record<string, Token>; // mint -> Token
  onBack: () => void;
  onUpdateGroup: (updated: LinkGroup) => void;
  onDeleteGroup: (id: string) => void;
  onRefreshPrices: () => Promise<void>;
  onSaveSnapshot: (
    groupId: string,
    groupName: string,
    snapshotBalances: TokenBalance[],
    totalUsd: number,
    eventType?: 'convert' | 'rebalance' | 'cashout' | 'membership' | 'manual'
  ) => void;
  groupSnapshots: any[];
  loadingPrices?: boolean;
  onMoveToken?: (mint: string, fromGroup: LinkGroup, toGroup: LinkGroup) => void;
  onOpenAddBasket?: () => void;
}

export default function AllocationView({
  group,
  groups,
  allBalances,
  prices,
  tokenMetadata,
  onBack,
  onUpdateGroup,
  onDeleteGroup,
  onRefreshPrices,
  onSaveSnapshot,
  groupSnapshots,
  loadingPrices = false,
  onMoveToken,
  onOpenAddBasket,
}: AllocationViewProps) {
  const { signAndExecuteSwap, publicKey, type, refreshBalances, slippageBps } = useSolanaWallet();

  const [loadingQuotes, setLoadingQuotes] = useState(false);
  const [rebalancing, setRebalancing] = useState(false);
  const [rebalanceStep, setRebalanceStep] = useState<number>(0);
  const [rebalanceStatus, setRebalanceStatus] = useState<Record<number, { success: boolean; txId?: string; error?: string }>>({});
  const [rebalanceInitiated, setRebalanceInitiated] = useState(false);
  const [previewActive, setPreviewActive] = useState(false);
  const [showExecuteAnywayConfirm, setShowExecuteAnywayConfirm] = useState(false);
  const [selectedSwapIndices, setSelectedSwapIndices] = useState<Record<number, boolean>>({});
  
  const [swapQuotes, setSwapQuotes] = useState<Record<number, { quote: any; error?: string }>>({});
  const [showTooltip, setShowTooltip] = useState(false);
  const [groupNameInput, setGroupNameInput] = useState(group.name);
  const inputRef = React.useRef<HTMLInputElement>(null);

  // Reset rebalance gate on group switch
  useEffect(() => {
    setRebalanceInitiated(false);
    setPreviewActive(false);
    setSelectedSwapIndices({});
  }, [group.id]);

  // States for membership editing and warnings
  const [confirmRemoveMint, setConfirmRemoveMint] = useState<string | null>(null);
  const [showInlineAddPicker, setShowInlineAddPicker] = useState(false);

  // Local state for target weights as percentages (0 to 100)
  const [tempWeights, setTempWeights] = useState<Record<string, number>>({});

  useEffect(() => {
    const initialWeights: Record<string, number> = {};
    group.memberMints.forEach((mint) => {
      const weightFraction = (group.targetWeights && group.targetWeights[mint] !== undefined)
        ? group.targetWeights[mint]
        : (group.memberMints.length > 0 ? 1 / group.memberMints.length : 0);
      initialWeights[mint] = Number((weightFraction * 100).toFixed(1));
    });
    setTempWeights(initialWeights);
  }, [group.id, group.memberMints]);

  const handleWeightChange = (mint: string, valPercent: number) => {
    setTempWeights((prev) => ({
      ...prev,
      [mint]: valPercent,
    }));
  };

  const handleNormalize = () => {
    const sum = Object.keys(tempWeights).reduce((sum, mint) => sum + (tempWeights[mint] || 0), 0);
    if (sum === 0) return;
    const normalized: Record<string, number> = {};
    Object.keys(tempWeights).forEach((mint) => {
      normalized[mint] = Number((((tempWeights[mint] || 0) / sum) * 100).toFixed(1));
    });
    setTempWeights(normalized);
  };

  const handleResetToEqual = () => {
    const equalVal = group.memberMints.length > 0 ? 100 / group.memberMints.length : 0;
    const reset: Record<string, number> = {};
    group.memberMints.forEach((mint) => {
      reset[mint] = Number(equalVal.toFixed(1));
    });
    setTempWeights(reset);
  };

  const handleSaveWeights = () => {
    const finalTargetWeights: Record<string, number> = {};
    Object.keys(tempWeights).forEach((mint) => {
      finalTargetWeights[mint] = tempWeights[mint] / 100;
    });
    onUpdateGroup({
      ...group,
      targetWeights: finalTargetWeights,
    });
  };
  const [verifiedTokens, setVerifiedTokens] = useState<Token[]>([]);
  const [loadingVerifiedTokens, setLoadingVerifiedTokens] = useState(false);
  const [addCoinSearchQuery, setAddCoinSearchQuery] = useState('');
  const [checkingLiquidity, setCheckingLiquidity] = useState<string | null>(null);

  // Fetch verified tokens list when add picker is opened
  useEffect(() => {
    if (showInlineAddPicker && verifiedTokens.length === 0) {
      const loadVerified = async () => {
        setLoadingVerifiedTokens(true);
        try {
          const tokens = await fetchVerifiedTokens();
          setVerifiedTokens(tokens);
        } catch (err) {
          console.error('Failed to load verified tokens:', err);
        } finally {
          setLoadingVerifiedTokens(false);
        }
      };
      loadVerified();
    }
  }, [showInlineAddPicker, verifiedTokens.length]);
  const [pendingWarningToken, setPendingWarningToken] = useState<{ token: Token; liquidity: number } | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showUnlinkAllConfirm, setShowUnlinkAllConfirm] = useState(false);

  // Cash out / Proportional Withdraw trigger state
  const [isCashingOut, setIsCashingOut] = useState(false);
  const [showSnapshotSuccess, setShowSnapshotSuccess] = useState(false);

  const USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';

  // Sync title input with group changes
  useEffect(() => {
    setGroupNameInput(group.name);
  }, [group.id, group.name]);

  // Handle inline rename
  const handleRenameGroup = (newName: string) => {
    setGroupNameInput(newName);
    if (newName.trim()) {
      onUpdateGroup({
        ...group,
        name: newName.trim(),
      });
    }
  };

  // Membership editing functions
  const handleRemoveCoin = (mint: string) => {
    onUpdateGroup({
      ...group,
      memberMints: group.memberMints.filter((m) => m !== mint),
    });
    setConfirmRemoveMint(null);
  };

  const handleAddCoinPreCheck = async (token: Token) => {
    const mint = token.address;
    const safeMints = [
      'So11111111111111111111111111111111111111112', // SOL
      'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', // USDC
      'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB', // USDT
    ];
    if (safeMints.includes(mint)) {
      handleAddCoinDirect(mint);
      return;
    }

    setCheckingLiquidity(mint);
    try {
      const { fetchTokenLiquidity } = await import('../jupiter');
      const liq = await fetchTokenLiquidity(mint);
      if (liq < 50000) {
        setPendingWarningToken({ token, liquidity: liq });
      } else {
        handleAddCoinDirect(mint);
      }
    } catch (err) {
      handleAddCoinDirect(mint);
    } finally {
      setCheckingLiquidity(null);
    }
  };

  const handleAddCoinDirect = (mint: string) => {
    if (group.memberMints.includes(mint)) return;
    onUpdateGroup({
      ...group,
      memberMints: [...group.memberMints, mint],
    });
    setShowInlineAddPicker(false);
  };

  // 1. Map other token details and calculate balances scoped to this group
  const getGroupBalances = (overrideBalances?: Record<string, number>): TokenBalance[] => {
    const members = group.memberMints;
    if (members.length === 0) return [];

    const activeBalances = overrideBalances || allBalances;

    const list = members.map((mint) => {
      const meta = tokenMetadata[mint] || { address: mint, symbol: mint.substring(0, 4), name: 'Unknown Token', decimals: undefined };
      const priceInfo = prices[mint] || { price: 0, change24h: 0 };
      const rawBalance = activeBalances[mint] || 0;
      const decimals = meta.decimals;
      const isDecimalsUnknown = decimals === undefined;
      const resolvedDecimals = decimals !== undefined ? decimals : 9;
      const amountHuman = isDecimalsUnknown ? 0 : rawBalance / Math.pow(10, resolvedDecimals);
      const usdValue = isDecimalsUnknown ? 0 : amountHuman * priceInfo.price;

      return {
        mint,
        symbol: meta.symbol,
        decimals: resolvedDecimals,
        isDecimalsUnknown,
        amount: rawBalance,
        amountHuman,
        price: priceInfo.price,
        usdValue,
        currentWeight: 0, // calculated below
        targetWeight: 0,  // calculated below
        drift: 0,         // calculated below
        change24h: priceInfo.change24h,
      };
    });

    const calculatedTokens = list.filter((item) => !item.isDecimalsUnknown);
    const totalGroupUsd = calculatedTokens.reduce((sum, item) => sum + item.usdValue, 0);

    return list.map((item) => {
      if (item.isDecimalsUnknown) {
        return {
          ...item,
          currentWeight: 0,
          targetWeight: 0,
          drift: 0,
        };
      }
      const currentWeight = totalGroupUsd > 0 ? (item.usdValue / totalGroupUsd) * 100 : 0;
      const weightFraction = (group.targetWeights && group.targetWeights[item.mint] !== undefined)
        ? group.targetWeights[item.mint]
        : (calculatedTokens.length > 0 ? 1 / calculatedTokens.length : 0);
      const targetWeight = weightFraction * 100;
      const drift = currentWeight - targetWeight;
      return {
        ...item,
        currentWeight,
        targetWeight,
        drift,
      };
    });
  };

  const groupBalances = getGroupBalances();
  const totalUsdValue = groupBalances.reduce((sum, item) => sum + item.usdValue, 0);
  const targetPercent = group.memberMints.length > 0 ? 100 / group.memberMints.length : 0;

  // Drift status
  const maxAbsoluteDrift = groupBalances.reduce(
    (max, item) => Math.max(max, Math.abs(item.drift)),
    0
  );
  
  // Rebalance is available if there is at least one coin and we have some value
  const rebalanceAvailable = groupBalances.length > 1 && totalUsdValue > 0;

  const targetWeightsSum = groupBalances.reduce((sum, item) => sum + item.targetWeight, 0);
  const isTargetWeightsSumValid = groupBalances.length === 0 || Math.abs(targetWeightsSum - 100) < 0.15;
  const tempWeightsSum = Object.keys(tempWeights).reduce((sum, mint) => sum + (tempWeights[mint] || 0), 0);

  // Crash Warnings
  const crashWarnings = groupBalances.filter((item) => {
    return item.amountHuman > 0 && (item.change24h || 0) <= CRASH_THRESHOLD_24H;
  });

  // 2. Base units greedy matching rebalance swaps builder
  const calculateRebalanceSwaps = (bypassFloor: boolean = false): RebalanceSwap[] => {
    // Filter out unknown decimals
    const activeMembers = groupBalances.filter((b) => !(b as any).isDecimalsUnknown);
    if (activeMembers.length < 2 || totalUsdValue <= 0) return [];

    const sells: { mint: string; symbol: string; decimals: number; amountUsdToSell: number }[] = [];
    const buys: { mint: string; symbol: string; decimals: number; amountUsdToBuy: number }[] = [];

    const calculatedTokens = activeMembers;
    const activeTotalUsd = calculatedTokens.reduce((sum, item) => sum + item.usdValue, 0);

    for (const item of calculatedTokens) {
      const weightFraction = (group.targetWeights && group.targetWeights[item.mint] !== undefined)
        ? group.targetWeights[item.mint]
        : (calculatedTokens.length > 0 ? 1 / calculatedTokens.length : 0);
      const targetUsd = weightFraction * activeTotalUsd;
      const differenceUsd = item.usdValue - targetUsd;

      if (differenceUsd > 0) {
        sells.push({
          mint: item.mint,
          symbol: item.symbol,
          decimals: item.decimals,
          amountUsdToSell: differenceUsd,
        });
      } else if (differenceUsd < 0) {
        buys.push({
          mint: item.mint,
          symbol: item.symbol,
          decimals: item.decimals,
          amountUsdToBuy: Math.abs(differenceUsd),
        });
      }
    }

    sells.sort((a, b) => b.amountUsdToSell - a.amountUsdToSell);
    buys.sort((a, b) => b.amountUsdToBuy - a.amountUsdToBuy);

    const swapsList: RebalanceSwap[] = [];
    let sellIdx = 0;
    let buyIdx = 0;

    const floor = bypassFloor ? 0.000001 : MIN_TRADE_FLOOR_USD;

    while (sellIdx < sells.length && buyIdx < buys.length) {
      const sell = sells[sellIdx];
      const buy = buys[buyIdx];

      const matchUsd = Math.min(sell.amountUsdToSell, buy.amountUsdToBuy);

      if (matchUsd >= floor) {
        const sellTokenInfo = calculatedTokens.find((b) => b.mint === sell.mint)!;
        const sellAmountHuman = matchUsd / sellTokenInfo.price;
        const sellAmountBase = Math.floor(sellAmountHuman * Math.pow(10, sell.decimals));

        if (sellAmountBase > 0) {
          swapsList.push({
            inputMint: sell.mint,
            inputSymbol: sell.symbol,
            inputDecimals: sell.decimals,
            outputMint: buy.mint,
            outputSymbol: buy.symbol,
            outputDecimals: buy.decimals,
            amount: sellAmountBase,
            amountHuman: sellAmountHuman,
            usdValue: matchUsd,
          });
        }
      }

      sell.amountUsdToSell -= matchUsd;
      buy.amountUsdToBuy -= matchUsd;

      if (sell.amountUsdToSell < floor) sellIdx++;
      if (buy.amountUsdToBuy < floor) buyIdx++;
    }

    return swapsList;
  };

  const currentSwaps = calculateRebalanceSwaps(false);
  const previewSwaps = calculateRebalanceSwaps(true);
  const activeSwaps = previewActive ? previewSwaps : currentSwaps;
  const previewRebalanceAvailable = groupBalances.filter(item => item.amountHuman > 0 && item.usdValue > 0).length >= 2;

  // Initialize all active swaps as selected by default when activeSwaps length or preview state changes
  useEffect(() => {
    if (rebalancing) return;
    const initialSelection: Record<number, boolean> = {};
    activeSwaps.forEach((_, idx) => {
      initialSelection[idx] = true;
    });
    setSelectedSwapIndices(initialSelection);
  }, [activeSwaps.length, previewActive, rebalanceInitiated, rebalancing]);

  // Find SOL price for network fee estimation
  const solPrice = prices['So11111111111111111111111111111111111111112']?.price || 140;

  let totalSlippageLossUsd = 0;
  let totalNetworkFeeUsd = 0;

  activeSwaps.forEach((swap, idx) => {
    if (selectedSwapIndices[idx] === false) return; // skip unselected trades

    const quoteInfo = swapQuotes[idx];
    if (quoteInfo?.quote) {
      const outputCoinPrice = prices[swap.outputMint]?.price || 0;
      const quotedOutput = parseInt(quoteInfo.quote.outAmount || '0') / Math.pow(10, swap.outputDecimals);
      const slippageLoss = Math.max(0, swap.usdValue - (quotedOutput * outputCoinPrice));
      totalSlippageLossUsd += slippageLoss;
    } else {
      // Estimate 0.5% slippage placeholder before quote loaded
      totalSlippageLossUsd += swap.usdValue * 0.005;
    }
    totalNetworkFeeUsd += 0.00005 * solPrice;
  });

  const totalEstimatedCostUsd = totalSlippageLossUsd + totalNetworkFeeUsd;

  const previewResultingBalances = groupBalances.map(coin => {
    let netUnitChange = 0;
    let netUsdChange = 0;

    activeSwaps.forEach((swap, idx) => {
      if (selectedSwapIndices[idx] === false) return; // skip unselected trades

      const quoteInfo = swapQuotes[idx];
      const quotedOutput = quoteInfo?.quote 
        ? (parseInt(quoteInfo.quote.outAmount || '0') / Math.pow(10, swap.outputDecimals))
        : (swap.usdValue / coin.price); // fallback to ideal if quote not loaded yet

      if (swap.inputMint === coin.mint) {
        netUnitChange -= swap.amountHuman;
        netUsdChange -= swap.usdValue;
      }
      if (swap.outputMint === coin.mint) {
        netUnitChange += quotedOutput;
        netUsdChange += (quotedOutput * coin.price);
      }
    });

    const resultingAmountHuman = Math.max(0, coin.amountHuman + netUnitChange);
    const resultingUsdValue = Math.max(0, coin.usdValue + netUsdChange);

    return {
      ...coin,
      netUnitChange,
      resultingAmountHuman,
      resultingUsdValue,
    };
  });

  const totalResultingUsdValue = previewResultingBalances.reduce((sum, item) => sum + item.resultingUsdValue, 0);

  const resultingBalancesWithWeights = previewResultingBalances.map(item => {
    const resultingWeight = totalResultingUsdValue > 0 ? (item.resultingUsdValue / totalResultingUsdValue) * 100 : 0;
    return {
      ...item,
      resultingWeight,
    };
  });

  const getCostVerdict = (drift: number, cost: number) => {
    const costStr = cost < 0.01 ? `<$0.01` : `$${cost.toFixed(2)}`;
    const driftStr = `${drift.toFixed(1)}%`;

    if (drift < 1.0) {
      return `Correcting ~${driftStr} drift would cost ~${costStr} in fees/slippage, likely not worth it due to minimal variance.`;
    } else if (drift < 5.0) {
      if (cost > 0.50) {
        return `Correcting ~${driftStr} drift would cost ~${costStr} in fees/slippage, likely not worth it due to high transaction costs.`;
      }
      return `Correcting ~${driftStr} drift would cost ~${costStr} in fees/slippage: roughly break-even, may be performed for precision.`;
    } else {
      if (cost > 2.00) {
        return `Correcting ~${driftStr} drift would cost ~${costStr} in fees/slippage: high fee impact, but recommended to restore target weights.`;
      }
      return `Correcting ~${driftStr} drift would cost ~${costStr} in fees/slippage: highly efficient, recommended to restore target weights.`;
    }
  };

  // Generate serialized key representing the active swaps to safely depend on for quote refreshing
  const activeSwapsKey = activeSwaps.map(s => `${s.inputMint}-${s.outputMint}-${s.amount}`).join(',');

  // Load quotes from Jupiter for Rebalancing Swaps ON DEMAND (only when user initiates rebalance)
  useEffect(() => {
    async function loadQuotes() {
      if (activeSwaps.length === 0) {
        setSwapQuotes({});
        return;
      }

      setLoadingQuotes(true);
      const quotesRecord: Record<number, { quote: any; error?: string }> = {};

      for (let i = 0; i < activeSwaps.length; i++) {
        const swap = activeSwaps[i];
        try {
          if (swap.amount <= 0) {
            throw new Error('Trade size is zero');
          }

          const q = await fetchQuote({
            inputMint: swap.inputMint,
            outputMint: swap.outputMint,
            amount: swap.amount.toString(),
            slippageBps,
          });

          const outAmt = q ? parseInt(q.outAmount || '0') : 0;
          if (outAmt === 0) {
            throw new Error('Quote returned 0 output units');
          }

          quotesRecord[i] = { quote: q };
        } catch (err: any) {
          console.error(`Quote failed for ${swap.inputSymbol} -> ${swap.outputSymbol}:`, err);
          quotesRecord[i] = { quote: null, error: err?.message || 'Quote failed' };
        }
      }

      setSwapQuotes(quotesRecord);
      setLoadingQuotes(false);
    }

    if (rebalanceAvailable && (rebalanceInitiated || previewActive) && !rebalancing && !isCashingOut) {
      loadQuotes();
    }
  }, [rebalanceAvailable, rebalanceInitiated, previewActive, rebalancing, group.id, isCashingOut, activeSwapsKey]);

  // Execute sequential swaps for rebalancing
  const handleExecuteRebalance = async () => {
    if (activeSwaps.length === 0) return;
    if (rebalancing) return;

    setRebalancing(true);

    const localStatus = { ...rebalanceStatus };

    // Filter to selected indices that are not yet successfully executed
    const selectedIndices = activeSwaps
      .map((_, idx) => idx)
      .filter(idx => selectedSwapIndices[idx] !== false && !localStatus[idx]?.success);

    if (selectedIndices.length === 0) {
      setRebalancing(false);
      return;
    }

    for (let seqIdx = 0; seqIdx < selectedIndices.length; seqIdx++) {
      const i = selectedIndices[seqIdx];
      setRebalanceStep(i + 1);
      const swap = activeSwaps[i];
      const quoteInfo = swapQuotes[i];

      if (!quoteInfo || !quoteInfo.quote) {
        const errStr = quoteInfo?.error || 'Quote failed / Skipped';
        localStatus[i] = { success: false, error: errStr };
        setRebalanceStatus({ ...localStatus });
        setRebalancing(false);
        return; // halt sequence
      }

      try {
        const txId = await signAndExecuteSwap({
          inputMint: swap.inputMint,
          outputMint: swap.outputMint,
          amountBase: swap.amount,
          quoteResponse: quoteInfo.quote,
          inputDecimals: swap.inputDecimals,
          outputDecimals: swap.outputDecimals,
        });

        localStatus[i] = { success: true, txId };
        setRebalanceStatus({ ...localStatus });
      } catch (err: any) {
        console.error(`Rebalance step ${i + 1} failed:`, err);
        const errStr = err?.message || 'Transaction rejected';
        localStatus[i] = { success: false, error: errStr };
        setRebalanceStatus({ ...localStatus });
        setRebalancing(false);
        return; // halt sequence
      }
    }

    setRebalancing(false);

    // Verify if indeed EVERY SELECTED step is a success
    const finalAllSucceeded = activeSwaps.every((_, idx) => {
      if (selectedSwapIndices[idx] === false) return true; // skip unselected
      return localStatus[idx]?.success;
    });

    if (finalAllSucceeded) {
      await onRefreshPrices();
      const freshBalances = await refreshBalances();
      const freshGroupBalances = getGroupBalances(freshBalances);
      const freshTotalUsdValue = freshGroupBalances.reduce((sum, item) => sum + item.usdValue, 0);

      onSaveSnapshot(group.id, group.name, freshGroupBalances, freshTotalUsdValue, 'rebalance');
      
      // Reset statuses so we can re-evaluate remaining trades
      setRebalanceStatus({});
      setRebalanceStep(0);
      setSelectedSwapIndices({});
    }
  };

  // Execute a single specific trade from the list
  const handleExecuteSingleTrade = async (targetIdx: number) => {
    if (rebalancing) return;
    const swap = activeSwaps[targetIdx];
    if (!swap) return;

    setRebalancing(true);
    setRebalanceStep(targetIdx + 1);

    const localStatus = { ...rebalanceStatus };
    const quoteInfo = swapQuotes[targetIdx];

    if (!quoteInfo || !quoteInfo.quote) {
      const errStr = quoteInfo?.error || 'Quote failed / Skipped';
      localStatus[targetIdx] = { success: false, error: errStr };
      setRebalanceStatus({ ...localStatus });
      setRebalancing(false);
      return;
    }

    try {
      const txId = await signAndExecuteSwap({
        inputMint: swap.inputMint,
        outputMint: swap.outputMint,
        amountBase: swap.amount,
        quoteResponse: quoteInfo.quote,
        inputDecimals: swap.inputDecimals,
        outputDecimals: swap.outputDecimals,
      });

      localStatus[targetIdx] = { success: true, txId };
      setRebalanceStatus({ ...localStatus });
      setRebalancing(false);

      // Successfully finished the single trade - let's refresh prices and balances
      await onRefreshPrices();
      const freshBalances = await refreshBalances();
      const freshGroupBalances = getGroupBalances(freshBalances);
      const freshTotalUsdValue = freshGroupBalances.reduce((sum, item) => sum + item.usdValue, 0);

      onSaveSnapshot(group.id, group.name, freshGroupBalances, freshTotalUsdValue, 'rebalance');
      
      // Reset rebalance and selection states for remaining trades
      setRebalanceStatus({});
      setRebalanceStep(0);
      setSelectedSwapIndices({});
    } catch (err: any) {
      console.error(`Single rebalance trade failed:`, err);
      const errStr = err?.message || 'Transaction rejected';
      localStatus[targetIdx] = { success: false, error: errStr };
      setRebalanceStatus({ ...localStatus });
      setRebalancing(false);
    }
  };

  // Group Color styling mapping
  const groupColors = getGroupColorClasses(group.color);

  // Compute creation baseline snapshot for "Value Since Creation"
  const sortedGroupSnapshots = [...(groupSnapshots || [])]
    .filter((s) => s && s.groupId === group.id)
    .sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));

  const cleanCreationBaseline = sortedGroupSnapshots.find((s) => {
    if (!s || !s.totalUsdValue || s.totalUsdValue <= 0) return false;
    if (!Array.isArray(s.balances) || s.balances.length === 0) return false;
    const hasZeroPrice = s.balances.some((b: any) => !b || b.price === undefined || b.price <= 0);
    return !hasZeroPrice;
  });

  const creationBaselineUsd = cleanCreationBaseline?.totalUsdValue;
  const hasCreationBaseline = creationBaselineUsd !== undefined && creationBaselineUsd > 0;

  let sinceCreationPct: number | null = null;
  let sinceCreationDeltaUsd: number | null = null;

  if (hasCreationBaseline) {
    sinceCreationDeltaUsd = totalUsdValue - creationBaselineUsd;
    sinceCreationPct = (sinceCreationDeltaUsd / creationBaselineUsd) * 100;
  }

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-3 duration-300">
      
      {/* Header Bar accented in Group Color */}
      <div className={`p-6 bg-slate-900 border ${groupColors.border} rounded-2xl flex flex-col md:flex-row justify-between items-start md:items-center gap-4 relative overflow-hidden`}>
        <div className={`absolute top-0 left-0 w-1.5 h-full ${groupColors.bgSolid}`} />
        
        <div className="space-y-1">
          <button 
            onClick={onBack}
            className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-white transition-colors cursor-pointer mb-2"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Back to Wallet List
          </button>

          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2 group/edit relative bg-slate-950/30 px-3 py-1.5 rounded-xl border border-slate-800/80 hover:border-slate-700/80 transition-all focus-within:border-slate-600 focus-within:bg-slate-950/60">
              <input 
                ref={inputRef}
                type="text"
                value={groupNameInput}
                onChange={(e) => handleRenameGroup(e.target.value)}
                className="text-xl md:text-2xl font-black text-white bg-transparent border-none focus:outline-none tracking-tight shrink min-w-[200px]"
                title="Click to rename group"
                placeholder="Unnamed Group"
              />
              <button
                onClick={() => inputRef.current?.focus()}
                className="text-slate-500 hover:text-white transition-colors cursor-pointer"
                title="Click to rename group"
              >
                <Edit2 className="w-4 h-4" />
              </button>
            </div>
            <span className={`text-[10px] uppercase font-bold tracking-widest px-2.5 py-0.5 rounded-full ${groupColors.bg} ${groupColors.text} border ${groupColors.border}`}>
              {group.color} Group
            </span>
          </div>
          
          <p className="text-xs text-slate-400">
            A self-contained equal-weight link-group managing {group.memberMints.length} assets at equal target weight.
          </p>
        </div>

        {/* Unlink Group Controls */}
        <div className="flex flex-wrap items-center gap-2.5">
          {group.memberMints.length === 0 ? (
            <button
              onClick={() => setShowDeleteConfirm(true)}
              className="comic-btn bg-rose-500/15 hover:bg-rose-500/25 border border-rose-500/30 text-rose-400 px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer"
              title="Delete this empty group"
            >
              <Trash2 className="w-4 h-4" />
              Delete Group
            </button>
          ) : (
            <>
              <button
                onClick={() => setShowUnlinkAllConfirm(true)}
                className="comic-btn bg-slate-950 hover:bg-slate-850 border border-slate-850 hover:border-slate-800 text-slate-300 hover:text-white px-3.5 py-2 rounded-xl text-xs font-semibold transition-all flex items-center gap-1.5 cursor-pointer"
                title="Remove all coins from this group"
              >
                <Trash2 className="w-4 h-4 text-slate-500" />
                Unlink All Coins
              </button>

              <button
                onClick={() => setIsCashingOut(true)}
                disabled={!groupBalances.some(item => item.amountHuman > 0)}
                className="comic-btn bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/20 text-rose-400 px-3.5 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-40"
                title="Swap all member assets into USDC on the DEX"
              >
                <Coins className="w-4 h-4" />
                Cash Out to USDC
              </button>
            </>
          )}
        </div>
      </div>

      {/* Crash Warning Hatch */}
      {crashWarnings.map((coin) => (
        <div key={coin.mint} className="risk-disclosure bg-rose-950/25 border border-rose-900/40 rounded-xl p-5 shadow-sm text-slate-200 animate-in slide-in-from-top-4 duration-300">
          <div className="flex gap-4 items-start">
            <div className="p-2.5 bg-rose-500/10 text-rose-400 rounded-lg">
              <AlertCircle className="w-5 h-5" />
            </div>
            <div className="space-y-1 flex-grow">
              <h5 className="font-bold text-sm text-rose-200 uppercase tracking-wide">Extreme 24h Devaluaton Case: {coin.symbol}</h5>
              <p className="text-xs text-slate-400 leading-relaxed max-w-2xl">
                Asset <strong className="text-white">{coin.symbol}</strong> is crashing hard: <strong className="text-rose-400">{(coin.change24h || 0).toFixed(1)}% drop in the last 24h</strong>. Equal-weight rebalancing will naturally build route trades to buy MORE of this crash coin using proceeds from selling other assets. Evaluate if a fundamental crash has occurred before executing.
              </p>
            </div>
          </div>
        </div>
      ))}

      {/* Basket Actions Bar */}
      <div className="bg-slate-900 border border-slate-850 p-5 rounded-2xl flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 shadow-xl">
        <div className="space-y-1">
          <h4 className="text-sm font-extrabold text-white uppercase tracking-wider flex items-center gap-1.5">
            <Coins className={`w-4 h-4 ${groupColors.text}`} />
            Basket Trade Center
          </h4>
          <p className="text-xs text-slate-400">
            {group.memberMints.length === 0 
              ? 'This group is empty. Link coins first to enable funding splits.'
              : `Choose a funding coin to buy evenly into the ${group.memberMints.length} linked assets.`
            }
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={onOpenAddBasket}
            disabled={group.memberMints.length === 0}
            className="comic-btn bg-emerald-500 hover:bg-emerald-450 text-slate-950 font-black rounded-xl text-xs px-5 py-2.5 transition-all cursor-pointer flex items-center gap-1.5 shadow-md disabled:opacity-40 disabled:cursor-not-allowed"
            title={group.memberMints.length === 0 ? 'Link coins to the group first' : 'Buy evenly into this group'}
          >
            <Plus className="w-3.5 h-3.5" />
            Add to Basket (Split)
          </button>

          <button
            onClick={() => {
              if (rebalanceAvailable && currentSwaps.length > 0) {
                setRebalanceInitiated(true);
              }
            }}
            disabled={!rebalanceAvailable || currentSwaps.length === 0}
            className="comic-btn bg-slate-950 hover:bg-slate-850 border border-slate-800 hover:border-slate-700 text-slate-300 font-black rounded-xl text-xs px-5 py-2.5 transition-all cursor-pointer flex items-center gap-1.5 shadow-md disabled:opacity-40 disabled:cursor-not-allowed"
            title={
              !rebalanceAvailable
                ? 'Link at least 2 coins with balance to enable rebalance'
                : currentSwaps.length === 0
                ? 'Already balanced, no trades needed.'
                : 'Trade between members to restore equal weight'
            }
          >
            <ArrowUpDown className="w-3.5 h-3.5" />
            Rebalance
          </button>
        </div>
      </div>

      {/* Group Statistics Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-slate-900 border border-slate-850 p-4 rounded-xl space-y-1">
          <span className="text-[10px] font-bold uppercase text-slate-500 tracking-wider">Group Managed Value</span>
          <div className="text-xl font-mono font-black text-white">
            ${totalUsdValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
        </div>

        <div className="bg-slate-900 border border-slate-850 p-4 rounded-xl space-y-1">
          <span className="text-[10px] font-bold uppercase text-slate-500 tracking-wider">Group Size</span>
          <div className="text-xl font-mono font-black text-white">{group.memberMints.length} coins</div>
        </div>

        <div className="bg-slate-900 border border-slate-850 p-4 rounded-xl space-y-1">
          <span className="text-[10px] font-bold uppercase text-slate-500 tracking-wider">Maximum absolute Drift</span>
          <div className={`text-xl font-mono font-black ${maxAbsoluteDrift >= DRIFT_THRESHOLD ? 'text-amber-400' : 'text-emerald-400'}`}>
            {maxAbsoluteDrift.toFixed(1)}%
          </div>
        </div>

        <div className="bg-slate-900 border border-slate-850 p-4 rounded-xl space-y-1">
          <span className="text-[10px] font-bold uppercase text-slate-500 tracking-wider">Value Since Creation</span>
          {hasCreationBaseline && sinceCreationPct !== null && sinceCreationDeltaUsd !== null ? (
            <div>
              <div className={`text-xl font-mono font-black ${sinceCreationPct >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                {sinceCreationPct >= 0 ? '+' : ''}{sinceCreationPct.toFixed(1)}%
              </div>
              <div className="text-[11px] font-mono font-medium text-slate-400 mt-0.5">
                {sinceCreationDeltaUsd >= 0 ? '+' : '-'}${Math.abs(sinceCreationDeltaUsd).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
            </div>
          ) : (
            <div>
              <div className="text-xl font-mono font-black text-slate-500">Pending</div>
              <div className="text-[11px] font-sans text-slate-500 mt-0.5">Log a snapshot</div>
            </div>
          )}
        </div>
      </div>

      {/* Primary Layout Block: Left: Grid & Rebalancer; Right: Scoreboard Ledger */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Left Column (2 Cols) - Rebalance targets & Weights */}
        <div className="lg:col-span-2 space-y-6">
          
          <div className={`bg-slate-900 border border-slate-850 rounded-2xl p-6 shadow-xl relative overflow-hidden`}>
            {/* Table Header */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 pb-6 border-b border-slate-800">
              <div>
                <h3 className="text-md font-bold text-white flex items-center gap-2">
                  <ArrowUpDown className={`w-4 h-4 ${groupColors.text}`} />
                  Group Weights & Live Prices
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Live price feed produces dynamic drift. Rebalance is <strong className="text-emerald-400">always available</strong>, but advised if drift exceeds <strong className="text-white">±{DRIFT_THRESHOLD}%</strong>.
                </p>
              </div>

              <button
                onClick={onRefreshPrices}
                disabled={loadingPrices}
                className="bg-slate-950 hover:bg-slate-850 border border-slate-800 text-slate-300 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-2 disabled:opacity-50 cursor-pointer"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${loadingPrices ? 'animate-spin text-emerald-400' : ''}`} />
                Sync Rates
              </button>
            </div>

            {/* Custom Target Weights Control Bar */}
            {groupBalances.length > 0 && (
              <div className="bg-slate-950/60 border border-slate-850 rounded-xl p-4 mb-4 space-y-3">
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
                  <div className="space-y-0.5">
                    <span className="text-xs font-bold text-white flex items-center gap-1.5">
                      <Settings className="w-3.5 h-3.5 text-slate-400" />
                      Custom Target Weights Configuration
                    </span>
                    <p className="text-[10px] text-slate-500">
                      Customize targets per coin, then save. Default is equal-weighted.
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-1.5 self-stretch sm:self-auto justify-end">
                    <button
                      onClick={handleResetToEqual}
                      className="bg-slate-900 hover:bg-slate-800 border border-slate-805 text-slate-300 px-2.5 py-1 rounded-lg text-[10px] font-bold cursor-pointer transition-all"
                    >
                      Reset to Equal
                    </button>
                    <button
                      onClick={handleNormalize}
                      className="bg-slate-900 hover:bg-slate-800 border border-slate-805 text-slate-300 px-2.5 py-1 rounded-lg text-[10px] font-bold cursor-pointer transition-all"
                    >
                      Normalize to 100%
                    </button>
                    <button
                      onClick={handleSaveWeights}
                      disabled={Math.abs(tempWeightsSum - 100) > 0.15}
                      className="bg-emerald-500 hover:bg-emerald-400 text-slate-950 px-3 py-1 rounded-lg text-[10px] font-black cursor-pointer transition-all disabled:opacity-30 disabled:cursor-not-allowed"
                    >
                      Save Weights
                    </button>
                  </div>
                </div>

                {/* Status Indicator */}
                <div className="flex justify-between items-center text-[10px] font-mono font-bold border-t border-slate-900 pt-2 text-slate-400">
                  <span>Current Target Weights Sum:</span>
                  <span className={Math.abs(tempWeightsSum - 100) < 0.15 ? 'text-emerald-400' : 'text-amber-500'}>
                    {tempWeightsSum.toFixed(1)}% {Math.abs(tempWeightsSum - 100) < 0.15 ? '✓ (Valid)' : '⚠️ (Must equal 100%)'}
                  </span>
                </div>
              </div>
            )}

            {/* Weights List */}
            <div className="py-2 space-y-5">
              {groupBalances.length === 0 ? (
                <div className="text-center py-10 text-slate-500 text-sm">
                  This link-group is empty. Use the Add Coin button below to populate it.
                </div>
              ) : (
                groupBalances.map((item) => {
                  const isUnknown = (item as any).isDecimalsUnknown;
                  const isOver = item.drift > 0;
                  const absDrift = Math.abs(item.drift);
                  const driftTriggered = absDrift >= DRIFT_THRESHOLD;

                  return (
                    <div key={item.mint} className="space-y-2">
                      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-2">
                        <div className="flex flex-wrap items-center gap-2.5">
                          <div 
                            className="w-2.5 h-2.5 rounded-full shrink-0" 
                            style={{ backgroundColor: COIN_LINE_COLORS[group.memberMints.indexOf(item.mint) % COIN_LINE_COLORS.length] || '#475569' }}
                          />
                          <span className="font-extrabold text-white text-sm">{item.symbol}</span>
                          <span className="text-[11px] text-slate-500 font-mono">
                            {isUnknown ? (
                              <span className="text-amber-500/80 animate-pulse font-medium">Resolving decimals on Solana...</span>
                            ) : (
                              `${item.amountHuman.toLocaleString(undefined, { maximumFractionDigits: 6 })}`
                            )}
                          </span>

                          {/* Inline Target Weight Input */}
                          {!isUnknown && (
                            <div className="flex items-center gap-1.5 ml-2">
                              <span className="text-[11px] text-slate-500 font-bold uppercase font-mono">Target:</span>
                              <input
                                type="number"
                                inputMode="decimal"
                                min="0"
                                max="100"
                                step="0.1"
                                value={tempWeights[item.mint] !== undefined ? tempWeights[item.mint] : ''}
                                onChange={(e) => handleWeightChange(item.mint, parseFloat(e.target.value) || 0)}
                                className="bg-slate-950 border border-slate-800 rounded px-1.5 py-0.5 w-16 text-right text-[11px] text-white font-mono font-bold tabular-nums focus:outline-none focus:border-emerald-500"
                              />
                              <span className="text-[11px] text-slate-500 font-bold">%</span>
                            </div>
                          )}

                          {/* Inline Remove Control */}
                          {confirmRemoveMint === item.mint ? (
                            <div className="flex items-center gap-1 bg-rose-950/40 border border-rose-900/40 px-2 py-0.5 rounded-lg text-[10px] animate-in fade-in duration-150">
                              <span className="text-rose-400 font-semibold">Unlink?</span>
                              <button
                                onClick={() => handleRemoveCoin(item.mint)}
                                className="text-emerald-400 hover:text-emerald-350 font-extrabold px-1 cursor-pointer"
                              >
                                Yes
                              </button>
                              <span className="text-slate-600">/</span>
                              <button
                                onClick={() => setConfirmRemoveMint(null)}
                                className="text-slate-400 hover:text-white px-1 cursor-pointer"
                              >
                                No
                              </button>
                            </div>
                          ) : (
                            <button
                              onClick={() => setConfirmRemoveMint(item.mint)}
                              className="text-slate-500 hover:text-rose-400 transition-all cursor-pointer text-xs px-1.5 py-0.5 hover:bg-slate-800 rounded-md"
                              title="Unlink coin from this group"
                            >
                              ✕
                            </button>
                          )}
                        </div>

                        <div className="text-right text-[11px] font-mono">
                          {isUnknown ? (
                            <span className="text-slate-500 italic">Loading balances...</span>
                          ) : (
                            <>
                              <span className="text-slate-300 font-semibold">${item.usdValue.toFixed(2)}</span>
                              <span className="text-slate-500 mx-1.5">|</span>
                              <span className="text-slate-400">Price: {formatPrice(item.price)}</span>
                              <span className={`text-[11px] ml-1.5 font-bold ${(item.change24h || 0) >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                                ({(item.change24h || 0) >= 0 ? '+' : ''}{(item.change24h || 0).toFixed(1)}%)
                              </span>
                            </>
                          )}
                        </div>
                      </div>

                      {/* Drift Bar */}
                      {isUnknown ? (
                        <div className="w-full bg-slate-950/50 h-5 rounded-lg overflow-hidden border border-slate-900/40 flex items-center justify-center relative">
                          <span className="text-[10px] font-mono text-slate-600 tracking-wider uppercase animate-pulse">Calculating drift once decimals resolve...</span>
                        </div>
                      ) : (
                        <div className="w-full bg-slate-950 h-5 rounded-lg overflow-hidden border border-slate-850 flex relative">
                          {/* Underweight fill (left side of target) */}
                          <div className="w-1/2 h-full flex justify-end items-center bg-slate-950/40 relative">
                            {!isOver && (
                              <div 
                                className="h-full bg-sky-500/20 border-r border-sky-400/40 transition-all"
                                style={{ width: `${Math.min(100, (absDrift / item.targetWeight) * 100)}%` }}
                              />
                            )}
                          </div>
                          {/* Divider Line representing exact Target Weight */}
                          <div className="absolute left-1/2 top-0 bottom-0 w-0.5 bg-slate-700 z-10 flex items-center justify-center">
                            <span className="absolute text-[10px] font-mono text-slate-500 -top-3.5">TARGET ({item.targetWeight.toFixed(1)}%)</span>
                          </div>
                          {/* Overweight fill (right side of target) */}
                          <div className="w-1/2 h-full flex justify-start items-center bg-slate-950/40 relative">
                            {isOver && (
                              <div 
                                className="h-full bg-emerald-500/20 border-l border-emerald-400/40 transition-all"
                                style={{ width: `${Math.min(100, (absDrift / item.targetWeight) * 100)}%` }}
                              />
                            )}
                          </div>

                          {/* Text Label Over the bar */}
                          <div className="absolute inset-0 flex justify-between items-center px-3 pointer-events-none text-[10px] font-mono">
                            <span className="text-slate-400">Actual: {item.currentWeight.toFixed(1)}%</span>
                            <span className={`font-bold ${isOver ? 'text-emerald-400' : 'text-sky-400'} ${driftTriggered ? 'animate-pulse' : ''}`}>
                              {isOver ? '+' : '-'}{absDrift.toFixed(1)}% drift {driftTriggered ? '⚠️' : '✓'}
                            </span>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })
              )}

              {/* "+ Add Coin" inline interface */}
              {showInlineAddPicker ? (
                <div className="mt-4 p-4 bg-slate-950 border border-slate-850 rounded-xl space-y-3 animate-in slide-in-from-top-2 duration-200">
                  <div className="flex justify-between items-center border-b border-slate-900 pb-2">
                    <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Select Coin to Add</span>
                    <button
                      onClick={() => {
                        setShowInlineAddPicker(false);
                        setPendingWarningToken(null);
                      }}
                      className="text-[10px] text-slate-500 hover:text-white px-2 py-0.5 hover:bg-slate-800 rounded cursor-pointer transition-all"
                    >
                      Cancel
                    </button>
                  </div>

                  <div className="relative">
                    <input
                      type="text"
                      placeholder="Search coin symbol, name or mint address..."
                      value={addCoinSearchQuery}
                      onChange={(e) => setAddCoinSearchQuery(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 transition-all"
                    />
                  </div>

                  {/* Warning Dialog for Liquidity */}
                  {pendingWarningToken && (
                    <div className="p-3 bg-amber-950/40 border border-amber-900/40 rounded-lg space-y-2 text-xs">
                      <div className="flex gap-2 items-start text-amber-300">
                        <AlertTriangle className="w-4 h-4 shrink-0 text-amber-400 mt-0.5" />
                        <div>
                          <strong className="text-white">Low Liquidity Warning</strong>
                          <p className="mt-0.5 text-[11px] text-slate-300 leading-relaxed">
                            {pendingWarningToken.token.symbol} has an estimated liquidity of <strong className="text-white">${pendingWarningToken.liquidity.toLocaleString(undefined, { maximumFractionDigits: 0 })}</strong>, which is below our safe threshold of $50,000. Rebalancing trades may experience slippage.
                          </p>
                        </div>
                      </div>
                      <div className="flex gap-2 justify-end">
                        <button
                          onClick={() => setPendingWarningToken(null)}
                          className="px-2.5 py-1 text-[10px] font-bold text-slate-400 hover:text-white bg-slate-900 rounded hover:bg-slate-800 cursor-pointer"
                        >
                          Cancel
                        </button>
                        <button
                          onClick={() => {
                            handleAddCoinDirect(pendingWarningToken.token.address);
                            setPendingWarningToken(null);
                          }}
                          className="px-2.5 py-1 text-[10px] font-extrabold text-slate-950 bg-amber-400 rounded hover:bg-amber-300 cursor-pointer"
                        >
                          Add Anyway
                        </button>
                      </div>
                    </div>
                  )}

                  <div className="max-h-[220px] overflow-y-auto space-y-1 pr-1 divide-y divide-slate-900">
                    {loadingVerifiedTokens ? (
                      <div className="flex flex-col items-center justify-center py-6 text-center text-xs text-slate-500 gap-2">
                        <Loader2 className="w-4 h-4 animate-spin text-emerald-400" />
                        <span>Fetching Jupiter verified list...</span>
                      </div>
                    ) : (
                      (() => {
                        let listToUse = verifiedTokens.length > 0 ? verifiedTokens : Object.entries(tokenMetadata).map(([addr, t]) => ({
                          address: addr,
                          symbol: t.symbol,
                          name: t.name || 'Unknown',
                          decimals: t.decimals,
                        }));

                        // Exclude current group members
                        listToUse = listToUse.filter((t) => !group.memberMints.includes(t.address));

                        // Apply search filter
                        if (addCoinSearchQuery.trim()) {
                          const q = addCoinSearchQuery.toLowerCase().trim();
                          listToUse = listToUse.filter(
                            (t) =>
                              t.symbol.toLowerCase().includes(q) ||
                              (t.name && t.name.toLowerCase().includes(q)) ||
                              t.address.toLowerCase() === q
                          );
                        }

                        // Sort: wallet balances first, then alphabetically by symbol
                        listToUse = [...listToUse].sort((a, b) => {
                          const balA = allBalances[a.address] || 0;
                          const balB = allBalances[b.address] || 0;
                          if (balA > 0 && balB === 0) return -1;
                          if (balB > 0 && balA === 0) return 1;
                          return a.symbol.localeCompare(b.symbol);
                        });

                        // Slice for performance
                        const displayedList = listToUse.slice(0, 50);

                        if (displayedList.length === 0) {
                          return <div className="text-center py-4 text-xs text-slate-500">No matching verified coins found.</div>;
                        }

                        return displayedList.map((token) => {
                          const mint = token.address;
                          const meta = tokenMetadata[mint] || token;
                          const otherGroup = groups.find((g) => g.memberMints.includes(mint) && g.id !== group.id);
                          const balanceRaw = allBalances[mint] || 0;
                          const balanceHuman = meta.decimals !== undefined ? balanceRaw / Math.pow(10, meta.decimals) : 0;

                          return (
                            <div key={mint} className="flex justify-between items-center py-2 text-xs first:pt-0">
                              <div className="flex items-center gap-2">
                                <div className="w-6 h-6 bg-slate-900 rounded-full flex items-center justify-center font-bold text-[10px] text-slate-400">
                                  {meta.symbol ? meta.symbol.substring(0, 2) : '??'}
                                </div>
                                <div>
                                  <div className="font-extrabold text-white flex items-center gap-1.5">
                                    <span>{meta.symbol}</span>
                                    {balanceHuman > 0 && (
                                      <span className="text-[9px] text-emerald-400 font-mono">
                                        ({balanceHuman.toLocaleString(undefined, { maximumFractionDigits: 4 })} in wallet)
                                      </span>
                                    )}
                                  </div>
                                  <div className="text-[10px] text-slate-500 max-w-[180px] truncate">{meta.name}</div>
                                </div>
                              </div>

                              <div>
                                {otherGroup ? (
                                  <div className="flex items-center gap-2">
                                    <span className="text-[10px] text-slate-500 italic">in {otherGroup.name}</span>
                                    <button
                                      onClick={() => {
                                        if (onMoveToken) {
                                          onMoveToken(mint, otherGroup, group);
                                          setShowInlineAddPicker(false);
                                          setAddCoinSearchQuery('');
                                        }
                                      }}
                                      className="bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border border-amber-500/20 px-2.5 py-1 rounded-lg text-[10px] font-extrabold cursor-pointer transition-all"
                                    >
                                      Move here
                                    </button>
                                  </div>
                                ) : (
                                  <button
                                    onClick={() => handleAddCoinPreCheck({
                                      address: token.address,
                                      symbol: token.symbol,
                                      name: token.name,
                                      decimals: token.decimals || 9
                                    })}
                                    disabled={checkingLiquidity !== null}
                                    className="bg-emerald-500 hover:bg-emerald-450 text-slate-950 px-3 py-1 rounded-lg text-[10px] font-black cursor-pointer transition-all flex items-center gap-1"
                                  >
                                    {checkingLiquidity === mint ? (
                                      <Loader2 className="w-3 h-3 animate-spin text-slate-950" />
                                    ) : (
                                      <Plus className="w-3 h-3" />
                                    )}
                                    Add
                                  </button>
                                )}
                              </div>
                            </div>
                          );
                        });
                      })()
                    )}
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => setShowInlineAddPicker(true)}
                  className="w-full mt-2 border border-dashed border-slate-800 hover:border-slate-700 hover:bg-slate-900/40 text-slate-400 hover:text-white py-2.5 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer transition-all"
                >
                  <Plus className="w-4 h-4 text-emerald-400" />
                  + Add coin
                </button>
              )}
            </div>
          </div>

          {/* Rebalance Advisory Trades Container */}
          {rebalanceAvailable && (
            <div className={`bg-slate-900 border ${groupColors.border} rounded-2xl p-6 shadow-xl space-y-4`}>
              {!isTargetWeightsSumValid ? (
                <div className="text-center py-6 space-y-4 animate-in fade-in duration-200">
                  <div className="mx-auto w-12 h-12 rounded-full bg-amber-500/10 flex items-center justify-center text-amber-500">
                    <AlertTriangle className="w-6 h-6" />
                  </div>
                  <div className="space-y-1">
                    <h4 className="text-sm font-extrabold text-white">Rebalance Gated</h4>
                    <p className="text-xs text-slate-400 max-w-md mx-auto">
                      Your custom target weights sum to <strong className="text-white">{targetWeightsSum.toFixed(1)}%</strong>. They must sum to exactly 100% to enable equal-weight or custom rebalancing.
                    </p>
                  </div>
                  <div className="p-3 bg-amber-950/20 border border-amber-900/40 rounded-xl max-w-sm mx-auto text-[11px] text-slate-300">
                    Use the <strong>Custom Target Weights Configuration</strong> panel above and click <strong>Normalize to 100%</strong> followed by <strong>Save Weights</strong> to fix this!
                  </div>
                </div>
              ) : (!rebalanceInitiated && !previewActive) ? (
                // NORMAL CLOSED STATES
                currentSwaps.length === 0 ? (
                  <div className="text-center py-6 space-y-3 animate-in fade-in duration-200">
                    <div className="mx-auto w-12 h-12 rounded-full bg-emerald-500/10 flex items-center justify-center text-emerald-400">
                      <Check className="w-6 h-6" />
                    </div>
                    <div className="space-y-1">
                      <h4 className="text-sm font-extrabold text-white">Basket Perfectly Balanced</h4>
                      <p className="text-xs text-slate-400 max-w-md mx-auto">
                        This group is within ±5% on every coin. Nothing to rebalance right now.
                      </p>
                    </div>
                    {previewRebalanceAvailable && (
                      <button
                        onClick={() => setPreviewActive(true)}
                        className="mt-2 text-xs font-bold text-emerald-400 hover:text-emerald-300 transition-colors underline cursor-pointer flex items-center gap-1 mx-auto"
                      >
                        <Sparkles className="w-3.5 h-3.5" />
                        Preview Rebalance & Override
                      </button>
                    )}
                  </div>
                ) : (
                  <div className="text-center py-6 space-y-4 animate-in fade-in duration-200">
                    <div className="mx-auto w-12 h-12 rounded-full bg-emerald-500/10 flex items-center justify-center text-emerald-400">
                      <ArrowUpDown className="w-6 h-6" />
                    </div>
                    <div className="space-y-1">
                      <h4 className="text-sm font-extrabold text-white">Rebalance Available ({currentSwaps.length} Actionable Trades)</h4>
                      <p className="text-xs text-slate-400 max-w-md mx-auto">
                        Dynamic price fluctuations have introduced weights drift. Click below to load live routing quotes from Jupiter.
                      </p>
                    </div>
                    <div className="flex flex-col gap-3 items-center">
                      <button
                        onClick={() => setRebalanceInitiated(true)}
                        className="px-5 py-2.5 bg-emerald-500 hover:bg-emerald-450 text-slate-950 font-extrabold rounded-xl text-xs transition-all cursor-pointer shadow-lg"
                      >
                        Verify Rebalance Routes & Quotes
                      </button>
                      {previewRebalanceAvailable && (
                        <button
                          onClick={() => setPreviewActive(true)}
                          className="text-xs font-bold text-slate-400 hover:text-white transition-colors underline cursor-pointer flex items-center gap-1"
                        >
                          <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
                          Preview Rebalance (under the hood)
                        </button>
                      )}
                    </div>
                  </div>
                )
              ) : (
                // OPEN ACTIVE PREVIEW / ROUTE VIEW
                <>
                  <div className="border-b border-slate-800 pb-4 flex justify-between items-center animate-in fade-in duration-200">
                    <div>
                      <h4 className="text-md font-bold text-white flex items-center gap-2">
                        <ArrowUpDown className={`w-4 h-4 ${groupColors.text}`} />
                        {previewActive ? 'Preview Rebalance Route Calculations' : `Matching Advisory Trade List (${activeSwaps.length} swaps)`}
                      </h4>
                      <p className="text-xs text-slate-400">
                        {previewActive 
                          ? 'Pure read-only preview bypassing minimum floors to show accurate weights corrections.'
                          : 'Direct wallet-to-wallet routes generated to restore exact equal-weights.'
                        }
                      </p>
                    </div>
                    <div className="flex items-center gap-4">
                      {/* Select All / None toggle */}
                      {!rebalancing && activeSwaps.length > 0 && (
                        <button
                          onClick={() => {
                            const allSelected = activeSwaps.every((_, i) => selectedSwapIndices[i] !== false);
                            const updated: Record<number, boolean> = {};
                            activeSwaps.forEach((_, i) => {
                              updated[i] = !allSelected;
                            });
                            setSelectedSwapIndices(updated);
                          }}
                          className="text-xs text-emerald-400 hover:text-emerald-300 font-bold cursor-pointer transition-colors"
                        >
                          {activeSwaps.every((_, i) => selectedSwapIndices[i] !== false) ? 'Deselect All' : 'Select All'}
                        </button>
                      )}

                      {loadingQuotes ? (
                        <span className="text-xs text-slate-500 flex items-center gap-1.5 animate-pulse">
                          <Loader2 className="w-3.5 h-3.5 animate-spin text-emerald-400" />
                          Quoting Routes...
                        </span>
                      ) : (
                        <span className="text-xs text-emerald-400 font-bold uppercase tracking-wider">Fresh Route Quotes</span>
                      )}
                    </div>
                  </div>

                  {/* Trades List */}
                  <div className="space-y-2">
                    {activeSwaps.map((swap, idx) => {
                      const quoteInfo = swapQuotes[idx];
                      const isCrashCase = crashWarnings.some((w) => w.mint === swap.outputMint);

                      // Calculate Ideal vs Quoted
                      const outputCoinPrice = prices[swap.outputMint]?.price || 0;
                      const idealOutput = outputCoinPrice > 0 ? (swap.usdValue / outputCoinPrice) : 0;
                      const quotedOutput = quoteInfo?.quote 
                        ? (parseInt(quoteInfo.quote.outAmount || '0') / Math.pow(10, swap.outputDecimals))
                        : 0;
                      const swapSlippageUsd = Math.max(0, swap.usdValue - (quotedOutput * outputCoinPrice));

                      return (
                        <div key={idx} className={`p-4 rounded-xl border ${isCrashCase ? 'bg-rose-950/20 border-rose-500/20' : 'bg-slate-950 border-slate-850'} flex gap-4 items-center text-xs`}>
                          {/* Granular Checkbox Selection */}
                          <div className="flex items-center justify-center min-w-[20px]">
                            <input
                              type="checkbox"
                              checked={selectedSwapIndices[idx] !== false}
                              onChange={() => {
                                setSelectedSwapIndices(prev => ({
                                  ...prev,
                                  [idx]: !prev[idx]
                                }));
                              }}
                              disabled={rebalancing}
                              className="w-4 h-4 rounded border-slate-800 bg-slate-900 text-emerald-500 focus:ring-emerald-500/50 focus:ring-offset-0 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                            />
                          </div>

                          <div className="flex-grow flex flex-col sm:flex-row justify-between sm:items-center gap-3">
                            <div className="space-y-1.5 flex-1">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="text-slate-500 font-bold uppercase tracking-wider">SELL</span>
                                <strong className="text-white font-black">
                                  {(swap.amount / Math.pow(10, swap.inputDecimals)).toLocaleString(undefined, { maximumFractionDigits: 6 })} {swap.inputSymbol}
                                </strong>
                                <span className="text-slate-600">→</span>
                                <span className="text-slate-500 font-bold uppercase tracking-wider">BUY</span>
                                <strong className={`font-black ${isCrashCase ? 'text-rose-400' : 'text-emerald-400'}`}>
                                  {quoteInfo && quoteInfo.quote ? (
                                    quotedOutput.toLocaleString(undefined, { maximumFractionDigits: 6 })
                                  ) : (
                                    `~${idealOutput.toLocaleString(undefined, { maximumFractionDigits: 6 })}`
                                  )} {swap.outputSymbol}
                                </strong>
                              </div>
                              
                              {/* Cost breakdown for this trade if quote available */}
                              {quoteInfo && quoteInfo.quote && (
                                <div className="text-[10px] text-slate-500 flex items-center gap-2">
                                  <span>Ideal: <strong className="text-slate-400">{idealOutput.toLocaleString(undefined, { maximumFractionDigits: 4 })} {swap.outputSymbol}</strong></span>
                                  <span className="text-slate-700">|</span>
                                  <span>Est. Slippage & Fees: <strong className="text-amber-400">${swapSlippageUsd.toFixed(3)}</strong></span>
                                </div>
                              )}

                              <div className="text-[10px] text-slate-500">
                                Match size: <strong className="text-slate-400">${swap.usdValue.toFixed(2)}</strong>
                              </div>
                            </div>

                            {/* Status & Inline Execute Action */}
                            <div className="flex flex-col sm:flex-row items-end sm:items-center gap-3">
                              <div className="text-right">
                                {rebalanceStatus[idx] ? (
                                  rebalanceStatus[idx].success ? (
                                    <span className="text-xs text-emerald-400 font-extrabold flex items-center gap-1 px-2.5 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/30">
                                      <Check className="w-3.5 h-3.5 text-emerald-400" /> Swap Succeeded
                                    </span>
                                  ) : (
                                    <span className="text-xs text-rose-400 font-extrabold flex items-center gap-1 px-2.5 py-1 rounded-full bg-rose-500/10 border border-rose-500/30 animate-pulse" title={rebalanceStatus[idx].error}>
                                      <AlertCircle className="w-3.5 h-3.5 text-rose-400" /> Swap Failed
                                    </span>
                                  )
                                ) : rebalancing && rebalanceStep === idx + 1 ? (
                                  <span className="text-xs text-amber-400 font-extrabold flex items-center gap-1 px-2.5 py-1 rounded-full bg-amber-500/10 border border-amber-500/30 animate-pulse">
                                    <Loader2 className="w-3.5 h-3.5 animate-spin text-amber-400" /> Signing Swap...
                                  </span>
                                ) : quoteInfo?.error ? (
                                  <span className="text-xs text-rose-400 font-bold flex items-center gap-1 px-2.5 py-1 rounded-full bg-rose-500/5 border border-rose-500/10">
                                    <AlertCircle className="w-3.5 h-3.5 text-rose-400" /> 
                                    {quoteInfo.error.includes('small') ? 'Too Small to Route' : 'Quote Failed'}
                                  </span>
                                ) : quoteInfo ? (
                                  <span className="text-xs text-emerald-400 font-extrabold flex items-center gap-1 px-2.5 py-1 rounded-full bg-emerald-500/5 border border-emerald-500/10">
                                    <Check className="w-3.5 h-3.5 text-emerald-400" /> Direct Route Verified
                                  </span>
                                ) : (
                                  <span className="text-[10px] text-slate-500 animate-pulse">Verifying Route...</span>
                                )}
                              </div>

                              {/* Inline Quick Execution Option */}
                              {!rebalancing && !rebalanceStatus[idx]?.success && quoteInfo?.quote && selectedSwapIndices[idx] !== false && (
                                <button
                                  onClick={() => handleExecuteSingleTrade(idx)}
                                  className="px-2.5 py-1.5 bg-emerald-500/10 hover:bg-emerald-500 hover:text-slate-950 text-emerald-400 border border-emerald-500/20 font-black rounded-lg text-[10px] transition-all cursor-pointer shadow flex items-center gap-1"
                                >
                                  <Play className="w-2.5 h-2.5" />
                                  Run Trade
                                </button>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* PREVIEW EXCLUSIVE MATH SECTION */}
                  {previewActive && (
                    <div className="bg-slate-950 border border-slate-850 rounded-xl p-4 space-y-4 animate-in fade-in duration-300">
                      <h5 className="text-xs font-extrabold text-slate-300 uppercase tracking-wider flex items-center gap-1.5 border-b border-slate-850 pb-2">
                        <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
                        Rebalance Preview Summary
                      </h5>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {/* Cost section */}
                        <div className="bg-slate-900 border border-slate-850/50 p-3 rounded-lg space-y-1.5">
                          <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Total Estimated Cost</span>
                          <div className="text-lg font-mono font-black text-rose-400">
                            ${totalEstimatedCostUsd.toFixed(2)}
                          </div>
                          <p className="text-[10px] text-slate-400 leading-normal">
                            Includes slippage/price-impact (${totalSlippageLossUsd.toFixed(2)}) + Sol network fees (${totalNetworkFeeUsd.toFixed(2)}).
                          </p>
                        </div>

                        {/* Resulting Weights preview */}
                        <div className="bg-slate-900 border border-slate-850/50 p-3 rounded-lg space-y-2">
                          <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Resulting Target Weighting</span>
                          <div className="space-y-1 max-h-[120px] overflow-y-auto pr-1">
                            {resultingBalancesWithWeights.map((coin) => (
                              <div key={coin.mint} className="flex justify-between items-center text-[11px] font-mono">
                                <span className="text-slate-400 flex items-center gap-1">
                                  <strong>{coin.symbol}</strong>
                                  <span className={coin.netUnitChange >= 0 ? 'text-emerald-400 text-[10px]' : 'text-rose-400 text-[10px]'}>
                                    ({coin.netUnitChange >= 0 ? '+' : ''}{coin.netUnitChange.toLocaleString(undefined, { maximumFractionDigits: 4 })})
                                  </span>
                                </span>
                                <div className="flex items-center gap-1.5">
                                  <span className="text-slate-500 text-[10px]">{coin.currentWeight.toFixed(1)}%</span>
                                  <span className="text-slate-600">→</span>
                                  <span className="text-white font-bold">{coin.resultingWeight.toFixed(1)}%</span>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>

                      {/* Verdict Banner */}
                      <div className="bg-slate-900/60 border border-slate-800 p-3 rounded-lg text-xs flex items-start gap-2">
                        <Info className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                        <p className="text-slate-300 font-medium leading-relaxed">
                          {getCostVerdict(maxAbsoluteDrift, totalEstimatedCostUsd)}
                        </p>
                      </div>
                    </div>
                  )}

                  {/* Execution Block */}
                  <div className="bg-slate-950 rounded-xl border border-slate-850 p-4 space-y-4">
                    {!localStorage.getItem('roundtrip_has_real_swapped') && (
                      <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 rounded-lg text-xs leading-relaxed animate-in fade-in duration-200">
                        <strong>First live swap:</strong> Confirm your wallet prompt appears and the transaction confirms before continuing.
                      </div>
                    )}
                    <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-3 text-[11px] text-slate-400">
                      <p className="max-w-md">
                        {previewActive 
                          ? `Execution will execute the selected subset of sequential swap transactions to force rebalance to equal weight.`
                          : `Execution requires signing selected consecutive swap transactions. No assets ever leave your own wallet.`
                        }
                      </p>
                    </div>

                    {rebalancing && (
                      <div className="bg-slate-900 border border-slate-800 p-4 rounded-lg space-y-3">
                        <div className="flex items-center gap-2">
                          <Loader2 className="w-4 h-4 animate-spin text-emerald-400" />
                          <span className="text-xs text-slate-300 font-semibold">
                            Executing Swap {rebalanceStep} of {activeSwaps.length}...
                          </span>
                        </div>
                        <div className="w-full bg-slate-950 h-2 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-emerald-500 transition-all duration-300"
                            style={{ width: `${(rebalanceStep / activeSwaps.length) * 100}%` }}
                          />
                        </div>
                      </div>
                    )}

                    <div className="flex gap-3">
                      <button
                        onClick={() => {
                          setRebalanceInitiated(false);
                          setPreviewActive(false);
                          setRebalanceStatus({});
                        }}
                        disabled={rebalancing}
                        className="flex-grow py-4 bg-slate-900 border border-slate-850 hover:bg-slate-800 text-white font-semibold rounded-xl text-sm transition-all disabled:opacity-50 cursor-pointer text-center"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={() => {
                          if (previewActive && maxAbsoluteDrift < DRIFT_THRESHOLD) {
                            setShowExecuteAnywayConfirm(true);
                          } else {
                            handleExecuteRebalance();
                          }
                        }}
                        disabled={rebalancing || loadingQuotes || !publicKey || activeSwaps.length === 0 || activeSwaps.filter((_, i) => selectedSwapIndices[i] !== false).length === 0}
                        className={`flex-grow py-4 rounded-xl text-sm font-extrabold transition-all flex items-center justify-center gap-2 cursor-pointer ${
                          crashWarnings.length > 0
                            ? 'bg-rose-600 hover:bg-rose-700 text-white'
                            : `bg-emerald-500 hover:bg-emerald-400 text-slate-950`
                        } disabled:opacity-50 shadow-md`}
                      >
                        {rebalancing ? (
                          <>
                            <Loader2 className="w-4.5 h-4.5 animate-spin text-slate-950" />
                            Awaiting Signature...
                          </>
                        ) : Object.keys(rebalanceStatus).length > 0 && activeSwaps.some((_, idx) => rebalanceStatus[idx] && !rebalanceStatus[idx].success) ? (
                          <>
                            <RefreshCw className="w-4.5 h-4.5" />
                            Retry Failed Selected Trades ({activeSwaps.filter((_, i) => selectedSwapIndices[i] !== false).length})
                          </>
                        ) : crashWarnings.length > 0 ? (
                          <>
                            <AlertTriangle className="w-4.5 h-4.5" />
                            Override Crash Warning & Execute Selected ({activeSwaps.filter((_, i) => selectedSwapIndices[i] !== false).length})
                          </>
                        ) : previewActive ? (
                          <>
                            <Play className="w-4.5 h-4.5" />
                            Execute Selected Trade(s) Anyway ({activeSwaps.filter((_, i) => selectedSwapIndices[i] !== false).length})
                          </>
                        ) : (
                          <>
                            <RefreshCw className="w-4.5 h-4.5" />
                            Execute Selected Trade(s) ({activeSwaps.filter((_, i) => selectedSwapIndices[i] !== false).length})
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>
          )}

        </div>

        {/* Right Column (1 Col) - Group's scoreboard & snapshot stats */}
        <div className="space-y-6">
          <ScoreboardView
            group={group}
            snapshots={groupSnapshots}
            groupBalances={groupBalances}
            tokenMetadata={tokenMetadata}
            onSaveSnapshot={() => {
              onSaveSnapshot(group.id, group.name, getGroupBalances(), totalUsdValue, 'manual');
              setShowSnapshotSuccess(true);
              setTimeout(() => setShowSnapshotSuccess(false), 3000);
            }}
            showSnapshotSuccess={showSnapshotSuccess}
          />
        </div>

      </div>

      {/* Cash Out / Proportional Withdraw Modal */}
      {isCashingOut && (
        <WithdrawModal
          group={group}
          balancesWithPrice={groupBalances}
          onClose={() => setIsCashingOut(false)}
          onUpdateGroup={onUpdateGroup}
          onDeleteGroup={onDeleteGroup}
          onSaveSnapshot={onSaveSnapshot}
          onRefreshPrices={onRefreshPrices}
        />
      )}

      {/* Reusable Confirm Modals */}
      <ConfirmModal
        isOpen={showDeleteConfirm}
        title="Delete empty group?"
        message={`Are you sure you want to delete the empty group "${group.name}"? This will stop tracking it in your active dashboards.`}
        confirmText="Yes, Delete it"
        cancelText="Cancel"
        onConfirm={() => {
          setShowDeleteConfirm(false);
          onDeleteGroup(group.id);
        }}
        onCancel={() => setShowDeleteConfirm(false)}
      />

      <ConfirmModal
        isOpen={showUnlinkAllConfirm}
        title="Unlink all coins?"
        message={`Unlinking will remove all coins from "${group.name}" and return them to your unlinked wallet inventory. No coins are swapped on-chain, and the group will become empty. Proceed?`}
        confirmText="Yes, Unlink All"
        cancelText="Cancel"
        onConfirm={() => {
          setShowUnlinkAllConfirm(false);
          onUpdateGroup({ ...group, memberMints: [] });
        }}
        onCancel={() => setShowUnlinkAllConfirm(false)}
      />

      <ConfirmModal
        isOpen={showExecuteAnywayConfirm}
        title="Execute rebalance anyway?"
        message={`This rebalance costs ~$${totalEstimatedCostUsd.toFixed(2)} in fees/slippage to correct ~${maxAbsoluteDrift.toFixed(1)}% drift. Execute anyway?`}
        confirmText="Yes, Execute Anyway"
        cancelText="Abort"
        onConfirm={() => {
          setShowExecuteAnywayConfirm(false);
          handleExecuteRebalance();
        }}
        onCancel={() => setShowExecuteAnywayConfirm(false)}
      />

    </div>
  );
}
