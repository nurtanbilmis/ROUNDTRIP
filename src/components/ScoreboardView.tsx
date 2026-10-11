import React from 'react';
import { Award, ArrowRight, ExternalLink, Calendar, RefreshCw } from 'lucide-react';
import { HarvestEvent, Token, TokenBalance, getGroupColorClasses, LinkGroup, COIN_LINE_COLORS } from '../types';

interface ScoreboardViewProps {
  group: LinkGroup;
  harvestEvents: HarvestEvent[];
  groupBalances: TokenBalance[];
  tokenMetadata: Record<string, Token>;
}

export default function ScoreboardView({
  group,
  harvestEvents,
  groupBalances,
  tokenMetadata,
}: ScoreboardViewProps) {
  const groupColors = getGroupColorClasses(group.color);

  // Filter events for this group and sort chronologically (oldest to newest for stats, reverse for list)
  const groupEvents = (harvestEvents || []).filter((e) => e && e.groupId === group.id);
  const sortedEvents = [...groupEvents].sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));

  const totalGroupHarvestVolume = sortedEvents.reduce((sum, e) => sum + (e.volumeUsd || 0), 0);

  const firstEventTs = sortedEvents.length > 0 ? sortedEvents[0].timestamp : null;
  const firstEventDate = firstEventTs
    ? new Date(firstEventTs).toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      })
    : null;

  // Compute per-coin harvest stats so the headline reconciles exactly with the rows
  const perCoinRows = group.memberMints.map((mint, idx) => {
    const meta = tokenMetadata[mint] || { symbol: mint.substring(0, 4) };
    const color = COIN_LINE_COLORS[idx % COIN_LINE_COLORS.length];
    const bal = groupBalances.find((b) => b && b.mint === mint);
    const symbol = bal?.symbol || meta.symbol;
    const price = bal?.price || 0;

    // Compute net units harvested for this token across all confirmed rebalances
    const soldUnits = sortedEvents
      .filter((e) => e.soldMint === mint)
      .reduce((sum, e) => sum + (e.soldUnits || 0), 0);
    const boughtUnits = sortedEvents
      .filter((e) => e.boughtMint === mint)
      .reduce((sum, e) => sum + (e.boughtUnits || 0), 0);
    const netUnits = boughtUnits - soldUnits;
    const netUsd = netUnits * price;
    const hasActivity = soldUnits > 0 || boughtUnits > 0;

    return {
      mint,
      meta,
      color,
      bal,
      symbol,
      price,
      soldUnits,
      boughtUnits,
      netUnits,
      netUsd,
      hasActivity,
    };
  });

  const totalNetHarvestUsd = perCoinRows.reduce((sum, r) => sum + r.netUsd, 0);
  const isZeroNet = Math.abs(totalNetHarvestUsd) < 0.005;
  const isPositiveNet = totalNetHarvestUsd >= 0.005;
  const netColorClass = isZeroNet ? 'text-slate-400' : isPositiveNet ? 'text-emerald-400' : 'text-rose-400';
  const formattedNetHarvestUsd = isZeroNet
    ? '$0.00'
    : `${isPositiveNet ? '+' : '-'}$${Math.abs(totalNetHarvestUsd).toLocaleString(undefined, {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })}`;

  return (
    <div className="bg-slate-900 border border-slate-850 rounded-2xl p-6 shadow-xl space-y-5">
      {/* Harvest Header */}
      <div className="flex justify-between items-start border-b border-slate-800 pb-3">
        <div className="space-y-0.5">
          <h4 className="text-sm font-extrabold text-white flex items-center gap-1.5">
            <Award className={`w-4.5 h-4.5 ${groupColors.text}`} />
            Harvest per coin ({group.name})
          </h4>
          {firstEventDate && (
            <div className="text-[10px] font-mono text-slate-500">
              Harvest tracked since {firstEventDate}
            </div>
          )}
        </div>
        <span className="text-[10px] font-mono text-slate-400 font-bold bg-slate-950 px-2 py-0.5 rounded border border-slate-850">
          {sortedEvents.length} {sortedEvents.length === 1 ? 'trade' : 'trades'}
        </span>
      </div>

      {/* Main Panel Body */}
      {sortedEvents.length === 0 ? (
        <div className="bg-slate-950 border border-slate-850 rounded-xl p-6 text-center space-y-2">
          <div className="w-10 h-10 bg-slate-900 border border-slate-850 rounded-full flex items-center justify-center text-slate-400 mx-auto">
            <RefreshCw className="w-4 h-4 text-emerald-400" />
          </div>
          <p className="text-xs text-white font-bold">
            Harvest appears after your first rebalance.
          </p>
          <p className="text-[11px] text-slate-400 max-w-xs mx-auto leading-relaxed">
            Rebalancing trades volatility between basket assets, automatically trimming pumps to accumulate dips.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Net harvest headline */}
          <div className="bg-slate-950/80 border border-slate-850 p-3.5 rounded-xl flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Net harvest</span>
            <span className={`text-lg font-mono font-black ${netColorClass}`}>
              {formattedNetHarvestUsd}
            </span>
          </div>

          {/* Per-Coin Harvest Rows */}
          <div className="space-y-2.5">
            {perCoinRows.map(({ mint, color, symbol, bal, netUnits, netUsd, hasActivity }) => {
              return (
                <div
                  key={mint}
                  className="bg-slate-950 border border-slate-850 p-3.5 rounded-xl space-y-2 text-xs"
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span
                        className="w-2.5 h-2.5 rounded-full shrink-0"
                        style={{ backgroundColor: color }}
                      />
                      <span className="font-extrabold text-white text-sm">{symbol}</span>
                      <span className="text-[11px] font-mono text-slate-400 ml-1">
                        {bal
                          ? `${bal.amountHuman.toLocaleString(undefined, { maximumFractionDigits: 4 })} held`
                          : '0 held'}
                      </span>
                    </div>

                    <div className="flex items-center gap-3 text-right font-mono text-xs">
                      {hasActivity ? (
                        <div
                          className={`font-bold ${
                            netUnits >= 0 ? 'text-emerald-400' : 'text-rose-400'
                          }`}
                        >
                          {netUnits >= 0 ? '+' : ''}
                          {netUnits.toLocaleString(undefined, {
                            maximumFractionDigits: 4,
                          })}{' '}
                          {symbol}
                          <span className="text-[11px] text-slate-400 ml-1.5 font-normal">
                            ({netUsd >= 0 ? '+' : '-'}${Math.abs(netUsd).toLocaleString(undefined, {
                              minimumFractionDigits: 2,
                              maximumFractionDigits: 2,
                            })})
                          </span>
                        </div>
                      ) : (
                        <span className="text-slate-500 italic text-[11px]">
                          no rebalance trades yet
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Caption */}
          <p className="text-[10px] text-slate-500 leading-normal font-sans italic">
            Net units accumulated or trimmed from confirmed on-chain Round Trip rebalances.
          </p>

          {/* Confirmed Rebalance Trades Ledger */}
          <div className="space-y-2.5 pt-2 border-t border-slate-850">
            <div className="flex justify-between items-center text-[10px] font-bold uppercase text-slate-500 tracking-wider">
              <span>Confirmed Harvest Trades</span>
              <span className="text-slate-400 font-mono">Turnover: ${totalGroupHarvestVolume.toFixed(2)}</span>
            </div>
            <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
              {sortedEvents
                .slice()
                .reverse()
                .map((event) => {
                  const dateObj = new Date(event.timestamp || Date.now());
                  const timeStr = dateObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
                  const dateStr = dateObj.toLocaleDateString([], { month: 'short', day: 'numeric' });

                  return (
                    <div key={event.id} className="bg-slate-950 p-2.5 rounded-xl border border-slate-850/60 space-y-1 text-[11px]">
                      <div className="flex justify-between items-center text-[10px] text-slate-400 font-mono">
                        <span className="flex items-center gap-1.5 font-bold text-slate-300">
                          <Calendar className="w-3 h-3 text-emerald-400 shrink-0" />
                          {dateStr} {timeStr}
                        </span>
                        <div className="flex items-center gap-2">
                          <strong className="text-emerald-400 font-mono">${event.volumeUsd.toFixed(2)}</strong>
                          {event.txId && (
                            <a
                              href={`https://solscan.io/tx/${event.txId}`}
                              target="_blank"
                              rel="noreferrer"
                              className="text-slate-500 hover:text-emerald-400 transition-colors"
                              title="View on Solscan"
                            >
                              <ExternalLink className="w-3 h-3" />
                            </a>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5 text-[10px] font-mono text-slate-300 border-t border-slate-900 pt-1">
                        <span className="text-rose-400 font-semibold">
                          -{event.soldUnits.toLocaleString(undefined, { maximumFractionDigits: 4 })} {event.soldSymbol}
                        </span>
                        <ArrowRight className="w-3 h-3 text-slate-600 shrink-0" />
                        <span className="text-emerald-400 font-semibold">
                          +{event.boughtUnits.toLocaleString(undefined, { maximumFractionDigits: 4 })} {event.boughtSymbol}
                        </span>
                      </div>
                    </div>
                  );
                })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

