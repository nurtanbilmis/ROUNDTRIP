import React, { useState, useEffect } from 'react';
import { ArrowRight, Wallet, CheckCircle, RefreshCw, Loader2, Sparkles, AlertCircle } from 'lucide-react';
import { Token, TokenBalance, LinkGroup } from '../types';
import { useSolanaWallet } from './WalletProvider';
import { fetchQuote } from '../jupiter';
import TokenLogo from './TokenLogo';

const POPULAR_TOKENS_METADATA: Token[] = [
  {
    address: 'So11111111111111111111111111111111111111112',
    symbol: 'SOL',
    name: 'Wrapped SOL',
    decimals: 9,
  },
  {
    address: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
    symbol: 'USDC',
    name: 'USD Coin',
    decimals: 6,
  },
  {
    address: 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB',
    symbol: 'USDT',
    name: 'USDT',
    decimals: 6,
  },
  {
    address: 'JUPyiwrYJFskUPiFG4gpvXvjTE76SreV8NToA8Y5YyJ',
    symbol: 'JUP',
    name: 'Jupiter',
    decimals: 6,
  },
  {
    address: 'DezXAZ8z7PnrFcPykJzn99s94ChKnmk699rCgHmzUM6y',
    symbol: 'BONK',
    name: 'Bonk',
    decimals: 5,
  },
];

interface ConvertModalProps {
  groups: LinkGroup[];
  activeGroupId: string | null;
  tokenMetadata: Record<string, Token>;
  prices: Record<string, { price: number; change24h: number }>;
  onClose: () => void;
  onSuccess: (groupId: string, freshBalances: Record<string, number>) => void;
}

