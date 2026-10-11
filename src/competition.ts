export interface CompetitionEntrant {
  address: string;
  label?: string;
}

// Global competition activation flag and current season number.
// When false, the leaderboard shows the frozen Hall of Fame panel with no live RPC reads.
// When true for Season 2, starts clean with fresh entrants and baselines.
export const COMPETITION_ACTIVE = false;
export const COMPETITION_SEASON = 1;

// Hand edited. Add entrant wallet addresses here. label is optional.
export const COMPETITION_ENTRANTS: CompetitionEntrant[] = [
  { address: 'REMOVED_WALLET', label: 'kirk' },
  { address: 'REMOVED_WALLET', label: 'billy' },
  { address: 'REMOVED_WALLET', label: 'naris' },
  { address: 'REMOVED_WALLET', label: 'giza' },
  { address: 'REMOVED_WALLET', label: 'untiedbear' },
  { address: 'REMOVED_WALLET', label: 'coffeeattack' },
];

// Everyone funds with exactly 0.5 SOL at entry. This is the SOL baseline.
export const COMPETITION_BASELINE_SOL = 0.5;

// Prize pool distribution. Pool is in USDC.
// Split: every valid entrant clears a base, the top performer gets a bonus,
// the remainder is shared by performance using a floored min-max weight.
export const COMPETITION_PRIZE_POOL_USD = 200;
export const COMPETITION_BASE_PCT = 0.05;          // per valid entrant
export const COMPETITION_WINNER_BONUS_PCT = 0.10;  // top performer only
export const COMPETITION_REMAINDER_FLOOR = 0.25;   // 0 = pure performance, 1 = flat

// Set by hand at kickoff: the USD value of 0.5 SOL at the moment the
// competition starts (0.5 times the SOL price in USD at that moment).
// Leave null until the competition begins. While null, the USD view is
// disabled and the SOL view still works.
export const COMPETITION_START_USD_BASELINE: number | null = 48.13;

// Optional display metadata. Any field left empty is simply not shown.
export const COMPETITION_META = {
  title: 'The Round Trip Challenge',
  subtitle: '',
  startLabel: '',
  endLabel: '',
  poolLabel: '',
};
