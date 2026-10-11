import React from 'react';
import { Trophy, Crown, Sparkles } from 'lucide-react';

export const SEASON_1_RESULTS = [
  { rank: 1, name: 'untiedbear', returnPct: 11.76, finalValueUsd: 53.79, payoutUsdc: 58.98 },
  { rank: 2, name: 'kirk', returnPct: 6.43, finalValueUsd: 51.23, payoutUsdc: 35.34 },
  { rank: 3, name: 'giza', returnPct: 4.51, finalValueUsd: 50.3, payoutUsdc: 34.03 },
  { rank: 4, name: 'billy', returnPct: 2.54, finalValueUsd: 49.35, payoutUsdc: 32.69 },
  { rank: 5, name: 'coffeeattack', returnPct: -13.53, finalValueUsd: 41.62, payoutUsdc: 21.72 },
  { rank: 6, name: 'naris', returnPct: -20.09, finalValueUsd: 38.46, payoutUsdc: 17.24 },
];

const SEASON_1_POOL_USDC = 200;
const SEASON_1_BASELINE = '0.5 SOL ($48.13)';

type Medal = { fill: string; top: string; ink: string; ring: string; blockH: string };
const MEDALS: Record<number, Medal> = {
  1: { fill: '#f5b301', top: '#ffd84d', ink: '#3a2400', ring: '#ffd84d', blockH: 'h-36 sm:h-44' },
  2: { fill: '#aab4c3', top: '#dfe5ee', ink: '#1b2230', ring: '#dfe5ee', blockH: 'h-24 sm:h-32' },
  3: { fill: '#c26a2c', top: '#e89559', ink: '#2e1203', ring: '#e89559', blockH: 'h-16 sm:h-24' },
};

const fmtPct = (v: number) => `${v >= 0 ? '+' : ''}${v.toFixed(2)}%`;
const fmtUsd = (v: number) => `$${v.toFixed(2)}`;

function PodiumColumn({ row }: { row: (typeof SEASON_1_RESULTS)[number] }) {
  const m = MEDALS[row.rank];
  const isWinner = row.rank === 1;
  const positive = row.returnPct >= 0;
  return (
    <div className={`flex flex-col items-center justify-end min-w-0 ${isWinner ? 'w-[36%]' : 'w-[30%]'}`}>
      <div className="flex flex-col items-center mb-3 min-w-0 w-full">
        {isWinner && (
          <Crown className="w-7 h-7 sm:w-8 sm:h-8 mb-1 drop-shadow-[0_0_10px_rgba(255,216,77,0.7)]" style={{ color: m.top }} fill={m.top} />
        )}
        <div
          className={`flex items-center justify-center rounded-full font-black uppercase ${isWinner ? 'w-16 h-16 sm:w-20 sm:h-20 text-2xl sm:text-3xl' : 'w-12 h-12 sm:w-16 sm:h-16 text-lg sm:text-2xl'}`}
          style={{
            background: 'radial-gradient(circle at 30% 25%, #3b2a6b, #140c2e)',
            border: `4px solid ${m.ring}`,
            boxShadow: isWinner ? '0 0 0 3px #000, 0 0 28px rgba(255,216,77,0.55)' : '0 0 0 3px #000',
            color: m.top,
          }}
        >
          <span className="font-display">{row.name.charAt(0)}</span>
        </div>
        <div className={`mt-2 font-display font-extrabold text-white truncate max-w-full text-center ${isWinner ? 'text-base sm:text-xl' : 'text-sm sm:text-base'}`} title={row.name}>
          {row.name}
        </div>
        <div className={`font-mono font-black text-xs sm:text-sm ${positive ? 'text-emerald-400' : 'text-rose-400'}`}>{fmtPct(row.returnPct)}</div>
      </div>
      <div
        className={`w-full ${m.blockH} flex flex-col items-center justify-start pt-2 sm:pt-3 rounded-t-xl`}
        style={{
          background: `linear-gradient(180deg, ${m.top} 0%, ${m.fill} 35%, ${m.fill} 100%)`,
          border: '3px solid #000',
          borderBottom: 'none',
          boxShadow: 'inset 0 -12px 20px rgba(0,0,0,0.18)',
          color: m.ink,
        }}
      >
        <span className="font-display font-black leading-none text-3xl sm:text-5xl">{row.rank}</span>
        <span className="mt-1 font-mono font-black text-[11px] sm:text-sm whitespace-nowrap">{fmtUsd(row.payoutUsdc)}</span>
        <span className="font-mono font-bold text-[9px] sm:text-[10px] opacity-70 uppercase tracking-wider">USDC</span>
      </div>
    </div>
  );
}

