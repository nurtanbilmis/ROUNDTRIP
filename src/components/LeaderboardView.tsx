import React, { useState, useEffect, useCallback } from 'react';
import { Connection, PublicKey } from '@solana/web3.js';
import { TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID } from '@solana/spl-token';
import { fetchPricesAndInfo } from '../jupiter';
import {
  COMPETITION_ENTRANTS,
  COMPETITION_BASELINE_SOL,
  COMPETITION_START_USD_BASELINE,
  COMPETITION_META,
  CompetitionEntrant,
} from '../competition';
import { Trophy, RefreshCw, AlertTriangle, ExternalLink, Sparkles, CheckCircle2 } from 'lucide-react';

interface LeaderboardViewProps {
  rpcUrl: string;
}

export interface TokenBalanceInfo {
  amount: number;
  decimals: number;
}

interface EntrantRow {
  address: string;
  label?: string;
  status: 'loading' | 'ok' | 'error';
  errorMessage?: string;
  rawBalances?: Record<string, TokenBalanceInfo>;
  usdValue?: number;
  solValue?: number;
  solPct?: number;
  usdPct?: number | null;
}

const WSOL_MINT = 'So11111111111111111111111111111111111111112';

async function fetchWalletBalances(address: string, rpcUrl: string): Promise<Record<string, TokenBalanceInfo>> {
  const connection = new Connection(rpcUrl, 'confirmed');
  const pubkey = new PublicKey(address);
  const balances: Record<string, TokenBalanceInfo> = {};

  // 1. SOL
  const lamports = await connection.getBalance(pubkey);
  balances[WSOL_MINT] = { amount: lamports, decimals: 9 };

  // 2. Legacy SPL Tokens
  const tokenAccounts = await connection.getParsedTokenAccountsByOwner(pubkey, {
    programId: TOKEN_PROGRAM_ID,
  });
  for (const account of tokenAccounts.value) {
    const info = account.account.data.parsed.info;
    const mint = info.mint;
    const amount = parseInt(info.tokenAmount.amount, 10);
    const decimals = typeof info.tokenAmount.decimals === 'number' ? info.tokenAmount.decimals : 9;
    if (!isNaN(amount) && amount > 0) {
      if (balances[mint]) {
        balances[mint].amount += amount;
      } else {
        balances[mint] = { amount, decimals };
      }
    }
  }

  // 3. Token-2022 Accounts
  try {
    const token2022Accounts = await connection.getParsedTokenAccountsByOwner(pubkey, {
      programId: TOKEN_2022_PROGRAM_ID,
    });
    for (const account of token2022Accounts.value) {
      const info = account.account.data.parsed.info;
      const mint = info.mint;
      const amount = parseInt(info.tokenAmount.amount, 10);
      const decimals = typeof info.tokenAmount.decimals === 'number' ? info.tokenAmount.decimals : 9;
      if (!isNaN(amount) && amount > 0) {
        if (balances[mint]) {
          balances[mint].amount += amount;
        } else {
          balances[mint] = { amount, decimals };
        }
      }
    }
  } catch (err) {
    console.warn(`Failed to fetch Token-2022 accounts for ${address}:`, err);
  }

  return balances;
}

