import React, { useState } from 'react';
import { Coffee, Check, Copy } from 'lucide-react';

// Tip address for the creator. A Solana Name Service (.sol) name: Phantom, Solflare and
// Backpack resolve it when sending. Forks can change or remove this.
export const SUPPORT_SOL_NAME = 'bestchain.sol';

export default function SupportCreator() {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(SUPPORT_SOL_NAME);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard blocked: the name is visible, users can copy it by hand
    }
  };

  return (
    <button
      type="button"
      onClick={copy}
      title={`Copy ${SUPPORT_SOL_NAME}. Send any amount of SOL or tokens from your wallet.`}
      className="flex items-center gap-1.5 text-[10px] text-slate-500 hover:text-emerald-400 transition-colors cursor-pointer"
    >
      <Coffee className="w-3 h-3" />
      <span className="hidden sm:inline">Buy the creator a coffee:</span>
      <span className="font-mono font-bold text-slate-400">{SUPPORT_SOL_NAME}</span>
      {copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
      {copied && <span className="text-emerald-400">Copied</span>}
    </button>
  );
}
