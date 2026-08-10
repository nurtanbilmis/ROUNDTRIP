import React from 'react';
import { Award, Calendar } from 'lucide-react';
import { BalanceSnapshot, Token, TokenBalance, getGroupColorClasses, LinkGroup, COIN_LINE_COLORS } from '../types';

interface ScoreboardViewProps {
  group: LinkGroup;
  snapshots: BalanceSnapshot[];
  groupBalances: TokenBalance[];
  tokenMetadata: Record<string, Token>;
  onSaveSnapshot?: () => void;
  showSnapshotSuccess?: boolean;
}

export function getCoinBaselineSnapshot(
  groupSnapshots: BalanceSnapshot[],
  mint: string
): BalanceSnapshot | null {
  const sorted = [...(groupSnapshots || [])].sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
  let candidate: BalanceSnapshot | null = null;

  for (let i = 0; i < sorted.length; i++) {
    const snap = sorted[i];
    const bal = snap.balances?.find((b) => b && b.mint === mint);
    const units = bal ? bal.amountHuman || 0 : 0;

    if (units > 0) {
      if (i === 0) {
        candidate = snap;
      } else {
        const prevSnap = sorted[i - 1];
        const prevBal = prevSnap.balances?.find((b) => b && b.mint === mint);
        const prevUnits = prevBal ? prevBal.amountHuman || 0 : 0;
        if (prevUnits <= 0) {
          candidate = snap;
        }
      }
    } else {
      candidate = null;
    }
  }

  return candidate;
}

export function getCoinStrategyGrowth(
  groupSnapshots: BalanceSnapshot[],
  mint: string,
  currentUnits?: number
) {
  const sorted = [...(groupSnapshots || [])].sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));

  let harvestUnits = 0;
  for (let i = 0; i < sorted.length; i++) {
    const snap = sorted[i];
    if (snap.eventType === 'rebalance') {
      const curBal = snap.balances?.find((b) => b && b.mint === mint);
      const prevBal = i > 0 ? sorted[i - 1]?.balances?.find((b) => b && b.mint === mint) : undefined;
      const curUnits = curBal ? curBal.amountHuman || 0 : 0;
      const prevUnits = prevBal ? prevBal.amountHuman || 0 : 0;
      harvestUnits += curUnits - prevUnits;
    }
  }

  const unitsNow =
    currentUnits !== undefined
      ? currentUnits
      : sorted[sorted.length - 1]?.balances?.find((b) => b && b.mint === mint)?.amountHuman || 0;

  const holdUnits = unitsNow - harvestUnits;
  const strategyDeltaUnits = harvestUnits;
  const denom = holdUnits;
  const hasBaseline = denom > 0;
  const strategyDeltaPct = hasBaseline ? (harvestUnits / denom) * 100 : null;
  const baselineUnits = holdUnits;

  return {
    hasBaseline,
    baselineUnits,
    unitsNow,
    strategyDeltaUnits,
    strategyDeltaPct,
  };
}

