import React, { createContext, useContext, useState, useEffect, useCallback, useMemo, useRef } from 'react';
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
  connect: (walletType: 'demo' | 'real') => Promise<void>;
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
  addDemoFunds: (mint: string, amountHuman: number, decimals: number) => void;
  rpcUrl: string;
  setRpcUrl: (url: string) => void;
  slippageBps: number;
  setSlippageBps: (bps: number) => void;
}

const WalletContext = createContext<WalletContextType | undefined>(undefined);

// Initial Demo balances stored in localStorage
const DEFAULT_DEMO_BALANCES: Record<string, number> = {
  // SOL (9 decimals): 12.5 SOL
  'So11111111111111111111111111111111111111112': 12.5 * 1e9,
  // USDC (6 decimals): 2500 USDC
  'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v': 2500 * 1e6,
  // USDT (6 decimals): 500 USDT
  'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB': 500 * 1e6,
  // JUP (6 decimals): 1200 JUP
  'JUPyiwrYJFskUPiFG4gpvXvjTE76SreV8NToA8Y5YyJ': 1200 * 1e6,
  // BONK (5 decimals): 15,000,000 BONK
  'DezXAZ8z7PnrFcPykJzn99s94ChKnmk699rCgHmzUM6y': 15000000 * 1e5,
};

