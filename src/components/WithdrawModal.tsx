import React, { useState, useEffect } from 'react';
import { ArrowRight, ShieldAlert, CheckCircle, RefreshCw, Loader2, Sparkles, AlertCircle, Coins, Info, Check, Trash2 } from 'lucide-react';
import { Token, TokenBalance, LinkGroup } from '../types';
import { useSolanaWallet } from './WalletProvider';
import { fetchQuote } from '../jupiter';

interface WithdrawModalProps {
  group: LinkGroup;
  balancesWithPrice: TokenBalance[];
  onClose: () => void;
  onUpdateGroup: (updated: LinkGroup) => void;
  onDeleteGroup: (id: string) => void;
  onRefreshPrices: () => Promise<void>;
}

export default function WithdrawModal({
  group,
  balancesWithPrice,
  onClose,
  onUpdateGroup,
  onDeleteGroup,
  onRefreshPrices,
}: WithdrawModalProps) {
  const {
    publicKey,
    signAndExecuteSwap,
    refreshBalances,
    slippageBps,
  } = useSolanaWallet();

  const [withdrawPercent, setWithdrawPercent] = useState<number>(25);
  const [withdrawMode, setWithdrawMode] = useState<'inkind' | 'usdc'>('usdc');
  
  // Track which tokens are selected/checked to be withdrawn
  const [checkedMints, setCheckedMints] = useState<Set<string>>(() => {
    return new Set(balancesWithPrice.map(b => b.mint));
  });

  const [quotes, setQuotes] = useState<Record<string, { quote: any; expectedOut: number; error?: string }>>({});
  const [loadingQuotes, setLoadingQuotes] = useState(false);
  const [executing, setExecuting] = useState(false);
  const [executionStep, setExecutionStep] = useState<number>(0);
  const [executedSteps, setExecutedSteps] = useState<Record<number, { success: boolean; txId?: string; error?: string }>>({});

  const USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
  const MIN_TRADE_FLOOR_USD = 1.50;

  // Toggle selection for a token
  const toggleTokenCheck = (mint: string) => {
    const next = new Set(checkedMints);
    if (next.has(mint)) {
      next.delete(mint);
    } else {
      next.add(mint);
    }
    setCheckedMints(next);
  };

  // Get active selected list
  const getSellsList = () => {
    return balancesWithPrice
      .filter((item) => {
        if (!checkedMints.has(item.mint)) return false;
        if (item.mint === USDC_MINT) return false; // Exclude USDC from swaps
        return item.amount > 0;
      })
      .map((item) => {
        const sellAmountBase = item.amount * (withdrawPercent / 100);
        const sellAmountHuman = sellAmountBase / Math.pow(10, item.decimals || 9);
        const estimatedUsd = (item.price || 0) * sellAmountHuman;

        return {
          token: item,
          sellAmountBase: Math.floor(sellAmountBase),
          sellAmountHuman,
          estimatedUsd,
        };
      });
  };

  const sellsList = getSellsList();

  // Load quotes for swap-to-USDC
  const loadLiquidationQuotes = async () => {
    if (withdrawMode !== 'usdc' || sellsList.length === 0) return;

    setLoadingQuotes(true);
    const newQuotes: Record<string, { quote: any; expectedOut: number; error?: string }> = {};

    for (const sell of sellsList) {
      try {
        if (sell.sellAmountBase <= 0) {
          throw new Error('Zero balance');
        }
        if (sell.estimatedUsd < MIN_TRADE_FLOOR_USD) {
          throw new Error(`Size under $${MIN_TRADE_FLOOR_USD.toFixed(2)} floor`);
        }

        const quoteRes = await fetchQuote({
          inputMint: sell.token.mint,
          outputMint: USDC_MINT,
          amount: sell.sellAmountBase.toString(),
          slippageBps, // Use dynamic slippage tolerance setting
        });

        const outAmountHuman = parseInt(quoteRes.outAmount || '0') / 1e6;
        if (outAmountHuman === 0) {
          throw new Error('0 output units returned');
        }

        newQuotes[sell.token.mint] = {
          quote: quoteRes,
          expectedOut: outAmountHuman,
        };
      } catch (err: any) {
        console.error(`Withdraw quote failed for ${sell.token.symbol}:`, err);
        newQuotes[sell.token.mint] = {
          quote: null,
          expectedOut: 0,
          error: err?.message || 'Quote failed',
        };
      }
    }

    setQuotes(newQuotes);
    setLoadingQuotes(false);
  };

  // Trigger quotes when percent, mode, or checked set changes
  useEffect(() => {
    if (withdrawMode === 'usdc') {
      const timer = setTimeout(() => {
        loadLiquidationQuotes();
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [withdrawPercent, withdrawMode, checkedMints]);

  const handleExecuteWithdraw = async () => {
    if (checkedMints.size === 0) return;
    setExecuting(true);
    setExecutedSteps({});

    const initialBalances = [...balancesWithPrice];
    const initialTotalUsd = balancesWithPrice.reduce((sum, item) => sum + item.usdValue, 0);

    // 1. IN-KIND UNLINK MODE (Purely client-side tracking adjustment)
    if (withdrawMode === 'inkind') {
      try {
        // Remove checked mints from the group's memberMints list
        const remainingMints = group.memberMints.filter((m) => !checkedMints.has(m));

        if (remainingMints.length === 0) {
          onDeleteGroup(group.id);
        } else {
          onUpdateGroup({
            ...group,
            memberMints: remainingMints,
          });
        }

        setExecuting(false);
        onClose();
      } catch (err) {
        console.error('Failed to unlink in-kind:', err);
        setExecuting(false);
      }
      return;
    }

    // 2. CASH OUT TO USDC MODE (On-chain Swaps)
    const activeSwaps = sellsList.filter(sell => {
      const quote = quotes[sell.token.mint];
      return quote && quote.quote && sell.sellAmountBase > 0 && sell.estimatedUsd >= MIN_TRADE_FLOOR_USD;
    });

    if (activeSwaps.length === 0) {
      // Nothing to swap, but if withdraw percent is 100%, we remove checked mints
      if (withdrawPercent === 100) {
        const remainingMints = group.memberMints.filter((m) => !checkedMints.has(m));
        if (remainingMints.length === 0) {
          onDeleteGroup(group.id);
        } else {
          onUpdateGroup({
            ...group,
            memberMints: remainingMints,
          });
        }
      }
      setExecuting(false);
      onClose();
      return;
    }

    // Sequentially execute swaps
    for (let i = 0; i < activeSwaps.length; i++) {
      setExecutionStep(i + 1);
      const sell = activeSwaps[i];
      const quoteInfo = quotes[sell.token.mint];

      try {
        const txId = await signAndExecuteSwap({
          inputMint: sell.token.mint,
          outputMint: USDC_MINT,
          amountBase: sell.sellAmountBase,
          quoteResponse: quoteInfo.quote,
          inputDecimals: sell.token.decimals,
          outputDecimals: 6, // USDC decimals
        });

        setExecutedSteps((prev) => ({
          ...prev,
          [i]: { success: true, txId },
        }));
      } catch (err: any) {
        console.error(`Withdraw swap failed for ${sell.token.symbol}:`, err);
        setExecutedSteps((prev) => ({
          ...prev,
          [i]: { success: false, error: err?.message || 'Transaction rejected' },
        }));
        setExecuting(false);
        return; // halt sequence
      }
    }

    // Success - update group memberMints if 100% liquidated
    const remainingMints = group.memberMints.filter((m) => {
      // If we did a 100% cash out, and it was checked, remove it
      return !(withdrawPercent === 100 && checkedMints.has(m));
    });

    if (remainingMints.length === 0) {
      onDeleteGroup(group.id);
    } else {
      onUpdateGroup({
        ...group,
        memberMints: remainingMints,
      });
    }

    // Refresh prices & balances
    await onRefreshPrices();
    await refreshBalances();

    setExecuting(false);
    onClose();
  };

  const totalExpectedUsdcOut = (Object.values(quotes) as Array<{ expectedOut: number }>).reduce((sum, q) => sum + (q?.expectedOut || 0), 0);
  const checkedBalancesWithPrice = balancesWithPrice.filter(b => checkedMints.has(b.mint));
  const checkedUsdValue = checkedBalancesWithPrice.reduce((sum, b) => sum + b.usdValue, 0);
  const withdrawAmountUsd = checkedUsdValue * (withdrawPercent / 100);

  return (
    <div id="withdraw-modal" className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-800 rounded-xl w-full max-w-xl max-h-[90vh] flex flex-col overflow-hidden shadow-2xl animate-in fade-in zoom-in duration-200">
        
        {/* Header */}
        <div className="p-6 border-b border-slate-800 flex items-center justify-between">
          <div>
            <h3 className="text-xl font-bold text-white tracking-tight flex items-center gap-2">
              <Coins className="w-5 h-5 text-emerald-400" />
              Proportional Cash Out / Unlink
            </h3>
            <p className="text-xs text-slate-400 mt-1">
              Reduce or unlink your active tracked portfolio of group <strong className="text-white">"{group.name}"</strong>.
            </p>
          </div>
          <button
            onClick={onClose}
            disabled={executing}
            className="text-slate-400 hover:text-white bg-slate-800 hover:bg-slate-700 p-2 rounded-lg transition-all cursor-pointer"
          >
            ✕
          </button>
        </div>

        {/* Content */}
        <div className="flex-grow overflow-y-auto p-6 space-y-6">
          
          {executing ? (
            /* Running animation */
            <div className="py-12 flex flex-col items-center justify-center text-center space-y-5">
              <Loader2 className="w-12 h-12 text-emerald-500 animate-spin" />
              <div className="space-y-1">
                <h4 className="text-lg font-bold text-white">
                  {withdrawMode === 'inkind' ? 'Releasing Portfolio Tracking' : 'Executing DEX Liquidation'}
                </h4>
                <p className="text-sm text-slate-400">
                  {withdrawMode === 'inkind' 
                    ? `Removing selected coins from equal weight tracking...`
                    : `Step ${executionStep} of ${sellsList.length}: Swapping ${sellsList[executionStep - 1]?.token.symbol} to USDC`
                  }
                </p>
              </div>

              {withdrawMode === 'usdc' && (
                <div className="w-full max-w-md bg-slate-950 rounded-xl border border-slate-800 p-4 space-y-3 text-left">
                  {sellsList.map((sell, idx) => {
                    const stepStatus = executedSteps[idx];
                    const isCurrent = executionStep === idx + 1;
                    return (
                      <div key={sell.token.mint} className="flex items-center justify-between text-xs">
                        <span className="text-slate-300 font-medium">
                          {sell.sellAmountHuman.toFixed(3)} {sell.token.symbol} → USDC
                        </span>
                        <div>
                          {isCurrent && <span className="text-emerald-400 font-semibold animate-pulse">Confirming...</span>}
                          {stepStatus?.success && <span className="text-emerald-400 font-semibold">Liquidated</span>}
                          {stepStatus?.error && <span className="text-rose-400 font-semibold">Failed</span>}
                          {!stepStatus && !isCurrent && <span className="text-slate-500">Pending</span>}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          ) : (
            <>
              {/* Select Settlement Mode */}
              <div className="space-y-3">
                <label className="text-xs font-semibold uppercase tracking-wider text-slate-400">1. Select Settlement Mode</label>
                
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {/* In-Kind Mode */}
                  <button
                    type="button"
                    onClick={() => setWithdrawMode('inkind')}
                    className={`p-4 rounded-xl border text-left flex flex-col justify-between transition-all cursor-pointer ${
                      withdrawMode === 'inkind'
                        ? 'bg-emerald-500/10 border-emerald-500/40 shadow-sm'
                        : 'bg-slate-950 border-slate-850 hover:bg-slate-900'
                    }`}
                  >
                    <div>
                      <div className="font-bold text-sm text-white flex items-center gap-1.5">
                        In-Kind Unlink
                        <span className="text-[9px] bg-emerald-500/20 text-emerald-400 px-1.5 py-0.5 rounded-full font-mono uppercase">Free</span>
                      </div>
                      <p className="text-xs text-slate-400 mt-2 leading-relaxed">
                        Stops tracking the selected coins in this group. Actual tokens remain in your wallet exactly as they are.
                      </p>
                    </div>
                    <div className="text-[10px] text-emerald-500 font-semibold mt-3">
                      ✔ 0 Swaps • 0 Fees • Non-Taxable
                    </div>
                  </button>

                  {/* As USDC Mode */}
                  <button
                    type="button"
                    onClick={() => setWithdrawMode('usdc')}
                    className={`p-4 rounded-xl border text-left flex flex-col justify-between transition-all cursor-pointer ${
                      withdrawMode === 'usdc'
                        ? 'bg-emerald-500/10 border-emerald-500/40 shadow-sm'
                        : 'bg-slate-950 border-slate-850 hover:bg-slate-900'
                    }`}
                  >
                    <div>
                      <div className="font-bold text-sm text-white flex items-center gap-1.5">
                        Cash Out to USDC
                        <span className="text-[9px] bg-amber-500/10 text-amber-400 px-1.5 py-0.5 rounded-full font-mono uppercase">On-Chain</span>
                      </div>
                      <p className="text-xs text-slate-400 mt-2 leading-relaxed">
                        Sells a set percentage of selected coins into USDC. The USDC stablecoin stays directly in your wallet.
                      </p>
                    </div>
                    <div className="text-[10px] text-amber-400 font-semibold mt-3">
                      ⚠ DEX Swaps • Pay gas • Taxable Event
                    </div>
                  </button>
                </div>
              </div>

              {/* Coins Checklist */}
              <div className="space-y-3">
                <label className="text-xs font-semibold uppercase tracking-wider text-slate-400">2. Select Coins to Cash Out / Unlink</label>
                <div className="bg-slate-950 rounded-xl border border-slate-850 p-4 space-y-2.5 max-h-[160px] overflow-y-auto">
                  {balancesWithPrice.map((item) => {
                    const isChecked = checkedMints.has(item.mint);
                    return (
                      <div
                        key={item.mint}
                        onClick={() => toggleTokenCheck(item.mint)}
                        className="flex items-center justify-between p-2 hover:bg-slate-900/60 rounded-lg cursor-pointer transition-all"
                      >
                        <div className="flex items-center gap-3">
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => {}} // toggled by parent div click
                            className="accent-emerald-500 cursor-pointer w-4 h-4"
                          />
                          <span className="text-sm font-bold text-white">{item.symbol}</span>
                          <span className="text-xs text-slate-400">{item.amountHuman.toLocaleString(undefined, { maximumFractionDigits: 4 })}</span>
                        </div>
                        <span className="font-mono text-xs text-slate-300 font-semibold">${item.usdValue.toFixed(2)}</span>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Slider for Percentage (USDC Mode Only) */}
              {withdrawMode === 'usdc' && (
                <div className="space-y-3">
                  <div className="flex justify-between items-center">
                    <label className="text-xs font-semibold uppercase tracking-wider text-slate-400">3. Choose Settlement Percentage</label>
                    <span className="font-mono text-lg font-extrabold text-emerald-400">{withdrawPercent}%</span>
                  </div>
                  
                  <input
                    type="range"
                    min="5"
                    max="100"
                    step="5"
                    value={withdrawPercent}
                    onChange={(e) => setWithdrawPercent(parseInt(e.target.value))}
                    className="w-full accent-emerald-500 cursor-pointer bg-slate-950 rounded-lg h-2"
                  />

                  <div className="flex justify-between items-center text-[10px] text-slate-500 font-mono">
                    <span>5%</span>
                    <span>25%</span>
                    <span>50%</span>
                    <span>75%</span>
                    <span>100% (Full Exit)</span>
                  </div>

                  <div className="bg-slate-950 p-3 rounded-lg border border-slate-850 flex justify-between items-center text-xs">
                    <span className="text-slate-400">Estimated value to swap:</span>
                    <span className="font-mono font-bold text-white">
                      ~${withdrawAmountUsd.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                  </div>
                </div>
              )}

              {/* Tax Disclosure & Info */}
              <div className="bg-slate-950 p-4 rounded-xl border border-slate-850 space-y-2.5">
                <h4 className="text-xs font-bold text-white flex items-center gap-1.5 uppercase">
                  <Info className="w-4 h-4 text-emerald-400" />
                  Mode Tradeoffs & Tax Treatment
                </h4>
                <div className="text-xs text-slate-400 space-y-1.5 leading-relaxed">
                  {withdrawMode === 'inkind' ? (
                    <p>
                      Since we are non-custodial, assets sit in your own wallet. Under <strong className="text-white">In-Kind Unlink</strong>, the app simply stops tracking the {checkedMints.size} selected assets in this group. No transactions are sent to the blockchain, meaning <strong className="text-emerald-400">no swap fees</strong> and <strong className="text-emerald-400">no capital gain realization</strong>.
                    </p>
                  ) : (
                    <p>
                      Under <strong className="text-white">Cash Out to USDC</strong>, the app will execute parallel on-chain swaps to sell {withdrawPercent}% of your checked group assets for USDC. This is a <strong className="text-amber-400">taxable realization event</strong> and will consume a small amount of SOL for gas, leaving you with safe, liquid stablecoins.
                    </p>
                  )}
                </div>
              </div>

              {/* Proposed Swaps (USDC Mode Only) */}
              {withdrawMode === 'usdc' && sellsList.length > 0 && (
                <div className="space-y-3 bg-slate-950/40 border border-slate-850 p-4 rounded-xl">
                  <div className="flex justify-between items-center border-b border-slate-800 pb-2">
                    <h5 className="text-xs font-semibold uppercase tracking-wider text-slate-400">DEX Swap Breakdown</h5>
                    {loadingQuotes ? (
                      <span className="flex items-center gap-1 text-[10px] text-slate-500 uppercase font-bold animate-pulse">
                        <RefreshCw className="w-3 h-3 animate-spin text-emerald-500" /> Quoting...
                      </span>
                    ) : (
                      <span className="text-[10px] text-emerald-400 uppercase font-bold">Quotes Loaded</span>
                    )}
                  </div>

                  <div className="space-y-2 max-h-[140px] overflow-y-auto">
                    {sellsList.map((sell) => {
                      const quote = quotes[sell.token.mint];
                      const isTooSmall = sell.estimatedUsd < MIN_TRADE_FLOOR_USD;
                      return (
                        <div key={sell.token.mint} className="flex justify-between items-center text-xs p-1.5 bg-slate-900/40 rounded-lg">
                          <span className="text-slate-300">
                            {sell.sellAmountHuman.toFixed(4)} {sell.token.symbol} (${sell.estimatedUsd.toFixed(2)})
                          </span>
                          <span className={`font-mono font-bold ${isTooSmall ? 'text-rose-400' : 'text-emerald-400'}`}>
                            {isTooSmall ? 'Below $1.50 Floor' : quote?.error ? 'Quote Failed' : quote ? `→ $${quote.expectedOut.toFixed(2)} USDC` : '...'}
                          </span>
                        </div>
                      );
                    })}
                  </div>

                  {totalExpectedUsdcOut > 0 && (
                    <div className="border-t border-slate-800 pt-2 flex justify-between items-center text-xs">
                      <span className="text-slate-400 font-semibold">Total Estimated Settled USDC:</span>
                      <span className="font-mono font-bold text-white text-sm">
                        ${totalExpectedUsdcOut.toFixed(2)} USDC
                      </span>
                    </div>
                  )}
                </div>
              )}
            </>
          )}

        </div>

        {/* Footer */}
        <div className="p-4 bg-slate-900 border-t border-slate-800 flex gap-3">
          <button
            onClick={onClose}
            disabled={executing}
            className="flex-grow bg-slate-850 hover:bg-slate-800 text-white font-semibold py-3 rounded-lg text-xs transition-all disabled:opacity-50 cursor-pointer"
          >
            Cancel
          </button>
          <button
            onClick={handleExecuteWithdraw}
            disabled={executing || checkedMints.size === 0 || (withdrawMode === 'usdc' && loadingQuotes) || !publicKey}
            className="flex-grow bg-emerald-500 text-slate-950 hover:bg-emerald-400 font-extrabold py-3 rounded-lg text-xs transition-all disabled:opacity-50 flex items-center justify-center gap-1.5 shadow-md cursor-pointer"
          >
            {executing ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin text-slate-950" />
                Processing...
              </>
            ) : (
              <>
                {withdrawMode === 'inkind' ? 'Confirm In-Kind Unlink' : 'Confirm Cash Out to USDC'}
                <ArrowRight className="w-3.5 h-3.5" />
              </>
            )}
          </button>
        </div>

      </div>
    </div>
  );
}