export default function HallOfFame() {
  const [first, second, third] = SEASON_1_RESULTS;
  const rest = SEASON_1_RESULTS.slice(3);
  const chip = { background: 'rgba(255,255,255,0.06)', color: '#c4b5fd', border: '1px solid rgba(196,181,253,0.25)' };
  return (
    <div
      className="w-full overflow-hidden"
      style={{ borderRadius: 24, border: '4px solid #000', boxShadow: '10px 10px 0 0 #000', background: 'linear-gradient(180deg, #1a0b3d 0%, #120828 45%, #0b0618 100%)' }}
    >
      {/* Banner hero */}
      <div className="relative w-full aspect-[2/1] sm:aspect-[21/9] max-h-[22rem]" style={{ background: '#2a1060' }}>
        <img
          src="/season1-banner.png"
          alt="Season 1 trophy"
          className="absolute inset-0 w-full h-full object-cover object-center"
          onError={(e) => { (e.currentTarget as HTMLElement).style.display = 'none'; }}
        />
        <div className="absolute inset-x-0 bottom-0 h-1/2 pointer-events-none" style={{ background: 'linear-gradient(180deg, rgba(26,11,61,0) 0%, #1a0b3d 100%)' }} />
        <div className="absolute top-3 left-3 right-3 sm:top-4 sm:left-4 sm:right-4 flex justify-between items-start gap-2">
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] sm:text-[11px] font-black uppercase tracking-wider"
            style={{ background: 'rgba(0,0,0,0.55)', color: '#ffd84d', border: '1.5px solid rgba(255,216,77,0.6)', backdropFilter: 'blur(6px)' }}>
            <Trophy className="w-3.5 h-3.5" /> Concluded
          </span>
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] sm:text-[11px] font-black uppercase tracking-wider"
            style={{ background: '#10b981', color: '#022c22', border: '2px solid #000', boxShadow: '3px 3px 0 0 #000' }}>
            <Sparkles className="w-3.5 h-3.5" /> Season 2 coming soon
          </span>
        </div>
      </div>

      {/* Title */}
      <div className="relative -mt-10 sm:-mt-14 px-4 text-center">
        <h2 className="text-3xl sm:text-5xl font-black tracking-tight text-white drop-shadow-[0_3px_0_#000]">Hall of Fame</h2>
        <p className="mt-1 text-xs sm:text-sm text-violet-200/80">The first Round Trip rebalancing challenge · final standings locked</p>
        <div className="mt-3 flex flex-wrap justify-center gap-2 text-[10px] sm:text-[11px] font-mono font-bold uppercase tracking-wider">
          <span className="px-2.5 py-1 rounded-full" style={chip}>6 entrants</span>
          <span className="px-2.5 py-1 rounded-full" style={chip}>${SEASON_1_POOL_USDC} USDC pool</span>
          <span className="px-2.5 py-1 rounded-full" style={chip}>Baseline: {SEASON_1_BASELINE}</span>
        </div>
      </div>

      {/* Podium for top 3 */}
      <div className="mt-8 px-4 sm:px-8 max-w-2xl mx-auto">
        <div className="flex items-end justify-center gap-2 sm:gap-4 border-b-4 border-black pb-0">
          <PodiumColumn row={second} />
          <PodiumColumn row={first} />
          <PodiumColumn row={third} />
        </div>
      </div>

      {/* Rest of the field (ranks 4-6) */}
      <div className="mt-8 px-4 sm:px-8 pb-8 max-w-2xl mx-auto space-y-4">
        <div
          className="rounded-xl overflow-hidden"
          style={{
            background: 'rgba(255,255,255,0.03)',
            border: '2px solid rgba(196,181,253,0.15)',
          }}
        >
          <div
            className="px-4 py-2.5 text-[10px] sm:text-xs font-mono font-bold uppercase tracking-wider text-violet-300/70 border-b flex justify-between items-center"
            style={{ borderColor: 'rgba(196,181,253,0.1)' }}
          >
            <span>Rank &amp; Entrant</span>
            <div className="flex gap-6 sm:gap-10 pr-2">
              <span>Return</span>
              <span className="hidden sm:inline">Final Value</span>
              <span>Payout</span>
            </div>
          </div>
          <div className="divide-y" style={{ borderColor: 'rgba(196,181,253,0.08)' }}>
            {rest.map((row) => {
              const positive = row.returnPct >= 0;
              return (
                <div
                  key={row.name}
                  className="flex items-center justify-between px-4 py-3 gap-3 transition-colors hover:bg-white/[0.02]"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span
                      className="w-7 h-7 rounded-lg flex items-center justify-center font-display font-black text-xs shrink-0"
                      style={{
                        background: 'rgba(255,255,255,0.07)',
                        color: '#c4b5fd',
                        border: '1.5px solid rgba(196,181,253,0.2)',
                      }}
                    >
                      {row.rank}
                    </span>
                    <span className="font-display font-extrabold text-white text-sm truncate" title={row.name}>
                      {row.name}
                    </span>
                  </div>

                  <div className="flex items-center gap-4 sm:gap-8 shrink-0 font-mono text-xs sm:text-sm">
                    <span className={`font-black text-right w-16 ${positive ? 'text-emerald-400' : 'text-rose-400'}`}>
                      {fmtPct(row.returnPct)}
                    </span>
                    <span className="text-violet-200/60 hidden sm:inline text-right w-16">
                      {fmtUsd(row.finalValueUsd)}
                    </span>
                    <span
                      className="font-bold px-2.5 py-1 rounded-md text-violet-200 text-right"
                      style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(196,181,253,0.15)' }}
                    >
                      {fmtUsd(row.payoutUsdc)} <span className="text-[10px] opacity-70">USDC</span>
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Footer announcement */}
        <div className="pt-2 text-center text-xs font-mono text-violet-300/60">
          Season 2 coming soon — stay tuned.
        </div>
      </div>
    </div>
  );
}
