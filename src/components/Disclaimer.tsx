import { ShieldAlert, Info, X } from 'lucide-react';

interface DisclaimerProps {
  onDismiss?: () => void;
  showDismissButton?: boolean;
}

export default function Disclaimer({ onDismiss, showDismissButton = false }: DisclaimerProps) {
  return (
    <div id="disclaimer-banner" className="risk-disclosure bg-amber-500/10 border border-amber-500/20 p-5 rounded-xl shadow-sm relative overflow-hidden transition-all duration-300">
      <div className="flex gap-4">
        <div className="flex-shrink-0 text-amber-500">
          <ShieldAlert className="w-5 h-5 animate-pulse" />
        </div>
        <div className="flex-grow">
          <h4 className="text-amber-400 font-bold text-xs uppercase tracking-wider flex items-center gap-1.5">
            Risk Disclosure & Strategy Warning
          </h4>
          <p className="text-slate-300 text-xs mt-1.5 leading-relaxed font-sans font-normal">
            This is a <strong className="text-amber-400 font-semibold">volatility-harvesting rebalancer</strong>. It profits when your chosen coins oscillate and all remain long-term viable. It will <span className="underline font-medium text-rose-400">actively move your funds into any coin that is genuinely dying</span>. Coin selection is the entire risk — choose coins you would hold through a full cycle, not lottery tickets. This is not financial advice. You approve and sign every transaction yourself.
          </p>
        </div>
        {showDismissButton && onDismiss && (
          <button
            onClick={onDismiss}
            className="flex-shrink-0 text-amber-500 hover:text-amber-400 p-1 rounded-md transition-colors cursor-pointer"
            title="Dismiss Disclaimer"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>
    </div>
  );
}

export function DisclaimerCard() {
  return (
    <div id="disclaimer-card" className="risk-disclosure bg-slate-900 text-slate-100 border border-slate-800 p-6 rounded-xl relative overflow-hidden shadow-2xl">
      <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/5 blur-3xl rounded-full"></div>
      <div className="flex items-start gap-4">
        <div className="p-3 bg-emerald-500/10 text-emerald-400 rounded-lg">
          <Info className="w-6 h-6" />
        </div>
        <div>
          <h3 className="font-bold text-lg text-white tracking-tight mb-2">Understanding Equal Weight Volatility Harvesting</h3>
          <p className="text-slate-300 text-sm leading-relaxed mb-3">
            Our rebalancer operates purely on a mathematical grid: <strong className="text-emerald-400 font-medium">100 / N% allocation</strong>.
            When a token surges, it is sold down to target. When a token drops, more is purchased to meet target.
          </p>
          <div className="bg-slate-950/60 p-3.5 rounded-lg border border-slate-800 text-xs space-y-2 text-slate-400">
            <p>
              <span className="text-emerald-400 font-semibold">✔ The Profit Case:</span> Over months of lateral oscillation, selling highs and buying lows systematically accumulates more <strong>units/coin-count</strong> of each asset, compounding your overall bag.
            </p>
            <p>
              <span className="text-rose-400 font-semibold">✘ The Risk Case:</span> If one of your tokens experiences a permanent structural crash (e.g., rugpull, exploit, or zeroing), the rebalancer will relentlessly bleed your other healthy tokens to buy the dip, eventually draining your entire portfolio.
            </p>
          </div>
          <p className="text-xs text-amber-500/90 mt-4 font-normal leading-relaxed italic">
            Disclaimer: Non-custodial, 100% manual. No background script, cron job, or delegated smart contract can move your funds. Every transaction is constructed in the browser and requires your explicit ledger/wallet signature.
          </p>
        </div>
      </div>
    </div>
  );
}
