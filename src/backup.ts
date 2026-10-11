import { HarvestEvent, LinkGroup } from './types';

/**
 * Backup file for moving a wallet's baskets and harvest ledger between browsers
 * or domains. Data otherwise lives only in localStorage, which is tied to one
 * browser and one website address.
 *
 * Format v1 (keep stable: older app versions produce exactly this shape):
 * {
 *   "app": "round-trip",
 *   "kind": "backup",
 *   "version": 1,
 *   "exportedAt": "2026-10-11T12:00:00.000Z",
 *   "wallet": "<wallet address, or 'guest'>",
 *   "groups": LinkGroup[],
 *   "harvestLedger": HarvestEvent[]
 * }
 */
export interface RoundTripBackup {
  app: 'round-trip';
  kind: 'backup';
  version: 1;
  exportedAt: string;
  wallet: string;
  groups: LinkGroup[];
  harvestLedger: HarvestEvent[];
}

export function buildBackup(wallet: string, groups: LinkGroup[], harvestLedger: HarvestEvent[]): RoundTripBackup {
  return {
    app: 'round-trip',
    kind: 'backup',
    version: 1,
    exportedAt: new Date().toISOString(),
    wallet,
    groups,
    harvestLedger,
  };
}

export function backupFileName(backup: RoundTripBackup): string {
  const who = backup.wallet === 'guest' ? 'guest' : backup.wallet.slice(0, 6);
  return `round-trip-backup-${who}-${backup.exportedAt.slice(0, 10)}.json`;
}

/** Triggers a browser download of the backup as a JSON file. */
export function downloadBackup(backup: RoundTripBackup): void {
  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = backupFileName(backup);
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const isStr = (v: unknown): v is string => typeof v === 'string' && v.length > 0;
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

function isValidGroup(g: any): g is LinkGroup {
  return (
    g && isStr(g.id) && isStr(g.name) &&
    Array.isArray(g.memberMints) && g.memberMints.every(isStr) &&
    (g.targetWeights === undefined ||
      (typeof g.targetWeights === 'object' && Object.values(g.targetWeights).every(isNum)))
  );
}

function isValidHarvestEvent(e: any): e is HarvestEvent {
  return (
    e && isStr(e.id) && isNum(e.timestamp) && typeof e.txId === 'string' &&
    isStr(e.soldMint) && isStr(e.boughtMint) &&
    isNum(e.soldUnits) && isNum(e.boughtUnits)
  );
}

export interface ParsedBackup {
  backup: RoundTripBackup;
  /** Entries dropped because they were malformed */
  skippedGroups: number;
  skippedEvents: number;
}

/** Parses and validates a backup file's text. Throws an Error with a user-facing message. */
export function parseBackup(text: string): ParsedBackup {
  let data: any;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error('This file is not valid JSON.');
  }
  if (!data || data.app !== 'round-trip' || data.kind !== 'backup') {
    throw new Error('This is not a Round Trip backup file.');
  }
  if (data.version !== 1) {
    throw new Error(`Unsupported backup version (${data.version}). Please update Round Trip.`);
  }
  if (!isStr(data.wallet) || !Array.isArray(data.groups) || !Array.isArray(data.harvestLedger)) {
    throw new Error('The backup file is incomplete or damaged.');
  }

  const groups = data.groups.filter(isValidGroup);
  const harvestLedger = data.harvestLedger.filter(isValidHarvestEvent);

  return {
    backup: {
      app: 'round-trip',
      kind: 'backup',
      version: 1,
      exportedAt: isStr(data.exportedAt) ? data.exportedAt : '',
      wallet: data.wallet,
      groups,
      harvestLedger,
    },
    skippedGroups: data.groups.length - groups.length,
    skippedEvents: data.harvestLedger.length - harvestLedger.length,
  };
}

export interface MergeResult {
  groups: LinkGroup[];
  harvestLedger: HarvestEvent[];
  addedGroups: number;
  addedEvents: number;
}

/**
 * Merges a backup into the current data without losing anything.
 * - Groups: added when their id isn't present yet (existing groups win).
 * - Harvest events: added when neither the id nor the transaction id is present yet,
 *   so importing the same file twice never double-counts a swap.
 */
export function mergeBackup(
  currentGroups: LinkGroup[],
  currentLedger: HarvestEvent[],
  backup: RoundTripBackup
): MergeResult {
  const groupIds = new Set(currentGroups.map((g) => g.id));
  const newGroups = backup.groups.filter((g) => !groupIds.has(g.id));

  const eventIds = new Set(currentLedger.map((e) => e.id));
  // One transaction can hold several legs only with different mints, so key on tx + mints
  const txKey = (e: HarvestEvent) => (e.txId ? `${e.txId}:${e.soldMint}:${e.boughtMint}` : '');
  const txKeys = new Set(currentLedger.map(txKey).filter(Boolean));
  const newEvents = backup.harvestLedger.filter(
    (e) => !eventIds.has(e.id) && !(txKey(e) && txKeys.has(txKey(e)))
  );

  return {
    groups: [...currentGroups, ...newGroups],
    harvestLedger: [...currentLedger, ...newEvents].sort((a, b) => a.timestamp - b.timestamp),
    addedGroups: newGroups.length,
    addedEvents: newEvents.length,
  };
}
