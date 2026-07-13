import React from 'react';
import { TrendingUp, TrendingDown, RefreshCw, Star, Flame, Loader2, Sparkles, AlertOctagon } from 'lucide-react';
import { TokenBalance, formatPrice } from '../types';
import TokenLogo from './TokenLogo';

interface PriceViewProps {
  balancesWithPrice: TokenBalance[];
  loadingPrices: boolean;
  onRefreshPrices: () => Promise<void>;
}

export default function PriceView({ balancesWithPrice, loadingPrices, onRefreshPrices }: PriceViewProps) {
  return (
    <div id="price-view" className="space-y-6">
      
      {/* Intro Stats Banner */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 shadow-xl relative overflow-hidden flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
        <div className="space-y-1">
          <h3 className="text-lg font-bold text-white flex items-center gap-2">
            <Flame className="w-5 h-5 text-emerald-400" />
            Live Market & Asset Intel
          </h3>
          <p className="text-xs text-slate-400">
            Real-time USD prices and 24h volatility trackers sourced from Jupiter price indices and DexScreener.
          </p>
        </div>

        <button
          onClick={onRefreshPrices}
          disabled={loadingPrices}
          className="bg-slate-950 hover:bg-slate-850 border border-slate-800 text-slate-300 px-4 py-2 rounded-lg text-xs font-semibold transition-all flex items-center gap-2 disabled:opacity-50 cursor-pointer"
        >
          {loadingPrices ? (
            <>
              <Loader2 className="w-3.5 h-3.5 animate-spin text-emerald-400" />
              Syncing Prices...
            </>
          ) : (
            <>
              <RefreshCw className="w-3.5 h-3.5" />
              Sync Market Rates
            </>
          )}
        </button>
      </div>

      {/* Asset Grid */}
      {balancesWithPrice.length === 0 ? (
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-10 text-center text-slate-500 text-sm">
          No selected coins to track. Connect your wallet and pick tokens.
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {balancesWithPrice.map((item) => {
            const isUp = (item as any).change24h >= 0;
            const changePercent = (item as any).change24h || 0;
            const isCrashed = changePercent <= -40.0;

            return (
              <div
                key={item.mint}
                className={`bg-slate-900 border ${
                  isCrashed
                    ? 'border-rose-500/30 bg-rose-500/[0.01]'
                    : 'border-slate-800 hover:border-slate-700'
                } rounded-xl p-5 shadow-lg transition-all relative overflow-hidden flex flex-col justify-between`}
              >
                {isCrashed && (
                  <div className="absolute top-3 right-3 bg-rose-500/10 text-rose-400 text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border border-rose-500/20 flex items-center gap-1">
                    <AlertOctagon className="w-3 h-3" />
                    Hard Drop
                  </div>
                )}

                {/* Top header */}
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-slate-950 flex items-center justify-center border border-slate-800">
                    {/* Token icon */}
                    <TokenLogo logoURI={item.logoURI} symbol={item.symbol} size="md" />
                  </div>
                  <div>
                    <span className="font-extrabold text-white text-base block">{item.symbol}</span>
                    <span className="text-[10px] text-slate-500 truncate block max-w-[120px]">{item.mint.substring(0, 6)}...{item.mint.substring(item.mint.length - 4)}</span>
                  </div>
                </div>

                {/* Pricing info */}
                <div className="py-6">
                  <div className="text-xs text-slate-500">Live USD Price</div>
                  <div className="text-2xl font-mono font-black text-white mt-1">
                    {item.price > 0 ? (
                      formatPrice(item.price)
                    ) : (
                      <span className="text-rose-500 text-sm font-semibold">Price unavailable</span>
                    )}
                  </div>
                </div>

                {/* 24h change pill */}
                <div className="flex items-center justify-between pt-3 border-t border-slate-800 mt-auto">
                  <span className="text-xs text-slate-500">24h Volatility</span>
                  <div className={`flex items-center gap-1 text-xs font-extrabold px-2.5 py-1 rounded-lg ${
                    isUp
                      ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/10'
                      : 'bg-rose-500/10 text-rose-400 border border-rose-500/10'
                  }`}>
                    {isUp ? <TrendingUp className="w-3.5 h-3.5" /> : <TrendingDown className="w-3.5 h-3.5" />}
                    <span>{isUp ? '+' : ''}{changePercent.toFixed(2)}%</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Explanatory Intuition Card */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 shadow-xl relative overflow-hidden">
        <div className="flex items-start gap-4">
          <div className="p-3 bg-emerald-500/10 text-emerald-400 rounded-lg">
            <Sparkles className="w-6 h-6" />
          </div>
          <div>
            <h4 className="text-white font-bold text-base mb-1.5">Rebalancing Intuition: Volatility Harvesting</h4>
            <p className="text-slate-300 text-sm leading-relaxed">
              Why rebalance? In equal-weight portfolios, the strategy trades volatility for accumulation. When a coin outperforms, you sell the top to buy another coin that has lagged behind.
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4 text-xs text-slate-400 leading-relaxed">
              <div className="bg-slate-950 p-4 rounded-xl border border-slate-800">
                <strong className="text-white block mb-1">Lateral Oscillations = Gains</strong>
                If your chosen SPL tokens oscillate up and down without permanently trending to zero, each rebalance trims pumps and accumulates dips. You build higher unit quantities of each asset!
              </div>
              <div className="bg-slate-950 p-4 rounded-xl border border-slate-800">
                <strong className="text-rose-400 block mb-1">One-Way Trends = Risk</strong>
                If a coin rugpulls or permanently dies, equal-weight rebalancing will continuously buy more of it on the way down, draining your whole portfolio. Choose long-term bluechips!
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
