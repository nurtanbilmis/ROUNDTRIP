import React from 'react';
import { Award, TrendingUp, Calendar, Info, Activity } from 'lucide-react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip as RechartsTooltip,
  CartesianGrid,
  ReferenceLine,
} from 'recharts';
import { BalanceSnapshot, Token, TokenBalance, getGroupColorClasses, LinkGroup, COIN_LINE_COLORS } from '../types';

interface ScoreboardViewProps {
  group: LinkGroup;
  snapshots: BalanceSnapshot[];
  groupBalances: TokenBalance[];
  tokenMetadata: Record<string, Token>;
  onSaveSnapshot?: () => void;
  showSnapshotSuccess?: boolean;
}

// Helper to calculate a coin's baseline snapshot in the group
export function getCoinBaselineSnapshot(snapshotsForGroup: BalanceSnapshot[], mint: string): BalanceSnapshot | null {
  if (!snapshotsForGroup || snapshotsForGroup.length === 0) return null;

  // Find all snapshots where this coin is present in balances
  const indicesWithCoin = snapshotsForGroup
    .map((s, idx) => ({ s, idx, hasCoin: s && Array.isArray(s.balances) && s.balances.some((b) => b && b.mint === mint) }))
    .filter((item) => item.hasCoin);

  if (indicesWithCoin.length === 0) return null;

  // Track backwards from the latest snapshot to detect if there was a gap (removal & re-addition)
  let baselineIdx = indicesWithCoin[0].idx;

  for (let i = snapshotsForGroup.length - 1; i >= 0; i--) {
    const s = snapshotsForGroup[i];
    const hasCoin = s && Array.isArray(s.balances) && s.balances.some((b) => b && b.mint === mint);
    if (!hasCoin) {
      // Coin was absent here, meaning any appearance after this is a fresh addition.
      const firstAfterGap = indicesWithCoin.find((item) => item.idx > i);
      if (firstAfterGap) {
        baselineIdx = firstAfterGap.idx;
      }
      break;
    }
  }

  return snapshotsForGroup[baselineIdx] || null;
}

export interface CoinGrowthStats {
  unitsNow: number;
  baselineUnits: number;
  netDeposited: number;
  strategyDeltaUnits: number;
  strategyDeltaPct: number;
}

