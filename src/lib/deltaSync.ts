// ─── Keeping a list on the device in step with the server ────────────────────
//
// The rules of the sync in `firebase/syncList.ts`, apart from Firestore, so
// they can be tested on their own.
//
// A list is read whole once per device. After that only what changed is asked
// for: documents whose `updatedAt` is newer than the newest one already held
// (the cursor). A deletion leaves no document behind to be found that way, so
// every delete is also written to a short log on the user's own document,
// which is read anyway; the log is applied on top of the changes.
//
// The whole list is read again when the copy on the device cannot be trusted
// to be complete: there is none, it was made by an older version of this
// code, it is older than the log keeps deletions for, the data was reset on
// another device, or a week has passed — a weekly whole read heals anything a
// failed log write or an old version of the app left out of step.

export const SYNC_VERSION = 1;
/** How long a deletion stays in the log on the user's document. */
export const DELETE_LOG_KEEP_MS = 60 * 24 * 60 * 60 * 1000;
/** How often the whole list is read anyway. */
export const FULL_SYNC_EVERY_MS = 7 * 24 * 60 * 60 * 1000;
/** Changes are asked for from a little before the cursor; the overlap is read twice and merged by id. */
export const CURSOR_OVERLAP_MS = 60 * 1000;
/**
 * A deletion is stamped by the deleting device's clock, a document's
 * `updatedAt` by the server's. A document changed later than its deletion by
 * more than this was written again under the same id, and stays.
 */
export const CLOCK_SKEW_MS = 2 * 60 * 1000;

/** One deletion in the log on the user's document. */
export interface DeleteEntry {
  /** The collection. */
  c: string;
  id: string;
  /** When, in milliseconds, by the deleting device's clock. */
  at: number;
}

export interface SyncState<T> {
  v: number;
  rows: T[];
  /** The newest `updatedAt` held, in milliseconds. */
  cursor: number;
  /** When the server was last asked, by this device's clock. */
  syncedAt: number;
  /** When the whole list was last read. */
  fullAt: number;
}

export function needsFullSync(state: SyncState<unknown> | undefined, now: number, resetAt?: number): boolean {
  if (!state || state.v !== SYNC_VERSION || !Array.isArray(state.rows)) return true;
  if (now - state.fullAt > FULL_SYNC_EVERY_MS) return true;
  // Deletions older than the log keeps them may have been dropped from it.
  if (now - state.syncedAt > DELETE_LOG_KEEP_MS) return true;
  // Another device cleared the data in bulk, which writes no log.
  if (resetAt !== undefined && resetAt > state.fullAt) return true;
  return false;
}

/** The newest `updatedAt` among the rows, or 0. */
export function newestUpdate<T>(rows: T[], updatedMs: (row: T) => number): number {
  let newest = 0;
  for (const row of rows) newest = Math.max(newest, updatedMs(row));
  return newest;
}

/**
 * The list held on the device, brought up to date: changed documents replace
 * or join it, and logged deletions for this collection leave it.
 */
export function mergeChanges<T extends { id: string }>(rows: T[], changed: T[], deletes: DeleteEntry[], collection: string, updatedMs: (row: T) => number): T[] {
  const byId = new Map(rows.map((row) => [row.id, row]));
  for (const row of changed) byId.set(row.id, row);
  for (const entry of deletes) {
    if (entry.c !== collection) continue;
    const row = byId.get(entry.id);
    if (row && updatedMs(row) <= entry.at + CLOCK_SKEW_MS) byId.delete(entry.id);
  }
  return [...byId.values()];
}

/**
 * The log as stored on the user document: one field per deleted document,
 * named `collection__id`, holding when. One field per document rather than a
 * list, so writing a document again under the same id can take its deletion
 * back out (see `noteRecreated`).
 */
export type DeleteLog = Record<string, number>;

export const logKey = (collection: string, id: string) => `${collection}__${id}`;

/** The log read back as entries; anything malformed is skipped. */
export function logEntries(log: unknown): DeleteEntry[] {
  if (!log || typeof log !== "object") return [];
  const entries: DeleteEntry[] = [];
  for (const [key, at] of Object.entries(log as Record<string, unknown>)) {
    const split = key.indexOf("__");
    if (split <= 0 || typeof at !== "number") continue;
    entries.push({ c: key.slice(0, split), id: key.slice(split + 2), at });
  }
  return entries;
}

/** Keys of the log old enough to drop. */
export function expiredLogKeys(log: unknown, now: number): string[] {
  if (!log || typeof log !== "object") return [];
  return Object.entries(log as Record<string, unknown>)
    .filter(([, at]) => typeof at !== "number" || now - at > DELETE_LOG_KEEP_MS)
    .map(([key]) => key);
}
