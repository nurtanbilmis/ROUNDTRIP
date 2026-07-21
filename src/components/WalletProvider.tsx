import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import { Connection, PublicKey, VersionedTransaction } from '@solana/web3.js';
import { WalletType } from '../types';
import { buildSwapTransaction } from '../jupiter';
import {
  ConnectionProvider,
  WalletProvider as SolanaBaseWalletProvider,
  useWallet
} from '@solana/wallet-adapter-react';
import {
  WalletModalProvider,
  useWalletModal
} from '@solana/wallet-adapter-react-ui';

// Import Solana Wallet Adapter CSS
import '@solana/wallet-adapter-react-ui/styles.css';

import { TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID } from '@solana/spl-token';

interface WalletContextType {
  publicKey: string | null;
  type: WalletType;
  connected: boolean;
  connecting: boolean;
  balances: Record<string, number>; // mint address -> base units balance
  realOnChainBalances: Record<string, number>; // actual onchain balances without scaling
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
  refreshBalances: () => Promise<Record<string, number>>;
  signAndExecuteSwap: (params: {
    inputMint: string;
    outputMint: string;
    amountBase: number;
    quoteResponse: any;
    inputDecimals: number;
    outputDecimals: number;
  }) => Promise<string>;
  rpcUrl: string;
  setRpcUrl: (url: string) => void;
  slippageBps: number;
  setSlippageBps: (bps: number) => void;
}

const WalletContext = createContext<WalletContextType | undefined>(undefined);

