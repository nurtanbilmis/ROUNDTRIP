import { Connection } from '@solana/web3.js';

/**
 * Optional fallback: a public, domain-locked RPC URL that the browser calls directly.
 * Leave VITE_PUBLIC_RPC_URL unset (recommended) to use the /api/rpc proxy, which keeps
 * the RPC URL on the server. Set it only if your RPC provider refuses server-side calls
 * (for example Triton answering "Your IP or provider is blocked"). Anything starting with
 * VITE_ is bundled into the page, so every visitor can see this URL; lock it to your
 * domain in the provider's dashboard.
 */
const PUBLIC_RPC_URL = import.meta.env?.VITE_PUBLIC_RPC_URL?.trim() || '';

/** True when the app talks to its own /api/rpc proxy (the default). */
export const USING_RPC_PROXY = !PUBLIC_RPC_URL;

export const DEFAULT_RPC_URL = PUBLIC_RPC_URL
  ? PUBLIC_RPC_URL
  : typeof window !== 'undefined'
    ? `${window.location.origin}/api/rpc`
    : '/api/rpc';

/**
 * Websocket for confirmations. The /api/rpc proxy handles HTTP only, so it uses the public
 * Solana websocket. A direct RPC URL derives its own websocket (wss:// on the same host).
 */
export function wsEndpointFor(url: string): string | undefined {
  return url === DEFAULT_RPC_URL && USING_RPC_PROXY ? 'wss://api.mainnet-beta.solana.com' : undefined;
}

export function createConnection(url: string): Connection {
  return new Connection(url, {
    commitment: 'confirmed',
    wsEndpoint: wsEndpointFor(url),
  });
}
