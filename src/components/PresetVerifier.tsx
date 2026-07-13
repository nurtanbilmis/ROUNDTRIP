import React, { useState, useEffect } from 'react';
import { ShieldAlert, CheckCircle2, AlertTriangle, XCircle, Loader2, ArrowRight } from 'lucide-react';
import { Preset } from '../presets';
import { Token, LinkGroup } from '../types';
import { verifyJupiterToken, fetchTokenLiquidity, MIN_LIQUIDITY_THRESHOLD } from '../jupiter';
import TokenLogo from './TokenLogo';

interface PresetVerifierProps {
  preset: Preset;
  groups: LinkGroup[];
  onApply: (tokens: Token[], conflictsToMove: { mint: string; symbol: string; groupId: string }[]) => void;
  onCancel: () => void;
}

interface VerificationState {
  token: Token | null;
  expectedSymbol: string;
  expectedMint: string;
  status: 'pending' | 'verified' | 'failed' | 'trusted_override';
  liquidity: number | null;
  loadingLiquidity: boolean;
  error?: string;
}

export default function PresetVerifier({ preset, groups, onApply, onCancel }: PresetVerifierProps) {
  const [verifications, setVerifications] = useState<VerificationState[]>([]);
  const [loading, setLoading] = useState(true);
  const [disclaimerAccepted, setDisclaimerAccepted] = useState(false);
  const [conflictAction, setConflictAction] = useState<'move' | 'exclude'>('move');

  useEffect(() => {
    let active = true;

    async function runVerification() {
      setLoading(true);
      
      const isSandbox = localStorage.getItem('roundtrip_demo_active') === 'true';
      const allowManualTrust = localStorage.getItem('roundtrip_manual_trust') === 'true';

      // Initialize states
      const initialStates: VerificationState[] = preset.tokens.map(t => ({
        token: null,
        expectedSymbol: t.symbol,
        expectedMint: t.expectedMint,
        status: 'pending',
        liquidity: null,
        loadingLiquidity: true,
      }));
      setVerifications(initialStates);

      const verifiedResults: VerificationState[] = [];

      for (const t of preset.tokens) {
        if (!active) return;
        try {
          let resolvedToken: Token | null = null;
          let isOverridden = false;

          // Attempt real verification first even in sandbox to get accurate decimals & metadata
          resolvedToken = await verifyJupiterToken(t.expectedMint);

          if (!resolvedToken) {
            if (isSandbox || allowManualTrust) {
              // Resolve decimals accurately based on known preset tokens
              let decimals = 9; // fallback
              const sym = t.symbol.toUpperCase();
              if (
                sym === 'PAXG' || 
                sym === 'SPYX' || 
                sym === 'QQQX' || 
                sym === 'USDC' || 
                sym === 'USDT' || 
                sym === 'JUP' || 
                sym.endsWith('X')
              ) {
                decimals = 6;
              } else if (sym === 'CBBTC' || sym === 'ETH') {
                decimals = 8;
              }
              resolvedToken = {
                address: t.expectedMint,
                symbol: t.symbol,
                name: isSandbox ? t.symbol : `${t.symbol} (Trusted)`,
                decimals,
              };
              if (!isSandbox) {
                isOverridden = true;
              }
            }
          }

          if (resolvedToken) {
            // Fetch liquidity
            const rawLiq = await fetchTokenLiquidity(t.expectedMint);
            const liq = rawLiq > 0 ? rawLiq : null;
            verifiedResults.push({
              token: resolvedToken,
              expectedSymbol: t.symbol,
              expectedMint: t.expectedMint,
              status: isOverridden ? 'trusted_override' : 'verified',
              liquidity: liq,
              loadingLiquidity: false,
            });
          } else {
            // Verification failed
            verifiedResults.push({
              token: null,
              expectedSymbol: t.symbol,
              expectedMint: t.expectedMint,
              status: 'failed',
              liquidity: null,
              loadingLiquidity: false,
              error: `Jupiter Tokens API could not verify mint ${t.expectedMint}.`,
            });
          }
        } catch (err: any) {
          verifiedResults.push({
            token: null,
            expectedSymbol: t.symbol,
            expectedMint: t.expectedMint,
            status: 'failed',
            liquidity: null,
            loadingLiquidity: false,
            error: err?.message || 'Verification failed due to API timeout.',
          });
        }

        // Incremental update so the user sees progress in real-time
        if (active) {
          setVerifications([...verifiedResults, ...initialStates.slice(verifiedResults.length)]);
        }
      }

      if (active) {
        setLoading(false);
      }
    }

    runVerification();

    return () => {
      active = false;
    };
  }, [preset]);

  const allVerified = verifications.every(v => v.status === 'verified' || v.status === 'trusted_override');
  const anyFailed = verifications.some(v => v.status === 'failed');

  // Conflict Checking
  const getConflictingTokens = () => {
    const list: { mint: string; symbol: string; groupName: string; groupId: string }[] = [];
    preset.tokens.forEach((pt) => {
      groups.forEach((g) => {
        if (g.memberMints.includes(pt.expectedMint)) {
          list.push({
            mint: pt.expectedMint,
            symbol: pt.symbol,
            groupName: g.name,
            groupId: g.id,
          });
        }
      });
    });
    return list;
  };

  const conflicts = getConflictingTokens();
  const hasConflicts = conflicts.length > 0;

  const handleApply = () => {
    if (!allVerified || !disclaimerAccepted) return;
    let tokens = verifications.map(v => v.token!).filter(Boolean);
    
    if (hasConflicts && conflictAction === 'exclude') {
      const conflictingMints = conflicts.map(c => c.mint);
      tokens = tokens.filter(t => !conflictingMints.includes(t.address));
    }
    
    onApply(
      tokens,
      hasConflicts && conflictAction === 'move' ? conflicts : []
    );
  };

  return (
    <div id="preset-verification-modal" className="fixed inset-0 bg-slate-950/90 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden shadow-2xl animate-in fade-in zoom-in duration-200">
        
        {/* Header */}
        <div className="p-6 border-b border-slate-800 flex items-center justify-between bg-slate-900">
          <div>
            <div className="flex items-center gap-2">
              <span className={`text-[10px] uppercase font-mono px-2 py-0.5 rounded-full border ${
                preset.riskLabel === 'Safe' 
                  ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' 
                  : preset.riskLabel.includes('High')
                  ? 'bg-rose-500/10 text-rose-400 border-rose-500/20'
                  : 'bg-amber-500/10 text-amber-400 border-amber-500/20'
              }`}>
                {preset.riskLabel} Risk
              </span>
              <h3 className="text-xl font-extrabold text-white tracking-tight">
                Verify Preset: {preset.name}
              </h3>
            </div>
            <p className="text-xs text-slate-400 mt-1">{preset.description}</p>
          </div>
          <button
            onClick={onCancel}
            className="text-slate-400 hover:text-white bg-slate-850 hover:bg-slate-800 p-2 rounded-lg transition-all cursor-pointer"
          >
            ✕
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="flex-grow overflow-y-auto p-6 space-y-6">
          
          {/* Safety Verification Warning */}
          <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 flex gap-3 text-xs text-slate-300">
            <ShieldAlert className="w-5 h-5 text-emerald-400 flex-shrink-0" />
            <div>
              <strong className="text-white block mb-0.5 font-bold">Safety-Critical Guardrail Active</strong>
              This application strictly matches user-defined expected mint addresses against Jupiter\'s verified token index. Spoofed or malicious mints are automatically detected and blocked to protect your funds.
            </div>
          </div>

          {/* Tokens Status Table */}
          <div className="space-y-3">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-500">Asset Verification Summary ({preset.tokens.length} Assets)</h4>
            
            <div className="space-y-2.5">
              {verifications.map((v) => (
                <div
                  key={v.expectedMint}
                  className={`p-4 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-4 transition-all ${
                    v.status === 'verified'
                      ? 'bg-slate-950/40 border-slate-800'
                      : v.status === 'trusted_override'
                      ? 'bg-amber-500/5 border-amber-500/20 shadow-sm'
                      : v.status === 'failed'
                      ? 'bg-rose-500/5 border-rose-500/20 shadow-sm'
                      : 'bg-slate-900 border-slate-850 animate-pulse'
                  }`}
                >
                  {/* Left block: Icon and info */}
                  <div className="flex items-center gap-3.5 min-w-0">
                    <TokenLogo logoURI={v.token?.logoURI || undefined} symbol={v.expectedSymbol} size="md" />
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-extrabold text-white text-sm">{v.expectedSymbol}</span>
                        {v.token && v.token.symbol !== v.expectedSymbol && (
                          <span className="text-[10px] bg-slate-800 text-slate-400 px-1.5 py-0.5 rounded-full">
                            Resolved: {v.token.symbol}
                          </span>
                        )}
                      </div>
                      <p className="font-mono text-[9px] text-slate-500 truncate mt-0.5">
                        {v.expectedMint}
                      </p>
                    </div>
                  </div>

                  {/* Right block: Status and Liquidity */}
                  <div className="flex items-center sm:justify-end gap-4 min-w-[150px] text-right sm:text-right">
                    <div className="space-y-1 w-full flex sm:flex-col justify-between sm:justify-start items-center sm:items-end gap-2 sm:gap-0">
                      
                      {/* Verification Status */}
                      <div>
                        {v.status === 'pending' && (
                          <span className="text-xs text-amber-500 flex items-center gap-1.5 font-semibold">
                            <Loader2 className="w-3.5 h-3.5 animate-spin text-amber-500" />
                            Verifying...
                          </span>
                        )}
                        {v.status === 'verified' && (
                          <span className="text-xs text-emerald-400 flex items-center gap-1.5 font-semibold">
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            Verified
                          </span>
                        )}
                        {v.status === 'trusted_override' && (
                          <span className="text-xs text-amber-500 flex items-center gap-1.5 font-semibold" title="Unverified by Jupiter, trusted via Developer manual override">
                            <AlertTriangle className="w-3.5 h-3.5" />
                            Manual Trust
                          </span>
                        )}
                        {v.status === 'failed' && (
                          <span className="text-xs text-rose-400 flex items-center gap-1.5 font-semibold">
                            <XCircle className="w-3.5 h-3.5" />
                            Unverified
                          </span>
                        )}
                      </div>

                      {/* Liquidity Check */}
                      {(v.status === 'verified' || v.status === 'trusted_override') && (
                        <div className="text-xs">
                          {v.loadingLiquidity ? (
                            <span className="text-[10px] text-slate-500 animate-pulse">Checking liquidity...</span>
                          ) : (
                            <div className="flex flex-col items-start sm:items-end">
                              <span className="text-slate-400 text-[10px] uppercase font-bold tracking-tighter">
                                DEX Liquidity
                              </span>
                              {v.liquidity === null ? (
                                <span className="text-amber-500 font-semibold text-xs">
                                  liquidity unknown
                                </span>
                              ) : (
                                <span className={`font-mono text-xs font-bold ${v.liquidity >= MIN_LIQUIDITY_THRESHOLD ? 'text-white' : 'text-amber-400'}`}>
                                  ${v.liquidity.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Conflicts Warning */}
          {allVerified && hasConflicts && (
            <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-4 space-y-3">
              <h5 className="text-xs font-extrabold text-amber-400 uppercase flex items-center gap-1.5">
                <AlertTriangle className="w-4 h-4" />
                Coin Conflict Detected
              </h5>
              <div className="text-xs text-slate-300 space-y-2">
                <p>
                  Some tokens in this preset are <strong>already linked</strong> to another Link-Group:
                </p>
                <div className="p-3 bg-slate-950 rounded-lg space-y-1 text-[11px] font-mono text-amber-300">
                  {conflicts.map((c) => (
                    <div key={`${c.mint}-${c.groupId}`}>
                      • {c.symbol} is currently in <strong className="text-white">{c.groupName}</strong>
                    </div>
                  ))}
                </div>
                <p className="mt-2 text-slate-300">Choose how you want to handle these conflicts:</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                  <button
                    type="button"
                    onClick={() => setConflictAction('move')}
                    className={`p-3 rounded-lg border text-left transition-all ${
                      conflictAction === 'move'
                        ? 'bg-emerald-500/10 border-emerald-500/50 text-white shadow-sm'
                        : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-white'
                    }`}
                  >
                    <div className="font-bold text-xs">Move Coins</div>
                    <div className="text-[10px] text-slate-400 mt-1">
                      Remove them from their old groups and link them to this new group.
                    </div>
                  </button>
                  <button
                    type="button"
                    onClick={() => setConflictAction('exclude')}
                    className={`p-3 rounded-lg border text-left transition-all ${
                      conflictAction === 'exclude'
                        ? 'bg-emerald-500/10 border-emerald-500/50 text-white shadow-sm'
                        : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-white'
                    }`}
                  >
                    <div className="font-bold text-xs">Exclude Coins</div>
                    <div className="text-[10px] text-slate-400 mt-1">
                      Create this group without those coins, keeping them in their old groups.
                    </div>
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Low Liquidity Warns */}
          {allVerified && verifications.some(v => v.liquidity !== null && v.liquidity < MIN_LIQUIDITY_THRESHOLD) && (
            <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-4 space-y-2">
              <h5 className="text-xs font-extrabold text-amber-400 uppercase flex items-center gap-1.5">
                <AlertTriangle className="w-4 h-4" />
                DEX Liquidity Warning
              </h5>
              <div className="space-y-1.5 text-xs text-slate-300 leading-normal">
                <p>
                  The following assets in this preset have a live market liquidity below the standard{' '}
                  <strong className="text-amber-400">${MIN_LIQUIDITY_THRESHOLD.toLocaleString()}</strong> safety threshold:
                </p>
                <ul className="list-disc list-inside space-y-1 font-mono text-[11px] text-amber-400 pl-2">
                  {verifications.filter(v => v.liquidity !== null && v.liquidity < MIN_LIQUIDITY_THRESHOLD).map(v => (
                    <li key={v.expectedMint}>
                      {v.expectedSymbol}: ${v.liquidity!.toLocaleString(undefined, { maximumFractionDigits: 0 })} liquidity on Solana DEXs
                    </li>
                  ))}
                </ul>
                <p className="text-[11px] text-slate-400 mt-1 italic leading-relaxed">
                  Low-liquidity assets might cause higher slippage on larger swaps. You can still proceed with paper testing (sandbox) or connect with small amounts.
                </p>
              </div>
            </div>
          )}

          {/* Verification Failed Box */}
          {anyFailed && (
            <div className="bg-rose-500/10 border border-rose-500/20 rounded-xl p-4 space-y-2">
              <h5 className="text-xs font-bold text-rose-400 uppercase flex items-center gap-1.5">
                <XCircle className="w-4 h-4 text-rose-400" />
                Preset Disabled
              </h5>
              <p className="text-xs text-slate-300 leading-relaxed">
                One or more assets in this preset could not be verified on the official Jupiter Tokens registry. This preset is disabled to protect against routing funds into spoofed or unverified contracts.
              </p>
              <div className="p-3 bg-slate-950 rounded-lg text-slate-400 font-mono text-[10px] leading-relaxed">
                {verifications.filter(v => v.status === 'failed').map(v => (
                  <div key={v.expectedMint} className="text-rose-400">
                    • {v.expectedSymbol}: {v.error}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Overridden Tokens Warning */}
          {allVerified && verifications.some(v => v.status === 'trusted_override') && (
            <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-4 space-y-2">
              <h5 className="text-xs font-bold text-amber-400 uppercase flex items-center gap-1.5">
                <AlertTriangle className="w-4 h-4 text-amber-400" />
                Developer Overrides Active
              </h5>
              <p className="text-xs text-slate-300 leading-relaxed">
                The following tokens failed official verification on Jupiter's registry, but have been trusted via your <strong>Developer manual-trust override</strong> setting. Proceed with caution.
              </p>
              <div className="p-3 bg-slate-950 rounded-lg text-slate-400 font-mono text-[10px] leading-relaxed">
                {verifications.filter(v => v.status === 'trusted_override').map(v => (
                  <div key={v.expectedMint} className="text-amber-400">
                    • {v.expectedSymbol}: {v.expectedMint} (Manual Trust)
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Risk Note Card */}
          <div className="bg-slate-950 border border-slate-850 rounded-xl p-5 space-y-3">
            <h5 className="text-xs font-bold text-white uppercase tracking-wider">Strategy Risk Briefing</h5>
            <p className="text-xs text-slate-400 leading-relaxed font-sans">{preset.riskNote}</p>
          </div>

          {/* User Acceptance Check */}
          {allVerified && (
            <label className="flex items-start gap-3 p-3 bg-slate-950 border border-slate-800 rounded-xl cursor-pointer hover:border-slate-700 transition-all">
              <input
                type="checkbox"
                checked={disclaimerAccepted}
                onChange={(e) => setDisclaimerAccepted(e.target.checked)}
                className="mt-0.5 rounded border-slate-700 bg-slate-900 text-emerald-500 focus:ring-emerald-500/50 w-4 h-4 cursor-pointer"
              />
              <span className="text-xs text-slate-300 select-none leading-relaxed">
                I understand that this rebalancer is <strong>non-custodial</strong> and maintains target weights purely by performing market trades that I approve and sign. If any asset in this basket fails or trends to zero, the rebalancer will bleed the other healthy assets to acquire it.
              </span>
            </label>
          )}

        </div>

        {/* Footer */}
        <div className="p-4 bg-slate-900 border-t border-slate-800 flex justify-end gap-3">
          <button
            onClick={onCancel}
            className="px-5 py-2.5 bg-slate-850 hover:bg-slate-800 text-white rounded-lg text-xs font-semibold transition-all cursor-pointer"
          >
            Cancel
          </button>
          <button
            onClick={handleApply}
            disabled={!allVerified || !disclaimerAccepted}
            className={`px-5 py-2.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 shadow-md ${
              allVerified && disclaimerAccepted
                ? 'bg-emerald-500 text-slate-950 hover:bg-emerald-400 cursor-pointer'
                : 'bg-slate-800 text-slate-500 cursor-not-allowed'
            }`}
          >
            Apply Preset Allocation
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>

      </div>
    </div>
  );
}
