export interface CompetitionEntrant {
  address: string;
  label?: string;
}

// Hand edited. Add entrant wallet addresses here. label is optional.
export const COMPETITION_ENTRANTS: CompetitionEntrant[] = [
  { address: '3MFxDHLMkv863rxcupKQ4srPZnT5yDwFAaTENhJBxaKM', label: 'Placeholder 1' },
  { address: '2MfADSmySVnvAgtrY36hy2zqVHMiQM43rdWmh5dc6HqJ', label: 'Placeholder 2' },
  { address: 'ReplaceWithWalletAddress3', label: 'Placeholder 3' },
];

// Everyone funds with exactly 0.5 SOL at entry. This is the SOL baseline.
export const COMPETITION_BASELINE_SOL = 0.5;

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
