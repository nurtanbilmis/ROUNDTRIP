import { Token, TokenWithPrice, COIN_METADATA } from './types';

// Constants
// All Jupiter calls go through our own server route, which adds the private API key
// (JUP_API_KEY, server-side) and caches shared data like prices. See lib/jupProxy.ts.
const JUP_PROXY = '/api/jup';

function jupUrl(endpoint: string, params: Record<string, string> = {}): string {
  const qs = new URLSearchParams({ p: endpoint, ...params });
  return `${JUP_PROXY}?${qs.toString()}`;
}
const DEXSCREENER_API_BASE = 'https://api.dexscreener.com/latest/dex';

// In-memory cache for verified tokens to avoid spamming the API
let cachedTokens: Token[] = [];

/**
 * Fetches the verified token list from Jupiter Tokens API v2.
 * Returns a subset of verified tokens to prevent overloading the UI.
 */
export async function fetchVerifiedTokens(): Promise<Token[]> {
  if (cachedTokens.length > 0) {
    return cachedTokens;
  }

  try {
    const res = await fetch(jupUrl('tokens/v2/tag', { query: 'verified' }));
    if (!res.ok) {
      throw new Error(`HTTP status ${res.status}`);
    }
    const data = await res.json();
    if (Array.isArray(data)) {
      // Map and sort them
      const tokens: Token[] = data.map((t: any) => ({
        address: t.id,
        symbol: t.symbol,
        name: t.name,
        decimals: t.decimals,
        logoURI: t.icon || undefined,
        tags: t.tags || [],
      }));
      cachedTokens = tokens;
      return tokens;
    }
  } catch (err) {
    console.warn('Could not fetch verified tokens from Jupiter API. Falling back to local token metadata.', err);
  }

  // Fallback to local metadata mapping
  const fallbackTokens: Token[] = Object.entries(COIN_METADATA).map(([mint, meta]) => ({
    address: mint,
    symbol: meta.symbol,
    name: meta.name,
    decimals: meta.decimals,
    logoURI: meta.logoURI,
    tags: ['verified'],
  }));
  cachedTokens = fallbackTokens;
  return fallbackTokens;
}

export const MIN_LIQUIDITY_THRESHOLD = 50000;

/**
 * Verifies if a given mint is a verified token in Jupiter's token list.
 * Returns the resolved Token metadata if verified, otherwise null.
 */
export async function verifyJupiterToken(mint: string): Promise<Token | null> {
  try {
    const verifiedTokens = await fetchVerifiedTokens();
    const matched = verifiedTokens.find(t => t.address === mint);
    if (matched) {
      return matched;
    }
  } catch (err) {
    console.warn(`Error verifying token ${mint} on Jupiter:`, err);
  }
  return null;
}

/**
 * Searches tokens via Jupiter Tokens API v2.
 */
export async function searchJupiterTokens(query: string): Promise<(Token & { isVerified: boolean; id?: string })[]> {
  if (!query || !query.trim()) return [];

  try {
    const res = await fetch(jupUrl('tokens/v2/search', { query: query.trim() }));
    if (!res.ok) {
      return [];
    }
    const data = await res.json();
    if (Array.isArray(data)) {
      return data.map((item: any) => {
        const isVerified = item.isVerified === true || (Array.isArray(item.tags) && item.tags.includes('verified'));
        return {
          id: item.id,
          address: item.id,
          symbol: item.symbol || 'Unknown',
          name: item.name || 'Unknown Token',
          decimals: typeof item.decimals === 'number' ? item.decimals : undefined,
          logoURI: item.icon || item.logoURI || undefined,
          tags: item.tags || (isVerified ? ['verified'] : ['unverified']),
          isVerified,
        };
      });
    }
  } catch (err) {
    console.warn(`Error searching Jupiter tokens for "${query}":`, err);
  }
  return [];
}

/**
 * Fetches token metadata for a single mint using searchJupiterTokens.
 */
export async function fetchTokenMetadata(mint: string): Promise<Token | null> {
  // First, check if we have it in our local static registry
  if (COIN_METADATA[mint]) {
    const meta = COIN_METADATA[mint];
    return {
      address: mint,
      symbol: meta.symbol,
      name: meta.name,
      decimals: meta.decimals,
      logoURI: meta.logoURI,
      tags: ['verified'],
    };
  }

  try {
    const results = await searchJupiterTokens(mint);
    const matched = results.find((item: any) => item.id === mint || item.address === mint);
    if (matched) {
      return {
        address: matched.address,
        symbol: matched.symbol,
        name: matched.name,
        decimals: matched.decimals,
        logoURI: matched.logoURI,
        tags: matched.tags,
      };
    }
  } catch (err) {
    console.warn(`Error fetching token metadata for ${mint} via Jupiter API:`, err);
  }
  return null;
}

/**
 * Fetches the live DEX liquidity in USD for a given mint from DexScreener.
 */
