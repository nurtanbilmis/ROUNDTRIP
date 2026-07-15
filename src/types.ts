export interface Token {
  address: string; // mint address
  symbol: string;
  name: string;
  decimals?: number;
  logoURI?: string;
  tags?: string[];
}

export interface TokenWithPrice extends Token {
  price?: number;
  change24h?: number; // 24h price change percentage
}

export interface TokenBalance {
  mint: string;
  symbol: string;
  decimals: number;
  amount: number; // in base units (lamports/atoms)
  amountHuman: number; // human-readable units
  price: number; // current price in USD
  usdValue: number; // amountHuman * price
  currentWeight: number; // current percentage of portfolio
  targetWeight: number; // target percentage (100 / n)
  drift: number; // currentWeight - targetWeight (in percentage points)
  logoURI?: string;
  change24h?: number;
}

export interface LinkGroup {
  id: string;
  name: string;
  color: string; // 'violet' | 'amber' | 'sky' | 'rose' | 'lime'
  memberMints: string[];
}

export const GROUP_COLORS = ['violet', 'amber', 'sky', 'rose', 'lime'];

export function getGroupColorClasses(color: string) {
  switch (color) {
    case 'violet':
      return {
        text: 'text-violet-400',
        bg: 'bg-violet-500/10',
        border: 'border-violet-500/20',
        ring: 'ring-violet-500/40',
        borderL: 'border-l-violet-500',
        fill: 'fill-violet-400',
        bgSolid: 'bg-violet-500',
        textDark: 'text-violet-200',
        borderHover: 'hover:border-violet-500/40',
      };
    case 'amber':
      return {
        text: 'text-amber-400',
        bg: 'bg-amber-500/10',
        border: 'border-amber-500/20',
        ring: 'ring-amber-500/40',
        borderL: 'border-l-amber-500',
        fill: 'fill-amber-400',
        bgSolid: 'bg-amber-500',
        textDark: 'text-amber-200',
        borderHover: 'hover:border-amber-500/40',
      };
    case 'sky':
      return {
        text: 'text-sky-400',
        bg: 'bg-sky-500/10',
        border: 'border-sky-500/20',
        ring: 'ring-sky-500/40',
        borderL: 'border-l-sky-500',
        fill: 'fill-sky-400',
        bgSolid: 'bg-sky-500',
        textDark: 'text-sky-200',
        borderHover: 'hover:border-sky-500/40',
      };
    case 'rose':
      return {
        text: 'text-rose-400',
        bg: 'bg-rose-500/10',
        border: 'border-rose-500/20',
        ring: 'ring-rose-500/40',
        borderL: 'border-l-rose-500',
        fill: 'fill-rose-400',
        bgSolid: 'bg-rose-500',
        textDark: 'text-rose-200',
        borderHover: 'hover:border-rose-500/40',
      };
    case 'lime':
      return {
        text: 'text-lime-400',
        bg: 'bg-lime-500/10',
        border: 'border-lime-500/20',
        ring: 'ring-lime-500/40',
        borderL: 'border-l-lime-500',
        fill: 'fill-lime-400',
        bgSolid: 'bg-lime-500',
        textDark: 'text-lime-200',
        borderHover: 'hover:border-lime-500/40',
      };
    default:
      return {
        text: 'text-slate-400',
        bg: 'bg-slate-500/10',
        border: 'border-slate-500/20',
        ring: 'ring-slate-500/40',
        borderL: 'border-l-slate-500',
        fill: 'fill-slate-400',
        bgSolid: 'bg-slate-500',
        textDark: 'text-slate-200',
        borderHover: 'hover:border-slate-500/40',
      };
  }
}

export interface RebalanceSwap {
  inputMint: string;
  inputSymbol: string;
  inputDecimals: number;
  outputMint: string;
  outputSymbol: string;
  outputDecimals: number;
  amount: number; // base units of input
  amountHuman: number;
  usdValue: number;
}

export interface BalanceSnapshot {
  id: string;
  groupId: string;
  groupName?: string;
  eventType?: 'convert' | 'rebalance' | 'cashout' | 'membership' | 'manual';
  timestamp: number;
  totalUsdValue: number;
  balances: {
    mint: string;
    symbol: string;
    units?: number;
    amountHuman: number;
    price: number;
    usdValue: number;
  }[];
}

export type WalletType = 'phantom' | 'solflare' | 'backpack' | 'demo' | null;

export interface SolanaWalletState {
  publicKey: string | null;
  type: WalletType;
  connected: boolean;
  connecting: boolean;
  balances: Record<string, number>; // mint -> base units balance
}

/**
 * Adaptive price formatting helper for micro-priced tokens.
 * Prints standard prices with 2-4 decimals, and smaller prices with up to 10 decimals.
 */
export function formatPrice(price: number): string {
  if (price === 0) return '$0.00';
  if (price >= 0.01) {
    return '$' + price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 });
  }
  const str = price.toFixed(12);
  const parts = str.split('.');
  if (parts.length < 2) return '$' + price.toString();
  const frac = parts[1];
  let leadingZeros = 0;
  for (let i = 0; i < frac.length; i++) {
    if (frac[i] === '0') {
      leadingZeros++;
    } else {
      break;
    }
  }
  const decimals = Math.min(10, leadingZeros + 4);
  // strip trailing zeros of the fixed result to keep it clean, but keep at least 4 decimals
  const formatted = price.toFixed(decimals);
  return '$' + formatted;
}