export default function ConvertModal({
  groups,
  activeGroupId,
  tokenMetadata,
  prices,
  onClose,
  onSuccess,
}: ConvertModalProps) {
  const { balances, addDemoFunds, type, publicKey, signAndExecuteSwap, refreshBalances } = useSolanaWallet();
  
  const [chosenGroupId, setChosenGroupId] = useState<string | null>(activeGroupId);
  const [walletTokens, setWalletTokens] = useState<Token[]>(POPULAR_TOKENS_METADATA);
  const [loadingTokens, setLoadingTokens] = useState(false);
  const [groupSelectError, setGroupSelectError] = useState<string | null>(null);

  const selectedGroup = groups.find((g) => g.id === chosenGroupId);
  const selectedTokens = selectedGroup
    ? selectedGroup.memberMints
        .map((mint) => tokenMetadata[mint])
        .filter((t): t is Token => !!t && t.decimals !== undefined)
    : [];

  const [depositToken, setDepositToken] = useState<Token>(POPULAR_TOKENS_METADATA[1]);

  useEffect(() => {
    if (selectedTokens.length > 0) {
      const hasUsdc = selectedTokens.find((t) => t.symbol === 'USDC');
      if (hasUsdc) {
        setDepositToken(hasUsdc);
      } else {
        setDepositToken(selectedTokens[0]);
      }
    }
  }, [chosenGroupId]);

  useEffect(() => {
    let active = true;
    async function load() {
      setLoadingTokens(true);
      try {
        const { fetchVerifiedTokens } = await import('../jupiter');
        const verified = await fetchVerifiedTokens();
        if (!active) return;

        // Get mint addresses in wallet with non-zero balances
        const walletMints = Object.keys(balances).filter((mint) => (balances[mint] || 0) > 0);

        // Always include popular standard deposit tokens to give a good selection
        const popularMints = POPULAR_TOKENS_METADATA.map(t => t.address);
        const combinedMints = Array.from(new Set([...walletMints, ...popularMints]));

        const filtered = verified.filter((token) => combinedMints.includes(token.address));
        
        // Also map in case some tokens in balances are not in verified list but are popular
        const filteredAddresses = filtered.map(t => t.address);
        const missingPopular = POPULAR_TOKENS_METADATA.filter(t => !filteredAddresses.includes(t.address));
        
        setWalletTokens([...filtered, ...missingPopular]);
      } catch (err) {
        console.error('Failed to load wallet tokens', err);
      } finally {
        if (active) setLoadingTokens(false);
      }
    }
    load();
    return () => {
      active = false;
    };
  }, [balances]);
  
  const [depositAmount, setDepositAmount] = useState<string>('100');
  const [quotes, setQuotes] = useState<Record<string, { quote: any; expectedOut: number; error?: string }>>({});
  const [loadingQuotes, setLoadingQuotes] = useState(false);
  const [executing, setExecuting] = useState(false);
  const [executionStep, setExecutionStep] = useState<number>(0);
  const [executedSteps, setExecutedSteps] = useState<Record<number, { success: boolean; txId?: string; error?: string }>>({});
  
  // Get user balance for the deposit token
  const baseBalance = balances[depositToken.address] || 0;
  const humanBalance = depositToken.decimals !== undefined ? baseBalance / Math.pow(10, depositToken.decimals) : 0;

  // Equal weight calculations
  const tokenCount = selectedTokens.length;
  const targetPercent = tokenCount > 0 ? 100 / tokenCount : 0;

  // Calculate swaps required
  const getRequiredSwaps = (): { targetToken: Token; depositAmountPart: number }[] => {
    const amountNum = parseFloat(depositAmount) || 0;
    if (amountNum <= 0 || tokenCount === 0) return [];

    const amountPerToken = amountNum / tokenCount;
    return selectedTokens
      .filter((t) => t.address !== depositToken.address)
      .map((t) => ({
        targetToken: t,
        depositAmountPart: amountPerToken,
      }));
  };

  const requiredSwaps = getRequiredSwaps();

  // Load quotes from Jupiter
  const loadQuotes = async () => {
    const amountNum = parseFloat(depositAmount) || 0;
    if (amountNum <= 0 || requiredSwaps.length === 0 || depositToken.decimals === undefined) return;

    setLoadingQuotes(true);
    const newQuotes: Record<string, { quote: any; expectedOut: number; error?: string }> = {};

    const depositPrice = prices[depositToken.address]?.price || 0;
    const amountPerToken = amountNum / tokenCount;
    const swapUsdValue = amountPerToken * depositPrice;

    for (const swap of requiredSwaps) {
      try {
        if (swap.targetToken.decimals === undefined) {
          throw new Error('Target token decimals missing');
        }

        // Guard against too small split trades
        if (swapUsdValue < 1.50) {
          throw new Error('Trade size too small to route (min $1.50 USD)');
        }

        const rawAmount = swap.depositAmountPart * Math.pow(10, depositToken.decimals);
        // Base amount as integer string
        const baseAmountString = Math.floor(rawAmount).toString();

        const quoteRes = await fetchQuote({
          inputMint: depositToken.address,
          outputMint: swap.targetToken.address,
          amount: baseAmountString,
          slippageBps: 50, // 0.5%
        });

        const outAmount = quoteRes ? parseInt(quoteRes.outAmount || '0') : 0;
        if (outAmount === 0) {
          throw new Error('Jupiter quote returned 0 output units');
        }

        const outAmountHuman = outAmount / Math.pow(10, swap.targetToken.decimals);

        newQuotes[swap.targetToken.address] = {
          quote: quoteRes,
          expectedOut: outAmountHuman,
        };
      } catch (err: any) {
        console.error(`Quote failed for ${swap.targetToken.symbol}:`, err);
        newQuotes[swap.targetToken.address] = {
          quote: null,
          expectedOut: 0,
          error: err?.message || 'Failed to fetch quote',
        };
      }
    }

    setQuotes(newQuotes);
    setLoadingQuotes(false);
  };

  // Recalculate quotes when deposit amount or token changes
  useEffect(() => {
    const timer = setTimeout(() => {
      loadQuotes();
    }, 600);
    return () => clearTimeout(timer);
  }, [depositAmount, depositToken, chosenGroupId]);

  // Execute allocation swaps
  const handleExecuteConvert = async () => {
    const amountNum = parseFloat(depositAmount) || 0;
    if (amountNum <= 0 || !chosenGroupId || depositToken.decimals === undefined) return;

    const depositPrice = prices[depositToken.address]?.price || 0;
    const amountPerToken = amountNum / tokenCount;
    const swapUsdValue = amountPerToken * depositPrice;

    // For Demo wallet, if user's balance is insufficient, credit ONLY the difference to avoid over-crediting
    if (type === 'demo' && humanBalance < amountNum) {
      addDemoFunds(depositToken.address, amountNum - humanBalance, depositToken.decimals);
    }

    setExecuting(true);
    setExecutedSteps({});

    // If there are zero swaps needed (e.g. they only picked 1 coin, or they deposit the only selected coin)
    if (requiredSwaps.length === 0) {
      setExecuting(false);
      const fresh = await refreshBalances();
      onSuccess(chosenGroupId, fresh);
      return;
    }

    // Process swaps one by one
    for (let i = 0; i < requiredSwaps.length; i++) {
      setExecutionStep(i + 1);
      const swap = requiredSwaps[i];
      const quoteInfo = quotes[swap.targetToken.address];

      if (!quoteInfo || !quoteInfo.quote || swap.targetToken.decimals === undefined) {
        setExecutedSteps((prev) => ({
          ...prev,
          [i]: { success: false, error: quoteInfo?.error || 'No valid quote available' },
        }));
        setExecuting(false);
        return;
      }

      if (swapUsdValue < 1.50) {
        setExecutedSteps((prev) => ({
          ...prev,
          [i]: { success: false, error: 'Trade size too small to route (min $1.50 USD)' },
        }));
        setExecuting(false);
        return;
      }

      try {
        const rawAmount = swap.depositAmountPart * Math.pow(10, depositToken.decimals);
        const txId = await signAndExecuteSwap({
          inputMint: depositToken.address,
          outputMint: swap.targetToken.address,
          amountBase: Math.floor(rawAmount),
          quoteResponse: quoteInfo.quote,
          inputDecimals: depositToken.decimals,
          outputDecimals: swap.targetToken.decimals,
        });

        setExecutedSteps((prev) => ({
          ...prev,
          [i]: { success: true, txId },
        }));
      } catch (err: any) {
        console.error(`Execution failed for step ${i + 1}:`, err);
        setExecutedSteps((prev) => ({
          ...prev,
          [i]: { success: false, error: err?.message || 'Transaction rejected' },
        }));
        // Stop execution on failure
        setExecuting(false);
        return;
      }
    }

    setExecuting(false);
    const fresh = await refreshBalances();
    onSuccess(chosenGroupId, fresh);
  };

  // Group selection screen if none is chosen yet
  if (!chosenGroupId) {
    return (
      <div id="convert-modal" className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
        <div className="bg-slate-900 border border-slate-800 rounded-xl w-full max-w-md p-6 flex flex-col overflow-hidden shadow-2xl animate-in fade-in zoom-in duration-200 text-center space-y-4">
          <h3 className="text-xl font-bold text-white tracking-tight flex items-center justify-center gap-2">
            <Wallet className="w-5 h-5 text-emerald-400" />
            Convert & Link
          </h3>
          <p className="text-sm text-slate-400">
            Select the Link-Group you would like to allocate and split funds across:
          </p>
          {groupSelectError && (
            <div className="p-3 bg-rose-500/10 border border-rose-500/20 rounded-lg text-xs text-rose-400 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{groupSelectError}</span>
            </div>
          )}
          {groups.length === 0 ? (
            <div className="p-4 bg-slate-950 rounded-lg text-xs text-slate-500 border border-slate-850">
              No link-groups available. Please create a group first in the sidebar.
            </div>
          ) : (
            <div className="space-y-2 max-h-60 overflow-y-auto">
              {groups.map((g) => (
                <button
                  key={g.id}
                  onClick={() => {
                    if (g.memberMints.length === 0) {
                      setGroupSelectError(`Please link some tokens to "${g.name}" first!`);
                      return;
                    }
                    setChosenGroupId(g.id);
                  }}
                  className="comic-btn w-full p-3 bg-slate-950 border border-slate-850 hover:border-slate-700 hover:bg-slate-900 rounded-lg text-left text-white font-extrabold text-sm transition-all cursor-pointer flex justify-between items-center"
                >
                  <span>{g.name}</span>
                  <span className="text-xs text-slate-500 font-mono font-medium">{g.memberMints.length} linked coins</span>
                </button>
              ))}
            </div>
          )}
          <button
            onClick={onClose}
            className="comic-btn w-full bg-slate-850 hover:bg-slate-800 text-white font-semibold py-2.5 rounded-lg text-sm transition-colors cursor-pointer"
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  return (
    <div id="convert-modal" className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-800 rounded-xl w-full max-w-xl max-h-[90vh] flex flex-col overflow-hidden shadow-2xl animate-in fade-in zoom-in duration-200">
        
        {/* Header */}
        <div className="p-6 border-b border-slate-800 flex items-center justify-between">
          <div>
            <h3 className="text-xl font-bold text-white tracking-tight flex items-center gap-2">
              <Wallet className="w-5 h-5 text-emerald-400" />
              Convert & Link Split
            </h3>
            <p className="text-xs text-slate-400 mt-1">
              Convert from any coin. The app auto-splits it across the {tokenCount} tokens in <strong className="text-white">{selectedGroup?.name}</strong> at {targetPercent.toFixed(1)}% each.
            </p>
          </div>
          <button
            onClick={onClose}
            disabled={executing}
            className="text-slate-400 hover:text-white bg-slate-800 hover:bg-slate-700 p-2 rounded-lg transition-all disabled:opacity-50 cursor-pointer"
          >
            ✕
          </button>
        </div>

        <div className="flex-grow overflow-y-auto p-6 space-y-6">
          {executing ? (
            /* Execution Flow State */
            <div className="py-12 flex flex-col items-center justify-center text-center space-y-5">
              <Loader2 className="w-12 h-12 text-emerald-500 animate-spin" />
              <div className="space-y-1">
                <h4 className="text-lg font-bold text-white">Converting & Linking Allocation</h4>
                <p className="text-sm text-slate-400">
                  Step {executionStep} of {requiredSwaps.length}: Converting{' '}
                  <span className="text-white font-medium">{requiredSwaps[executionStep - 1]?.depositAmountPart.toFixed(2)} {depositToken.symbol}</span>{' '}
                  to{' '}
                  <span className="text-emerald-400 font-medium">{requiredSwaps[executionStep - 1]?.targetToken.symbol}</span>
                </p>
              </div>

              {/* Status List */}
              <div className="w-full max-w-md bg-slate-950 rounded-xl border border-slate-800 p-4 space-y-3 text-left">
                {requiredSwaps.map((swap, idx) => {
                  const stepStatus = executedSteps[idx];
                  const isCurrent = executionStep === idx + 1;
                  return (
                    <div key={swap.targetToken.address} className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className={`w-2 h-2 rounded-full ${isCurrent ? 'bg-emerald-500 animate-ping' : stepStatus?.success ? 'bg-emerald-500' : stepStatus ? 'bg-rose-500' : 'bg-slate-700'}`} />
                        <span className="text-slate-300 font-medium truncate">
                          {swap.depositAmountPart.toFixed(2)} {depositToken.symbol} → {swap.targetToken.symbol}
                        </span>
                      </div>
                      <div>
                        {isCurrent && <span className="text-emerald-400 font-semibold animate-pulse">Awaiting Signature...</span>}
                        {stepStatus?.success && <span className="text-emerald-400 font-semibold">Success</span>}
                        {stepStatus?.error && <span className="text-rose-400 font-semibold">Failed</span>}
                        {!stepStatus && !isCurrent && <span className="text-slate-500">Pending</span>}
                      </div>
                    </div>
                  );
                })}
              </div>

              {type === 'demo' && (
                <div className="text-xs bg-slate-950 p-3 rounded-lg border border-slate-800 text-slate-400 flex items-center gap-2 max-w-md">
                  <Sparkles className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                  <span>Demo Mode: Signing steps are pre-approved. Observe the simulated conversion sequence!</span>
                </div>
              )}
            </div>
          ) : (
            /* Input State */
            <>
              {/* Asset Selector */}
              <div className="space-y-2">
                <label className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                  1. Select Input Currency {loadingTokens && <span className="text-[10px] text-slate-500 lowercase italic animate-pulse">(updating...)</span>}
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-56 overflow-y-auto pr-1">
                  {walletTokens.map((token) => (
                    <button
                      key={token.address}
                      onClick={() => setDepositToken(token)}
                      className={`flex items-center gap-2.5 p-2.5 rounded-lg border text-left transition-all cursor-pointer ${
                        depositToken.address === token.address
                          ? 'bg-emerald-500/10 border-emerald-500/40 shadow-sm'
                          : 'bg-slate-950 border-slate-800 hover:bg-slate-900'
                      }`}
                    >
                      <TokenLogo logoURI={token.logoURI} symbol={token.symbol} size="sm" />
                      <div className="min-w-0">
                        <div className="font-bold text-xs text-white truncate">{token.symbol}</div>
                        <div className="text-[9px] text-slate-500 truncate">
                          Bal: {token.decimals !== undefined ? ((balances[token.address] || 0) / Math.pow(10, token.decimals)).toLocaleString(undefined, { maximumFractionDigits: 3 }) : '0'}
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Amount Input */}
              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <label className="text-xs font-semibold uppercase tracking-wider text-slate-400">2. Enter Allocation Amount</label>
                  <span className="text-xs text-slate-500">
                    Wallet Balance: <strong className="text-slate-300">{humanBalance.toFixed(4)} {depositToken.symbol}</strong>
                  </span>
                </div>
                <div className="relative">
                  <input
                    type="number"
                    min="0"
                    step="any"
                    value={depositAmount}
                    onChange={(e) => setDepositAmount(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg py-3.5 px-4 font-mono font-bold text-xl text-white placeholder-slate-600 focus:outline-none focus:border-slate-700 transition-all"
                  />
                  <div className="absolute right-4 top-1/2 -translate-y-1/2 flex items-center gap-2">
                    <span className="font-bold text-slate-400 text-xs">{depositToken.symbol}</span>
                    <button
                      onClick={() => setDepositAmount(humanBalance.toString())}
                      className="text-[10px] bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold px-2 py-1 rounded-md transition-colors cursor-pointer"
                    >
                      MAX
                    </button>
                  </div>
                </div>
              </div>

              {/* Proposed Splits */}
              <div className="space-y-3 bg-slate-950/50 rounded-lg border border-slate-800 p-4">
                <div className="flex justify-between items-center border-b border-slate-800 pb-2">
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-400">3. Estimated Allocation Splits</h4>
                  {loadingQuotes ? (
                    <span className="flex items-center gap-1 text-[11px] text-slate-500 font-semibold uppercase animate-pulse">
                      <RefreshCw className="w-3 h-3 animate-spin text-emerald-500" />
                      Loading Quotes
                    </span>
                  ) : (
                    <span className="text-[11px] text-emerald-400 font-semibold uppercase flex items-center gap-1">
                      <CheckCircle className="w-3 h-3" /> Quotes Fresh
                    </span>
                  )}
                </div>

                <div className="space-y-3">
                  {/* The Input Currency Retention */}
                  {selectedTokens.some((t) => t.address === depositToken.address) && (
                    <div className="flex justify-between items-center text-sm p-2 rounded-lg bg-slate-900/40">
                      <div className="flex items-center gap-2.5">
                        <span className="w-2 h-2 rounded-full bg-emerald-500" />
                        <span className="text-white font-medium text-xs">{depositToken.symbol}</span>
                        <span className="text-[10px] text-slate-500">({targetPercent.toFixed(1)}% Weight)</span>
                      </div>
                      <div className="text-right font-mono font-semibold text-white text-xs">
                        {(parseFloat(depositAmount) / tokenCount || 0).toFixed(4)} {depositToken.symbol}
                        <div className="text-[10px] text-slate-500">Retained / No convert required</div>
                      </div>
                    </div>
                  )}

                  {/* Other Split Swaps */}
                  {requiredSwaps.map((swap) => {
                    const quoteInfo = quotes[swap.targetToken.address];
                    return (
                      <div key={swap.targetToken.address} className="flex justify-between items-center text-sm p-2 rounded-lg bg-slate-900/40">
                        <div className="flex items-center gap-2.5">
                          <ArrowRight className="w-3.5 h-3.5 text-emerald-400" />
                          <span className="text-white font-medium text-xs">{swap.targetToken.symbol}</span>
                          <span className="text-[10px] text-slate-500">({targetPercent.toFixed(1)}% Weight)</span>
                        </div>
                        <div className="text-right font-mono font-semibold text-xs">
                          {quoteInfo?.error ? (
                            <span className="text-xs text-rose-400 flex items-center gap-1 justify-end">
                              <AlertCircle className="w-3 h-3" /> Error quoting
                            </span>
                          ) : (
                            <div className="text-emerald-400">
                              {quoteInfo ? quoteInfo.expectedOut.toFixed(4) : '...'} {swap.targetToken.symbol}
                            </div>
                          )}
                          <div className="text-[10px] text-slate-500">
                            Convert {swap.depositAmountPart.toFixed(2)} {depositToken.symbol}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {type === 'demo' && humanBalance < parseFloat(depositAmount) && (
                <div className="bg-amber-500/10 border border-amber-500/20 p-3 rounded-lg text-xs text-amber-400 flex gap-2">
                  <Sparkles className="w-4 h-4 text-amber-400 flex-shrink-0" />
                  <span>
                    You are in <strong>Demo Mode</strong>. Your simulated wallet balance is insufficient, but we will auto-credit <strong>+{parseFloat(depositAmount) - humanBalance} {depositToken.symbol}</strong> to your Sandbox wallet so you can complete this conversion split!
                  </span>
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
            className="comic-btn flex-grow bg-slate-850 hover:bg-slate-800 text-white font-semibold py-3 rounded-lg text-sm transition-all disabled:opacity-50 cursor-pointer"
          >
            Cancel
          </button>
          <button
            onClick={handleExecuteConvert}
            disabled={executing || loadingQuotes || parseFloat(depositAmount) <= 0 || !publicKey}
            className="comic-btn flex-grow bg-emerald-500 text-slate-950 hover:bg-emerald-400 font-bold py-3 rounded-lg text-sm transition-all disabled:opacity-50 flex items-center justify-center gap-1.5 shadow-md cursor-pointer"
          >
            {executing ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin text-slate-950" />
                Converting...
              </>
            ) : (
              <>
                Confirm & Convert
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
