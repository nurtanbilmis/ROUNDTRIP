export interface PresetToken {
  symbol: string;
  expectedMint: string;
}

export interface Preset {
  id: string;
  name: string;
  description: string;
  riskLabel: string;
  riskNote: string;
  tokens: PresetToken[];
}

export const PRESETS: Preset[] = [
  {
    id: 'steady',
    name: 'Steady',
    description: 'Gold + two broad US equity index tokens.',
    riskLabel: 'Safe',
    riskNote: 'Lowest single-name risk of the four - no coin here can casually go to zero. Gold is the real diversifier; SPYx and QQQx overlap (both broad US indices, QQQ tech-tilted), so expect a modest rebalancing harvest - this basket is more about stability than accumulation. PAXG uses the Token-2022 standard and may have thinner liquidity than the equity legs; if its live liquidity is low, the liquidity warning will flag it, and XAUt0 or XAUM are drop-in gold alternatives.',
    tokens: [
      { symbol: 'PAXG', expectedMint: '5GgRAEmv8ZxF2PR5hY72Qs5x1bnQ6UK2RbTPoqJ3wSwW' },
      { symbol: 'SPYx', expectedMint: 'XsoCS1TfEyfFhfvj8EtZ528L3CaKBDBRqRapnBbDF2W' },
      { symbol: 'QQQx', expectedMint: 'Xs8S1uUs1zvS2p7iwtsG3b6fkhpvmwz4GYU3gWAmWHZ' }
    ]
  },
  {
    id: 'majors',
    name: 'Majors',
    description: 'Crypto majors plus two mega-cap tech stocks - decorrelated across the crypto/equity line.',
    riskLabel: 'Bit less safe',
    riskNote: 'Blends the three most established crypto assets with two mega-cap tech stocks. Crypto and equities genuinely diverge, so this basket harvests reasonably while staying in resilient names. Full crypto drawdown risk applies - expect large swings - but individual-asset death risk is low.',
    tokens: [
      { symbol: 'cbBTC', expectedMint: 'cbbtcf3aa214zXHbiAZQwf4122FBYbraNdFqgw4iMij' },
      { symbol: 'ETH', expectedMint: '7vfCXTUXx5WJV5JADk17DUJ4ksgau7utNKj4b963voxs' },
      { symbol: 'SOL', expectedMint: 'So11111111111111111111111111111111111111112' },
      { symbol: 'NVDAx', expectedMint: 'Xsc9qvGR1efVDFGLrVsmkzv3qi45LTBjeUKSPmx9qEh' },
      { symbol: 'TSLAx', expectedMint: 'XsDoVfqeBukxuZHWhdvWHBhgEHjGNst4MLodqsJHzoB' }
    ]
  },
  {
    id: 'ai_tech',
    name: 'AI & Tech',
    description: 'The most liquid AI/big-tech names.',
    riskLabel: 'Thematic - Bit less safe',
    riskNote: 'A thematic AI basket. These names are highly correlated - they tend to move on the same news - so weights drift apart less often and this basket rebalances less frequently than a decorrelated one. Great narrative, modest rebalancing engine. Low chance any single name goes to zero.',
    tokens: [
      { symbol: 'NVDAx', expectedMint: 'Xsc9qvGR1efVDFGLrVsmkzv3qi45LTBjeUKSPmx9qEh' },
      { symbol: 'GOOGLx', expectedMint: 'XsCPL9dNWBMvFtTmwcCA5v3xWPSMEBCszbQdiLLq6aN' },
      { symbol: 'AMZNx', expectedMint: 'Xs3eBt7uRfJX8QUs4suhyU8p2M6DoUDrJyWBa8LLZsg' },
      { symbol: 'METAx', expectedMint: 'Xsa62P5mvPszXL1krVUnU5ar38bBSVcWAB6fmPCo5Zu' }
    ]
  },
  {
    id: 'high_beta',
    name: 'High Beta',
    description: 'Solana-ecosystem and higher-volatility crypto.',
    riskLabel: 'High risk',
    riskNote: 'High volatility and Solana/DeFi-concentrated. HYPE is bridged from another chain - confirm its live Solana liquidity before trading, as bridged wrappers can be thin. This basket moves a lot (good for harvesting) but carries real drawdown and, for the smaller names, real liquidity risk. The crash-warning and remove-coin tools matter most here.',
    tokens: [
      { symbol: 'HYPE', expectedMint: '98sMhvDwXj1RQi5c5Mndm3vPe9cBqPrbLaufMXFNMh5g' },
      { symbol: 'JTO', expectedMint: 'jtojtomepa8beP8AuQc6eXt5FriJwfFMwQx2v2f9mCL' },
      { symbol: 'JUP', expectedMint: 'JUPyiwrYJFskUPiFG4gpvXvjTE76SreV8NToA8Y5YyJ' }
    ]
  }
];