const WalletInnerProvider: React.FC<{
  children: React.ReactNode;
  rpcUrl: string;
  setRpcUrl: (url: string) => void;
  slippageBps: number;
  setSlippageBps: (bps: number) => void;
}> = ({ children, rpcUrl, setRpcUrl, slippageBps, setSlippageBps }) => {
  const baseWallet = useWallet();
  const walletModal = useWalletModal();

  // One-time cleanup of lingering demo keys from localStorage
  useEffect(() => {
    localStorage.removeItem('roundtrip_demo_active');
    localStorage.removeItem('roundtrip_demo_balances');
  }, []);

  // Track real on-chain balances fetched from RPC
  const [onChainBalances, setOnChainBalances] = useState<Record<string, number>>({});

  // Map state directly to real wallet status
  const connected = baseWallet.connected;
  const publicKeyStr = baseWallet.publicKey?.toBase58() || null;
  const connecting = baseWallet.connecting;
  
  const walletType = useMemo<WalletType>(() => {
    if (!baseWallet.connected) return null;
    const name = baseWallet.wallet?.adapter.name.toLowerCase() || '';
    if (name.includes('phantom')) return 'phantom';
    if (name.includes('solflare')) return 'solflare';
    if (name.includes('backpack')) return 'backpack';
    return 'phantom'; // fallback/standard
  }, [baseWallet.connected, baseWallet.wallet]);

  // Fetch real onchain balances for real wallets
  const refreshBalances = useCallback(async (): Promise<Record<string, number>> => {
    if (!connected || !publicKeyStr) return {};

    const publicEndpoints = [
      'https://api.mainnet-beta.solana.com',
      'https://rpc.ankr.com/solana',
      'https://solana.public-rpc.com',
      'https://api.turing.solana.com'
    ];

    // Order URLs to try: current RPC first, then others
    const urlsToTry = [rpcUrl];
    if (publicEndpoints.includes(rpcUrl)) {
      for (const endpoint of publicEndpoints) {
        if (endpoint !== rpcUrl) {
          urlsToTry.push(endpoint);
        }
      }
    }

    let lastError: any = null;

    for (const url of urlsToTry) {
      try {
        const connection = new Connection(url, 'confirmed');
        const pubkey = new PublicKey(publicKeyStr);
        const newBalances: Record<string, number> = {};

        // 1. Fetch SOL Balance
        const solBalance = await connection.getBalance(pubkey);
        // Map SOL to standard WSOL mint
        newBalances['So11111111111111111111111111111111111111112'] = solBalance;

        // 2. Fetch SPL token accounts
        try {
          const tokenAccounts = await connection.getParsedTokenAccountsByOwner(pubkey, {
            programId: TOKEN_PROGRAM_ID,
          });

          for (const account of tokenAccounts.value) {
            const info = account.account.data.parsed.info;
            const mint = info.mint;
            const amount = parseInt(info.tokenAmount.amount);
            newBalances[mint] = (newBalances[mint] || 0) + amount;
          }
        } catch (err) {
          console.warn(`Failed to fetch legacy SPL token accounts on ${url}:`, err);
        }

        // 3. Fetch Token-2022 accounts
        try {
          const token2022Accounts = await connection.getParsedTokenAccountsByOwner(pubkey, {
            programId: TOKEN_2022_PROGRAM_ID,
          });

          for (const account of token2022Accounts.value) {
            const info = account.account.data.parsed.info;
            const mint = info.mint;
            const amount = parseInt(info.tokenAmount.amount);
            newBalances[mint] = (newBalances[mint] || 0) + amount;
          }
        } catch (err) {
          console.warn(`Failed to fetch Token-2022 accounts on ${url}:`, err);
        }

        setOnChainBalances((current) => {
          const keys1 = Object.keys(newBalances);
          const keys2 = Object.keys(current);
          if (keys1.length !== keys2.length) return newBalances;
          for (const k of keys1) {
            if (newBalances[k] !== current[k]) return newBalances;
          }
          return current;
        });

        // If we switched to a fallback URL and it worked, auto-update the context RPC url
        if (url !== rpcUrl) {
          console.log(`Auto-switched to working RPC endpoint: ${url}`);
          setRpcUrl(url);
        }

        return newBalances;
      } catch (err) {
        console.warn(`Failed to fetch real wallet balances on RPC ${url}:`, err);
        lastError = err;
      }
    }

    console.error('All attempted RPC endpoints failed to fetch real wallet balances:', lastError);
    return {};
  }, [connected, publicKeyStr, rpcUrl, setRpcUrl]);

  // Auto-refresh balances on load/connect
  useEffect(() => {
    if (connected) {
      refreshBalances();
    }
  }, [connected, publicKeyStr, refreshBalances]);

  // Derived values for the app
  const balances = onChainBalances;
  const realOnChainBalances = onChainBalances;

  // Connect wallet
  const connect = async () => {
    walletModal.setVisible(true);
  };

  // Disconnect wallet
  const disconnect = async () => {
    await baseWallet.disconnect();
  };

  // Sign and Execute swap transaction
  const signAndExecuteSwap = async (params: {
    inputMint: string;
    outputMint: string;
    amountBase: number; // in base units
    quoteResponse: any;
    inputDecimals: number;
    outputDecimals: number;
  }): Promise<string> => {
    const { publicKeyStr: _un, quoteResponse } = { publicKeyStr, ...params };

    if (!connected || !publicKeyStr) {
      throw new Error('Wallet not connected');
    }

    // REAL WEB3 WALLET SWAP
    try {
      if (!baseWallet.signTransaction) {
        throw new Error('Connected wallet does not support signing transactions.');
      }

      // Build real Jupiter swap transaction
      const swapRes = await buildSwapTransaction({
        quoteResponse,
        userPublicKey: publicKeyStr,
        wrapAndUnwrapSol: true,
      });

      const swapTxBase64 = swapRes.swapTransaction;
      if (!swapTxBase64) {
        throw new Error('Jupiter Swap API returned an empty transaction.');
      }

      // Deserialize versioned transaction
      const binaryString = window.atob(swapTxBase64);
      const len = binaryString.length;
      const bytes = new Uint8Array(len);
      for (let i = 0; i < len; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      const transaction = VersionedTransaction.deserialize(bytes);

      // Request signature from user's extension
      const signedTransaction = await baseWallet.signTransaction(transaction);

      // Submit raw transaction on-chain
      const connection = new Connection(rpcUrl, 'confirmed');
      const rawTx = signedTransaction.serialize();
      
      const txId = await connection.sendRawTransaction(rawTx, {
        skipPreflight: false,
        maxRetries: 3,
      });

      // Confirm transaction using tx's own blockhash and swapRes's lastValidBlockHeight
      const txBlockhash = transaction.message.recentBlockhash;
      const jupLastValidBlockHeight = swapRes.lastValidBlockHeight;

      try {
        if (jupLastValidBlockHeight) {
          await connection.confirmTransaction({
            signature: txId,
            blockhash: txBlockhash,
            lastValidBlockHeight: jupLastValidBlockHeight,
          }, 'confirmed');
        } else {
          const latestBlockhash = await connection.getLatestBlockhash();
          await connection.confirmTransaction({
            signature: txId,
            blockhash: latestBlockhash.blockhash,
            lastValidBlockHeight: latestBlockhash.lastValidBlockHeight,
          }, 'confirmed');
        }
      } catch (confirmErr) {
        console.warn('confirmTransaction failed or timed out, polling getSignatureStatus for', txId, confirmErr);
        let landed = false;
        // Poll for up to 15 seconds (10 attempts * 1.5s)
        for (let i = 0; i < 10; i++) {
          try {
            const statusRes = await connection.getSignatureStatus(txId);
            const status = statusRes?.value;
            if (status) {
              if (status.confirmationStatus === 'confirmed' || status.confirmationStatus === 'finalized') {
                if (!status.err) {
                  landed = true;
                  break;
                } else {
                  throw new Error(`Transaction failed on-chain: ${JSON.stringify(status.err)}`);
                }
              }
            }
          } catch (statusErr) {
            console.error('Error fetching signature status:', statusErr);
          }
          await new Promise((resolve) => setTimeout(resolve, 1500));
        }
        if (!landed) {
          throw confirmErr;
        }
      }

      // Refresh balances on success
      await refreshBalances();

      // Mark that a real swap has occurred
      localStorage.setItem('roundtrip_has_real_swapped', 'true');

      return txId;
    } catch (err: any) {
      console.error('Real transaction failed:', err);
      throw new Error(err?.message || 'Transaction signing or execution failed.');
    }
  };

  return (
    <WalletContext.Provider
      value={{
        publicKey: publicKeyStr,
        type: walletType,
        connected,
        connecting,
        balances,
        realOnChainBalances,
        connect,
        disconnect,
        refreshBalances,
        signAndExecuteSwap,
        rpcUrl,
        setRpcUrl,
        slippageBps,
        setSlippageBps,
      }}
    >
      {children}
    </WalletContext.Provider>
  );
};

export const WalletProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [rpcUrl, setRpcUrl] = useState<string>(() => {
    return localStorage.getItem('roundtrip_rpc_url') || 'https://api.mainnet-beta.solana.com';
  });

  const [slippageBps, setSlippageBps] = useState<number>(() => {
    const saved = localStorage.getItem('roundtrip_slippage_bps');
    return saved ? parseInt(saved, 10) : 50; // default 50 bps (0.5%)
  });

  const setRpcUrlWithSave = (url: string) => {
    setRpcUrl(url);
    localStorage.setItem('roundtrip_rpc_url', url);
  };

  const setSlippageBpsWithSave = (bps: number) => {
    setSlippageBps(bps);
    localStorage.setItem('roundtrip_slippage_bps', bps.toString());
  };

  return (
    <ConnectionProvider endpoint={rpcUrl}>
      <SolanaBaseWalletProvider wallets={[]} autoConnect>
        <WalletModalProvider>
          <WalletInnerProvider
            rpcUrl={rpcUrl}
            setRpcUrl={setRpcUrlWithSave}
            slippageBps={slippageBps}
            setSlippageBps={setSlippageBpsWithSave}
          >
            {children}
          </WalletInnerProvider>
        </WalletModalProvider>
      </SolanaBaseWalletProvider>
    </ConnectionProvider>
  );
};

export const useSolanaWallet = () => {
  const context = useContext(WalletContext);
  if (!context) {
    throw new Error('useSolanaWallet must be used within a WalletProvider');
  }
  return context;
};
