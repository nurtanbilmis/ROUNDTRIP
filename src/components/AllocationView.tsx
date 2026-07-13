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
  Edit2
} from 'lucide-react';
import { Token, TokenBalance, RebalanceSwap, LinkGroup, getGroupColorClasses, formatPrice, COIN_LINE_COLORS } from '../types';
import { useSolanaWallet } from './WalletProvider';
import { fetchQuote } from '../jupiter';
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
}: AllocationViewProps) {
  const { signAndExecuteSwap, publicKey, type, refreshBalances } = useSolanaWallet();

  const [loadingQuotes, setLoadingQuotes] = useState(false);
  const [rebalancing, setRebalancing] = useState(false);
  const [rebalanceStep, setRebalanceStep] = useState<number>(0);
  const [rebalanceStatus, setRebalanceStatus] = useState<Record<number, { success: boolean; txId?: string; error?: string }>>({});
  const [rebalanceInitiated, setRebalanceInitiated] = useState(false);
  
  const [swapQuotes, setSwapQuotes] = useState<Record<number, { quote: any; error?: string }>>({});
  const [showTooltip, setShowTooltip] = useState(false);
  const [groupNameInput, setGroupNameInput] = useState(group.name);
  const inputRef = React.useRef<HTMLInputElement>(null);

  // Reset rebalance gate on group switch
  useEffect(() => {
    setRebalanceInitiated(false);
  }, [group.id]);

  // States for membership editing and warnings
  const [confirmRemoveMint, setConfirmRemoveMint] = useState<string | null>(null);
  const [showInlineAddPicker, setShowInlineAddPicker] = useState(false);
  const [checkingLiquidity, setCheckingLiquidity] = useState<string | null>(null);
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

  const handleAddCoinPreCheck = async (mint: string) => {
    const meta = tokenMetadata[mint] || { address: mint, symbol: mint.substring(0, 4), name: 'Unknown', decimals: 9 };
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
        setPendingWarningToken({ token: meta, liquidity: liq });
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
    const targetWeight = calculatedTokens.length > 0 ? 100 / calculatedTokens.length : 0;

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

  // Crash Warnings
  const crashWarnings = groupBalances.filter((item) => {
    return item.amountHuman > 0 && (item.change24h || 0) <= CRASH_THRESHOLD_24H;
  });

  // 2. Base units greedy matching rebalance swaps builder
  const calculateRebalanceSwaps = (): RebalanceSwap[] => {
    // Filter out unknown decimals
    const activeMembers = groupBalances.filter((b) => !(b as any).isDecimalsUnknown);
    if (activeMembers.length < 2 || totalUsdValue <= 0) return [];

    const sells: { mint: string; symbol: string; decimals: number; amountUsdToSell: number }[] = [];
    const buys: { mint: string; symbol: string; decimals: number; amountUsdToBuy: number }[] = [];

    const calculatedTokens = activeMembers;
    const activeTotalUsd = calculatedTokens.reduce((sum, item) => sum + item.usdValue, 0);
    const targetWeight = 100 / calculatedTokens.length;

    for (const item of calculatedTokens) {
      const targetUsd = (targetWeight / 100) * activeTotalUsd;
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

    while (sellIdx < sells.length && buyIdx < buys.length) {
      const sell = sells[sellIdx];
      const buy = buys[buyIdx];

      const matchUsd = Math.min(sell.amountUsdToSell, buy.amountUsdToBuy);

      if (matchUsd >= MIN_TRADE_FLOOR_USD) {
        const sellTokenInfo = calculatedTokens.find((b) => b.mint === sell.mint)!;
        const sellAmountHuman = matchUsd / sellTokenInfo.price;
        const sellAmountBase = Math.floor(sellAmountHuman * Math.pow(10, sell.decimals));

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

      sell.amountUsdToSell -= matchUsd;
      buy.amountUsdToBuy -= matchUsd;

      if (sell.amountUsdToSell < MIN_TRADE_FLOOR_USD) sellIdx++;
      if (buy.amountUsdToBuy < MIN_TRADE_FLOOR_USD) buyIdx++;
    }

    return swapsList;
  };

  const currentSwaps = calculateRebalanceSwaps();

  // Load quotes from Jupiter for Rebalancing Swaps ON DEMAND (only when user initiates rebalance)
  useEffect(() => {
    async function loadQuotes() {
      if (currentSwaps.length === 0) {
        setSwapQuotes({});
        return;
      }

      setLoadingQuotes(true);
      const quotesRecord: Record<number, { quote: any; error?: string }> = {};

      for (let i = 0; i < currentSwaps.length; i++) {
        const swap = currentSwaps[i];
        try {
          if (swap.amount <= 0 || swap.usdValue < MIN_TRADE_FLOOR_USD) {
            throw new Error('Trade size too small to route');
          }

          const q = await fetchQuote({
            inputMint: swap.inputMint,
            outputMint: swap.outputMint,
            amount: swap.amount.toString(),
            slippageBps: 50,
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

    if (rebalanceAvailable && rebalanceInitiated && !rebalancing && !isCashingOut) {
      loadQuotes();
    }
  }, [rebalanceAvailable, rebalanceInitiated, rebalancing, group.id, isCashingOut]);

  // Execute sequential swaps for rebalancing
  const handleExecuteRebalance = async () => {
    if (currentSwaps.length === 0) return;

    setRebalancing(true);
    setRebalanceStatus({});

    for (let i = 0; i < currentSwaps.length; i++) {
      setRebalanceStep(i + 1);
      const swap = currentSwaps[i];
      const quoteInfo = swapQuotes[i];

      if (!quoteInfo || !quoteInfo.quote) {
        setRebalanceStatus((prev) => ({
          ...prev,
          [i]: { success: false, error: quoteInfo?.error || 'Quote failed / Skipped' },
        }));
        continue;
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

        setRebalanceStatus((prev) => ({
          ...prev,
          [i]: { success: true, txId },
        }));
      } catch (err: any) {
        console.error(`Rebalance step ${i + 1} failed:`, err);
        setRebalanceStatus((prev) => ({
          ...prev,
          [i]: { success: false, error: err?.message || 'Transaction rejected' },
        }));
        setRebalancing(false);
        return; // halt sequence
      }
    }

    await onRefreshPrices();
    const freshBalances = await refreshBalances();
    const freshGroupBalances = getGroupBalances(freshBalances);
    const freshTotalUsdValue = freshGroupBalances.reduce((sum, item) => sum + item.usdValue, 0);

    onSaveSnapshot(group.id, group.name, freshGroupBalances, freshTotalUsdValue, 'rebalance');
    setRebalancing(false);
    setRebalanceInitiated(false);
  };

  // Group Color styling mapping
  const groupColors = getGroupColorClasses(group.color);

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
          <span className="text-[10px] font-bold uppercase text-slate-500 tracking-wider">Target Equal Weight</span>
          <div className="text-xl font-mono font-black text-white">{targetPercent.toFixed(1)}% each</div>
        </div>

        <div className="bg-slate-900 border border-slate-850 p-4 rounded-xl space-y-1">
          <span className="text-[10px] font-bold uppercase text-slate-500 tracking-wider">Maximum absolute Drift</span>
          <div className={`text-xl font-mono font-black ${maxAbsoluteDrift >= DRIFT_THRESHOLD ? 'text-amber-400' : 'text-emerald-400'}`}>
            {maxAbsoluteDrift.toFixed(1)}%
          </div>
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

            {/* Weights List */}
            <div className="py-4 space-y-5">
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
                      <div className="flex justify-between items-end">
                        <div className="flex items-center gap-2.5">
                          <div 
                            className="w-2.5 h-2.5 rounded-full shrink-0" 
                            style={{ backgroundColor: COIN_LINE_COLORS[group.memberMints.indexOf(item.mint) % COIN_LINE_COLORS.length] || '#475569' }}
                          />
                          <span className="font-extrabold text-white text-sm">{item.symbol}</span>
                          <span className="text-[10px] text-slate-500 font-mono">
                            {isUnknown ? (
                              <span className="text-amber-500/80 animate-pulse font-medium">Resolving decimals on Solana...</span>
                            ) : (
                              `${item.amountHuman.toLocaleString(undefined, { maximumFractionDigits: 6 })} units`
                            )}
                          </span>

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

                        <div className="text-right text-xs">
                          {isUnknown ? (
                            <span className="font-mono text-slate-500 italic text-[11px]">Loading balances...</span>
                          ) : (
                            <>
                              <span className="font-mono text-slate-300 font-semibold">${item.usdValue.toFixed(2)}</span>
                              <span className="text-slate-500 mx-1.5">|</span>
                              <span className="font-mono text-slate-400">Price: {formatPrice(item.price)}</span>
                              <span className={`text-[10px] ml-1.5 font-bold font-mono ${(item.change24h || 0) >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                                ({(item.change24h || 0) >= 0 ? '+' : ''}{(item.change24h || 0).toFixed(1)}%)
                              </span>
                            </>
                          )}
                        </div>
                      </div>

                      {/* Drift Bar */}
                      {isUnknown ? (
                        <div className="w-full bg-slate-950/50 h-5 rounded-lg overflow-hidden border border-slate-900/40 flex items-center justify-center relative">
                          <span className="text-[9px] font-mono text-slate-600 tracking-wider uppercase animate-pulse">Calculating drift once decimals resolve...</span>
                        </div>
                      ) : (
                        <div className="w-full bg-slate-950 h-5 rounded-lg overflow-hidden border border-slate-850 flex relative">
                          {/* Underweight fill (left side of target) */}
                          <div className="w-1/2 h-full flex justify-end items-center bg-slate-950/40 relative">
                            {!isOver && (
                              <div 
                                className="h-full bg-sky-500/20 border-r border-sky-400/40 transition-all"
                                style={{ width: `${Math.min(100, (absDrift / targetPercent) * 100)}%` }}
                              />
                            )}
                          </div>
                          {/* Divider Line representing exact Target Weight */}
                          <div className="absolute left-1/2 top-0 bottom-0 w-0.5 bg-slate-700 z-10 flex items-center justify-center">
                            <span className="absolute text-[8px] font-mono text-slate-500 -top-3.5">TARGET</span>
                          </div>
                          {/* Overweight fill (right side of target) */}
                          <div className="w-1/2 h-full flex justify-start items-center bg-slate-950/40 relative">
                            {isOver && (
                              <div 
                                className="h-full bg-emerald-500/20 border-l border-emerald-400/40 transition-all"
                                style={{ width: `${Math.min(100, (absDrift / targetPercent) * 100)}%` }}
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
                    {(() => {
                      const walletTokenMints = Object.keys(allBalances).filter((m) => (allBalances[m] || 0) > 0);
                      const popularMints = [
                        'So11111111111111111111111111111111111111112', // SOL
                        'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', // USDC
                        'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB', // USDT
                        'JUPyiwrYJFskUPiFG4gpvXvjTE76SreV8NToA8Y5YyJ', // JUP
                        'DezXAZ8z7PnrFcPykJzn99s94ChKnmk699rCgHmzUM6y', // BONK
                      ];
                      const allCandidateMints = Array.from(new Set([...walletTokenMints, ...popularMints]))
                        .filter((m) => !group.memberMints.includes(m));

                      if (allCandidateMints.length === 0) {
                        return <div className="text-center py-4 text-xs text-slate-500">No other coins found in wallet.</div>;
                      }

                      return allCandidateMints.map((mint) => {
                        const meta = tokenMetadata[mint] || { address: mint, symbol: mint.substring(0, 4), name: 'Unknown', decimals: 9 };
                        const otherGroup = groups.find((g) => g.memberMints.includes(mint) && g.id !== group.id);
                        const balanceRaw = allBalances[mint] || 0;
                        const balanceHuman = meta.decimals !== undefined ? balanceRaw / Math.pow(10, meta.decimals) : 0;

                        return (
                          <div key={mint} className="flex justify-between items-center py-2 text-xs first:pt-0">
                            <div className="flex items-center gap-2">
                              <div className="w-6 h-6 bg-slate-900 rounded-full flex items-center justify-center font-bold text-[10px] text-slate-450">
                                {meta.symbol.substring(0, 2)}
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
                                      }
                                    }}
                                    className="bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border border-amber-500/20 px-2.5 py-1 rounded-lg text-[10px] font-extrabold cursor-pointer transition-all"
                                  >
                                    Move here
                                  </button>
                                </div>
                              ) : (
                                <button
                                  onClick={() => handleAddCoinPreCheck(mint)}
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
                    })()}
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
          {rebalanceAvailable && currentSwaps.length > 0 && (
            <div className={`bg-slate-900 border ${groupColors.border} rounded-2xl p-6 shadow-xl space-y-4`}>
              {!rebalanceInitiated ? (
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
                  <button
                    onClick={() => setRebalanceInitiated(true)}
                    className="px-5 py-2.5 bg-emerald-500 hover:bg-emerald-450 text-slate-950 font-extrabold rounded-xl text-xs transition-all cursor-pointer shadow-lg"
                  >
                    Verify Rebalance Routes & Quotes
                  </button>
                </div>
              ) : (
                <>
                  <div className="border-b border-slate-800 pb-4 flex justify-between items-center animate-in fade-in duration-200">
                    <div>
                      <h4 className="text-md font-bold text-white flex items-center gap-2">
                        <ArrowUpDown className={`w-4 h-4 ${groupColors.text}`} />
                        Matching Advisory Trade List ({currentSwaps.length} swaps)
                      </h4>
                      <p className="text-xs text-slate-400">Direct wallet-to-wallet routes generated to restore exact equal-weights.</p>
                    </div>
                    {loadingQuotes ? (
                      <span className="text-xs text-slate-500 flex items-center gap-1.5 animate-pulse">
                        <Loader2 className="w-3.5 h-3.5 animate-spin text-emerald-400" />
                        Quoting Routes...
                      </span>
                    ) : (
                      <span className="text-xs text-emerald-400 font-bold uppercase tracking-wider">Fresh Route Quotes</span>
                    )}
                  </div>

                  <div className="space-y-2">
                    {currentSwaps.map((swap, idx) => {
                      const quoteInfo = swapQuotes[idx];
                      const isCrashCase = crashWarnings.some((w) => w.mint === swap.outputMint);

                      return (
                        <div key={idx} className={`p-4 rounded-xl border ${isCrashCase ? 'bg-rose-950/20 border-rose-500/20' : 'bg-slate-950 border-slate-850'} flex flex-col sm:flex-row justify-between sm:items-center gap-3 text-xs`}>
                          <div className="space-y-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-slate-500 font-bold uppercase tracking-wider">SELL</span>
                              <strong className="text-white font-black">
                                {(swap.amount / Math.pow(10, swap.inputDecimals)).toLocaleString(undefined, { maximumFractionDigits: 6 })} {swap.inputSymbol}
                              </strong>
                              <span className="text-slate-600">→</span>
                              <span className="text-slate-500 font-bold uppercase tracking-wider">BUY</span>
                              <strong className={`font-black ${isCrashCase ? 'text-rose-400' : 'text-emerald-400'}`}>
                                {quoteInfo && quoteInfo.quote ? (
                                  (parseInt(quoteInfo.quote.outAmount || '0') / Math.pow(10, swap.outputDecimals)).toLocaleString(undefined, { maximumFractionDigits: 6 })
                                ) : '0'} {swap.outputSymbol}
                              </strong>
                            </div>
                            <div className="text-[10px] text-slate-500">
                              Match size: <strong className="text-slate-400">${swap.usdValue.toFixed(2)}</strong>
                            </div>
                          </div>

                          <div className="text-right">
                            {quoteInfo?.error ? (
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
                        </div>
                      );
                    })}
                  </div>

                  {/* Execution Block */}
                  <div className="bg-slate-950 rounded-xl border border-slate-850 p-4 space-y-4">
                    <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-3 text-[11px] text-slate-400">
                      <p className="max-w-md">
                        Execution requires signing {currentSwaps.length} consecutive swap transactions. No assets ever leave your own wallet.
                      </p>
                      {type === 'demo' && (
                        <span className="text-[10px] bg-emerald-500/10 text-emerald-400 px-2 py-1 rounded-md border border-emerald-500/20 font-bold">
                          SIMULATED SANDBOX WALLET
                        </span>
                      )}
                    </div>

                    {rebalancing && (
                      <div className="bg-slate-900 border border-slate-800 p-4 rounded-lg space-y-3">
                        <div className="flex items-center gap-2">
                          <Loader2 className="w-4 h-4 animate-spin text-emerald-400" />
                          <span className="text-xs text-slate-300 font-semibold">
                            Executing Swap {rebalanceStep} of {currentSwaps.length}...
                          </span>
                        </div>
                        <div className="w-full bg-slate-950 h-2 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-emerald-500 transition-all duration-300"
                            style={{ width: `${(rebalanceStep / currentSwaps.length) * 100}%` }}
                          />
                        </div>
                      </div>
                    )}

                    <button
                      onClick={handleExecuteRebalance}
                      disabled={rebalancing || loadingQuotes || !publicKey}
                      className={`w-full py-4 rounded-xl text-sm font-extrabold transition-all flex items-center justify-center gap-2 cursor-pointer ${
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
                      ) : crashWarnings.length > 0 ? (
                        <>
                          <AlertTriangle className="w-4.5 h-4.5" />
                          Override Crash Warning & Rebalance
                        </>
                      ) : (
                        <>
                          <RefreshCw className="w-4.5 h-4.5" />
                          Execute Equal-Weight Rebalance Now
                        </>
                      )}
                    </button>
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

    </div>
  );
}
