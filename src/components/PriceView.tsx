import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  TrendingUp,
  TrendingDown,
  RefreshCw,
  Flame,
  Loader2,
  Sparkles,
  ChevronDown,
  Search,
  ArrowRight,
  ArrowDownUp,
  Zap,
  CheckCircle2,
  AlertCircle,
  ExternalLink,
  ChevronRight,
  X,
} from 'lucide-react';
import { TokenBalance, LinkGroup, Token, getGroupColorClasses, formatPrice } from '../types';
import TokenLogo from './TokenLogo';
import TokenLink from './TokenLink';
import { useSolanaWallet } from './WalletProvider';
import { fetchQuote, fetchVerifiedTokens } from '../jupiter';
import MountainRopeBackground from './MountainRopeBackground';
import PixelCharacterSprite from './PixelCharacterSprite';

// Helper for stable organic placement per token
const seededRand = (s: string) => {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 100000) / 100000;
};

interface PriceViewProps {
  balancesWithPrice: TokenBalance[];
  loadingPrices: boolean;
  onRefreshPrices: () => Promise<void>;
  groups: LinkGroup[];
  isVerifiedCoin: (mint: string) => boolean;
  prices: Record<string, { price: number; change24h: number }>;
  tokenMetadata: Record<string, Token>;
  onSelectGroup: (groupId: string) => void;
  onNavigateToWallet: () => void;
  landingMode?: boolean;
  onConnect?: () => void;
}

