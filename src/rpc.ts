import { Connection } from '@solana/web3.js';

export const DEFAULT_RPC_URL =
  typeof window !== 'undefined' ? `${window.location.origin}/api/rpc` : '/api/rpc';

export function createConnection(url: string): Connection {
  return new Connection(url, {
    commitment: 'confirmed',
    wsEndpoint: url === DEFAULT_RPC_URL ? 'wss://api.mainnet-beta.solana.com' : undefined,
  });
}
