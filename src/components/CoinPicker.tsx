import React, { useState, useEffect } from 'react';
import { Search, Plus, Trash2, Check, Sparkles, AlertTriangle } from 'lucide-react';
import { Token } from '../types';
import { fetchVerifiedTokens } from '../jupiter';
import TokenLogo from './TokenLogo';

interface CoinPickerProps {
  selectedTokens: Token[];
  onAddToken: (token: Token) => void;
  onRemoveToken: (mint: string) => void;
  onClose: () => void;
}

export default function CoinPicker({
  selectedTokens,
  onAddToken,
  onRemoveToken,
  onClose,
}: CoinPickerProps) {
  const [tokensList, setTokensList] = useState<Token[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [recommendedOnly, setRecommendedOnly] = useState(true);

  // Liquidity warning states
  const [checkingLiquidity, setCheckingLiquidity] = useState<string | null>(null);
  const [pendingWarningToken, setPendingWarningToken] = useState<{ token: Token; liquidity: number } | null>(null);

  const handlePreAddCheck = async (token: Token) => {
    const safeMints = [
      'So11111111111111111111111111111111111111112', // SOL
      'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', // USDC
      'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB', // USDT
    ];
    if (safeMints.includes(token.address)) {
      onAddToken(token);
      return;
    }

    setCheckingLiquidity(token.address);
    try {
      const { fetchTokenLiquidity } = await import('../jupiter');
      const liq = await fetchTokenLiquidity(token.address);
      if (liq < 50000) {
        setPendingWarningToken({ token, liquidity: liq });
      } else {
        onAddToken(token);
      }
    } catch (err) {
      onAddToken(token);
    } finally {
      setCheckingLiquidity(null);
    }
  };

  // Load verified tokens
  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const verified = await fetchVerifiedTokens();
        setTokensList(verified);
      } catch (err) {
        console.error('Failed to load verified tokens', err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  // Popular tokens to recommend upfront
  const popularMints = [
    'So11111111111111111111111111111111111111112', // SOL
    'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', // USDC
    'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB', // USDT
    'JUPyiwrYJFskUPiFG4gpvXvjTE76SreV8NToA8Y5YyJ', // JUP
    'DezXAZ8z7PnrFcPykJzn99s94ChKnmk699rCgHmzUM6y', // BONK
    'EKpQGSJtjv7mrvrtYEVYpZcC9K4N2U6Cee23GG9ApuS6', // WIF
    'jtoJSMRZ87v9vW8vS82T2S8nLcrDLRvM1T8Srx7d378', // JTO
    'HZ1bdEP9qL69SbyS6L4Zf8Y8stb684BBi4M7fL62BLaF', // PYTH
    'orcaEKTd2g64Q656MYNVag39awZDrS5PyAenwbNYCNN', // ORCA
  ];

  // Filter lists based on search and recommendations
  const filteredTokens = tokensList.filter((token) => {
    const query = searchQuery.toLowerCase().trim();
    if (!query) {
      return recommendedOnly ? popularMints.includes(token.address) : true;
    }
    
    return (
      token.symbol.toLowerCase().includes(query) ||
      token.name.toLowerCase().includes(query) ||
      token.address.toLowerCase() === query
    );
  });

  const isSelected = (mint: string) => {
    return selectedTokens.some((t) => t.address === mint);
  };

  return (
    <div id="coin-picker-modal" className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-800 rounded-xl w-full max-w-2xl max-h-[85vh] flex flex-col overflow-hidden shadow-2xl animate-in fade-in zoom-in duration-200">
        
        {/* Header */}
        <div className="p-6 border-b border-slate-800 flex items-center justify-between">
          <div>
            <h3 className="text-xl font-bold text-white tracking-tight flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-emerald-400" />
              Manage Portfolio Allocation
            </h3>
            <p className="text-xs text-slate-400 mt-1">
              Currently picking {selectedTokens.length} tokens. Rebalancer maintains target weight of{' '}
              {selectedTokens.length > 0 ? (100 / selectedTokens.length).toFixed(1) : 0}% each.
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white bg-slate-800 hover:bg-slate-700 p-2 rounded-lg transition-all cursor-pointer"
          >
            ✕
          </button>
        </div>

        {/* Selected Tokens Horizontal Bar */}
        <div className="bg-slate-950 px-6 py-4 border-b border-slate-800">
          <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2">Active Coins ({selectedTokens.length})</h4>
          {selectedTokens.length === 0 ? (
            <p className="text-sm text-slate-500 italic">No coins selected yet. Add at least 2 coins below.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {selectedTokens.map((token) => (
                <div
                  key={token.address}
                  className="flex items-center gap-2 bg-slate-900 border border-slate-800 hover:border-slate-700 px-3 py-1.5 rounded-full text-sm text-white group transition-all"
                >
                  <TokenLogo logoURI={token.logoURI} symbol={token.symbol} size="sm" />
                  <span className="font-semibold text-xs">{token.symbol}</span>
                  <button
                    onClick={() => onRemoveToken(token.address)}
                    className="text-slate-500 hover:text-rose-400 p-0.5 rounded-full hover:bg-slate-850 transition-all ml-1 cursor-pointer"
                    title={`Remove ${token.symbol}`}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
          {selectedTokens.length > 0 && selectedTokens.length < 2 && (
            <div className="flex items-center gap-1.5 mt-2.5 text-xs text-amber-500">
              <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
              <span>You must choose at least 2 tokens for equal-weight rebalancing to calculate drift.</span>
            </div>
          )}
        </div>

        {/* Search Bar & Toggles */}
        <div className="p-4 bg-slate-900 border-b border-slate-800 flex flex-col sm:flex-row gap-3">
          <div className="relative flex-grow">
            <Search className="w-5 h-5 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" />
            <input
              type="text"
              placeholder="Search by token name, symbol, or mint address..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-lg py-2.5 pl-11 pr-4 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-slate-700 transition-all"
            />
          </div>
          <div className="flex items-center justify-between sm:justify-start gap-2 border border-slate-800 rounded-lg px-3 bg-slate-950">
            <span className="text-xs text-slate-400">Filter:</span>
            <button
              onClick={() => setRecommendedOnly(!recommendedOnly)}
              className={`text-xs px-2.5 py-1 rounded-md font-medium transition-all cursor-pointer ${
                recommendedOnly
                  ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/25'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              {recommendedOnly ? 'Top Verified Assets' : 'All Verified Tokens'}
            </button>
          </div>
        </div>

        {/* Tokens List Scroll Area */}
        <div className="flex-grow overflow-y-auto p-4 space-y-2 bg-slate-950/40">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-12 text-slate-400 space-y-3">
              <div className="w-8 h-8 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin"></div>
              <p className="text-sm">Fetching Jupiter verified token list...</p>
            </div>
          ) : filteredTokens.length === 0 ? (
            <div className="text-center py-12 text-slate-500">
              <p className="text-sm">No verified tokens found matching "{searchQuery}"</p>
              <p className="text-xs mt-1">Make sure you query with accurate Solana verified symbols/mints.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {filteredTokens.map((token) => {
                const active = isSelected(token.address);
                return (
                  <div
                    key={token.address}
                    className={`flex items-center justify-between p-3 rounded-lg border transition-all ${
                      active
                        ? 'bg-emerald-500/5 border-emerald-500/20 shadow-sm'
                        : 'bg-slate-900 border-slate-800 hover:border-slate-700 hover:bg-slate-850'
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <TokenLogo logoURI={token.logoURI} symbol={token.symbol} size="md" />
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="font-bold text-white truncate text-sm">{token.symbol}</span>
                          {token.tags?.includes('verified') && (
                            <span className="text-[9px] bg-slate-800 text-slate-300 px-1.5 py-0.5 rounded-full border border-slate-700">
                              Verified
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-slate-500 truncate">{token.name}</p>
                      </div>
                    </div>

                    <div>
                      {active ? (
                        <button
                          onClick={() => onRemoveToken(token.address)}
                          className="p-1.5 bg-rose-500/10 text-rose-400 hover:bg-rose-500/20 border border-rose-500/25 rounded-lg transition-all cursor-pointer"
                          title="Remove from portfolio"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      ) : (
                        <button
                          onClick={() => handlePreAddCheck(token)}
                          disabled={checkingLiquidity !== null}
                          className="p-1.5 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500 border border-emerald-500/25 hover:text-slate-950 rounded-lg transition-all cursor-pointer disabled:opacity-40 flex items-center justify-center min-w-8 min-h-8"
                          title="Add to portfolio"
                        >
                          {checkingLiquidity === token.address ? (
                            <div className="w-4 h-4 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
                          ) : (
                            <Plus className="w-4 h-4" />
                          )}
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 bg-slate-900 border-t border-slate-800 flex items-center justify-between">
          <p className="text-[10px] text-slate-500 max-w-[65%] leading-relaxed">
            Only Jupiter v2 verified tokens can be selected, protecting you from malicious scam mints.
          </p>
          <button
            onClick={onClose}
            disabled={selectedTokens.length < 2}
            className={`px-5 py-2 rounded-lg text-sm font-semibold transition-all ${
              selectedTokens.length >= 2
                ? 'bg-emerald-500 text-slate-950 hover:bg-emerald-400 shadow-md cursor-pointer'
                : 'bg-slate-800 text-slate-500 cursor-not-allowed'
            }`}
          >
            Save Portfolio
          </button>
        </div>
      </div>

      {/* Interactive Low Liquidity Warning Modal Overlay */}
      {pendingWarningToken && (
        <div className="fixed inset-0 bg-slate-950/90 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-md p-6 space-y-6 shadow-2xl animate-in fade-in zoom-in duration-150 text-left">
            <div className="flex items-start gap-3.5">
              <div className="p-2.5 bg-amber-500/10 text-amber-400 rounded-xl border border-amber-500/20">
                <AlertTriangle className="w-6 h-6" />
              </div>
              <div>
                <h4 className="text-base font-bold text-white tracking-tight">
                  Low DEX Liquidity Warning
                </h4>
                <p className="text-xs text-slate-400 mt-1 font-sans">
                  The token <span className="text-amber-400 font-extrabold">{pendingWarningToken.token.symbol}</span> has a live DEX liquidity pool size of only:
                </p>
                <div className="text-2xl font-mono font-extrabold text-amber-400 mt-2">
                  ${pendingWarningToken.liquidity.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                </div>
              </div>
            </div>

            <div className="bg-slate-950 border border-slate-850 rounded-xl p-4 text-xs text-slate-300 leading-relaxed font-sans space-y-2">
              <p>
                This is below our standard <strong className="text-white">$50,000</strong> safe rebalancing liquidity threshold.
              </p>
              <p>
                Executing swaps with a low-liquidity asset can result in <strong>high slippage, negative price impact, and value degradation</strong> during systematic volatility harvesting.
              </p>
            </div>

            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setPendingWarningToken(null)}
                className="flex-grow py-3 bg-slate-850 hover:bg-slate-800 text-white text-xs font-semibold rounded-lg transition-all cursor-pointer"
              >
                Cancel / Do Not Add
              </button>
              <button
                type="button"
                onClick={() => {
                  onAddToken(pendingWarningToken.token);
                  setPendingWarningToken(null);
                }}
                className="flex-grow py-3 bg-amber-500 text-slate-950 text-xs font-extrabold rounded-lg hover:bg-amber-400 transition-all cursor-pointer"
              >
                Proceed & Add Anyway
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
