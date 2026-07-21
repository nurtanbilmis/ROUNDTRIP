import React from 'react';
import { TrendingUp, TrendingDown, RefreshCw, Flame, Loader2, Sparkles, AlertOctagon, ChevronDown } from 'lucide-react';
import { TokenBalance, LinkGroup, Token, getGroupColorClasses, formatPrice } from '../types';
import TokenLogo from './TokenLogo';

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
  const [showHiddenPrices, setShowHiddenPrices] = React.useState(false);

  // Top Index Coin definition
  const topIndexConfigs = [
    {
      mint: 'cbbtcf3aa214zXHbiAZQwf4122FBYbraNdFqgw4iMij', // cbBTC
      symbol: 'BTC',
      name: 'Bitcoin',
      logoURI: 'https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/cbbtcf3aa214zXHbiAZQwf4122FBYbraNdFqgw4iMij/logo.png',
    },
    {
      mint: '7vfCXTUXx5WJV5JADk17DUJ4ksgau7utNKj4b963voxs', // ETH
      symbol: 'ETH',
      name: 'Ethereum',
      logoURI: 'https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/7vfCXTUXx5WJV5JADk17DUJ4ksgau7utNKj4b963voxs/logo.png',
    },
    {
      mint: 'So11111111111111111111111111111111111111112', // SOL
      symbol: 'SOL',
      name: 'Solana',
      logoURI: 'https://dd.dexscreener.com/api/logo/1/solana/So11111111111111111111111111111111111111112',
    },
  ];

  const topIndexMints = topIndexConfigs.map(c => c.mint);

  // Apply junk filter matching the wallet inventory:
  // Must have balance > 0 (already guaranteed by balancesWithPrice)
  // AND exclude nonzero-balance-but-~$0-value and unverified tokens.
  // Meaning we keep a coin if:
  // 1. It is linked to any basket/group
  // 2. It is verified
  // 3. It has a real USD value (>= $0.01)
  // AND we exclude the top index coins (BTC, ETH, SOL) to prevent duplication ("not double")
  const heldRealCoins = balancesWithPrice.filter((item) => {
    if (topIndexMints.includes(item.mint)) {
      return false; // prevent duplication below
    }
    const isLinked = groups.some((g) => g.memberMints.includes(item.mint));
    const isVerified = isVerifiedCoin(item.mint);
    return isLinked || isVerified || item.usdValue >= 0.01;
  });

  // Sort by 24h price change % descending
  const sortedCoins = [...heldRealCoins].sort((a, b) => {
    const changeA = a.change24h || 0;
    const changeB = b.change24h || 0;
    return changeB - changeA;
  });

  // Calculate total portfolio values and enrich held assets data
  let totalHoldingsValue = 0;
  let total24hMoveUsd = 0;

  const enrichedCoins = sortedCoins.map((item) => {
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

  const handleRowClick = (row: typeof enrichedCoins[0]) => {
    if (row.owningGroup) {
      onSelectGroup(row.owningGroup.id);
    } else {
      onNavigateToWallet();
    }
  };

  // Helper renderer for a standard super-compact tile
  const renderCoinTile = (mint: string, symbol: string, logoURI: string | undefined, isTopIndex: boolean = false) => {
    const priceInfo = prices[mint] || { price: 0, change24h: 0 };
    const changePercent = priceInfo.change24h || 0;
    const isUp = changePercent >= 0;
    const isCrashed = changePercent <= -40.0;

    // Find owning group for this coin
    const owningGroup = groups.find((g) => g.memberMints.includes(mint));
    const gColors = owningGroup ? getGroupColorClasses(owningGroup.color) : null;

    const handleTileClick = () => {
      if (owningGroup) {
        onSelectGroup(owningGroup.id);
      } else {
        onNavigateToWallet();
      }
    };

    return (
      <div
        key={mint}
        onClick={handleTileClick}
        className={`p-3 rounded-xl border transition-all hover:border-emerald-500/40 hover:bg-slate-850/40 active:scale-[0.98] bg-slate-900 flex flex-col justify-between gap-1.5 shadow-md relative overflow-hidden cursor-pointer ${
          isCrashed ? 'border-rose-500/30 bg-rose-950/10' : 'border-slate-800/80'
        } ${isTopIndex ? 'border-slate-700 bg-slate-900/90' : ''}`}
        title={`Click to view in ${owningGroup ? `basket: ${owningGroup.name}` : 'wallet inventory'}`}
      >
        {/* Header: Logo, symbol, and crash tag */}
        <div className="flex items-center gap-2 min-w-0">
          <TokenLogo logoURI={logoURI} symbol={symbol} size="sm" />
          <div className="leading-none min-w-0">
            <div className="flex items-center gap-1">
              <span className="font-extrabold text-white text-xs truncate block">{symbol}</span>
              {isCrashed && (
                <span className="bg-rose-500/20 text-rose-400 text-[7px] font-black uppercase px-1 rounded">
                  DROP
                </span>
              )}
            </div>
            <span className="text-[8px] text-slate-500 font-mono">
              {mint.substring(0, 4)}...{mint.substring(mint.length - 4)}
            </span>
          </div>
        </div>

        {/* Live Price Display */}
        <div className="font-mono font-black text-slate-200 text-sm tracking-tight">
          {priceInfo.price > 0 ? (
            formatPrice(priceInfo.price)
          ) : (
            <span className="text-rose-500 text-[10px] font-semibold">Offline</span>
          )}
        </div>

        {/* Bottom row: Price change percentage and owning group label */}
        <div className="flex items-center justify-between gap-1.5 border-t border-slate-800/40 pt-1.5">
          {/* Volatility Badge */}
          <div className={`inline-flex items-center gap-0.5 text-[9px] font-bold px-1.5 py-0.5 rounded leading-none ${
            isUp
              ? 'bg-emerald-500/10 text-emerald-400'
              : 'bg-rose-500/10 text-rose-400'
          }`}>
            {isUp ? <TrendingUp className="w-2.5 h-2.5" /> : <TrendingDown className="w-2.5 h-2.5" />}
            <span>{isUp ? '+' : ''}{changePercent.toFixed(1)}%</span>
          </div>

          {/* Basket tag */}
          <div className="min-w-0 flex-shrink truncate">
            {owningGroup && gColors ? (
              <span className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[8px] font-black tracking-wide uppercase leading-none truncate max-w-[80px] ${gColors.bg} ${gColors.text} border ${gColors.border}`}>
                <span className={`w-1 h-1 rounded-full ${gColors.bgSolid}`} />
                {owningGroup.name}
              </span>
            ) : (
              <span className="text-[8px] text-slate-600 font-bold uppercase tracking-wider">Unlinked</span>
            )}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div id="price-view" className="space-y-4">
      
      {/* Intro Stats Banner: Clean & Compact */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-xl flex flex-row justify-between items-center gap-4">
        <div className="space-y-0.5">
          <h3 className="text-sm font-bold text-white flex items-center gap-1.5">
            <Flame className="w-4 h-4 text-emerald-400" />
            Live Market Intel
          </h3>
          <p className="text-[11px] text-slate-400 hidden sm:block">
            Real-time USD prices and 24h volatility trackers sourced from Jupiter.
          </p>
        </div>

        <button
          onClick={onRefreshPrices}
          disabled={loadingPrices}
          className="bg-slate-950 hover:bg-slate-850 border border-slate-800 text-slate-300 px-3 py-1.5 rounded-lg text-[11px] font-semibold transition-all flex items-center gap-1.5 disabled:opacity-50 cursor-pointer"
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

      {/* TOP INDEX LIST (BTC, ETH, SOL) */}
      <div className="space-y-1.5">
        <span className="text-[10px] font-bold uppercase text-slate-500 tracking-wider pl-1">Top Market Indices</span>
        <div className="grid grid-cols-3 gap-2">
          {topIndexConfigs.map((cfg) => {
            // Find logo from tokenMetadata if available as fallback
            const metaLogo = tokenMetadata[cfg.mint]?.logoURI || cfg.logoURI;
            return renderCoinTile(cfg.mint, cfg.symbol, metaLogo, true);
          })}
        </div>
      </div>

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
                                className={`hover:bg-slate-850/30 transition-all cursor-pointer text-xs font-mono group border-b border-slate-850/30 ${
                                  isCrashed ? 'bg-rose-950/10 border-l-2 border-l-rose-500' : ''
                                }`}
                                title={`Click to view in ${owningGroup ? `basket: ${owningGroup.name}` : 'wallet inventory'}`}
                              >
                                {/* Coin column */}
                                <td className="py-3 px-4 flex items-center gap-2 font-sans">
                                  <TokenLogo logoURI={item.logoURI} symbol={item.symbol} size="sm" />
                                  <div className="min-w-0 leading-none">
                                    <div className="flex items-center gap-1.5">
                                      <strong className="text-white font-extrabold text-xs block">{item.symbol}</strong>
                                      {isCrashed && (
                                        <span className="bg-rose-500/20 text-rose-400 text-[8px] font-black uppercase px-1 rounded">
                                          DROP
                                        </span>
                                      )}
                                    </div>
                                    {/* Mint title on hover */}
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
                                    <span className="inline-flex items-center gap-1.5 text-[10px] font-bold text-slate-300">
                                      <span className={`w-1.5 h-1.5 rounded-full ${gColors.bgSolid}`} />
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
                                      <TokenLogo logoURI={item.logoURI} symbol={item.symbol} size="sm" />
                                      <div className="min-w-0 leading-none">
                                        <div className="flex items-center gap-1.5">
                                          <strong className="text-white font-extrabold text-xs block">{item.symbol}</strong>
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

      {/* Explanatory Intuition Card: Clean & Tight */}
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
