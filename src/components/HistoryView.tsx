import React, { useState } from 'react';
import { Trash2, Activity, ChevronDown, Award } from 'lucide-react';
import { BalanceSnapshot, Token, TokenBalance, LinkGroup, getGroupColorClasses } from '../types';
import ScoreboardView from './ScoreboardView';
import ConfirmModal from './ConfirmModal';

interface HistoryViewProps {
  groups: LinkGroup[];
  snapshots: BalanceSnapshot[];
  allBalances: Record<string, number>;
  tokenMetadata: Record<string, Token>;
  prices: Record<string, { price: number; change24h: number }>;
  onClearHistory: () => void;
}

export default function HistoryView({
  groups,
  snapshots,
  allBalances,
  tokenMetadata,
  prices,
  onClearHistory,
}: HistoryViewProps) {
  // 1. Set first group as selected by default if any exist
  const [selectedGroupId, setSelectedGroupId] = useState<string>(
    groups[0]?.id || ''
  );
  const [showClearConfirm, setShowClearConfirm] = useState(false);

  // If previous selected group was deleted or none selected but groups exist, fall back to first group
  const activeGroup = groups.find((g) => g.id === selectedGroupId) || groups[0];

  // Map other token details and calculate balances scoped to this group
  const getGroupBalances = (group: LinkGroup): TokenBalance[] => {
    const members = group.memberMints;
    if (members.length === 0) return [];

    return members.map((mint) => {
      const meta = tokenMetadata[mint] || { address: mint, symbol: mint.substring(0, 4), name: 'Unknown Token', decimals: 9 };
      const priceInfo = prices[mint] || { price: 0, change24h: 0 };
      const rawBalance = allBalances[mint] || 0;
      const decimals = typeof meta.decimals === 'number' ? meta.decimals : 9;
      const amountHuman = rawBalance / Math.pow(10, decimals);
      const usdValue = amountHuman * priceInfo.price;

      return {
        mint,
        symbol: meta.symbol,
        decimals: decimals,
        amount: rawBalance,
        amountHuman,
        price: priceInfo.price,
        usdValue,
        currentWeight: 0,
        targetWeight: 0,
        drift: 0,
      };
    });
  };

  const hasGroups = groups.length > 0;
  const groupColors = activeGroup ? getGroupColorClasses(activeGroup.color) : null;
  const groupSnapshots = activeGroup ? snapshots.filter((s) => s.groupId === activeGroup.id) : [];

  return (
    <div id="history-view" className="space-y-6 animate-in fade-in duration-300">
      
      {/* Top Banner Stats */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 shadow-xl relative overflow-hidden flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
        <div className="space-y-1">
          <h3 className="text-lg font-bold text-white flex items-center gap-2">
            <Award className="w-5 h-5 text-emerald-400" />
            The Unit Accumulation Scoreboard
          </h3>
          <p className="text-xs text-slate-400">
            Track exact unit count growth over time. Rebalancing harvests market volatility to compound your base bag counts, ignoring temporary fiat swings.
          </p>
        </div>

        {snapshots.length > 0 && (
          <button
            onClick={() => setShowClearConfirm(true)}
            className="bg-rose-500/10 hover:bg-rose-500/25 border border-rose-500/20 text-rose-400 px-4 py-2 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 self-start md:self-center cursor-pointer"
          >
            <Trash2 className="w-4 h-4" />
            Clear Scoreboard
          </button>
        )}
      </div>

      {!hasGroups ? (
        /* Empty State: No Groups Created Yet */
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-12 text-center space-y-4 shadow-lg">
          <div className="w-14 h-14 bg-slate-950 border border-slate-850 rounded-xl flex items-center justify-center text-slate-400 mx-auto">
            <Activity className="w-6 h-6 text-emerald-400" />
          </div>
          <div className="space-y-1.5 max-w-md mx-auto">
            <h4 className="font-bold text-white text-base">Create a Link-Group to start</h4>
            <p className="text-xs text-slate-400 leading-relaxed">
              Scoreboard tracking requires active Link-Groups. Once you create a group, convert some assets, and execute a rebalance, your multi-coin scoreboard will automatically display here.
            </p>
          </div>
        </div>
      ) : (
        <div className="space-y-6">
          
          {/* Group Picker Dropdown */}
          <div className="flex flex-col sm:flex-row sm:items-center gap-3 bg-slate-900/50 border border-slate-850/60 p-4 rounded-xl">
            <label htmlFor="group-picker-select" className="text-xs font-bold uppercase tracking-wider text-slate-400 shrink-0">
              Select Link Group Scoreboard:
            </label>
            <div className="relative w-full sm:w-72">
              <select
                id="group-picker-select"
                value={activeGroup?.id || ''}
                onChange={(e) => setSelectedGroupId(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg py-2 pl-3.5 pr-10 text-xs font-bold text-white focus:outline-none focus:ring-1 focus:ring-emerald-500 appearance-none cursor-pointer"
              >
                {groups.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name} ({g.memberMints.length} coins)
                  </option>
                ))}
              </select>
              <div className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none text-slate-500">
                <ChevronDown className="w-4 h-4" />
              </div>
            </div>
          </div>

          {/* Render Active Group's Scoreboard */}
          {activeGroup && (
            <div className="space-y-6">
              <ScoreboardView
                group={activeGroup}
                snapshots={snapshots}
                groupBalances={getGroupBalances(activeGroup)}
                tokenMetadata={tokenMetadata}
              />
            </div>
          )}

        </div>
      )}

      <ConfirmModal
        isOpen={showClearConfirm}
        title="Clear scoreboard?"
        message="Are you sure you want to clear your scoreboard history? This is irreversible and will delete all stored snapshots."
        confirmText="Yes, Clear All"
        cancelText="Cancel"
        onConfirm={() => {
          setShowClearConfirm(false);
          onClearHistory();
        }}
        onCancel={() => setShowClearConfirm(false)}
      />

    </div>
  );
}
