import { Token, TokenWithPrice, COIN_METADATA } from './types';

// Constants
const JUP_API_BASE = 'https://api.jup.ag';
const TOKENS_API_BASE = 'https://api.jup.ag';
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

  const headers: Record<string, string> = {};
  const apiKey = (import.meta as any).env.VITE_JUP_API_KEY || (import.meta as any).env.VITE_JUPITER_API_KEY || '';
  if (apiKey) {
    headers['x-api-key'] = apiKey;
  }

  try {
    const res = await fetch(`${TOKENS_API_BASE}/tokens/v2/tag?query=verified`, { headers });
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
 * Fetches token metadata for a single mint from tokens.jup.ag API.
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
    };
  }

  try {
    const res = await fetch(`https://tokens.jup.ag/token/${mint}`);
    if (!res.ok) {
      return null;
    }
    const data = await res.json();
    if (data) {
      return {
        address: data.address || mint,
        symbol: data.symbol || 'Unknown',
        name: data.name || 'Unknown Token',
        decimals: typeof data.decimals === 'number' ? data.decimals : undefined,
        logoURI: data.logoURI || data.icon || undefined,
      } as any;
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
 * Fetches real-time USD prices and 24h price changes for tokens.
 * Uses Jupiter Price API v3 for exact pricing, and DexScreener as a secondary/fallback source.
 */
export async function fetchPricesAndInfo(mints: string[]): Promise<Record<string, { price: number; change24h: number }>> {
  const result: Record<string, { price: number; change24h: number }> = {};
  if (mints.length === 0) return result;

  // Initialize with fallback/default zero values
  for (const mint of mints) {
    result[mint] = { price: 0, change24h: 0 };
  }

  // 1. Fetch live prices from Jupiter Price API v3
  try {
    const headers: Record<string, string> = {};
    const apiKey = (import.meta as any).env.VITE_JUP_API_KEY || (import.meta as any).env.VITE_JUPITER_API_KEY || '';
    if (apiKey) {
      headers['x-api-key'] = apiKey;
    }
    const res = await fetch(`${JUP_API_BASE}/price/v3?ids=${mints.join(',')}`, { headers });
    if (res.ok) {
      const data = await res.json();
      if (data) {
        for (const mint of mints) {
          const item = data[mint];
          if (item) {
            if (typeof item.usdPrice === 'number') {
              result[mint].price = item.usdPrice;
            } else if (typeof item.usdPrice === 'string') {
              result[mint].price = parseFloat(item.usdPrice);
            }

            if (typeof item.priceChange24h === 'number') {
              result[mint].change24h = item.priceChange24h;
            } else if (typeof item.priceChange24h === 'string') {
              result[mint].change24h = parseFloat(item.priceChange24h);
            }
          }
        }
      }
    }
  } catch (err) {
    console.error('Error fetching prices from Jupiter Price API v3:', err);
  }

  // 2. Fetch 24h percentage changes and fallback prices from DexScreener
  try {
    // DexScreener accepts batch queries (up to 30)
    const res = await fetch(`${DEXSCREENER_API_BASE}/tokens/${mints.join(',')}`);
    if (res.ok) {
      const data = await res.json();
      if (data && data.pairs) {
        // Filter to Solana blockchain pairs only and sort by liquidity descending
        const solanaPairs = data.pairs
          .filter((pair: any) => pair.chainId === 'solana')
          .sort((a: any, b: any) => (b.liquidity?.usd || 0) - (a.liquidity?.usd || 0));

        // Tracks which mints we have already populated from the highest liquidity Solana pair
        const populatedMints = new Set<string>();

        for (const pair of solanaPairs) {
          const mintAddress = pair.baseToken?.address;
          if (mintAddress && mints.includes(mintAddress) && !populatedMints.has(mintAddress)) {
            // Fallback: If 24h change is not set/fetched yet from Jupiter, fill it from DexScreener
            if (result[mintAddress].change24h === 0 && pair.priceChange && typeof pair.priceChange.h24 === 'number') {
              result[mintAddress].change24h = pair.priceChange.h24;
            }
            // Fallback: ONLY fill price when the Jupiter price is 0/missing
            if (result[mintAddress].price === 0 && pair.priceUsd) {
              result[mintAddress].price = parseFloat(pair.priceUsd);
            }
            populatedMints.add(mintAddress);
          }
        }
      }
    }
  } catch (err) {
    console.error('Error fetching 24h changes from DexScreener:', err);
  }

  // Real mode: keep price as 0 ("price unavailable"), which will exclude it from calculations

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
  let url = `${JUP_API_BASE}/swap/v1/quote?inputMint=${inputMint}&outputMint=${outputMint}&amount=${amount}&slippageBps=${slippageBps}`;

  const headers: Record<string, string> = {};
  const apiKey = (import.meta as any).env.VITE_JUP_API_KEY || (import.meta as any).env.VITE_JUPITER_API_KEY || '';
  if (apiKey) {
    headers['x-api-key'] = apiKey;
  }

  const res = await fetch(url, { headers });
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

  const url = `${JUP_API_BASE}/swap/v1/swap`;

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
  const apiKey = (import.meta as any).env.VITE_JUP_API_KEY || (import.meta as any).env.VITE_JUPITER_API_KEY || '';
  if (apiKey) {
    headers['x-api-key'] = apiKey;
  }

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