export const LeaderboardView: React.FC<LeaderboardViewProps> = ({ rpcUrl }) => {
  const [viewMode, setViewMode] = useState<'SOL' | 'USD'>('SOL');
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [entrants, setEntrants] = useState<EntrantRow[]>([]);

  // Helper to calculate valuation for all ok entrants given their raw balances
  const calculateValuations = useCallback(
    async (
      currentEntrants: EntrantRow[]
    ): Promise<EntrantRow[]> => {
      // 1. Build union of all mints across all ok entrants
      const mintSet = new Set<string>();
      for (const entrant of currentEntrants) {
        if (entrant.status === 'ok' && entrant.rawBalances) {
          for (const mint of Object.keys(entrant.rawBalances)) {
            mintSet.add(mint);
          }
        }
      }

      const allMints = Array.from(mintSet);
      if (allMints.length === 0) {
        return currentEntrants;
      }

      // 2. Fetch prices for all mints (chunked in fetchPricesAndInfo)
      const priceMap = await fetchPricesAndInfo(allMints);
      const solPrice = priceMap[WSOL_MINT]?.price || 0;

      // 3. Compute metrics for each entrant using on-chain decimals
      return currentEntrants.map((entrant) => {
        if (entrant.status !== 'ok' || !entrant.rawBalances) {
          return entrant;
        }

        let usdValue = 0;
        for (const [mint, info] of Object.entries(entrant.rawBalances)) {
          const price = priceMap[mint]?.price || 0;
          const amountHuman = info.amount / Math.pow(10, info.decimals);
          usdValue += amountHuman * price;
        }

        const solValue = solPrice > 0 ? usdValue / solPrice : 0;
        const solPct = (solValue / COMPETITION_BASELINE_SOL - 1) * 100;
        const usdPct =
          COMPETITION_START_USD_BASELINE != null && COMPETITION_START_USD_BASELINE > 0
            ? (usdValue / COMPETITION_START_USD_BASELINE - 1) * 100
            : null;

        return {
          ...entrant,
          usdValue,
          solValue,
          solPct,
          usdPct,
        };
      });
    },
    []
  );

  // Full load flow for all entrants
  const loadAll = useCallback(async () => {
    setRefreshing(true);

    const initialRows: EntrantRow[] = COMPETITION_ENTRANTS.map((e) => ({
      address: e.address,
      label: e.label,
      status: 'loading',
    }));

    // Read balances for each entrant concurrently
    const balanceResults = await Promise.allSettled(
      COMPETITION_ENTRANTS.map((e) => fetchWalletBalances(e.address, rpcUrl))
    );

    const rowsWithBalances: EntrantRow[] = initialRows.map((row, idx) => {
      const res = balanceResults[idx];
      if (res.status === 'fulfilled') {
        return {
          ...row,
          status: 'ok',
          rawBalances: res.value,
        };
      } else {
        const err = res.reason;
        return {
          ...row,
          status: 'error',
          errorMessage: err?.message || 'Failed to read wallet balances',
        };
      }
    });

    const finalRows = await calculateValuations(rowsWithBalances);
    setEntrants(finalRows);
    setLastUpdated(new Date());
    setLoading(false);
    setRefreshing(false);
  }, [rpcUrl, calculateValuations]);

  // Initial load
  useEffect(() => {
    loadAll();
  }, [loadAll]);

  // Retry single entrant
  const retrySingleEntrant = async (address: string) => {
    setEntrants((prev) =>
      prev.map((e) => (e.address === address ? { ...e, status: 'loading', errorMessage: undefined } : e))
    );

    let updatedRow: EntrantRow;
    try {
      const balances = await fetchWalletBalances(address, rpcUrl);
      const entrantDef = COMPETITION_ENTRANTS.find((e) => e.address === address);
      updatedRow = {
        address,
        label: entrantDef?.label,
        status: 'ok',
        rawBalances: balances,
      };
    } catch (err: any) {
      const entrantDef = COMPETITION_ENTRANTS.find((e) => e.address === address);
      updatedRow = {
        address,
        label: entrantDef?.label,
        status: 'error',
        errorMessage: err?.message || 'Failed to read wallet balances',
      };
    }

    setEntrants((prev) => {
      const next = prev.map((e) => (e.address === address ? updatedRow : e));
      // Re-run valuations asynchronously
      calculateValuations(next).then((valRows) => setEntrants(valRows));
      return next;
    });
  };

  // Determine if USD view is valid
  const isUsdBaselineAvailable =
    COMPETITION_START_USD_BASELINE != null && COMPETITION_START_USD_BASELINE > 0;
  const isUsdSortingActive = viewMode === 'USD' && isUsdBaselineAvailable;

  // Sorted entrants
  const sortedEntrants = [...entrants].sort((a, b) => {
    if (a.status === 'ok' && b.status !== 'ok') return -1;
    if (a.status !== 'ok' && b.status === 'ok') return 1;
    if (a.status !== 'ok' && b.status !== 'ok') return 0;

    if (isUsdSortingActive) {
      const valA = a.usdPct ?? -Infinity;
      const valB = b.usdPct ?? -Infinity;
      return valB - valA;
    } else {
      const valA = a.solPct ?? -Infinity;
      const valB = b.solPct ?? -Infinity;
      return valB - valA;
    }
  });

  const hasMetaFields =
    Boolean(COMPETITION_META.title) ||
    Boolean(COMPETITION_META.subtitle) ||
    Boolean(COMPETITION_META.startLabel) ||
    Boolean(COMPETITION_META.endLabel) ||
    Boolean(COMPETITION_META.poolLabel);

  return (
    <div className="space-y-6 w-full">
      {/* Rules & Meta Banner if title/metadata is present */}
      {hasMetaFields && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl relative overflow-hidden">
          <div className="absolute top-0 right-0 w-48 h-48 bg-amber-500/5 blur-3xl rounded-full pointer-events-none" />
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 relative z-10">
            <div>
              {COMPETITION_META.title && (
                <h2 className="text-xl font-extrabold text-white flex items-center gap-2">
                  <Trophy className="w-5 h-5 text-amber-400" />
                  {COMPETITION_META.title}
                </h2>
              )}
              {COMPETITION_META.subtitle && (
                <p className="text-xs text-slate-400 mt-1">{COMPETITION_META.subtitle}</p>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2 text-[11px] font-mono">
              {COMPETITION_META.startLabel && (
                <span className="bg-slate-950 border border-slate-800 px-3 py-1 rounded-lg text-slate-300">
                  Start: <span className="text-white font-bold">{COMPETITION_META.startLabel}</span>
                </span>
              )}
              {COMPETITION_META.endLabel && (
                <span className="bg-slate-950 border border-slate-800 px-3 py-1 rounded-lg text-slate-300">
                  End: <span className="text-white font-bold">{COMPETITION_META.endLabel}</span>
                </span>
              )}
              {COMPETITION_META.poolLabel && (
                <span className="bg-amber-500/10 border border-amber-500/30 px-3 py-1 rounded-lg text-amber-400 font-bold">
                  Pool: {COMPETITION_META.poolLabel}
                </span>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Main Leaderboard Card */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-2xl space-y-4">
        {/* Controls Bar */}
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-800 pb-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-amber-500/10 text-amber-400 rounded-xl border border-amber-500/20">
              <Trophy className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-extrabold text-white text-base flex items-center gap-2">
                Competition Leaderboard
              </h3>
              <div className="flex items-center gap-2 text-xs text-slate-400 mt-0.5">
                <span>Baseline: {COMPETITION_BASELINE_SOL} SOL per entrant</span>
                {lastUpdated && (
                  <>
                    <span>•</span>
                    <span className="text-[11px] font-mono">
                      Updated {lastUpdated.toLocaleTimeString()}
                    </span>
                  </>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* View Switch Toggle */}
            <div className="flex items-center bg-slate-950 p-1 rounded-xl border border-slate-800">
              <button
                onClick={() => setViewMode('SOL')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  viewMode === 'SOL'
                    ? 'bg-amber-500 text-slate-950 shadow-md'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                SOL View
              </button>
              <button
                onClick={() => setViewMode('USD')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  viewMode === 'USD'
                    ? 'bg-amber-500 text-slate-950 shadow-md'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                USD View
              </button>
            </div>

            {/* Refresh Button */}
            <button
              onClick={() => loadAll()}
              disabled={refreshing}
              className="bg-slate-800 hover:bg-slate-750 text-slate-200 border border-slate-700 px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition-all cursor-pointer disabled:opacity-50"
              title="Re-read balances and fetch live prices"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin text-amber-400' : ''}`} />
              Refresh
            </button>
          </div>
        </div>

        {/* Notice when USD baseline is not set */}
        {viewMode === 'USD' && !isUsdBaselineAvailable && (
          <div className="bg-slate-950/80 border border-slate-800 text-slate-400 text-xs px-3.5 py-2 rounded-xl flex items-center gap-2">
            <Sparkles className="w-3.5 h-3.5 text-amber-400 shrink-0" />
            <span>USD baseline not set yet. Displaying live USD values while sorting by SOL gain.</span>
          </div>
        )}

        {/* Loading State */}
        {loading ? (
          <div className="py-16 text-center space-y-3">
            <RefreshCw className="w-8 h-8 animate-spin text-amber-400 mx-auto" />
            <p className="text-sm text-slate-400 font-medium">Reading entrant balances on-chain...</p>
          </div>
        ) : sortedEntrants.length === 0 ? (
          <div className="py-12 text-center text-slate-500 text-sm italic">
            No competition entrants configured.
          </div>
        ) : (
          /* Entrants Table */
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-800 text-[10px] font-extrabold uppercase tracking-wider text-slate-500">
                  <th className="py-3 px-3 w-12 text-center">Rank</th>
                  <th className="py-3 px-3">Entrant</th>
                  <th className="py-3 px-3 text-right">SOL Balance</th>
                  <th className="py-3 px-3 text-right">USD Value</th>
                  <th className="py-3 px-3 text-right">Return / Performance</th>
                  <th className="py-3 px-3 text-center w-20">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 text-xs">
                {sortedEntrants.map((entrant, idx) => {
                  const isOk = entrant.status === 'ok';
                  const rankNum = idx + 1;
                  const isTop3 = isOk && rankNum <= 3;

                  const solPct = entrant.solPct ?? 0;
                  const usdPct = entrant.usdPct;

                  // Active metric determination
                  const primaryPct = isUsdSortingActive ? usdPct : solPct;
                  const secondaryPct = isUsdSortingActive ? solPct : usdPct;

                  const primaryIsPositive = primaryPct != null && primaryPct > 0;
                  const primaryIsNegative = primaryPct != null && primaryPct < 0;

                  return (
                    <tr
                      key={entrant.address}
                      className="hover:bg-slate-850/50 transition-colors group"
                    >
                      {/* Rank */}
                      <td className="py-3.5 px-3 text-center font-mono font-bold">
                        {isTop3 ? (
                          <span
                            className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-black ${
                              rankNum === 1
                                ? 'bg-amber-400 text-slate-950 shadow-md shadow-amber-400/20'
                                : rankNum === 2
                                ? 'bg-slate-300 text-slate-950'
                                : 'bg-amber-700/80 text-amber-100'
                            }`}
                          >
                            {rankNum}
                          </span>
                        ) : (
                          <span className="text-slate-500">{isOk ? rankNum : '...'}</span>
                        )}
                      </td>

                      {/* Entrant Info */}
                      <td className="py-3.5 px-3">
                        <div className="flex items-center gap-2">
                          <div>
                            {entrant.label ? (
                              <div className="font-bold text-white text-sm">{entrant.label}</div>
                            ) : null}
                            <a
                              href={`https://solscan.io/account/${entrant.address}`}
                              target="_blank"
                              rel="noreferrer"
                              className="font-mono text-[11px] text-slate-400 hover:text-amber-400 flex items-center gap-1 transition-colors"
                            >
                              {entrant.address.slice(0, 4)}...{entrant.address.slice(-4)}
                              <ExternalLink className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity" />
                            </a>
                          </div>
                        </div>
                      </td>

                      {/* SOL Balance */}
                      <td className="py-3.5 px-3 text-right font-mono">
                        {isOk && entrant.solValue !== undefined ? (
                          <div className={`font-bold ${viewMode === 'SOL' ? 'text-white text-sm' : 'text-slate-400 text-xs'}`}>
                            {entrant.solValue.toLocaleString(undefined, {
                              minimumFractionDigits: 3,
                              maximumFractionDigits: 4,
                            })}{' '}
                            <span className="text-[10px] text-slate-500 font-sans">SOL</span>
                          </div>
                        ) : (
                          <span className="text-slate-600">-</span>
                        )}
                      </td>

                      {/* USD Value */}
                      <td className="py-3.5 px-3 text-right font-mono">
                        {isOk && entrant.usdValue !== undefined ? (
                          <div className={`font-bold ${viewMode === 'USD' ? 'text-white text-sm' : 'text-slate-400 text-xs'}`}>
                            $
                            {entrant.usdValue.toLocaleString(undefined, {
                              minimumFractionDigits: 2,
                              maximumFractionDigits: 2,
                            })}
                          </div>
                        ) : (
                          <span className="text-slate-600">-</span>
                        )}
                      </td>

                      {/* Performance Percentage */}
                      <td className="py-3.5 px-3 text-right font-mono">
                        {isOk && primaryPct != null ? (
                          <div className="flex flex-col items-end">
                            {/* Primary metric badge */}
                            <span
                              className={`font-black text-sm ${
                                primaryIsPositive
                                  ? 'text-emerald-400'
                                  : primaryIsNegative
                                  ? 'text-rose-400'
                                  : 'text-slate-400'
                              }`}
                            >
                              {primaryIsPositive ? '+' : ''}
                              {primaryPct.toFixed(2)}%
                            </span>

                            {/* Secondary metric label */}
                            {secondaryPct != null && (
                              <span className="text-[10px] text-slate-500 mt-0.5">
                                {isUsdSortingActive ? 'SOL return: ' : 'USD return: '}
                                <span
                                  className={
                                    secondaryPct > 0
                                      ? 'text-emerald-500/90 font-medium'
                                      : secondaryPct < 0
                                      ? 'text-rose-500/90 font-medium'
                                      : 'text-slate-500'
                                  }
                                >
                                  {secondaryPct > 0 ? '+' : ''}
                                  {secondaryPct.toFixed(2)}%
                                </span>
                              </span>
                            )}
                          </div>
                        ) : entrant.status === 'error' ? (
                          <span className="text-rose-400 text-xs italic">
                            {entrant.errorMessage || 'Error reading balance'}
                          </span>
                        ) : (
                          <span className="text-slate-600">-</span>
                        )}
                      </td>

                      {/* Status / Actions */}
                      <td className="py-3.5 px-3 text-center">
                        {entrant.status === 'loading' ? (
                          <RefreshCw className="w-4 h-4 animate-spin text-amber-400 mx-auto" />
                        ) : entrant.status === 'error' ? (
                          <button
                            onClick={() => retrySingleEntrant(entrant.address)}
                            className="bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/30 px-2 py-1 rounded-md text-[10px] font-bold transition-all cursor-pointer flex items-center gap-1 mx-auto"
                            title="Retry balance read for this entrant"
                          >
                            <AlertTriangle className="w-3 h-3" />
                            Retry
                          </button>
                        ) : (
                          <span className="inline-flex items-center text-emerald-400" title="Balance verified">
                            <CheckCircle2 className="w-4 h-4" />
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default LeaderboardView;