export default function PriceView({
  balancesWithPrice,
  loadingPrices,
  onRefreshPrices,
  groups,
  isVerifiedCoin,
  prices,
  tokenMetadata,
  onSelectGroup,
  onNavigateToWallet,
  landingMode = false,
  onConnect,
}: PriceViewProps) {
  const wallet = useSolanaWallet();
  const signAndExecuteSwap = wallet?.signAndExecuteSwap;
  const slippageBps = wallet?.slippageBps || 50;
  const publicKey = wallet?.publicKey;
  const refreshBalances = wallet?.refreshBalances;

  const [showHiddenPrices, setShowHiddenPrices] = useState(false);

  // Verified tokens list from Jupiter for Into token search
  const [verifiedTokens, setVerifiedTokens] = useState<Token[]>([]);

  useEffect(() => {
    fetchVerifiedTokens().then((tokens) => {
      if (tokens && tokens.length > 0) {
        setVerifiedTokens(tokens);
      }
    }).catch((err) => {
      console.warn('Could not load verified tokens for search:', err);
    });
  }, []);

  // Filter held real coins for the arena (>= $1 USD value to avoid dust clutter)
  const heldRealCoins = useMemo(() => {
    return balancesWithPrice.filter((item) => {
      const isLinked = groups.some((g) => g.memberMints.includes(item.mint));
      const isVerified = isVerifiedCoin(item.mint);
      return (isLinked || isVerified || item.usdValue >= 0.01) && item.amount > 0;
    });
  }, [balancesWithPrice, groups, isVerifiedCoin]);

  // Sort by 24h price change % descending for ranking in arena
  const sortedCoins = useMemo(() => {
    return [...heldRealCoins].sort((a, b) => {
      const changeA = a.change24h || 0;
      const changeB = b.change24h || 0;
      return changeB - changeA;
    });
  }, [heldRealCoins]);

  // Arena coins filtered to usdValue >= $1 to drop dust
  const arenaCoins = useMemo(() => {
    return sortedCoins.filter((c) => c.usdValue >= 1);
  }, [sortedCoins]);

  // Calculate total portfolio values and enrich held assets data
  let totalHoldingsValue = 0;
  let total24hMoveUsd = 0;

  const enrichedCoins = balancesWithPrice
    .filter((item) => {
      const isLinked = groups.some((g) => g.memberMints.includes(item.mint));
      const isVerified = isVerifiedCoin(item.mint);
      return isLinked || isVerified || item.usdValue >= 0.01;
    })
    .sort((a, b) => (b.change24h || 0) - (a.change24h || 0))
    .map((item) => {
      const priceInfo = prices[item.mint] || { price: item.price || 0, change24h: item.change24h || 0 };
      const price = priceInfo.price;
      const change24h = priceInfo.change24h || 0;
      const currentHoldingsUsd = item.amountHuman * price;
      const factor = 1 + (change24h / 100);
      const holdings24hChangeUsd = factor !== 0 ? currentHoldingsUsd - (currentHoldingsUsd / factor) : 0;
      
      totalHoldingsValue += currentHoldingsUsd;
      total24hMoveUsd += holdings24hChangeUsd;

      const owningGroup = groups.find((g) => g.memberMints.includes(item.mint));
      const gColors = owningGroup ? getGroupColorClasses(owningGroup.color) : null;
      const isCrashed = change24h <= -40.0;

      return {
        item,
        price,
        change24h,
        currentHoldingsUsd,
        holdings24hChangeUsd,
        owningGroup,
        gColors,
        isCrashed,
      };
    });

  const mainEnrichedCoins = enrichedCoins.filter(row => row.currentHoldingsUsd >= 0.01);
  const hiddenEnrichedCoins = enrichedCoins.filter(row => row.currentHoldingsUsd < 0.01);

  // Maximum 24h change magnitude for arena terrain mood based on visible arenaCoins
  const maxAbsChange = useMemo(() => {
    if (arenaCoins.length === 0) return 0;
    return Math.max(...arenaCoins.map(c => Math.abs(c.change24h || 0)));
  }, [arenaCoins]);

  // Selected coin on the Canvas
  const [selectedMint, setSelectedMint] = useState<string | null>(null);

  // Trade Panel States
  interface TradeSlotToken {
    mint: string;
    symbol: string;
    logoURI?: string;
    decimals: number;
    amountHuman?: number;
    price?: number;
    change24h?: number;
    usdValue?: number;
  }

  const [fromToken, setFromToken] = useState<TradeSlotToken | null>(null);
  const [intoToken, setIntoToken] = useState<TradeSlotToken | null>(null);
  const [fromAmount, setFromAmount] = useState<string>('');
  
  const [showFromDropdown, setShowFromDropdown] = useState(false);
  const [showIntoDropdown, setShowIntoDropdown] = useState(false);
  const [intoSearchQuery, setIntoSearchQuery] = useState('');

  // Quote state
  const [quote, setQuote] = useState<any>(null);
  const [quoting, setQuoting] = useState(false);
  const [quoteError, setQuoteError] = useState<string | null>(null);

  // Swap action state
  const [swapping, setSwapping] = useState(false);
  const [swapSuccessMsg, setSwapSuccessMsg] = useState<string | null>(null);
  const [swapErrorMsg, setSwapErrorMsg] = useState<string | null>(null);

  // Load Sell coin into FROM slot
  const handleSellCoin = (coin: TokenBalance) => {
    const decimals = coin.decimals || tokenMetadata[coin.mint]?.decimals || 6;
    setFromToken({
      mint: coin.mint,
      symbol: coin.symbol,
      logoURI: coin.logoURI,
      decimals,
      amountHuman: coin.amountHuman,
      price: coin.price,
      change24h: coin.change24h,
      usdValue: coin.usdValue,
    });

    // If up today, prefill with today's dollar move on holdings converted to token units
    if ((coin.change24h || 0) > 0 && coin.usdValue > 0 && coin.price > 0) {
      const factor = 1 + ((coin.change24h || 0) / 100);
      const holdings24hChangeUsd = coin.usdValue - (coin.usdValue / factor);
      const gainInTokenUnits = holdings24hChangeUsd / coin.price;
      setFromAmount(gainInTokenUnits.toFixed(6));
    } else {
      setFromAmount('');
    }
  };

  // Load Buy coin into INTO slot
  const handleBuyCoin = (coin: TokenBalance | Token) => {
    const mint = 'mint' in coin ? coin.mint : coin.address;
    const decimals = coin.decimals || tokenMetadata[mint]?.decimals || 6;
    setIntoToken({
      mint,
      symbol: coin.symbol,
      logoURI: coin.logoURI,
      decimals,
    });
  };

  // Fetch Jupiter quote when From token, Into token, and From amount are set
  useEffect(() => {
    if (!fromToken || !intoToken || !fromAmount || parseFloat(fromAmount) <= 0) {
      setQuote(null);
      setQuoteError(null);
      return;
    }

    if (fromToken.mint === intoToken.mint) {
      setQuote(null);
      setQuoteError('Cannot swap same token');
      return;
    }

    const timer = setTimeout(async () => {
      setQuoting(true);
      setQuoteError(null);
      try {
        const decimals = fromToken.decimals || 6;
        const amountBase = Math.floor(parseFloat(fromAmount) * (10 ** decimals));
        if (amountBase <= 0) {
          setQuoting(false);
          return;
        }

        const q = await fetchQuote({
          inputMint: fromToken.mint,
          outputMint: intoToken.mint,
          amount: amountBase.toString(),
          slippageBps,
        });

        if (q && q.outAmount) {
          setQuote(q);
        } else {
          setQuote(null);
          setQuoteError('No swap route found');
        }
      } catch (err: any) {
        console.warn('Quote fetch error:', err);
        setQuote(null);
        setQuoteError(err.message || 'Route unavailable');
      } finally {
        setQuoting(false);
      }
    }, 350);

    return () => clearTimeout(timer);
  }, [fromToken, intoToken, fromAmount, slippageBps]);

  // Execute Swap via Wallet
  const handleExecuteSwap = async () => {
    if (!signAndExecuteSwap || !fromToken || !intoToken || !fromAmount || !quote) return;

    setSwapping(true);
    setSwapErrorMsg(null);
    setSwapSuccessMsg(null);

    try {
      const inputDecimals = fromToken.decimals || 6;
      const outputDecimals = intoToken.decimals || 6;
      const amountBase = Math.floor(parseFloat(fromAmount) * (10 ** inputDecimals));

      const txId = await signAndExecuteSwap({
        inputMint: fromToken.mint,
        outputMint: intoToken.mint,
        amountBase,
        quoteResponse: quote,
        inputDecimals,
        outputDecimals,
      });

      setSwapSuccessMsg(`Swapped ${fromToken.symbol} to ${intoToken.symbol}!`);
      if (refreshBalances) await refreshBalances();
      await onRefreshPrices();

      setFromAmount('');
      setQuote(null);
    } catch (err: any) {
      console.error('Swap execution error:', err);
      setSwapErrorMsg(err.message || 'Swap transaction rejected or failed.');
    } finally {
      setSwapping(false);
      setTimeout(() => {
        setSwapSuccessMsg(null);
      }, 5000);
    }
  };

  // Filter verified tokens for Into selector dropdown search
  const filteredIntoTokens = useMemo(() => {
    const q = intoSearchQuery.trim().toLowerCase();
    
    // Combine current held real coins and verified tokens list
    const combinedMap = new Map<string, Token>();

    heldRealCoins.forEach((c) => {
      combinedMap.set(c.mint, {
        address: c.mint,
        symbol: c.symbol,
        name: tokenMetadata[c.mint]?.name || c.symbol,
        decimals: c.decimals || 6,
        logoURI: c.logoURI,
      });
    });

    verifiedTokens.forEach((vt) => {
      if (!combinedMap.has(vt.address)) {
        combinedMap.set(vt.address, vt);
      }
    });

    const list = Array.from(combinedMap.values());
    if (!q) return list.slice(0, 40);

    return list
      .filter((t) => t.symbol.toLowerCase().includes(q) || (t.name && t.name.toLowerCase().includes(q)) || t.address.toLowerCase() === q)
      .slice(0, 40);
  }, [heldRealCoins, verifiedTokens, intoSearchQuery, tokenMetadata]);

  const handleRowClick = (row: typeof enrichedCoins[0]) => {
    if (row.owningGroup) {
      onSelectGroup(row.owningGroup.id);
    } else {
      onNavigateToWallet();
    }
  };

  // Selected coin object on Canvas
  const selectedCoinObj = useMemo(() => {
    if (!selectedMint) return null;
    return arenaCoins.find(c => c.mint === selectedMint) || null;
  }, [selectedMint, arenaCoins]);

  const selectedCoinGroup = useMemo(() => {
    if (!selectedCoinObj) return null;
    return groups.find((g) => g.memberMints.includes(selectedCoinObj.mint)) || null;
  }, [selectedCoinObj, groups]);

  // Deterministic overlap-relaxation pass for arena bubbles
  const positionedArenaCoins = useMemo(() => {
    if (arenaCoins.length === 0) return [];

    const K = 6; // softness: smaller = steeper near zero
    const V_SPAN = 42; // max offset from the 50 percent center

    const maxShare = Math.max(
      ...arenaCoins.map((c) => (totalHoldingsValue > 0 ? c.usdValue / totalHoldingsValue : 0)),
      1e-9
    );
    const MIN_SIDE = 30;
    const MAX_SIDE = 78;

    const W = 1000;
    const H = 580;

    const nodes = arenaCoins.map((coin) => {
      const change = coin.change24h || 0;
      const norm = Math.tanh(change / K); // positive is a winner
      let topPercent = 50 - norm * V_SPAN; // winners go up
      topPercent += (seededRand(coin.mint + 'y') - 0.5) * 3; // small jitter
      topPercent = Math.max(6, Math.min(94, topPercent));

      const xPercent = 8 + seededRand(coin.mint) * 78;

      const share = totalHoldingsValue > 0 ? coin.usdValue / totalHoldingsValue : 0;
      const ratio = share / maxShare; // largest holding is 1
      const tileSide = Math.round(MIN_SIDE + (MAX_SIDE - MIN_SIDE) * Math.sqrt(ratio));

      const x = (xPercent / 100) * W;
      const y = (topPercent / 100) * H;

      return {
        coin,
        tileSide,
        x,
        y,
        initY: y,
        r: tileSide / 2 + 6,
      };
    });

    for (let iter = 0; iter < 6; iter++) {
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const a = nodes[i];
          const b = nodes[j];
          let dx = b.x - a.x;
          let dy = b.y - a.y;
          let dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < 0.1) {
            dx = (seededRand(a.coin.mint + 'dx') - 0.5) * 2;
            dy = (seededRand(b.coin.mint + 'dy') - 0.5) * 2;
            dist = Math.sqrt(dx * dx + dy * dy);
          }
          const minDist = a.r + b.r;

          if (dist < minDist) {
            const overlap = minDist - dist;
            const nx = dx / dist;
            const ny = dy / dist;

            const pushX = nx * overlap * 0.5 * 0.85;
            const pushY = ny * overlap * 0.5 * 0.15;

            a.x -= pushX;
            b.x += pushX;

            a.y -= pushY;
            b.y += pushY;

            const maxVertDrift = H * 0.04;
            a.y = Math.max(a.initY - maxVertDrift, Math.min(a.initY + maxVertDrift, a.y));
            b.y = Math.max(b.initY - maxVertDrift, Math.min(b.initY + maxVertDrift, b.y));
          }
        }
      }
    }

    return nodes.map((node) => ({
      coin: node.coin,
      tileSide: node.tileSide,
      xPercent: Math.max(6, Math.min(88, (node.x / W) * 100)),
      topPercent: Math.max(6, Math.min(94, (node.y / H) * 100)),
    }));
  }, [arenaCoins, totalHoldingsValue]);

  return (
    <div id="price-view" className="space-y-4">
      {/* Dynamic Keyframe Style Block for Floating Arena Animations */}
      <style>{`
        @keyframes winnerBob {
          0%, 100% { transform: translateY(0px); }
          50% { transform: translateY(-6px); }
        }
        @keyframes loserWobble {
          0%, 100% { transform: rotate(0deg) translateY(0px); }
          25% { transform: rotate(-3deg) translateY(2px); }
          75% { transform: rotate(3deg) translateY(1px); }
        }
        @keyframes wingFlapLeft {
          0%, 100% { transform: translateY(-50%) rotate(0deg); }
          50% { transform: translateY(-50%) rotate(-18deg) scale(1.1); }
        }
        @keyframes wingFlapRight {
          0%, 100% { transform: translateY(-50%) rotate(0deg); }
          50% { transform: translateY(-50%) rotate(18deg) scale(1.1); }
        }
        .animate-winner-bob {
          animation: winnerBob 3.5s ease-in-out infinite;
        }
        .animate-loser-wobble {
          animation: loserWobble 2.8s ease-in-out infinite;
        }
        .animate-wing-flap-left {
          animation: wingFlapLeft 1.2s ease-in-out infinite;
        }
        .animate-wing-flap-right {
          animation: wingFlapRight 1.2s ease-in-out infinite;
        }
      `}</style>

      {/* Intro Stats Banner with Basket Color Legend Strip */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div className="space-y-1">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-sm font-bold text-white flex items-center gap-1.5">
              <Flame className="w-4 h-4 text-emerald-400" />
              Live Market Intel
            </h3>
            <span className="text-[10px] bg-slate-800 text-slate-300 font-mono font-bold px-2 py-0.5 rounded-full border border-slate-700">
              {groups.length} Baskets Tracked
            </span>
          </div>
          {/* BASKET COLOR LEGEND STRIP */}
          {groups.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5 pt-1">
              <span className="text-[9px] text-slate-500 font-extrabold uppercase mr-1">Baskets:</span>
              {groups.map((g) => {
                const gColors = getGroupColorClasses(g.color);
                return (
                  <button
                    key={g.id}
                    onClick={() => onSelectGroup(g.id)}
                    className={`text-[9px] font-mono font-black px-2 py-0.5 rounded-full border shadow flex items-center gap-1 transition-transform hover:scale-105 cursor-pointer ${gColors.bgSolid} text-white border-white/40`}
                    title={`Click to view ${g.name} basket`}
                  >
                    <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse shrink-0" />
                    <span>{g.name}</span>
                    <span className="opacity-80 font-normal">({g.memberMints.length})</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <button
          onClick={onRefreshPrices}
          disabled={loadingPrices}
          className="bg-slate-950 hover:bg-slate-850 border border-slate-800 text-slate-300 px-3 py-1.5 rounded-lg text-[11px] font-semibold transition-all flex items-center gap-1.5 disabled:opacity-50 cursor-pointer shrink-0 self-start md:self-auto"
        >
          {loadingPrices ? (
            <>
              <Loader2 className="w-3 h-3 animate-spin text-emerald-400" />
              Syncing...
            </>
          ) : (
            <>
              <RefreshCw className="w-3 h-3" />
              Sync Rates
            </>
          )}
        </button>
      </div>

      {/* WALLET ARENA HERO & TRADE PANEL */}
      {!landingMode && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          
          {/* LEFT COLUMN: HERO ARENA + SELECTION BAR STRIP */}
          <div className="lg:col-span-8 flex flex-col gap-3">

            {/* THE CANVAS (Hero Arena, ~600px - Mountain Rope Team) */}
            <div className="relative h-[600px] rounded-2xl border overflow-hidden shadow-2xl flex flex-col justify-between p-4 transition-all duration-500 bg-slate-950 border-slate-800">
            
            {/* 1. MOUNTAIN ROPE BACKGROUND */}
            <MountainRopeBackground maxAbsChange={maxAbsChange} />

            {/* 2. TOP ARENA HEADER: MOUNTAIN WEATHER BADGE */}
            <div className="relative z-30 flex items-center justify-end text-[10px]">
              <div className="flex items-center gap-1.5 bg-slate-900/90 px-2.5 py-1 rounded-lg border border-slate-800 backdrop-blur-sm pointer-events-none font-extrabold uppercase tracking-widest shadow-sm">
                {maxAbsChange > 20 ? (
                  <span className="flex items-center gap-1 text-slate-300 font-bold">
                    <span className="w-1.5 h-1.5 rounded-full bg-rose-400 animate-pulse" />
                    STORM
                  </span>
                ) : maxAbsChange >= 5 ? (
                  <span className="flex items-center gap-1 text-slate-300 font-bold">
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                    GUSTING
                  </span>
                ) : (
                  <span className="flex items-center gap-1 text-slate-400 font-bold">
                    <span className="w-1.5 h-1.5 rounded-full bg-slate-400" />
                    CLEAR
                  </span>
                )}
                <span className="text-slate-500 font-mono text-[9px] font-normal border-l border-slate-700/80 pl-1.5">
                  {maxAbsChange.toFixed(1)}% MAX
                </span>
              </div>
            </div>

            {/* 3. CLIMBING ROPE PERCENT AXIS (Right Edge) */}
            <div className="absolute right-2 top-8 bottom-8 w-14 z-20 pointer-events-none select-none">
              {/* Rope line */}
              <div
                className="absolute top-0 bottom-0 left-[3px] w-[2px] rounded-full opacity-60"
                style={{
                  background: 'linear-gradient(180deg, #92704f 0%, #78583c 50%, #5c432d 100%)',
                }}
              />
              {/* Knots & Mono percent labels along the rope */}
              {[
                { value: 10, label: '+10%' },
                { value: 5, label: '+5%' },
                { value: 0, label: '0.0%' },
                { value: -5, label: '-5%' },
                { value: -10, label: '-10%' },
              ].map((tick) => {
                const topPct = 50 - Math.tanh(tick.value / 6) * 42;
                const isZero = tick.value === 0;
                return (
                  <div
                    key={tick.value}
                    style={{ top: `${topPct}%` }}
                    className="absolute left-0 -translate-y-1/2 flex items-center gap-1.5"
                  >
                    {/* Knot dot centered on rope line */}
                    <div
                      className={`rounded-full shrink-0 shadow-sm ${
                        isZero
                          ? 'w-2 h-2 bg-slate-300 border border-slate-600'
                          : 'w-2 h-2 bg-[#a16207] border border-[#78350f]'
                      }`}
                    />
                    {/* Mono Label */}
                    <span
                      className={`font-mono text-[9px] font-bold tracking-tight whitespace-nowrap ${
                        isZero ? 'text-slate-200' : 'text-slate-400'
                      }`}
                    >
                      {tick.label}
                    </span>
                  </div>
                );
              })}
            </div>

            {/* 4. BUBBLE FIELD */}
            <div className="absolute inset-x-4 top-10 bottom-12 z-20">
              {positionedArenaCoins.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-center text-slate-500 space-y-2">
                  <Sparkles className="w-8 h-8 text-emerald-400/50 animate-pulse" />
                  <p className="text-xs font-medium">No active held Solana assets ≥ $1 found in wallet.</p>
                  <p className="text-[10px] text-slate-600">Connect a wallet or deposit tokens to view your Arena.</p>
                </div>
              ) : (
                positionedArenaCoins.map(({ coin, tileSide, xPercent, topPercent }) => {
                  const change = coin.change24h || 0;

                  // Owning group color / basket
                  const owningGroup = groups.find((g) => g.memberMints.includes(coin.mint));
                  const gColors = owningGroup ? getGroupColorClasses(owningGroup.color) : null;
                  const isSelected = selectedMint === coin.mint;

                  return (
                    <div
                      key={coin.mint}
                      style={{
                        top: `${topPercent}%`,
                        left: `${xPercent}%`,
                        transform: 'translate(-50%, -50%)',
                      }}
                      className="absolute z-20"
                    >
                      <PixelCharacterSprite
                        symbol={coin.symbol}
                        mint={coin.mint}
                        change24h={change}
                        usdValue={coin.usdValue}
                        tileSide={tileSide}
                        owningGroup={owningGroup}
                        gColors={gColors}
                        isSelected={isSelected}
                        topPercent={topPercent}
                        logoURI={coin.logoURI}
                        onClick={() => setSelectedMint((prev) => (prev === coin.mint ? null : coin.mint))}
                      />
                    </div>
                  );
                })
              )}
            </div>

          </div>

          {/* ALWAYS-VISIBLE SELECTION BAR STRIP BELOW ARENA */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-2.5 shadow-xl min-h-[56px] flex items-center justify-between gap-2">
            {selectedCoinObj ? (
              <>
                <div className="flex items-center gap-2 min-w-0">
                  <TokenLink mint={selectedCoinObj.mint} showIcon>
                    <TokenLogo logoURI={selectedCoinObj.logoURI} symbol={selectedCoinObj.symbol} size="sm" />
                    <strong className="text-white font-extrabold text-xs">{selectedCoinObj.symbol}</strong>
                  </TokenLink>
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className={`text-[9px] font-bold font-mono px-1 rounded ${
                        (selectedCoinObj.change24h || 0) >= 0 ? 'text-emerald-400 bg-emerald-500/10' : 'text-rose-400 bg-rose-500/10'
                      }`}>
                        {(selectedCoinObj.change24h || 0) >= 0 ? '+' : ''}{(selectedCoinObj.change24h || 0).toFixed(1)}%
                      </span>
                    </div>
                    <span className="text-[10px] text-slate-400 font-mono block truncate">
                      ${selectedCoinObj.usdValue.toFixed(2)} ({selectedCoinObj.amountHuman.toLocaleString(undefined, { maximumFractionDigits: 4 })} ${selectedCoinObj.symbol})
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    onClick={() => handleSellCoin(selectedCoinObj)}
                    className="bg-emerald-500/20 hover:bg-emerald-500/35 text-emerald-300 border border-emerald-500/40 text-[10px] font-bold px-2.5 py-1 rounded-lg transition-all cursor-pointer flex items-center gap-1"
                  >
                    ⚡ Sell
                  </button>

                  <button
                    onClick={() => handleBuyCoin(selectedCoinObj)}
                    className="bg-sky-500/20 hover:bg-sky-500/35 text-sky-300 border border-sky-500/40 text-[10px] font-bold px-2.5 py-1 rounded-lg transition-all cursor-pointer flex items-center gap-1"
                  >
                    📥 Buy
                  </button>

                  <button
                    onClick={() => {
                      if (selectedCoinGroup) {
                        onSelectGroup(selectedCoinGroup.id);
                      } else {
                        onNavigateToWallet();
                      }
                    }}
                    className="bg-slate-800 hover:bg-slate-750 text-slate-200 border border-slate-700 text-[10px] font-bold px-2 py-1 rounded-lg transition-all cursor-pointer flex items-center gap-1"
                  >
                    Go to basket →
                  </button>

                  <button
                    onClick={() => setSelectedMint(null)}
                    className="p-1 text-slate-400 hover:text-white transition-colors cursor-pointer"
                    title="Deselect"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="flex items-center gap-2 text-slate-500 text-xs">
                  <Sparkles className="w-3.5 h-3.5 text-slate-600" />
                  <span>Click a bubble in the arena to select a coin</span>
                </div>
                <div className="flex items-center gap-1.5 shrink-0 opacity-40 pointer-events-none">
                  <button className="bg-slate-800 text-slate-400 text-[10px] font-bold px-2.5 py-1 rounded-lg">⚡ Sell</button>
                  <button className="bg-slate-800 text-slate-400 text-[10px] font-bold px-2.5 py-1 rounded-lg">📥 Buy</button>
                  <button className="bg-slate-800 text-slate-400 text-[10px] font-bold px-2 py-1 rounded-lg">Go to basket →</button>
                </div>
              </>
            )}
          </div>
        </div>

          {/* TRADE PANEL (Always Visible, Empty at rest) */}
          <div className="lg:col-span-4 bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-2xl flex flex-col justify-between space-y-3 relative">
            <div>
              <div className="flex items-center justify-between border-b border-slate-800 pb-2 mb-3">
                <div className="flex items-center gap-1.5">
                  <Zap className="w-4 h-4 text-amber-400" />
                  <h4 className="text-xs font-bold text-white uppercase tracking-wider">Rebalance Swap Panel</h4>
                </div>
                <span className="text-[10px] font-mono text-slate-400">Slippage: {slippageBps / 100}%</span>
              </div>

              {/* FROM SLOT */}
              <div className="bg-slate-950 border border-slate-850 rounded-xl p-3 space-y-2">
                <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  <span>From (Pay)</span>
                  {fromToken && fromToken.amountHuman !== undefined && (
                    <span className="font-mono text-slate-400">
                      Bal: {fromToken.amountHuman.toLocaleString(undefined, { maximumFractionDigits: 4 })}
                    </span>
                  )}
                </div>

                <div className="flex items-center justify-between gap-2">
                  {/* From Token Selector Button */}
                  <div className="relative shrink-0">
                    <button
                      onClick={() => {
                        setShowFromDropdown(!showFromDropdown);
                        setShowIntoDropdown(false);
                      }}
                      className="bg-slate-900 hover:bg-slate-850 border border-slate-800 px-3 py-1.5 rounded-lg text-xs font-bold text-white flex items-center gap-2 cursor-pointer transition-colors whitespace-nowrap shrink-0"
                    >
                      {fromToken ? (
                        <>
                          <TokenLogo logoURI={fromToken.logoURI} symbol={fromToken.symbol} size="sm" />
                          <span className="whitespace-nowrap shrink-0">{fromToken.symbol}</span>
                        </>
                      ) : (
                        <span className="text-slate-400 whitespace-nowrap shrink-0">Select token</span>
                      )}
                      <ChevronDown className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                    </button>

                    {/* From Dropdown List */}
                    {showFromDropdown && (
                      <div className="absolute left-0 mt-1 w-56 bg-slate-900 border border-slate-800 rounded-xl shadow-2xl z-50 p-1.5 space-y-1 max-h-56 overflow-y-auto">
                        <div className="px-2 py-1 text-[9px] font-bold uppercase text-slate-500">Your Held Assets (≥ $1)</div>
                        {arenaCoins.length === 0 ? (
                          <div className="p-2 text-xs text-slate-500 italic">No holdings ≥ $1 found</div>
                        ) : (
                          arenaCoins.map((coin) => (
                            <button
                              key={coin.mint}
                              onClick={() => {
                                handleSellCoin(coin);
                                setShowFromDropdown(false);
                              }}
                              className="w-full text-left p-1.5 hover:bg-slate-850 rounded-lg flex items-center justify-between gap-2 text-xs transition-colors cursor-pointer"
                            >
                              <div className="flex items-center gap-2 min-w-0">
                                <TokenLogo logoURI={coin.logoURI} symbol={coin.symbol} size="sm" />
                                <span className="font-bold text-white truncate">{coin.symbol}</span>
                              </div>
                              <span className="text-[10px] font-mono text-slate-400">
                                ${coin.usdValue.toFixed(2)}
                              </span>
                            </button>
                          ))
                        )}
                      </div>
                    )}
                  </div>

                  {/* Amount Input */}
                  <div className="flex flex-col items-end min-w-0 flex-1">
                    <input
                      type="number"
                      placeholder="0.0"
                      value={fromAmount}
                      onChange={(e) => setFromAmount(e.target.value)}
                      className="w-full text-right bg-transparent text-white font-mono font-bold text-base focus:outline-none placeholder:text-slate-600"
                    />
                    {fromToken && fromAmount && !isNaN(parseFloat(fromAmount)) && parseFloat(fromAmount) > 0 && (
                      <div className="text-[10px] text-slate-400 text-right font-mono pt-0.5 truncate w-full">
                        ≈ ${(parseFloat(fromAmount) * (fromToken.price || prices[fromToken.mint]?.price || 0)).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </div>
                    )}
                  </div>
                </div>

                {/* Quick Presets for From */}
                {fromToken && fromToken.amountHuman !== undefined && fromToken.amountHuman > 0 && (
                  <div className="flex items-center justify-end gap-1.5 pt-1 border-t border-slate-900">
                    <button
                      onClick={() => setFromAmount((fromToken.amountHuman! * 0.25).toFixed(6))}
                      className="text-[9px] font-mono font-bold bg-slate-900 hover:bg-slate-850 text-slate-400 px-1.5 py-0.5 rounded cursor-pointer"
                    >
                      25%
                    </button>
                    <button
                      onClick={() => setFromAmount((fromToken.amountHuman! * 0.5).toFixed(6))}
                      className="text-[9px] font-mono font-bold bg-slate-900 hover:bg-slate-850 text-slate-400 px-1.5 py-0.5 rounded cursor-pointer"
                    >
                      50%
                    </button>
                    <button
                      onClick={() => setFromAmount(fromToken.amountHuman!.toString())}
                      className="text-[9px] font-mono font-bold bg-slate-900 hover:bg-slate-850 text-emerald-400 px-1.5 py-0.5 rounded cursor-pointer"
                    >
                      MAX
                    </button>
                    {(fromToken.change24h || 0) > 0 && fromToken.usdValue && fromToken.price ? (
                      <button
                        onClick={() => {
                          const factor = 1 + ((fromToken.change24h || 0) / 100);
                          const gainUsd = fromToken.usdValue! - (fromToken.usdValue! / factor);
                          const gainUnits = gainUsd / fromToken.price!;
                          setFromAmount(gainUnits.toFixed(6));
                        }}
                        className="text-[9px] font-mono font-bold bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 px-1.5 py-0.5 rounded cursor-pointer flex items-center gap-0.5"
                        title="Prefill 24h dollar move converted to token units"
                      >
                        ⚡ Harvest Gains
                      </button>
                    ) : null}
                  </div>
                )}
              </div>

              {/* Swap Switch Divider */}
              <div className="flex justify-center -my-1.5 relative z-10 pointer-events-none">
                <div className="bg-slate-900 border border-slate-800 p-1 rounded-full text-slate-400 shadow">
                  <ArrowDownUp className="w-3.5 h-3.5" />
                </div>
              </div>

              {/* INTO SLOT */}
              <div className="bg-slate-950 border border-slate-850 rounded-xl p-3 space-y-2">
                <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  <span>Into (Receive)</span>
                  <span className="text-[10px] text-slate-500 font-mono">Read-only estimate</span>
                </div>

                <div className="flex items-center justify-between gap-2">
                  {/* Into Token Selector Button */}
                  <div className="relative shrink-0">
                    <button
                      onClick={() => {
                        setShowIntoDropdown(!showIntoDropdown);
                        setShowFromDropdown(false);
                      }}
                      className="bg-slate-900 hover:bg-slate-850 border border-slate-800 px-3 py-1.5 rounded-lg text-xs font-bold text-white flex items-center gap-2 cursor-pointer transition-colors whitespace-nowrap shrink-0"
                    >
                      {intoToken ? (
                        <>
                          <TokenLogo logoURI={intoToken.logoURI} symbol={intoToken.symbol} size="sm" />
                          <span className="whitespace-nowrap shrink-0">{intoToken.symbol}</span>
                        </>
                      ) : (
                        <span className="text-slate-400 whitespace-nowrap shrink-0">Select token</span>
                      )}
                      <ChevronDown className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                    </button>

                    {/* Into Dropdown List with Search */}
                    {showIntoDropdown && (
                      <div className="absolute left-0 mt-1 w-64 bg-slate-900 border border-slate-800 rounded-xl shadow-2xl z-50 p-2 space-y-2">
                        <div className="relative">
                          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                          <input
                            type="text"
                            placeholder="Search name or mint..."
                            value={intoSearchQuery}
                            onChange={(e) => setIntoSearchQuery(e.target.value)}
                            className="w-full pl-8 pr-2 py-1 bg-slate-950 border border-slate-800 rounded-lg text-xs text-white placeholder:text-slate-500 focus:outline-none"
                            autoFocus
                          />
                        </div>

                        <div className="max-h-52 overflow-y-auto space-y-1">
                          {filteredIntoTokens.length === 0 ? (
                            <div className="p-2 text-xs text-slate-500 italic">No matching tokens</div>
                          ) : (
                            filteredIntoTokens.map((t) => (
                              <button
                                key={t.address}
                                onClick={() => {
                                  setIntoToken({
                                    mint: t.address,
                                    symbol: t.symbol,
                                    logoURI: t.logoURI,
                                    decimals: t.decimals || 6,
                                  });
                                  setShowIntoDropdown(false);
                                }}
                                className="w-full text-left p-1.5 hover:bg-slate-850 rounded-lg flex items-center gap-2 text-xs transition-colors cursor-pointer"
                              >
                                <TokenLogo logoURI={t.logoURI} symbol={t.symbol} size="sm" />
                                <div className="min-w-0">
                                  <div className="font-bold text-white truncate">{t.symbol}</div>
                                  <div className="text-[9px] text-slate-500 truncate">{t.name || t.address}</div>
                                </div>
                              </button>
                            ))
                          )}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Quoted Output Display */}
                  <div className="text-right min-w-0 flex-1">
                    <div className="font-mono font-bold text-base text-emerald-400 truncate">
                      {quoting ? (
                        <Loader2 className="w-4 h-4 animate-spin text-emerald-400 ml-auto" />
                      ) : quote && quote.outAmount ? (
                        (parseInt(quote.outAmount, 10) / Math.pow(10, intoToken?.decimals || 6)).toLocaleString(undefined, { maximumFractionDigits: 6 })
                      ) : (
                        <span className="text-slate-600">0.0</span>
                      )}
                    </div>
                    {intoToken && (
                      <div className="text-[10px] text-slate-400 font-mono pt-0.5 truncate">
                        {quote && quote.outAmount ? (
                          (() => {
                            const units = parseInt(quote.outAmount, 10) / Math.pow(10, intoToken.decimals || 6);
                            const price = prices[intoToken.mint]?.price || intoToken.price || 0;
                            return price > 0
                              ? `≈ $${(units * price).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                              : '≈ $0.00';
                          })()
                        ) : (
                          '≈ $0.00'
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Quote Error or Route Info */}
              {quoteError && (
                <div className="text-[10px] text-rose-400 flex items-center gap-1 mt-1 px-1">
                  <AlertCircle className="w-3 h-3 shrink-0" />
                  <span>{quoteError}</span>
                </div>
              )}
            </div>

            {/* Execute Button & Messages */}
            <div className="space-y-2 pt-2 border-t border-slate-850">
              {swapSuccessMsg && (
                <div className="bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs p-2.5 rounded-xl flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span>{swapSuccessMsg}</span>
                </div>
              )}

              {swapErrorMsg && (
                <div className="bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs p-2.5 rounded-xl flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
                  <span className="truncate">{swapErrorMsg}</span>
                </div>
              )}

              <button
                onClick={handleExecuteSwap}
                disabled={!fromToken || !intoToken || !fromAmount || !quote || swapping || quoting}
                className="w-full bg-emerald-500 hover:bg-emerald-450 text-slate-950 font-black text-xs py-2.5 rounded-xl transition-all shadow-md flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
              >
                {swapping ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Executing Swap...</span>
                  </>
                ) : (
                  <>
                    <Zap className="w-4 h-4 fill-slate-950" />
                    <span>
                      {!fromToken || !intoToken
                        ? 'Select Pair to Swap'
                        : !fromAmount || parseFloat(fromAmount) <= 0
                        ? 'Enter From Amount'
                        : quoting
                        ? 'Fetching Quote...'
                        : !quote
                        ? 'No Route Available'
                        : `Swap ${fromToken.symbol} → ${intoToken.symbol}`}
                    </span>
                  </>
                )}
              </button>
            </div>
          </div>

        </div>
      )}

      {/* Portfolio Summary / CTA Strip */}
      {landingMode ? (
        <div className="bg-slate-900 border border-slate-850 p-8 rounded-xl shadow-md text-center space-y-4 max-w-lg mx-auto">
          <div className="w-12 h-12 bg-emerald-500/10 text-emerald-400 rounded-full flex items-center justify-center mx-auto">
            <Sparkles className="w-6 h-6" />
          </div>
          <div className="space-y-1.5">
            <h4 className="text-white font-extrabold text-base">See your wallet's movement</h4>
            <p className="text-slate-400 text-xs leading-relaxed">
              Connect your wallet to view your holdings, their 24h dollar movement, and total value.
            </p>
          </div>
          <button
            onClick={onConnect}
            className="bg-emerald-500 hover:bg-emerald-450 text-slate-950 text-xs font-bold px-5 py-2.5 rounded-lg transition-all shadow-md inline-flex items-center gap-1.5 cursor-pointer"
          >
            Connect Wallet
          </button>
        </div>
      ) : (
        <>
          {/* Portfolio Summary Strip */}
          <div className="grid grid-cols-2 gap-4 bg-slate-900 border border-slate-850 p-4 rounded-xl shadow-md">
            <div className="space-y-1">
              <span className="text-[10px] font-extrabold uppercase text-slate-500 tracking-wider block">
                Total Holdings Value
              </span>
              <span className="font-mono text-lg font-black text-white">
                ${totalHoldingsValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
            </div>
            <div className="space-y-1">
              <span className="text-[10px] font-extrabold uppercase text-slate-500 tracking-wider block">
                Total 24h Move ($)
              </span>
              <span className={`font-mono text-lg font-black ${total24hMoveUsd >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                {total24hMoveUsd >= 0 ? '+' : ''}${total24hMoveUsd.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
            </div>
          </div>

          {/* HELD ASSETS LIST */}
          <div className="space-y-3">
            <span className="text-[10px] font-bold uppercase text-slate-500 tracking-wider pl-1 block">Held Assets Portfolio</span>
            
            {mainEnrichedCoins.length === 0 && hiddenEnrichedCoins.length === 0 ? (
              <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 text-center text-slate-500 text-xs">
                No other qualifying held coins found. Connect a wallet with active Solana assets.
              </div>
            ) : (
              <>
                {mainEnrichedCoins.length === 0 ? (
                  <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 text-center text-slate-500 text-xs">
                    No major held coins found. Low-value or dust balances are hidden below.
                  </div>
                ) : (
                  <div className="bg-slate-900 border border-slate-850 rounded-xl overflow-hidden shadow-xl">
                    <div className="overflow-x-auto">
                      <table className="w-full text-left border-collapse min-w-[700px]">
                        <thead>
                          <tr className="border-b border-slate-850 bg-slate-950/60 text-[9px] font-extrabold uppercase text-slate-400 tracking-wider select-none">
                            <th className="py-3 px-4">Coin</th>
                            <th className="py-3 px-4 text-right">Units Held</th>
                            <th className="py-3 px-4 text-right">Price</th>
                            <th className="py-3 px-4 text-right">24h %</th>
                            <th className="py-3 px-4 text-right">24h $ (holdings)</th>
                            <th className="py-3 px-4 text-right">Holdings $</th>
                            <th className="py-3 px-4 text-right">Basket</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-850/60">
                          {mainEnrichedCoins.map((row) => {
                            const { item, price, change24h, currentHoldingsUsd, holdings24hChangeUsd, owningGroup, gColors, isCrashed } = row;
                            return (
                              <tr
                                key={item.mint}
                                onClick={() => handleRowClick(row)}
                                className={`hover:bg-slate-850/40 transition-all cursor-pointer text-xs font-mono group border-b border-slate-850/30 ${
                                  gColors ? `border-l-4 ${gColors.borderL}` : 'border-l-4 border-l-slate-800'
                                } ${isCrashed ? 'bg-rose-950/15' : ''}`}
                                title={`Click to view in ${owningGroup ? `basket: ${owningGroup.name}` : 'wallet inventory'}`}
                              >
                                {/* Coin column */}
                                <td className="py-3 px-4 flex items-center gap-2 font-sans">
                                  <TokenLink mint={item.mint} showIcon>
                                    <TokenLogo logoURI={item.logoURI} symbol={item.symbol} size="sm" />
                                    <strong className="text-white font-extrabold text-xs block">{item.symbol}</strong>
                                  </TokenLink>
                                  <div className="min-w-0 leading-none">
                                    <div className="flex items-center gap-1.5">
                                      {isCrashed && (
                                        <span className="bg-rose-500/20 text-rose-400 text-[8px] font-black uppercase px-1 rounded">
                                          DROP
                                        </span>
                                      )}
                                    </div>
                                    <span className="text-[10px] text-slate-500 block truncate max-w-[120px]" title={item.mint}>
                                      {item.mint.substring(0, 4)}...{item.mint.substring(item.mint.length - 4)}
                                    </span>
                                  </div>
                                </td>

                                {/* Units held */}
                                <td className="py-3 px-4 text-right text-slate-300">
                                  {item.amountHuman.toLocaleString(undefined, { maximumFractionDigits: 6 })}
                                </td>

                                {/* Price */}
                                <td className="py-3 px-4 text-right text-slate-200">
                                  {price > 0 ? formatPrice(price) : <span className="text-rose-500 text-[10px]">Offline</span>}
                                </td>

                                {/* 24h % */}
                                <td className={`py-3 px-4 text-right font-bold ${change24h >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                                  {change24h >= 0 ? '+' : ''}{change24h.toFixed(1)}%
                                </td>

                                {/* 24h $ holdings */}
                                <td className={`py-3 px-4 text-right font-bold ${holdings24hChangeUsd >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                                  {holdings24hChangeUsd >= 0 ? '+' : ''}${holdings24hChangeUsd.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                </td>

                                {/* Your Holdings $ */}
                                <td className="py-3 px-4 text-right text-white font-bold">
                                  ${currentHoldingsUsd.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                </td>

                                {/* Basket column */}
                                <td className="py-3 px-4 text-right">
                                  {owningGroup && gColors ? (
                                    <span className={`inline-flex items-center gap-1.5 text-[9px] font-mono font-black uppercase px-2 py-0.5 rounded-full ${gColors.bgSolid} text-white shadow`}>
                                      <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
                                      {owningGroup.name}
                                    </span>
                                  ) : (
                                    <span className="text-[10px] text-slate-550 font-bold">Unlinked</span>
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* EXPANDER FOR HIDDEN LOW-VALUE TOKENS */}
                {hiddenEnrichedCoins.length > 0 && (
                  <div className="mt-3">
                    <button
                      onClick={() => setShowHiddenPrices(!showHiddenPrices)}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-850 hover:bg-slate-850 text-[10px] text-slate-400 hover:text-white transition-all cursor-pointer select-none font-extrabold uppercase tracking-wider shadow"
                    >
                      <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-200 ${showHiddenPrices ? 'rotate-180' : ''}`} />
                      <span>{hiddenEnrichedCoins.length} hidden low-value tokens (${hiddenEnrichedCoins.reduce((acc, row) => acc + row.currentHoldingsUsd, 0).toFixed(2)})</span>
                    </button>
                    {showHiddenPrices && (
                      <div className="bg-slate-900 border border-slate-850 rounded-xl overflow-hidden shadow-xl mt-2.5">
                        <div className="overflow-x-auto">
                          <table className="w-full text-left border-collapse min-w-[700px]">
                            <thead>
                              <tr className="border-b border-slate-850 bg-slate-950/60 text-[9px] font-extrabold uppercase text-slate-400 tracking-wider select-none">
                                <th className="py-2.5 px-4">Coin</th>
                                <th className="py-2.5 px-4 text-right">Units Held</th>
                                <th className="py-2.5 px-4 text-right">Price</th>
                                <th className="py-2.5 px-4 text-right">24h %</th>
                                <th className="py-2.5 px-4 text-right">24h $ (holdings)</th>
                                <th className="py-2.5 px-4 text-right">Holdings $</th>
                                <th className="py-2.5 px-4 text-right">Basket</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-850/40">
                              {hiddenEnrichedCoins.map((row) => {
                                const { item, price, change24h, currentHoldingsUsd, holdings24hChangeUsd, owningGroup, gColors, isCrashed } = row;
                                return (
                                  <tr
                                    key={item.mint}
                                    onClick={() => handleRowClick(row)}
                                    className={`hover:bg-slate-850/20 transition-all cursor-pointer text-xs font-mono group border-b border-slate-850/30 ${
                                      isCrashed ? 'bg-rose-950/10 border-l-2 border-l-rose-500' : ''
                                    }`}
                                    title={`Click to view in ${owningGroup ? `basket: ${owningGroup.name}` : 'wallet inventory'}`}
                                  >
                                    {/* Coin column */}
                                    <td className="py-2.5 px-4 flex items-center gap-2 font-sans">
                                      <TokenLink mint={item.mint} showIcon>
                                        <TokenLogo logoURI={item.logoURI} symbol={item.symbol} size="sm" />
                                        <strong className="text-white font-extrabold text-xs block">{item.symbol}</strong>
                                      </TokenLink>
                                      <div className="min-w-0 leading-none">
                                        <div className="flex items-center gap-1.5">
                                          {isCrashed && (
                                            <span className="bg-rose-500/20 text-rose-400 text-[8px] font-black uppercase px-1 rounded">
                                              DROP
                                            </span>
                                          )}
                                        </div>
                                        <span className="text-[10px] text-slate-500 block truncate max-w-[120px]" title={item.mint}>
                                          {item.mint.substring(0, 4)}...{item.mint.substring(item.mint.length - 4)}
                                        </span>
                                      </div>
                                    </td>

                                    {/* Units held */}
                                    <td className="py-2.5 px-4 text-right text-slate-400">
                                      {item.amountHuman.toLocaleString(undefined, { maximumFractionDigits: 6 })}
                                    </td>

                                    {/* Price */}
                                    <td className="py-2.5 px-4 text-right text-slate-300">
                                      {price > 0 ? formatPrice(price) : <span className="text-rose-500 text-[10px]">Offline</span>}
                                    </td>

                                    {/* 24h % */}
                                    <td className={`py-2.5 px-4 text-right font-medium ${change24h >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                                      {change24h >= 0 ? '+' : ''}{change24h.toFixed(1)}%
                                    </td>

                                    {/* 24h $ holdings */}
                                    <td className={`py-2.5 px-4 text-right font-medium ${holdings24hChangeUsd >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                                      {holdings24hChangeUsd >= 0 ? '+' : ''}${holdings24hChangeUsd.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                    </td>

                                    {/* Your Holdings $ */}
                                    <td className="py-2.5 px-4 text-right text-slate-300 font-medium">
                                      ${currentHoldingsUsd.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 })}
                                    </td>

                                    {/* Basket column */}
                                    <td className="py-2.5 px-4 text-right">
                                      {owningGroup && gColors ? (
                                        <span className="inline-flex items-center gap-1.5 text-[10px] font-medium text-slate-400">
                                          <span className={`w-1.5 h-1.5 rounded-full ${gColors.bgSolid}`} />
                                          {owningGroup.name}
                                        </span>
                                      ) : (
                                        <span className="text-[10px] text-slate-600 font-medium">Unlinked</span>
                                      )}
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        </>
      )}

      {/* Explanatory Intuition Card */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-xl">
        <div className="flex items-start gap-3">
          <div className="p-2 bg-emerald-500/10 text-emerald-400 rounded-lg shrink-0">
            <Sparkles className="w-4 h-4" />
          </div>
          <div>
            <h4 className="text-white font-bold text-xs mb-1">Rebalancing Intuition: Volatility Harvesting</h4>
            <p className="text-slate-400 text-[11px] leading-relaxed">
              When a coin outperforms, you sell the top to buy another coin that has lagged behind, trading volatility for accumulation.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-3 text-[10px] text-slate-500">
              <div className="bg-slate-950 p-2.5 rounded-lg border border-slate-850">
                <strong className="text-white block mb-0.5">Lateral Oscillations = Gains</strong>
                If your chosen tokens oscillate, each rebalance trims pumps and accumulates dips. You build higher unit quantities!
              </div>
              <div className="bg-slate-950 p-2.5 rounded-lg border border-slate-850">
                <strong className="text-rose-400 block mb-0.5">One-Way Trends = Risk</strong>
                If a coin rugpulls, equal-weight rebalancing will continuously buy more on the way down. Choose bluechips!
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