export default function ScoreboardView({
  group,
  snapshots,
  groupBalances,
  tokenMetadata,
  onSaveSnapshot,
  showSnapshotSuccess = false,
}: ScoreboardViewProps) {
  const groupColors = getGroupColorClasses(group.color);

  // 1. Sort snapshots chronologically for this group
  const sortedSnapshots = [...(snapshots || [])]
    .filter((s) => s && s.groupId === group.id)
    .sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));

  const hasAnyRebalance = sortedSnapshots.some((s) => s.eventType === 'rebalance');

  // Calculate current total USD for group
  const totalGroupUsd = groupBalances.reduce(
    (sum, b) => sum + (b ? b.usdValue || (b.amountHuman || 0) * (b.price || 0) : 0),
    0
  );

  return (
    <div className="bg-slate-900 border border-slate-850 rounded-2xl p-6 shadow-xl space-y-5">
      {/* Scoreboard Header */}
      <div className="flex justify-between items-center border-b border-slate-800 pb-3">
        <h4 className="text-sm font-extrabold text-white flex items-center gap-1.5">
          <Award className={`w-4.5 h-4.5 ${groupColors.text}`} />
          Harvest per coin ({group.name})
        </h4>
        {onSaveSnapshot && (
          <button
            onClick={onSaveSnapshot}
            disabled={groupBalances.length === 0}
            className={`text-[10px] ${groupColors.bg} ${groupColors.text} border ${groupColors.border} px-2.5 py-1 rounded-lg font-bold hover:bg-slate-800 transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed`}
          >
            Log Snapshot
          </button>
        )}
      </div>

      {showSnapshotSuccess && (
        <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-emerald-400 text-xs font-bold text-center animate-in fade-in duration-200">
          ✓ Snapshot saved! Unit scoreboard logged successfully.
        </div>
      )}

      {/* Main Panel Body */}
      {sortedSnapshots.length === 0 ? (
        <div className="bg-slate-950 border border-slate-850 rounded-xl p-8 text-center space-y-2">
          <p className="text-xs text-slate-400 font-medium">
            Log a snapshot to start tracking harvest.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Per-Coin Harvest Rows or Directional Note */}
          {!hasAnyRebalance ? (
            <div className="bg-slate-950 border border-slate-850 rounded-xl p-6 text-center space-y-2">
              <p className="text-xs text-slate-400 font-medium">
                Harvest appears after your first rebalance.
              </p>
            </div>
          ) : (
            <div className="space-y-2.5">
              {group.memberMints.map((mint, idx) => {
                const meta = tokenMetadata[mint] || { symbol: mint.substring(0, 4) };
                const color = COIN_LINE_COLORS[idx % COIN_LINE_COLORS.length];
                const bal = groupBalances.find((b) => b && b.mint === mint);
                const currentUnits = bal ? bal.amountHuman || 0 : 0;
                const usdVal = bal ? bal.usdValue || currentUnits * (bal.price || 0) : 0;
                const sharePct = totalGroupUsd > 0 ? (usdVal / totalGroupUsd) * 100 : 0;
                const symbol = bal?.symbol || meta.symbol;

                const growth = getCoinStrategyGrowth(sortedSnapshots, mint, currentUnits);

                const fillPct =
                  growth.strategyDeltaPct != null
                    ? Math.min(100, (Math.abs(growth.strategyDeltaPct) / 50) * 100)
                    : 0;

                return (
                  <div
                    key={mint}
                    className="bg-slate-950 border border-slate-850 p-3.5 rounded-xl space-y-2 text-xs"
                  >
                    {/* Top line: Coin info & metrics */}
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span
                          className="w-2.5 h-2.5 rounded-full shrink-0"
                          style={{ backgroundColor: color }}
                        />
                        <span className="font-extrabold text-white text-sm">{symbol}</span>
                        <span className="text-[11px] font-mono text-slate-400 ml-1">
                          {growth.hasBaseline
                            ? `${growth.baselineUnits.toLocaleString(undefined, {
                                maximumFractionDigits: 3,
                              })} to ${growth.unitsNow.toLocaleString(undefined, {
                                maximumFractionDigits: 3,
                              })}`
                            : 'no baseline'}
                        </span>
                      </div>

                      <div className="flex items-center gap-3 text-right font-mono text-xs">
                        <div className="text-slate-400 text-[11px]">
                          ${usdVal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}{' '}
                          <span className="text-slate-500">({sharePct.toFixed(1)}%)</span>
                        </div>

                        {growth.hasBaseline && growth.strategyDeltaPct != null ? (
                          <div
                            className={`font-bold ${
                              growth.strategyDeltaUnits >= 0 ? 'text-emerald-400' : 'text-rose-400'
                            }`}
                          >
                            {growth.strategyDeltaUnits >= 0 ? '+' : ''}
                            {growth.strategyDeltaUnits.toLocaleString(undefined, {
                              maximumFractionDigits: 3,
                            })}{' '}
                            <span className="text-[11px]">
                              ({growth.strategyDeltaPct >= 0 ? '+' : ''}
                              {growth.strategyDeltaPct.toFixed(1)}%)
                            </span>
                          </div>
                        ) : (
                          <span className="text-slate-500 italic text-[11px]">
                            awaiting first snapshot
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Bottom line: Diverging Bar */}
                    {growth.hasBaseline && growth.strategyDeltaPct != null ? (
                      <div className="w-full h-2.5 bg-slate-900 rounded-full border border-slate-800 flex items-center relative overflow-hidden">
                        <div className="absolute left-1/2 top-0 bottom-0 w-0.5 bg-slate-700 z-10" />

                        {/* Left side (negative fill) */}
                        <div className="w-1/2 h-full flex justify-end items-center relative">
                          {growth.strategyDeltaPct < 0 && (
                            <div
                              className="h-full bg-rose-500 rounded-l-full transition-all"
                              style={{ width: `${fillPct}%` }}
                            />
                          )}
                        </div>

                        {/* Right side (positive fill) */}
                        <div className="w-1/2 h-full flex justify-start items-center relative">
                          {growth.strategyDeltaPct > 0 && (
                            <div
                              className="h-full bg-emerald-500 rounded-r-full transition-all"
                              style={{ width: `${fillPct}%` }}
                            />
                          )}
                        </div>
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          )}

          {/* Caption */}
          <p className="text-[10px] text-slate-500 leading-normal font-sans italic">
            Units rebalancing added or removed versus simply holding your funded position. Only logged rebalances count.
          </p>

          {/* Historical Snapshot Ledger List */}
          <div className="space-y-2.5 pt-2 border-t border-slate-850">
            <span className="text-[10px] font-bold uppercase text-slate-500 tracking-wider">
              Historical Snapshot Ledger
            </span>
            <div className="space-y-2 max-h-44 overflow-y-auto pr-1">
              {sortedSnapshots
                .slice()
                .reverse()
                .map((snap) => {
                  const dateObj = new Date(snap.timestamp || Date.now());
                  const timeStr = dateObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
                  const dateStr = dateObj.toLocaleDateString([], { month: 'short', day: 'numeric' });

                  return (
                    <div key={snap.id} className="bg-slate-950 p-2.5 rounded-xl border border-slate-850/60 space-y-1 text-[11px]">
                      <div className="flex justify-between items-center text-[10px] text-slate-400 font-mono">
                        <span className="flex items-center gap-1.5 font-bold">
                          <Calendar className="w-3 h-3 text-emerald-400 shrink-0" />
                          {snap.eventType || 'manual'} : {dateStr} {timeStr}
                        </span>
                        <strong className="text-slate-300 font-mono">${snap.totalUsdValue.toFixed(2)}</strong>
                      </div>
                      <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-[9px] font-mono text-slate-400 border-t border-slate-900 pt-1">
                        {Array.isArray(snap.balances) &&
                          snap.balances.map((bal: any) => {
                            if (!bal) return null;
                            return (
                              <div key={bal.mint} className="flex justify-between items-center">
                                <span>{bal.symbol}:</span>
                                <strong className="text-white">
                                  {bal.amountHuman.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                                </strong>
                              </div>
                            );
                          })}
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
