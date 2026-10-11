export interface CompetitionEntrant {
  address: string;
  label?: string;
}

/*
 * HOW TO START A COMPETITION SEASON
 * 1. SHOW_LEADERBOARD = true            (shows the Leaderboard tab)
 * 2. COMPETITION_ACTIVE = true          (live standings instead of the Hall of Fame)
 * 3. COMPETITION_SEASON = <number>
 * 4. COMPETITION_ENTRANTS = [{ address: '<wallet>', label: '<name>' }, ...]
 * 5. COMPETITION_START_USD_BASELINE = USD value of 0.5 SOL at kickoff
 *    (0.5 x SOL price at the start moment)
 * 6. COMPETITION_META.startLabel / endLabel = start and end dates as shown to users
 * Commit, open a pull request, merge: the site redeploys with the season live.
 */

// Shows or hides the Leaderboard tab. The leaderboard code stays in place while hidden.
export const SHOW_LEADERBOARD = false;

// When false, the leaderboard shows the frozen Hall of Fame panel with no live RPC reads.
export const COMPETITION_ACTIVE = false;
export const COMPETITION_SEASON = 2;

// Hand edited. Add entrant wallet addresses here. label is optional.
export const COMPETITION_ENTRANTS: CompetitionEntrant[] = [];

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
export const COMPETITION_START_USD_BASELINE: number | null = null;

// Optional display metadata. Any field left empty is simply not shown.
export const COMPETITION_META = {
  title: 'The Round Trip Challenge',
  subtitle: '',
  startLabel: '',
  endLabel: '',
  poolLabel: '',
};
