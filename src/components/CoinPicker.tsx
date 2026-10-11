import React, { useState, useEffect } from 'react';
import { Search, Plus, Trash2, Sparkles, AlertTriangle, AlertCircle, Loader2 } from 'lucide-react';
import { Token } from '../types';
import { fetchVerifiedTokens, searchJupiterTokens, fetchTokenLiquidity } from '../jupiter';
import { PublicKey } from '@solana/web3.js';
import { createConnection, DEFAULT_RPC_URL } from '../rpc';
import { TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID, getMint, getAccount } from '@solana/spl-token';
import TokenLogo from './TokenLogo';

interface CoinPickerProps {
  selectedTokens: Token[];
  onAddToken: (token: Token) => void;
  onRemoveToken: (mint: string) => void;
  onClose: () => void;
}

export default function CoinPicker({
  selectedTokens,
  onAddToken,
  onRemoveToken,
  onClose,
}: CoinPickerProps) {
  const [tokensList, setTokensList] = useState<Token[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [recommendedOnly, setRecommendedOnly] = useState(true);

  // Jupiter search & address validation state
  const [searchingJupiter, setSearchingJupiter] = useState(false);
  const [jupiterResults, setJupiterResults] = useState<(Token & { isVerified: boolean })[]>([]);
  const [validatingMint, setValidatingMint] = useState(false);
  const [mintValidationResult, setMintValidationResult] = useState<{
    status: 'idle' | 'checking' | 'valid' | 'invalid' | 'pool_suggestion' | 'token_account';
    mint?: string;
    error?: string;
    token?: Token;
    isToken2022?: boolean;
    isVerified?: boolean;
    suggestedTokens?: (Token & { isVerified: boolean })[];
    tokenAccountMint?: string;
  }>({ status: 'idle' });

  // Liquidity and unverified warning states
  const [checkingLiquidity, setCheckingLiquidity] = useState<string | null>(null);
  const [pendingWarningToken, setPendingWarningToken] = useState<{ token: Token; liquidity: number } | null>(null);
  const [pendingUnverifiedToken, setPendingUnverifiedToken] = useState<{ token: Token; liquidity?: number } | null>(null);

  // Load verified tokens
  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const verified = await fetchVerifiedTokens();
        setTokensList(verified);
      } catch (err) {
        console.error('Failed to load verified tokens', err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  // Search Jupiter tokens & validate address
  useEffect(() => {
    const trimmed = searchQuery.trim();
    if (!trimmed) {
      setJupiterResults([]);
      setSearchingJupiter(false);
      setMintValidationResult({ status: 'idle' });
      setValidatingMint(false);
      return;
    }

    let active = true;

    // Search Jupiter tokens for list display
    const searchTimer = setTimeout(async () => {
      setSearchingJupiter(true);
      try {
        const res = await searchJupiterTokens(trimmed);
        if (active) {
          setJupiterResults(res);
        }
      } catch (err) {
        console.warn('Jupiter search error:', err);
      } finally {
        if (active) {
          setSearchingJupiter(false);
        }
      }
    }, 250);

    // If input matches Base58 character set and length, check address
    const isBase58Regex = /^[1-9A-HJ-NP-Za-km-z]{30,48}$/;
    if (isBase58Regex.test(trimmed)) {
      setValidatingMint(true);
      setMintValidationResult({ status: 'checking' });

      const addressTimer = setTimeout(async () => {
        let pubkey: PublicKey;
        try {
          pubkey = new PublicKey(trimmed);
        } catch {
          if (active) {
            setMintValidationResult({
              status: 'invalid',
              error: 'Invalid Solana address: Base58 public key decode failed.',
            });
            setValidatingMint(false);
          }
          return;
        }

        const inputAddress = pubkey.toBase58();

        // 1. Check Jupiter search
        let jupRes: (Token & { isVerified: boolean; id?: string })[] = [];
        try {
          jupRes = await searchJupiterTokens(inputAddress);
        } catch (err) {
          console.warn('searchJupiterTokens address lookup error:', err);
        }

        const exactMatch = jupRes.find((t) => (t as any).id === inputAddress || t.address === inputAddress);

        if (exactMatch) {
          // Step 1a: Exact match. That IS the mint. Use on-chain only for decimals, not as a blocker.
          let decimals = exactMatch.decimals;
          let isToken2022 = false;

          try {
            const connection = createConnection(DEFAULT_RPC_URL);
            const info = await connection.getAccountInfo(pubkey);
            if (info) {
              console.debug({ address: inputAddress, owner: info.owner.toBase58(), dataLength: info.data.length });
              if (info.owner.equals(TOKEN_2022_PROGRAM_ID)) {
                isToken2022 = true;
              }
              try {
                const mintInfo = await getMint(connection, pubkey, 'confirmed', info.owner);
                if (typeof mintInfo.decimals === 'number') {
                  decimals = mintInfo.decimals;
                }
              } catch {
                // ignore
              }
            }
          } catch {
            // ignore
          }

          const isVerified = exactMatch.isVerified === true || exactMatch.tags?.includes('verified');
          const tokenObj: Token = {
            address: inputAddress,
            symbol: exactMatch.symbol,
            name: exactMatch.name,
            decimals,
            logoURI: exactMatch.logoURI,
            tags: isVerified ? ['verified'] : ['unverified'],
          };

          if (active) {
            setMintValidationResult({
              status: 'valid',
              mint: inputAddress,
              token: tokenObj,
              isToken2022,
              isVerified,
            });
            setValidatingMint(false);
          }
          return;
        }

        if (jupRes.length > 0 && !exactMatch) {
          // Step 1b: Results exist but none has id === input. Pool/pair address.
          if (active) {
            setMintValidationResult({
              status: 'pool_suggestion',
              mint: inputAddress,
              suggestedTokens: jupRes,
            });
            setValidatingMint(false);
          }
          return;
        }

        // Step 2: Fallback to on-chain mint check
        try {
          const connection = createConnection(DEFAULT_RPC_URL);
          const info = await connection.getAccountInfo(pubkey);

          if (!info) {
            if (active) {
              setMintValidationResult({
                status: 'invalid',
                mint: inputAddress,
                error: 'Address was not found on Solana mainnet. Make sure the token exists on-chain.',
              });
              setValidatingMint(false);
            }
            return;
          }

          console.debug({ address: inputAddress, owner: info.owner.toBase58(), dataLength: info.data.length });

          const isSpl = info.owner.equals(TOKEN_PROGRAM_ID);
          const is2022 = info.owner.equals(TOKEN_2022_PROGRAM_ID);

          if (isSpl || is2022) {
            try {
              const mintInfo = await getMint(connection, pubkey, 'confirmed', info.owner);
              const decimals = mintInfo.decimals;
              const tokenObj: Token = {
                address: inputAddress,
                symbol: `${inputAddress.slice(0, 4)}...${inputAddress.slice(-4)}`,
                name: `Token (${inputAddress.slice(0, 4)}...${inputAddress.slice(-4)})`,
                decimals,
                tags: ['unverified'],
              };
              if (active) {
                setMintValidationResult({
                  status: 'valid',
                  mint: inputAddress,
                  token: tokenObj,
                  isToken2022: is2022,
                  isVerified: false,
                });
                setValidatingMint(false);
              }
              return;
            } catch {
              try {
                const accInfo = await getAccount(connection, pubkey, 'confirmed', info.owner);
                const realMint = accInfo.mint.toBase58();
                if (active) {
                  setMintValidationResult({
                    status: 'token_account',
                    mint: inputAddress,
                    tokenAccountMint: realMint,
                  });
                  setValidatingMint(false);
                }
                return;
              } catch {
                if (active) {
                  setMintValidationResult({
                    status: 'invalid',
                    mint: inputAddress,
                    error: 'Account is owned by the token program, but could not be parsed as a valid token mint.',
                  });
                  setValidatingMint(false);
                }
                return;
              }
            }
          } else {
            if (active) {
              setMintValidationResult({
                status: 'invalid',
                mint: inputAddress,
                error: "This looks like a liquidity pool or pair address, not a token. Paste the token's contract address instead (on pump.fun tokens it usually ends in 'pump').",
              });
              setValidatingMint(false);
            }
            return;
          }
        } catch (err: any) {
          if (active) {
            setMintValidationResult({
              status: 'invalid',
              mint: inputAddress,
              error: `Network error verifying mint on-chain: ${err?.message || 'RPC request timed out'}`,
            });
            setValidatingMint(false);
          }
        }
      }, 350);

      return () => {
        active = false;
        clearTimeout(searchTimer);
        clearTimeout(addressTimer);
      };
    } else {
      setMintValidationResult({ status: 'idle' });
      setValidatingMint(false);
    }

    return () => {
      active = false;
      clearTimeout(searchTimer);
    };
  }, [searchQuery]);

  const handlePreAddCheck = async (token: Token) => {
    const isVerified = token.tags?.includes('verified');
    const safeMints = [
      'So11111111111111111111111111111111111111112', // SOL
      'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', // USDC
      'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB', // USDT
    ];

    if (!isVerified) {
      let liq: number | undefined = undefined;
      try {
        liq = await fetchTokenLiquidity(token.address);
      } catch {
        // ignore
      }
      setPendingUnverifiedToken({ token, liquidity: liq });
      return;
    }

    if (safeMints.includes(token.address)) {
      onAddToken(token);
      return;
    }

    setCheckingLiquidity(token.address);
    try {
      const liq = await fetchTokenLiquidity(token.address);
      if (liq < 50000) {
        setPendingWarningToken({ token, liquidity: liq });
      } else {
        onAddToken(token);
      }
    } catch {
      onAddToken(token);
    } finally {
      setCheckingLiquidity(null);
    }
  };

  // Popular tokens to recommend upfront
  const popularMints = [
    'So11111111111111111111111111111111111111112', // SOL
    'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', // USDC
    'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB', // USDT
    'JUPyiwrYJFskUPiFG4gpvXvjTE76SreV8NToA8Y5YyJ', // JUP
    'DezXAZ8z7PnrFcPykJzn99s94ChKnmk699rCgHmzUM6y', // BONK
    'EKpQGSJtjv7mrvrtYEVYpZcC9K4N2U6Cee23GG9ApuS6', // WIF
    'jtoJSMRZ87v9vW8vS82T2S8nLcrDLRvM1T8Srx7d378', // JTO
    'HZ1bdEP9qL69SbyS6L4Zf8Y8stb684BBi4M7fL62BLaF', // PYTH
    'orcaEKTd2g64Q656MYNVag39awZDrS5PyAenwbNYCNN', // ORCA
  ];

  // Combine local tokens and Jupiter search results
  let combinedList: Token[] = [...tokensList];
  const query = searchQuery.toLowerCase().trim();

  if (query) {
    combinedList = combinedList.filter(
      (token) =>
        token.symbol.toLowerCase().includes(query) ||
        token.name.toLowerCase().includes(query) ||
        token.address.toLowerCase() === query
    );

    const seenMints = new Set(combinedList.map((t) => t.address));
    jupiterResults.forEach((jupT) => {
      if (!seenMints.has(jupT.address)) {
        seenMints.add(jupT.address);
        combinedList.push(jupT);
      }
    });
  } else if (recommendedOnly) {
    combinedList = combinedList.filter((token) => popularMints.includes(token.address));
  }

  const isSelected = (mint: string) => {
    return selectedTokens.some((t) => t.address === mint);
  };

  return (
    <div id="coin-picker-modal" className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-800 rounded-xl w-full max-w-2xl max-h-[85vh] flex flex-col overflow-hidden shadow-2xl animate-in fade-in zoom-in duration-200">
        
        {/* Header */}
        <div className="p-6 border-b border-slate-800 flex items-center justify-between">
          <div>
            <h3 className="text-xl font-bold text-white tracking-tight flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-emerald-400" />
              Manage Portfolio Allocation
            </h3>
            <p className="text-xs text-slate-400 mt-1">
              Currently picking {selectedTokens.length} tokens. Rebalancer maintains target weight of{' '}
              {selectedTokens.length > 0 ? (100 / selectedTokens.length).toFixed(1) : 0}% each.
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white bg-slate-800 hover:bg-slate-700 p-2 rounded-lg transition-all cursor-pointer"
          >
            ✕
          </button>
        </div>

        {/* Selected Tokens Horizontal Bar */}
        <div className="bg-slate-950 px-6 py-4 border-b border-slate-800">
          <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2">Active Coins ({selectedTokens.length})</h4>
          {selectedTokens.length === 0 ? (
            <p className="text-sm text-slate-500 italic">No coins selected yet. Add at least 2 coins below.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {selectedTokens.map((token) => (
                <div
                  key={token.address}
                  className="flex items-center gap-2 bg-slate-900 border border-slate-800 hover:border-slate-700 px-3 py-1.5 rounded-full text-sm text-white group transition-all"
                >
                  <TokenLogo logoURI={token.logoURI} symbol={token.symbol} size="sm" />
                  <span className="font-semibold text-xs">{token.symbol}</span>
                  <button
                    onClick={() => onRemoveToken(token.address)}
                    className="text-slate-500 hover:text-rose-400 p-0.5 rounded-full hover:bg-slate-850 transition-all ml-1 cursor-pointer"
                    title={`Remove ${token.symbol}`}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
          {selectedTokens.length > 0 && selectedTokens.length < 2 && (
            <div className="flex items-center gap-1.5 mt-2.5 text-xs text-amber-500">
              <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
              <span>You must choose at least 2 tokens for equal-weight rebalancing to calculate drift.</span>
            </div>
          )}
        </div>

        {/* Search Bar & Toggles */}
        <div className="p-4 bg-slate-900 border-b border-slate-800 flex flex-col sm:flex-row gap-3">
          <div className="relative flex-grow">
            <Search className="w-5 h-5 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" />
            <input
              type="text"
              placeholder="Search by token name, symbol, or mint address..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-lg py-2.5 pl-11 pr-4 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-slate-700 transition-all"
            />
          </div>
          <div className="flex items-center justify-between sm:justify-start gap-2 border border-slate-800 rounded-lg px-3 bg-slate-950">
            <span className="text-xs text-slate-400">Filter:</span>
            <button
              onClick={() => setRecommendedOnly(!recommendedOnly)}
              className={`text-xs px-2.5 py-1 rounded-md font-medium transition-all cursor-pointer ${
                recommendedOnly
                  ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/25'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              {recommendedOnly ? 'Top Assets' : 'All Assets'}
            </button>
          </div>
        </div>

        {/* Mint / Address Validation Alerts */}
        {validatingMint && (
          <div className="mx-4 mt-3 flex items-center gap-2 p-3 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-300 animate-pulse">
            <Loader2 className="w-4 h-4 animate-spin text-emerald-400 shrink-0" />
            <span>Searching Jupiter & validating address...</span>
          </div>
        )}

        {/* Step 1b: Pool or pair address suggestion */}
        {!validatingMint && mintValidationResult.status === 'pool_suggestion' && (
          <div className="mx-4 mt-3 p-3.5 bg-amber-950/40 border border-amber-900/50 rounded-xl space-y-2 text-xs">
            <div className="flex gap-2.5 items-start text-amber-300">
              <AlertCircle className="w-4 h-4 shrink-0 text-amber-400 mt-0.5" />
              <div className="flex-1">
                <p className="text-white font-medium text-xs">
                  This looks like a liquidity pool or pair address, not a token. Did you mean:
                </p>
                <div className="mt-2 space-y-1.5">
                  {mintValidationResult.suggestedTokens?.map((sug) => {
                    const isSugVerified = sug.isVerified === true || sug.tags?.includes('verified');
                    return (
                      <div
                        key={sug.address}
                        className="flex items-center justify-between p-2 bg-slate-900/90 border border-slate-800 rounded-lg hover:border-amber-500/50 transition-all gap-2"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <TokenLogo logoURI={sug.logoURI} symbol={sug.symbol} size="sm" />
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="font-bold text-white text-xs">{sug.symbol}</span>
                              <span className="text-[10px] text-slate-400 truncate max-w-[120px]">{sug.name}</span>
                              <span className="text-[10px] font-mono text-slate-400">
                                ({sug.address.slice(0, 4)}...{sug.address.slice(-4)})
                              </span>
                              {!isSugVerified ? (
                                <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/30 uppercase tracking-wider">
                                  Unverified
                                </span>
                              ) : (
                                <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                                  Verified
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                        <button
                          onClick={() => setSearchQuery(sug.address)}
                          className="px-2.5 py-1 bg-amber-400 hover:bg-amber-300 text-slate-950 font-bold rounded text-[11px] shrink-0 cursor-pointer shadow"
                        >
                          Use mint {sug.address.slice(0, 4)}...{sug.address.slice(-4)}
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Step 2: Token Account Detected */}
        {!validatingMint && mintValidationResult.status === 'token_account' && (
          <div className="mx-4 mt-3 p-3 bg-amber-950/40 border border-amber-900/50 rounded-lg space-y-2 text-xs">
            <div className="flex gap-2 items-start text-amber-300">
              <AlertCircle className="w-4 h-4 shrink-0 text-amber-400 mt-0.5" />
              <div className="flex-1">
                <strong className="text-white font-bold">This is a token account, not a token mint.</strong>
                {mintValidationResult.tokenAccountMint && (
                  <div className="mt-2 flex items-center justify-between">
                    <span className="text-[11px] text-slate-400 font-mono">
                      Mint: {mintValidationResult.tokenAccountMint.slice(0, 4)}...{mintValidationResult.tokenAccountMint.slice(-4)}
                    </span>
                    <button
                      onClick={() => setSearchQuery(mintValidationResult.tokenAccountMint!)}
                      className="px-2.5 py-1 bg-amber-400 hover:bg-amber-300 text-slate-950 font-bold rounded text-[10px] cursor-pointer"
                    >
                      Use mint {mintValidationResult.tokenAccountMint.slice(0, 4)}...{mintValidationResult.tokenAccountMint.slice(-4)}
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Invalid address alert */}
        {!validatingMint && mintValidationResult.status === 'invalid' && mintValidationResult.error && (
          <div className="mx-4 mt-3 p-3 bg-rose-950/40 border border-rose-900/50 rounded-lg space-y-1 text-xs">
            <div className="flex gap-2 items-start text-rose-300">
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-400 mt-0.5" />
              <div>
                <strong className="text-white font-bold">Invalid Mint Address:</strong>
                <p className="text-[11px] text-rose-300 mt-0.5 leading-relaxed font-sans">
                  {mintValidationResult.error}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Validated Custom Mint Preview Card */}
        {!validatingMint && mintValidationResult.status === 'valid' && mintValidationResult.token && (
          <div className="mx-4 mt-3 p-3 bg-slate-950 border border-emerald-500/40 rounded-xl flex items-center justify-between gap-3 shadow-md">
            <div className="flex items-center gap-2.5">
              <TokenLogo logoURI={mintValidationResult.token.logoURI} symbol={mintValidationResult.token.symbol} size="md" />
              <div>
                <div className="font-extrabold text-white text-xs flex items-center gap-1.5 flex-wrap">
                  <span>{mintValidationResult.token.symbol}</span>
                  <span className="text-[10px] font-mono text-slate-400 font-normal">
                    ({mintValidationResult.token.address.slice(0, 4)}...{mintValidationResult.token.address.slice(-4)})
                  </span>
                  {!mintValidationResult.isVerified && (
                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/30 uppercase tracking-wider">
                      Unverified
                    </span>
                  )}
                  {mintValidationResult.isToken2022 && (
                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-sky-500/10 text-sky-400 border border-sky-500/30">
                      Token-2022
                    </span>
                  )}
                </div>
                <div className="text-[10px] text-slate-400">
                  {mintValidationResult.token.name} {mintValidationResult.token.decimals !== undefined ? `· ${mintValidationResult.token.decimals} decimals` : ''}
                </div>
              </div>
            </div>

            <button
              onClick={() => handlePreAddCheck(mintValidationResult.token!)}
              className="px-3 py-1.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black rounded-lg text-[10px] flex items-center gap-1 cursor-pointer transition-all shadow shrink-0"
            >
              <Plus className="w-3.5 h-3.5" />
              Add Token
            </button>
          </div>
        )}

        {/* Tokens List Scroll Area */}
        <div className="flex-grow overflow-y-auto p-4 space-y-2 bg-slate-950/40">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-12 text-slate-400 space-y-3">
              <div className="w-8 h-8 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin"></div>
              <p className="text-sm">Fetching Jupiter verified token list...</p>
            </div>
          ) : combinedList.length === 0 ? (
            <div className="text-center py-12 text-slate-500">
              {searchingJupiter ? (
                <div className="flex flex-col items-center justify-center gap-2">
                  <Loader2 className="w-5 h-5 animate-spin text-emerald-400" />
                  <p className="text-sm">Searching Jupiter tokens...</p>
                </div>
              ) : (
                <>
                  <p className="text-sm">No tokens found matching "{searchQuery}"</p>
                  <p className="text-xs mt-1">Make sure you query with accurate Solana symbols, mint, or pool addresses.</p>
                </>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {combinedList.map((token) => {
                const active = isSelected(token.address);
                const isVerified = token.tags?.includes('verified');
                return (
                  <div
                    key={token.address}
                    className={`flex items-center justify-between p-3 rounded-lg border transition-all ${
                      active
                        ? 'bg-emerald-500/5 border-emerald-500/20 shadow-sm'
                        : 'bg-slate-900 border-slate-800 hover:border-slate-700 hover:bg-slate-850'
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <TokenLogo logoURI={token.logoURI} symbol={token.symbol} size="md" />
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="font-bold text-white truncate text-sm">{token.symbol}</span>
                          {isVerified ? (
                            <span className="text-[9px] bg-slate-800 text-slate-300 px-1.5 py-0.5 rounded-full border border-slate-700">
                              Verified
                            </span>
                          ) : (
                            <span className="text-[9px] bg-amber-500/10 text-amber-400 px-1.5 py-0.5 rounded-full border border-amber-500/25 uppercase">
                              Unverified
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-slate-500 truncate">{token.name}</p>
                      </div>
                    </div>

                    <div>
                      {active ? (
                        <button
                          onClick={() => onRemoveToken(token.address)}
                          className="p-1.5 bg-rose-500/10 text-rose-400 hover:bg-rose-500/20 border border-rose-500/25 rounded-lg transition-all cursor-pointer"
                          title="Remove from portfolio"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      ) : (
                        <button
                          onClick={() => handlePreAddCheck(token)}
                          disabled={checkingLiquidity !== null}
                          className="p-1.5 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500 border border-emerald-500/25 hover:text-slate-950 rounded-lg transition-all cursor-pointer disabled:opacity-40 flex items-center justify-center min-w-8 min-h-8"
                          title="Add to portfolio"
                        >
                          {checkingLiquidity === token.address ? (
                            <div className="w-4 h-4 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
                          ) : (
                            <Plus className="w-4 h-4" />
                          )}
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 bg-slate-900 border-t border-slate-800 flex items-center justify-between">
          <p className="text-[10px] text-slate-500 max-w-[65%] leading-relaxed">
            Supports verified Jupiter tokens and custom SPL or Token-2022 mint addresses.
          </p>
          <button
            onClick={onClose}
            disabled={selectedTokens.length < 2}
            className={`px-5 py-2 rounded-lg text-sm font-semibold transition-all ${
              selectedTokens.length >= 2
                ? 'bg-emerald-500 text-slate-950 hover:bg-emerald-400 shadow-md cursor-pointer'
                : 'bg-slate-800 text-slate-500 cursor-not-allowed'
            }`}
          >
            Save Portfolio
          </button>
        </div>
      </div>

      {/* Unverified Token Warning Modal Overlay */}
      {pendingUnverifiedToken && (
        <div className="fixed inset-0 bg-slate-950/90 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-md p-6 space-y-6 shadow-2xl animate-in fade-in zoom-in duration-150 text-left">
            <div className="flex items-start gap-3.5">
              <div className="p-2.5 bg-amber-500/10 text-amber-400 rounded-xl border border-amber-500/20">
                <AlertTriangle className="w-6 h-6" />
              </div>
              <div className="flex-1">
                <h4 className="text-base font-bold text-white tracking-tight">
                  Unverified Token Warning
                </h4>
                <p className="text-xs text-slate-400 mt-1 font-sans">
                  The token <span className="text-amber-400 font-extrabold">{pendingUnverifiedToken.token.symbol}</span> ({pendingUnverifiedToken.token.address.slice(0, 6)}...{pendingUnverifiedToken.token.address.slice(-4)}) is not in Jupiter's verified token registry.
                </p>
              </div>
            </div>

            <div className="bg-slate-950 border border-slate-850 rounded-xl p-4 text-xs text-slate-300 leading-relaxed font-sans space-y-2">
              <p>
                Unverified tokens carry heightened risk of low DEX liquidity, price spoofing, high slippage, or failed rebalancing swaps. Ensure you trust this contract address.
              </p>
              {pendingUnverifiedToken.liquidity !== undefined && (
                <div className="mt-2 p-2.5 bg-slate-900 rounded border border-amber-500/25 text-xs text-amber-300">
                  <span>DEX Liquidity: </span>
                  <strong className="text-white font-mono">
                    ${Number(pendingUnverifiedToken.liquidity).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                  </strong>
                  {pendingUnverifiedToken.liquidity < 50000 && (
                    <span className="text-amber-400 font-semibold ml-1.5">
                      (Low liquidity: below standard $50,000 threshold)
                    </span>
                  )}
                </div>
              )}
            </div>

            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setPendingUnverifiedToken(null)}
                className="flex-grow py-3 bg-slate-850 hover:bg-slate-800 text-white text-xs font-semibold rounded-lg transition-all cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  onAddToken(pendingUnverifiedToken.token);
                  setPendingUnverifiedToken(null);
                }}
                className="flex-grow py-3 bg-amber-500 text-slate-950 text-xs font-extrabold rounded-lg hover:bg-amber-400 transition-all cursor-pointer shadow"
              >
                Proceed & Add Anyway
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Low DEX Liquidity Warning Modal Overlay */}
      {pendingWarningToken && (
        <div className="fixed inset-0 bg-slate-950/90 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-md p-6 space-y-6 shadow-2xl animate-in fade-in zoom-in duration-150 text-left">
            <div className="flex items-start gap-3.5">
              <div className="p-2.5 bg-amber-500/10 text-amber-400 rounded-xl border border-amber-500/20">
                <AlertTriangle className="w-6 h-6" />
              </div>
              <div>
                <h4 className="text-base font-bold text-white tracking-tight">
                  Low DEX Liquidity Warning
                </h4>
                <p className="text-xs text-slate-400 mt-1 font-sans">
                  The token <span className="text-amber-400 font-extrabold">{pendingWarningToken.token.symbol}</span> has a live DEX liquidity pool size of only:
                </p>
                <div className="text-2xl font-mono font-extrabold text-amber-400 mt-2">
                  ${pendingWarningToken.liquidity.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                </div>
              </div>
            </div>

            <div className="bg-slate-950 border border-slate-850 rounded-xl p-4 text-xs text-slate-300 leading-relaxed font-sans space-y-2">
              <p>
                This is below our standard <strong className="text-white">$50,000</strong> safe rebalancing liquidity threshold.
              </p>
              <p>
                Executing swaps with a low-liquidity asset can result in <strong>high slippage, negative price impact, and value degradation</strong> during systematic volatility harvesting.
              </p>
            </div>

            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setPendingWarningToken(null)}
                className="flex-grow py-3 bg-slate-850 hover:bg-slate-800 text-white text-xs font-semibold rounded-lg transition-all cursor-pointer"
              >
                Cancel / Do Not Add
              </button>
              <button
                type="button"
                onClick={() => {
                  onAddToken(pendingWarningToken.token);
                  setPendingWarningToken(null);
                }}
                className="flex-grow py-3 bg-amber-500 text-slate-950 text-xs font-extrabold rounded-lg hover:bg-amber-400 transition-all cursor-pointer shadow"
              >
                Proceed & Add Anyway
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
