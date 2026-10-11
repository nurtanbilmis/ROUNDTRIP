import React, { Component, ErrorInfo, ReactNode, StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Buffer } from 'buffer';

if (typeof window !== 'undefined') {
  window.Buffer = Buffer;
  globalThis.Buffer = Buffer;
  if (!(window as any).global) {
    (window as any).global = window;
  }

  // Prevent default on uncaught promise rejections and errors
  window.addEventListener('error', (event) => {
    console.warn('Unhandled global error captured:', event.message || event.error);
    event.preventDefault();
  });

  window.addEventListener('unhandledrejection', (event) => {
    console.warn('Unhandled promise rejection captured:', event.reason);
    event.preventDefault();
  });
}

import App from './App.tsx';
import './index.css';

// Settings that are safe to reset after a crash. User data (baskets, harvest ledger) is not listed on purpose.
const SETTINGS_KEYS = [
  'roundtrip_rpc_url',
  'roundtrip_slippage_bps',
  'roundtrip_rpc_warning_dismissed',
  'roundtrip_token_viewer',
  'roundtrip_manual_trust',
  'walletName',
];

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

class ErrorBoundary extends React.Component<Props, State> {
  public props: Props;
  public state: State;

  constructor(props: Props) {
    super(props);
    this.props = props;
    this.state = {
      hasError: false,
      error: null,
    };
  }

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.warn('ErrorBoundary caught rendering error:', error, errorInfo);
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col items-center justify-center p-6 font-sans">
          <div className="max-w-md w-full bg-slate-900 border-4 border-black p-6 rounded-2xl shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] space-y-4">
            <h2 className="text-xl font-black text-rose-500 font-display">Something went wrong</h2>
            <p className="text-xs text-slate-400">
              The application encountered an unexpected rendering error. Try reloading first. If that doesn't help, reset settings: your baskets and harvest history are kept.
            </p>
            <pre className="text-[10px] bg-slate-950 p-3 rounded border border-slate-800 text-rose-400 font-mono overflow-auto max-h-40">
              {this.state.error?.toString() || 'Unknown Error'}
            </pre>
            <button
              onClick={() => window.location.reload()}
              className="w-full py-2 bg-emerald-500 text-black border-2 border-black font-bold font-display rounded shadow-[4px_4px_0px_0px_#000000] hover:scale-105 active:scale-95 transition-all cursor-pointer"
            >
              Reload
            </button>
            <button
              onClick={() => {
                // Reset settings only. Never clear baskets (roundtrip_link_groups__*) or the
                // harvest ledger (roundtrip_harvest_ledger__*): they exist nowhere else.
                for (const key of SETTINGS_KEYS) {
                  try {
                    localStorage.removeItem(key);
                  } catch {
                    // storage unavailable
                  }
                }
                window.location.reload();
              }}
              className="w-full py-2 bg-transparent text-slate-300 border-2 border-slate-700 font-bold font-display rounded hover:text-white transition-all cursor-pointer"
            >
              Reset settings & reload
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
);