export function getCoinStrategyGrowth(
  sortedSnapshots: BalanceSnapshot[],
  mint: string,
  currentUnits?: number
): CoinGrowthStats {
  const baseline = getCoinBaselineSnapshot(sortedSnapshots, mint);
  if (!baseline) {
    const uNow = currentUnits ?? 0;
    return {
      unitsNow: uNow,
      baselineUnits: uNow,
      netDeposited: 0,
      strategyDeltaUnits: 0,
      strategyDeltaPct: 0,
    };
  }

  const baseBal = baseline.balances.find((b) => b && b.mint === mint);
  const baselineUnits = baseBal ? baseBal.amountHuman : 0;

  const baselineIdx = sortedSnapshots.findIndex((s) => s.id === baseline.id);
  let netDeposited = 0;

  if (baselineIdx !== -1) {
    for (let i = baselineIdx + 1; i < sortedSnapshots.length; i++) {
      const snap = sortedSnapshots[i];
      if (snap.eventType === 'convert' || snap.eventType === 'cashout') {
        const prevSnap = sortedSnapshots[i - 1];
        const prevBal = prevSnap ? prevSnap.balances.find((b) => b && b.mint === mint) : undefined;
        const curBal = snap.balances.find((b) => b && b.mint === mint);

        const unitsPrev = prevBal ? prevBal.amountHuman : 0;
        const unitsCur = curBal ? curBal.amountHuman : 0;

        netDeposited += (unitsCur - unitsPrev);
      }
    }
  }

  let unitsNow = 0;
  if (currentUnits !== undefined) {
    unitsNow = currentUnits;
  } else if (sortedSnapshots.length > 0) {
    const latestSnap = sortedSnapshots[sortedSnapshots.length - 1];
    const latestBal = latestSnap.balances.find((b) => b && b.mint === mint);
    unitsNow = latestBal ? latestBal.amountHuman : 0;
  }

  const strategyDeltaUnits = unitsNow - baselineUnits - netDeposited;
  const denom = baselineUnits + netDeposited;
  const strategyDeltaPct = denom > 0 ? (strategyDeltaUnits / denom) * 100 : 0;

  return {
    unitsNow,
    baselineUnits,
    netDeposited,
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
  const [metricMode, setMetricMode] = React.useState<'index' | 'units'>('index');

  // 1. Sort snapshots chronologically
  const sortedSnapshots = [...(snapshots || [])]
    .filter((s) => s && s.groupId === group.id)
    .sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));

  // 2. Generate custom sequential labels per event type to render on X-axis (e.g. "R2 · Jul 13 14:05")
  let rebalanceCount = 0;
  let convertCount = 0;
  let cashoutCount = 0;
  let membershipCount = 0;
  let manualCount = 0;

  const snapshotsWithLabels = sortedSnapshots.map((snap) => {
    const dateObj = new Date(snap.timestamp || Date.now());
    const timeStr = dateObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
    const dateStr = dateObj.toLocaleDateString([], { month: 'short', day: 'numeric' });

    let label = '';
    const et = snap.eventType || 'manual';

    if (et === 'rebalance') {
      rebalanceCount++;
      label = `R${rebalanceCount}`;
    } else if (et === 'convert') {
      convertCount++;
      label = `C${convertCount}`;
    } else if (et === 'cashout') {
      cashoutCount++;
      label = `CO${cashoutCount}`;
    } else if (et === 'membership') {
      membershipCount++;
      label = `M${membershipCount}`;
    } else {
      manualCount++;
      label = `S${manualCount}`;
    }

    const labelName = `${label} · ${dateStr} ${timeStr}`;
    return {
      ...snap,
      labelName,
    };
  });

  // 3. Precompute baselines for each member coin currently in the group
  const coinBaselines: Record<string, BalanceSnapshot | null> = {};
  group.memberMints.forEach((mint) => {
    coinBaselines[mint] = getCoinBaselineSnapshot(sortedSnapshots, mint);
  });

  // 4. Transform snapshots into series data for the line chart
  const chartData = snapshotsWithLabels.map((snap, snapIdx) => {
    const point: any = {
      name: snap.labelName,
      timestamp: snap.timestamp || Date.now(),
      eventType: snap.eventType || 'manual',
    };

    const snapsUpToPoint = sortedSnapshots.slice(0, snapIdx + 1);

    group.memberMints.forEach((mint) => {
      const baseline = coinBaselines[mint];
      if (!baseline || !Array.isArray(baseline.balances)) return; // Coins with no baseline yet are skipped on the line chart

      // Ensure the snapshot is chronological with or after the baseline snapshot
      if ((snap.timestamp || 0) < (baseline.timestamp || 0)) return;

      if (!Array.isArray(snap.balances)) return;
      const bal = snap.balances.find((b) => b && b.mint === mint);
      if (!bal) return;

      if (metricMode === 'units') {
        const val = Number(bal.amountHuman);
        point[mint] = isNaN(val) ? 0 : val;
      } else {
        const growth = getCoinStrategyGrowth(snapsUpToPoint, mint);
        point[mint] = 100 + growth.strategyDeltaPct;
      }
    });

    return point;
  });

  // 5. Generate custom legend elements with exact counts and Harvesting Delta
  const legendItems = group.memberMints.map((mint, idx) => {
    const meta = tokenMetadata[mint] || { symbol: mint.substring(0, 4) };
    const baseline = coinBaselines[mint];
    const color = COIN_LINE_COLORS[idx % COIN_LINE_COLORS.length];

    if (!baseline || !Array.isArray(baseline.balances)) {
      return {
        mint,
        symbol: meta.symbol,
        hasBaseline: false,
        color,
      };
    }

    const currentBal = Array.isArray(groupBalances) ? groupBalances.find((b) => b && b.mint === mint) : undefined;
    const unitsNow = currentBal ? currentBal.amountHuman : 0;

    const growth = getCoinStrategyGrowth(sortedSnapshots, mint, unitsNow);

    return {
      mint,
      symbol: meta.symbol,
      hasBaseline: true,
      unitsNow: growth.unitsNow,
      deltaUnits: growth.strategyDeltaUnits,
      deltaPct: growth.strategyDeltaPct,
      color,
    };
  });

  // Custom tooltips detailing exact quantities and baseline changes
  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      const snap = snapshotsWithLabels.find((s) => s.labelName === label);
      if (!snap) return null;

      const snapIdx = snapshotsWithLabels.findIndex((s) => s.id === snap.id);
      const snapsUpToPoint = sortedSnapshots.slice(0, snapIdx + 1);

      return (
        <div className="bg-slate-950 border border-slate-800 p-3.5 rounded-xl shadow-2xl space-y-2 text-xs">
          <p className="font-bold text-slate-300 border-b border-slate-900 pb-1.5 flex justify-between items-center gap-4">
            <span>{label}</span>
            <span className="text-[9px] uppercase px-1.5 py-0.5 rounded bg-slate-900 border border-slate-800 text-slate-400 font-semibold font-mono">
              {snap.eventType || 'manual'}
            </span>
          </p>
          <div className="space-y-2 max-w-xs">
            {payload.map((p: any) => {
              const mint = p.dataKey;
              const indexedVal = p.value;
              const balItem = Array.isArray(snap.balances) ? snap.balances.find((b) => b && b.mint === mint) : undefined;
              const baseline = coinBaselines[mint];

              if (!balItem || !baseline) return null;

              const growth = getCoinStrategyGrowth(snapsUpToPoint, mint);

              const unitsNow = growth.unitsNow;
              const deltaUnits = growth.strategyDeltaUnits;
              const deltaPct = growth.strategyDeltaPct;

              const color = p.stroke;
              const symbol = balItem.symbol;

              return (
                <div key={mint} className="flex flex-col gap-0.5 border-l-2 pl-2" style={{ borderColor: color }}>
                  <div className="flex justify-between gap-4">
                    <span className="font-bold text-slate-200">
                      {symbol} {metricMode === 'units' ? 'Units' : 'Index'}:
                    </span>
                    <strong className="font-mono" style={{ color }}>
                      {metricMode === 'units' 
                        ? indexedVal.toLocaleString(undefined, { maximumFractionDigits: 6 }) 
                        : indexedVal.toFixed(1)
                      }
                    </strong>
                  </div>
                  {metricMode === 'index' && (
                    <div className="flex justify-between text-[10px] text-slate-400">
                      <span>Units at point:</span>
                      <span className="font-mono text-white">
                        {unitsNow.toLocaleString(undefined, { maximumFractionDigits: 6 })}
                      </span>
                    </div>
                  )}
                  <div className="flex justify-between text-[10px] text-slate-400">
                    <span>Delta vs Baseline:</span>
                    <span className={`font-mono font-bold ${deltaUnits >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                      {deltaUnits >= 0 ? '+' : ''}{deltaUnits.toLocaleString(undefined, { maximumFractionDigits: 4 })} ({deltaUnits >= 0 ? '+' : ''}{deltaPct.toFixed(2)}%)
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="bg-slate-900 border border-slate-850 rounded-2xl p-6 shadow-xl space-y-5">
      
      {/* Scoreboard Header */}
      <div className="flex justify-between items-center border-b border-slate-800 pb-3">
        <h4 className="text-sm font-extrabold text-white flex items-center gap-1.5">
          <Award className={`w-4.5 h-4.5 ${groupColors.text}`} />
          Coin Scoreboard ({group.name})
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

      {/* Main Scoreboard Body: Chart and Legend */}
      {sortedSnapshots.length < 2 ? (
        <div className="bg-slate-950 border border-slate-850 rounded-xl p-8 text-center space-y-4">
          <div className="w-12 h-12 bg-slate-900 border border-slate-800 rounded-lg flex items-center justify-center text-slate-400 mx-auto">
            <Activity className="w-5 h-5 text-amber-500" />
          </div>
          <div className="space-y-1.5 max-w-sm mx-auto">
            <h5 className="font-bold text-white text-sm">Scoreboard Awaiting Trades</h5>
            <p className="text-xs text-slate-400 leading-relaxed">
              Run your first rebalance to start the scoreboard! Unit counts will automatically snapshot after each rebalance, link, or membership change.
            </p>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          
          {/* Metric Selector Toggles */}
          <div className="flex justify-between items-center bg-slate-950 p-1 rounded-xl border border-slate-850">
            <span className="text-[10px] font-bold text-slate-400 pl-2">Chart Metric</span>
            <div className="flex gap-1">
              <button
                onClick={() => setMetricMode('index')}
                className={`comic-btn px-2.5 py-1 rounded-lg text-[10px] font-extrabold cursor-pointer transition-all ${
                  metricMode === 'index'
                    ? 'bg-emerald-500 text-slate-950'
                    : 'bg-transparent text-slate-400 hover:text-white'
                }`}
              >
                Growth Index
              </button>
              <button
                onClick={() => setMetricMode('units')}
                className={`comic-btn px-2.5 py-1 rounded-lg text-[10px] font-extrabold cursor-pointer transition-all ${
                  metricMode === 'units'
                    ? 'bg-emerald-500 text-slate-950'
                    : 'bg-transparent text-slate-400 hover:text-white'
                }`}
              >
                Coin Units
              </button>
            </div>
          </div>
          
          {/* Indexed Line Chart */}
          <div className="h-44 w-full pr-2">
            <ResponsiveContainer key={metricMode} width="100%" height="100%">
              <LineChart data={chartData} margin={{ top: 5, right: 5, left: -25, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                <XAxis dataKey="name" stroke="#64748b" fontSize={8} tickLine={false} />
                <YAxis stroke="#64748b" fontSize={8} tickLine={false} domain={['auto', 'auto']} />
                
                <RechartsTooltip content={<CustomTooltip />} />
                
                {/* Reference line at 100 for visual benchmark */}
                {metricMode === 'index' && (
                  <ReferenceLine y={100} stroke="#475569" strokeWidth={1} strokeDasharray="3 3" />
                )}
                
                {group.memberMints.map((mint, idx) => {
                  if (!coinBaselines[mint]) return null;
                  return (
                    <Line
                      key={`${metricMode}-${mint}`}
                      type="monotone"
                      dataKey={mint}
                      stroke={COIN_LINE_COLORS[idx % COIN_LINE_COLORS.length]}
                      strokeWidth={2}
                      dot={{ r: 2.5 }}
                      activeDot={{ r: 4 }}
                      connectNulls
                    />
                  );
                })}
              </LineChart>
            </ResponsiveContainer>
          </div>

          {/* Small UI copy under the chart */}
          <p className="text-[9px] text-slate-500 leading-normal font-sans italic">
            Unit growth reflects rebalancing harvests. For tokenized stocks, balances may also increase from dividend rebases.
          </p>

          {/* Interactive Legend Grid */}
          <div className="space-y-2 pt-2 border-t border-slate-850">
            <span className="text-[10px] font-bold uppercase text-slate-500 tracking-wider">Group Coins Legend</span>
            <div className="grid grid-cols-2 gap-2.5">
              {legendItems.map((item) => {
                if (!item.hasBaseline) {
                  return (
                    <div
                      key={item.mint}
                      className="flex items-center gap-2 px-2.5 py-1.5 rounded-xl bg-slate-950/40 border border-slate-900/60 text-slate-500 text-[11px]"
                    >
                      <span className="w-2 h-2 rounded-full bg-slate-750 shrink-0"></span>
                      <span className="truncate">
                        {item.symbol} <span className="text-[9px] italic text-slate-600 block leading-tight">awaiting first snapshot</span>
                      </span>
                    </div>
                  );
                }

                const deltaStr = (item.deltaUnits ?? 0) >= 0 ? '+' : '';
                const pctStr = (item.deltaPct ?? 0) >= 0 ? '+' : '';

                return (
                  <div
                    key={item.mint}
                    className="flex flex-col gap-0.5 p-2 rounded-xl bg-slate-950 border border-slate-850 text-[11px] leading-tight"
                  >
                    <div className="flex items-center gap-1.5">
                      <span
                        className="w-2 h-2 rounded-full shrink-0"
                        style={{ backgroundColor: item.color }}
                      ></span>
                      <span className="font-extrabold text-slate-200">{item.symbol}</span>
                    </div>
                    <div className="text-[9px] text-slate-400 font-mono mt-1 border-t border-slate-900 pt-1 space-y-0.5">
                      <div className="flex justify-between gap-1">
                        <span>Units:</span>
                        <strong className="text-white font-mono">
                          {item.unitsNow?.toLocaleString(undefined, { maximumFractionDigits: 3 })}
                        </strong>
                      </div>
                      <div className="flex justify-between gap-1">
                        <span>Delta:</span>
                        <strong
                          className={(item.deltaUnits ?? 0) >= 0 ? 'text-emerald-400 font-bold' : 'text-rose-400 font-bold'}
                        >
                          {deltaStr}{item.deltaUnits?.toLocaleString(undefined, { maximumFractionDigits: 3 })} ({pctStr}{item.deltaPct?.toFixed(1)}%)
                        </strong>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Snapshot Ledger List within this group */}
          <div className="space-y-2.5 pt-2 border-t border-slate-850">
            <span className="text-[10px] font-bold uppercase text-slate-500 tracking-wider">Historical Snapshot Ledger</span>
            <div className="space-y-2 max-h-44 overflow-y-auto pr-1">
              {snapshotsWithLabels
                .slice()
                .reverse()
                .map((snap) => {
                  return (
                    <div key={snap.id} className="bg-slate-950 p-2.5 rounded-xl border border-slate-850/60 space-y-1 text-[11px]">
                      <div className="flex justify-between items-center text-[10px] text-slate-400 font-mono">
                        <span className="flex items-center gap-1.5 font-bold">
                          <Calendar className="w-3 h-3 text-emerald-400 shrink-0" />
                          {snap.labelName}
                        </span>
                        <strong className="text-slate-300 font-mono">${snap.totalUsdValue.toFixed(2)}</strong>
                      </div>
                      <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-[9px] font-mono text-slate-400 border-t border-slate-900 pt-1">
                        {Array.isArray(snap.balances) && snap.balances.map((bal: any) => {
                          if (!bal) return null;
                          const baseline = coinBaselines[bal.mint];
                          
                          const snapIdx = snapshotsWithLabels.findIndex((s) => s.id === snap.id);
                          const snapsUpToPoint = sortedSnapshots.slice(0, snapIdx + 1);
                          const growth = getCoinStrategyGrowth(snapsUpToPoint, bal.mint);

                          const changePct = growth.strategyDeltaPct;
                          const showChange = baseline && (snap.timestamp || 0) >= (baseline.timestamp || 0);
                          
                          return (
                            <div key={bal.mint} className="flex justify-between items-center">
                              <span>{bal.symbol}:</span>
                              <strong className="text-white">
                                {bal.amountHuman.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                                {showChange && (
                                  <span className={`text-[8px] ml-1 ${changePct >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                                    ({changePct >= 0 ? '+' : ''}{changePct.toFixed(0)}%)
                                  </span>
                                )}
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
