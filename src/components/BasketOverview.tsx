import React from 'react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip as RechartsTooltip } from 'recharts';
import { PieChart as PieChartIcon } from 'lucide-react';
import { LinkGroup, Token, TokenBalance, getGroupColorClasses, COIN_LINE_COLORS } from '../types';
import TokenLink from './TokenLink';

interface BasketOverviewProps {
  group: LinkGroup;
  groupBalances: TokenBalance[];
  tokenMetadata: Record<string, Token>;
}

function DonutTooltip({ active, payload }: any) {
  if (!active || !payload || !payload.length) return null;
  const p = payload[0]?.payload;
  if (!p) return null;
  return (
    <div className="bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs shadow-xl">
      <div className="flex items-center gap-2 font-bold text-white">
        <span className="w-2 h-2 rounded-full" style={{ backgroundColor: p.color }} />
        {p.name}
      </div>
      <div className="font-mono text-slate-300 mt-1">
        ${p.value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ({p.pct.toFixed(1)}%)
      </div>
    </div>
  );
}

export default function BasketOverview({ group, groupBalances, tokenMetadata }: BasketOverviewProps) {
  const groupColors = getGroupColorClasses(group.color);

  // Build rows in memberMints order so colors stay in sync with the left panel and coin dots.
  const rows = group.memberMints.map((mint, idx) => {
    const bal = groupBalances.find((b) => b && b.mint === mint);
    const meta = tokenMetadata[mint] || { symbol: mint.substring(0, 4) };
    const symbol = bal?.symbol || meta.symbol;
    const usdValue = bal ? bal.usdValue || (bal.amountHuman || 0) * (bal.price || 0) : 0;
    const color = COIN_LINE_COLORS[idx % COIN_LINE_COLORS.length];
    return { mint, symbol, usdValue, color };
  });

  const total = rows.reduce((sum, r) => sum + r.usdValue, 0);
  const hasValue = total > 0 && rows.length > 0;

  const chartData = rows.map((r) => ({
    name: r.symbol,
    mint: r.mint,
    value: r.usdValue,
    color: r.color,
    pct: total > 0 ? (r.usdValue / total) * 100 : 0,
  }));

  return (
    <div className="bg-slate-900 border border-slate-850 rounded-2xl p-6 shadow-xl space-y-5">
      <div className="flex justify-between items-center border-b border-slate-800 pb-3">
        <h4 className="text-sm font-extrabold text-white flex items-center gap-1.5">
          <PieChartIcon className={`w-4.5 h-4.5 ${groupColors.text}`} />
          Allocation ({group.name})
        </h4>
      </div>

      {!hasValue ? (
        <div className="bg-slate-950 border border-slate-850 rounded-xl p-8 text-center">
          <p className="text-xs text-slate-400 font-medium">No holdings to display yet.</p>
        </div>
      ) : (
        <div className="space-y-5">
          <div className="relative w-full" style={{ height: 220 }}>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={chartData}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  innerRadius={62}
                  outerRadius={92}
                  paddingAngle={2}
                  stroke="#0f172a"
                  strokeWidth={2}
                  startAngle={90}
                  endAngle={-270}
                >
                  {chartData.map((d) => (
                    <Cell key={d.name} fill={d.color} />
                  ))}
                </Pie>
                <RechartsTooltip content={<DonutTooltip />} />
              </PieChart>
            </ResponsiveContainer>

            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
              <span className="text-[10px] uppercase tracking-wider text-slate-500 font-bold">Basket value</span>
              <span className="text-xl font-extrabold text-white font-mono">
                ${total.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
            </div>
          </div>

          <div className="space-y-2">
            {chartData.map((d) => (
              <div key={d.name} className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: d.color }} />
                  <TokenLink mint={d.mint} showIcon>
                    <span className="font-extrabold text-white truncate">{d.name}</span>
                  </TokenLink>
                </div>
                <div className="flex items-center gap-3 font-mono shrink-0">
                  <span className="text-white font-bold">{d.pct.toFixed(1)}%</span>
                  <span className="text-slate-400 text-[11px]">
                    ${d.value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
