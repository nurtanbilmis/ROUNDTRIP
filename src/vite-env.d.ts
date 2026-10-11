/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Optional public, domain-locked RPC URL. See src/rpc.ts. */
  readonly VITE_PUBLIC_RPC_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