export async function fetchTokenLiquidity(mint: string): Promise<number> {
  try {
    const res = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${mint}`);
    if (!res.ok) return 0;
    const data = await res.json();
    if (data && data.pairs) {
      const solanaPairs = data.pairs.filter((p: any) => p.chainId === 'solana');
      if (solanaPairs.length > 0) {
        let maxLiquidity = 0;
        for (const pair of solanaPairs) {
          const liqUsd = pair.liquidity?.usd || 0;
          if (liqUsd > maxLiquidity) {
            maxLiquidity = liqUsd;
          }
        }
        return maxLiquidity;
      }
    }
  } catch (err) {
    console.error(`Error fetching liquidity for ${mint}:`, err);
  }
  return 0;
}

/**
 * fetch() with one retry on network errors, HTTP 429 and 5xx responses.
 */
async function fetchWithRetry(url: string, init?: RequestInit, retryDelayMs = 1500): Promise<Response> {
  const isRetryable = (status: number) => status === 429 || status >= 500;
  try {
    const res = await fetch(url, init);
    if (!isRetryable(res.status)) return res;
  } catch {
    // network error: fall through to the retry
  }
  await new Promise((r) => setTimeout(r, retryDelayMs));
  return fetch(url, init);
}

function toNumber(value: unknown): number | null {
  const n = typeof value === 'number' ? value : typeof value === 'string' ? parseFloat(value) : NaN;
  return Number.isFinite(n) ? n : null;
}

/**
 * Fetches real-time USD prices and 24h price changes for tokens.
 * Uses Jupiter Price API v3 as the primary source and DexScreener as fallback.
 *
 * IMPORTANT: a mint is only included in the result when a real price (> 0) was found.
 * Missing mints mean "unknown", never "$0". Callers merge results over the previous
 * prices, so a failed refresh keeps the last good price instead of zeroing it.
 */
export async function fetchPricesAndInfo(mints: string[]): Promise<Record<string, { price: number; change24h: number }>> {
  const found: Record<string, { price: number | null; change24h: number | null }> = {};
  if (mints.length === 0) return {};

  for (const mint of mints) {
    found[mint] = { price: null, change24h: null };
  }

  // DexScreener accepts at most 30 addresses per request. Sorting keeps batches (and so
  // request URLs) identical across users, so the server-side price cache can be shared.
  const BATCH_SIZE = 30;
  const sortedMints = [...new Set(mints)].sort();
  const batches: string[][] = [];
  for (let i = 0; i < sortedMints.length; i += BATCH_SIZE) {
    batches.push(sortedMints.slice(i, i + BATCH_SIZE));
  }

  for (const batch of batches) {
    // 1. Jupiter Price API v3
    try {
      const res = await fetchWithRetry(jupUrl('price/v3', { ids: batch.join(',') }));
      if (res.ok) {
        const data = await res.json();
        for (const mint of batch) {
          const item = data?.[mint];
          if (!item) continue;
          const price = toNumber(item.usdPrice);
          if (price !== null && price > 0) found[mint].price = price;
          const change = toNumber(item.priceChange24h);
          if (change !== null) found[mint].change24h = change;
        }
      } else {
        console.warn(`Jupiter Price API returned HTTP ${res.status}`);
      }
    } catch (err) {
      console.error('Error fetching prices from Jupiter Price API v3:', err);
    }

    // 2. DexScreener: fallback prices and 24h changes (most liquid Solana pair per mint)
    try {
      const res = await fetchWithRetry(`${DEXSCREENER_API_BASE}/tokens/${batch.join(',')}`);
      if (res.ok) {
        const data = await res.json();
        if (data && Array.isArray(data.pairs)) {
          const solanaPairs = data.pairs
            .filter((pair: any) => pair.chainId === 'solana')
            .sort((a: any, b: any) => (b.liquidity?.usd || 0) - (a.liquidity?.usd || 0));

          const populatedMints = new Set<string>();
          for (const pair of solanaPairs) {
            const mintAddress = pair.baseToken?.address;
            if (!mintAddress || !found[mintAddress] || !batch.includes(mintAddress) || populatedMints.has(mintAddress)) continue;
            populatedMints.add(mintAddress);

            if (found[mintAddress].change24h === null) {
              const change = toNumber(pair.priceChange?.h24);
              if (change !== null) found[mintAddress].change24h = change;
            }
            if (found[mintAddress].price === null) {
              const price = toNumber(pair.priceUsd);
              if (price !== null && price > 0) found[mintAddress].price = price;
            }
          }
        }
      } else {
        console.warn(`DexScreener returned HTTP ${res.status}`);
      }
    } catch (err) {
      console.error('Error fetching prices from DexScreener:', err);
    }
  }

  const result: Record<string, { price: number; change24h: number }> = {};
  for (const [mint, info] of Object.entries(found)) {
    if (info.price !== null && info.price > 0) {
      result[mint] = { price: info.price, change24h: info.change24h ?? 0 };
    }
  }
  return result;
}

/**
 * Fetches a real quote from Jupiter for a swap between inputMint and outputMint.
 */
export async function fetchQuote(params: {
  inputMint: string;
  outputMint: string;
  amount: string; // Base units (lamports/atoms)
  slippageBps?: number;
}): Promise<any> {
  const { inputMint, outputMint, amount, slippageBps = 50 } = params;
  
  // Clean parameter check
  if (inputMint === outputMint || parseFloat(amount) <= 0) {
    throw new Error('Invalid quote parameters');
  }

  // URL construction for swap/v1/quote
  const url = jupUrl('swap/v1/quote', { inputMint, outputMint, amount, slippageBps: String(slippageBps) });

  const res = await fetch(url);
  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`Jupiter Quote API failed: ${errorText}`);
  }

  return await res.json();
}

/**
 * Builds a swap transaction using Jupiter's v1 swap endpoint.
 * Accepts the quoteResponse and public key of the signing wallet.
 */
export async function buildSwapTransaction(params: {
  quoteResponse: any;
  userPublicKey: string;
  wrapAndUnwrapSol?: boolean;
}): Promise<any> {
  const { quoteResponse, userPublicKey, wrapAndUnwrapSol = true } = params;

  const url = jupUrl('swap/v1/swap');

  const body: any = {
    quoteResponse,
    userPublicKey,
    wrapAndUnwrapSol,
    dynamicComputeUnitLimit: true,
    prioritizationFeeLamports: 'auto',
  };

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  const res = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`Jupiter Swap API failed: ${errorText}`);
  }

  return await res.json();
}
