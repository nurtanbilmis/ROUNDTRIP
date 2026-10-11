import { useState, useEffect, useCallback } from 'react';

export type TokenViewer = 'dexscreener' | 'jupiter';

const KEY = 'roundtrip_token_viewer';
const EVENT_NAME = 'roundtrip-token-viewer-changed';
const WSOL_MINT = 'So11111111111111111111111111111111111111112';

export function getTokenViewer(): TokenViewer {
  try {
    const val = localStorage.getItem(KEY);
    if (val === 'dexscreener' || val === 'jupiter') {
      return val;
    }
  } catch {
    // localStorage may be unavailable or restricted
  }
  return 'dexscreener';
}

export function setTokenViewer(v: TokenViewer): void {
  try {
    localStorage.setItem(KEY, v);
  } catch {
    // ignore storage write errors
  }
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(EVENT_NAME, { detail: v }));
  }
}

export function useTokenViewer(): [TokenViewer, (v: TokenViewer) => void] {
  const [viewer, setViewerState] = useState<TokenViewer>(() => getTokenViewer());

  useEffect(() => {
    const handler = (e: Event) => {
      const customEvent = e as CustomEvent<TokenViewer>;
      if (customEvent.detail && (customEvent.detail === 'dexscreener' || customEvent.detail === 'jupiter')) {
        setViewerState(customEvent.detail);
      } else {
        setViewerState(getTokenViewer());
      }
    };

    window.addEventListener(EVENT_NAME, handler);
    window.addEventListener('storage', handler);
    return () => {
      window.removeEventListener(EVENT_NAME, handler);
      window.removeEventListener('storage', handler);
    };
  }, []);

  const updateViewer = useCallback((newVal: TokenViewer) => {
    setViewerState(newVal);
    setTokenViewer(newVal);
  }, []);

  return [viewer, updateViewer];
}

export function tokenViewerUrl(mint: string, viewer: TokenViewer): string {
  const targetMint = (!mint || mint.toUpperCase() === 'SOL' || mint === 'native') ? WSOL_MINT : mint;
  if (viewer === 'jupiter') {
    return `https://jup.ag/tokens/${targetMint}`;
  }
  return `https://dexscreener.com/solana/${targetMint}`;
}