const WalletInnerProvider: React.FC<{
  children: React.ReactNode;
  rpcUrl: string;
  setRpcUrl: (url: string) => void;
  slippageBps: number;
  setSlippageBps: (bps: number) => void;
}> = ({ children, rpcUrl, setRpcUrl, slippageBps, setSlippageBps }) => {
  const baseWallet = useWallet();
  const walletModal = useWalletModal();

  // Sandbox/demo mode state
  const [isDemo, setIsDemo] = useState<boolean>(() => {
    return localStorage.getItem('roundtrip_demo_active') === 'true';
  });

  const [demoBalances, setDemoBalances] = useState<Record<string, number>>(() => {
    const saved = localStorage.getItem('roundtrip_demo_balances');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        // ignore
      }
    }
    return DEFAULT_DEMO_BALANCES;
  });

  const demoBalancesRef = useRef<Record<string, number>>(demoBalances);
  useEffect(() => {
    demoBalancesRef.current = demoBalances;
  }, [demoBalances]);

  // Track real on-chain balances fetched from RPC
  const [onChainBalances, setOnChainBalances] = useState<Record<string, number>>({});

  // Sync demo state changes to storage
  useEffect(() => {
    localStorage.setItem('roundtrip_demo_active', isDemo ? 'true' : 'false');
  }, [isDemo]);

  // If real wallet connects, we turn off demo mode
  useEffect(() => {
    if (baseWallet.connected) {
      setIsDemo(false);
    }
  }, [baseWallet.connected]);

  // Map state
  const connected = isDemo ? true : baseWallet.connected;
  const publicKeyStr = isDemo
    ? 'DemoRebalancerWa11etAddressSolana11111111'
    : baseWallet.publicKey?.toBase58() || null;
  const connecting = isDemo ? false : baseWallet.connecting;
  
  const walletType = useMemo<WalletType>(() => {
    if (isDemo) return 'demo';
    if (!baseWallet.connected) return null;
    const name = baseWallet.wallet?.adapter.name.toLowerCase() || '';
    if (name.includes('phantom')) return 'phantom';
    if (name.includes('solflare')) return 'solflare';
    if (name.includes('backpack')) return 'backpack';
    return 'phantom'; // fallback/standard
  }, [isDemo, baseWallet.connected, baseWallet.wallet]);

  // Fetch real onchain balances for real wallets
  const refreshBalances = useCallback(async (): Promise<Record<string, number>> => {
    if (!connected || !publicKeyStr) return {};

    if (isDemo) {
      // Refreshing demo balances from state/storage
      let finalRaw = DEFAULT_DEMO_BALANCES;
      const savedBalances = localStorage.getItem('roundtrip_demo_balances');
      if (savedBalances) {
        try {
          finalRaw = JSON.parse(savedBalances);
        } catch (e) {
          // fallback
        }
      }
      setDemoBalances((current) => {
        const keys1 = Object.keys(finalRaw);
        const keys2 = Object.keys(current);
        if (keys1.length !== keys2.length) return finalRaw;
        for (const k of keys1) {
          if (finalRaw[k] !== current[k]) return finalRaw;
        }
        return current;
      });
      return finalRaw;
    }

    // Real Web3 Fetch
    try {
      const connection = new Connection(rpcUrl, 'confirmed');
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
        console.warn('Failed to fetch legacy SPL token accounts:', err);
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
        console.warn('Failed to fetch Token-2022 accounts:', err);
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
      return newBalances;
    } catch (err) {
      console.error('Failed to fetch real wallet balances:', err);
      return {};
    }
  }, [connected, publicKeyStr, isDemo, rpcUrl]);

  // Auto-refresh balances on load/connect
  useEffect(() => {
    if (connected) {
      refreshBalances();
    }
  }, [connected, publicKeyStr, isDemo, refreshBalances]);

  // Calculate scaled balances actually presented to the app
  const balances = useMemo(() => {
    return isDemo ? demoBalances : onChainBalances;
  }, [isDemo, demoBalances, onChainBalances]);

  const realOnChainBalances = useMemo(() => {
    return isDemo ? demoBalances : onChainBalances;
  }, [isDemo, demoBalances, onChainBalances]);

  // Connect wallet
  const connect = async (walletType: 'demo' | 'real') => {
    if (walletType === 'demo') {
      setIsDemo(true);
      if (baseWallet.connected) {
        await baseWallet.disconnect();
      }
    } else {
      setIsDemo(false);
      walletModal.setVisible(true);
    }
  };

  // Disconnect wallet
  const disconnect = async () => {
    if (isDemo) {
      setIsDemo(false);
    } else {
      await baseWallet.disconnect();
    }
  };

  // Add demo funds helper
  const addDemoFunds = (mint: string, amountHuman: number, decimals: number) => {
    if (!isDemo) return;

    const baseAmount = amountHuman * Math.pow(10, decimals);

    const updatedBalances = {
      ...demoBalances,
      [mint]: (demoBalances[mint] || 0) + baseAmount,
    };

    localStorage.setItem('roundtrip_demo_balances', JSON.stringify(updatedBalances));
    setDemoBalances(updatedBalances);
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
    const { inputMint, outputMint, amountBase, quoteResponse } = params;

    if (!connected || !publicKeyStr) {
      throw new Error('Wallet not connected');
    }

    // 1. DEMO SWAP SIMULATION
    if (isDemo) {
      return new Promise((resolve, reject) => {
        setTimeout(() => {
          try {
            const current = demoBalancesRef.current;
            const rawAmountIn = amountBase;
            const currentRawInBalance = current[inputMint] || 0;
            const rawAmountOut = parseInt(quoteResponse.outAmount || '0');

            if (currentRawInBalance < rawAmountIn) {
              throw new Error(`Insufficient simulated balance. Swap rejected.`);
            }

            const updatedBalances = { ...current };
            updatedBalances[inputMint] = Math.max(0, currentRawInBalance - rawAmountIn);
            updatedBalances[outputMint] = (updatedBalances[outputMint] || 0) + rawAmountOut;

            demoBalancesRef.current = updatedBalances;
            localStorage.setItem('roundtrip_demo_balances', JSON.stringify(updatedBalances));
            setDemoBalances(updatedBalances);

            const mockTxId = 'SimulatedSwapTxId' + Math.random().toString(36).substring(2, 15) + 'Confirmed';
            resolve(mockTxId);
          } catch (err) {
            reject(err);
          }
        }, 1500);
      });
    }

    // 2. REAL WEB3 WALLET SWAP
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

      // Confirm transaction using tx's own blockhash and swapRes's lastValidBlockHeight (C1)
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
        // Poll for up to 15 seconds (10 attempts * 1.5s) (C1)
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
        addDemoFunds,
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
