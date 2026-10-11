import { Info } from 'lucide-react';

interface DisclaimerProps {
  onDismiss?: () => void;
  showDismissButton?: boolean;
}

export default function Disclaimer(_props?: DisclaimerProps) {
  return (
    <div id="disclaimer-banner" className="risk-disclosure w-full max-w-5xl mx-auto px-4 py-3 text-center">
      <p className="text-[12px] text-slate-500 leading-relaxed font-sans">
        <span className="font-semibold text-slate-400">Risk Disclosure &amp; Strategy Warning:</span>{' '}
        This is a volatility-harvesting rebalancer. It profits when your chosen coins oscillate and all remain long-term viable. It will actively move your funds into any coin that is genuinely dying. Coin selection is the entire risk (choose coins you would hold through a full cycle, not lottery tickets). This is not financial advice. You approve and sign every transaction yourself.
      </p>
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