export const COIN_LINE_COLORS = [
  '#10b981', // emerald
  '#3b82f6', // blue
  '#f59e0b', // amber
  '#ec4899', // pink
  '#8b5cf6', // violet
  '#14b8a6', // teal
  '#ef4444', // red
  '#06b6d4', // cyan
];

export const COIN_METADATA: Record<string, { symbol: string; name: string; decimals: number; logoURI?: string }> = {
  'So11111111111111111111111111111111111111112': {
    symbol: 'SOL',
    name: 'Solana',
    decimals: 9,
    logoURI: 'https://dd.dexscreener.com/api/logo/1/solana/So11111111111111111111111111111111111111112'
  },
  'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v': {
    symbol: 'USDC',
    name: 'USD Coin',
    decimals: 6,
    logoURI: 'https://dd.dexscreener.com/api/logo/1/solana/EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'
  },
  'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB': {
    symbol: 'USDT',
    name: 'Tether USD',
    decimals: 6,
    logoURI: 'https://dd.dexscreener.com/api/logo/1/solana/Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB'
  },
  'JUPyiwrYJFskUPiFG4gpvXvjTE76SreV8NToA8Y5YyJ': {
    symbol: 'JUP',
    name: 'Jupiter',
    decimals: 6,
    logoURI: 'https://dd.dexscreener.com/api/logo/1/solana/JUPyiwrYJFskUPiFG4gpvXvjTE76SreV8NToA8Y5YyJ'
  },
  'DezXAZ8z7PnrFcPykJzn99s94ChKnmk699rCgHmzUM6y': {
    symbol: 'BONK',
    name: 'Bonk',
    decimals: 5,
    logoURI: 'https://dd.dexscreener.com/api/logo/1/solana/DezXAZ8z7PnrFcPykJzn99s94ChKnmk699rCgHmzUM6y'
  },
  '5GgRAEmv8ZxF2PR5hY72Qs5x1bnQ6UK2RbTPoqJ3wSwW': {
    symbol: 'PAXG',
    name: 'Pax Gold (Token-2022)',
    decimals: 6,
  },
  'XsoCS1TfEyfFhfvj8EtZ528L3CaKBDBRqRapnBbDF2W': {
    symbol: 'SPYx',
    name: 'SPY Basket Token',
    decimals: 6,
  },
  'Xs8S1uUs1zvS2p7iwtsG3b6fkhpvmwz4GYU3gWAmWHZ': {
    symbol: 'QQQx',
    name: 'QQQ Basket Token',
    decimals: 6,
  },
  'cbbtcf3aa214zXHbiAZQwf4122FBYbraNdFqgw4iMij': {
    symbol: 'cbBTC',
    name: 'Coinbase Wrapped BTC',
    decimals: 8,
  },
  '7vfCXTUXx5WJV5JADk17DUJ4ksgau7utNKj4b963voxs': {
    symbol: 'ETH',
    name: 'Ethereum',
    decimals: 8,
  },
  'Xsc9qvGR1efVDFGLrVsmkzv3qi45LTBjeUKSPmx9qEh': {
    symbol: 'NVDAx',
    name: 'Nvidia Basket Token',
    decimals: 6,
  },
  'XsDoVfqeBukxuZHWhdvWHBhgEHjGNst4MLodqsJHzoB': {
    symbol: 'TSLAx',
    name: 'Tesla Basket Token',
    decimals: 6,
  },
  'XsCPL9dNWBMvFtTmwcCA5v3xWPSMEBCszbQdiLLq6aN': {
    symbol: 'GOOGLx',
    name: 'Google Basket Token',
    decimals: 6,
  },
  'Xs3eBt7uRfJX8QUs4suhyU8p2M6DoUDrJyWBa8LLZsg': {
    symbol: 'AMZNx',
    name: 'Amazon Basket Token',
    decimals: 6,
  },
  'Xsa62P5mvPszXL1krVUnU5ar38bBSVcWAB6fmPCo5Zu': {
    symbol: 'METAx',
    name: 'Meta Basket Token',
    decimals: 6,
  },
  '98sMhvDwXj1RQi5c5Mndm3vPe9cBqPrbLaufMXFNMh5g': {
    symbol: 'HYPE',
    name: 'Hyperliquid',
    decimals: 9,
  },
  'jtojtomepa8beP8AuQc6eXt5FriJwfFMwQx2v2f9mCL': {
    symbol: 'JTO',
    name: 'Jito',
    decimals: 9,
  }
};

export const DEFAULT_POPULAR_MINTS = [
  'So11111111111111111111111111111111111111112', // SOL
  '7vfCXTUXx5WJV5JADk17DUJ4ksgau7utNKj4b963voxs', // ETH
  'cbbtcf3aa214zXHbiAZQwf4122FBYbraNdFqgw4iMij', // cbBTC
  'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', // USDC
  'JUPyiwrYJFskUPiFG4gpvXvjTE76SreV8NToA8Y5YyJ', // JUP
  '5GgRAEmv8ZxF2PR5hY72Qs5x1bnQ6UK2RbTPoqJ3wSwW', // PAXG
  'DezXAZ8z7PnrFcPykJzn99s94ChKnmk699rCgHmzUM6y', // BONK
];


