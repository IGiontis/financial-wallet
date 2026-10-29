import { collection, deleteField, doc, FieldPath, getDoc, getDocs, query, Timestamp, updateDoc, where, type DocumentData, type DocumentSnapshot } from "./firestoreApi";
import { db } from "./config";
import { localDeletePrefix, localGet, localSet } from "../lib/localStore";
import { meterRead } from "../lib/readMeter";
import { CURSOR_OVERLAP_MS, expiredLogKeys, logEntries, logKey, mergeChanges, needsFullSync, newestUpdate, SYNC_VERSION, type SyncState } from "../lib/deltaSync";

// ─── A user's list, read once per device and then only what changed ──────────
//
// See `lib/deltaSync.ts` for the rules. This is the part that talks to
// Firestore and to the store on the device.
//
// Asking for changes filters on `userId` and `updatedAt` together, which needs
// a composite index per collection. Until the index exists Firestore refuses
// the query; the list is then read whole, exactly as before this existed, and
// the changes query is not tried again until the app is reloaded.

const stateKey = (userId: string, name: string) => `sync:${userId}:${name}`;

/** Collections whose changes query was refused for want of an index, this session. */
const noIndex = new Set<string>();

/** The two fields on the user document the sync keeps. */
const LOG_FIELD = "syncDeletes";
const RESET_FIELD = "syncResetAt";

/**
 * The user's document, shared by the lists synced together at start-up so it
 * is read once for all of them rather than once each.
 */
let userRead: { userId: string; at: number; promise: Promise<DocumentSnapshot<DocumentData>> } | undefined;

function readUser(userId: string, now: number) {
  if (!userRead || userRead.userId !== userId || now - userRead.at > 5000) {
    const promise = getDoc(doc(db, "users", userId));
    void promise.then((snap) => meterRead("users (sync)", 1, !!snap.metadata?.fromCache)).catch(() => {});
    userRead = { userId, at: now, promise };
  }
  return userRead.promise;
}

/** Timestamps become Dates: the store on the device keeps plain values, and every reader takes either. */
function plain(value: unknown): unknown {
  if (value instanceof Timestamp) return value.toDate();
  if (Array.isArray(value)) return value.map(plain);
  if (value && typeof value === "object" && !(value instanceof Date) && Object.getPrototypeOf(value) === Object.prototype) {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, plain(v)]));
  }
  return value;
}

const updatedMs = (row: object) => {
  const updatedAt = (row as { updatedAt?: unknown }).updatedAt;
  return updatedAt instanceof Date ? updatedAt.getTime() : 0;
};

const errorCode = (err: unknown) => (err && typeof err === "object" && "code" in err ? String((err as { code: unknown }).code) : "");

/** `updateDoc` with any number of field paths, which its signature spreads out. */
function updateFields(userId: string, pairs: [FieldPath, unknown][]) {
  if (pairs.length === 0) return Promise.resolve();
  const [[field, value], ...rest] = pairs;
  return updateDoc(doc(db, "users", userId), field, value, ...rest.flat());
}

/**
 * Every document of `name` that belongs to the user, as of now.
 *
 * Whole the first time on a device; after that, the device's copy plus what
 * changed on the server since, which is usually nothing and costs one read.
 */
export async function syncedList<T extends { id: string }>(name: string, userId: string, now: number = Date.now()): Promise<T[]> {
  const toRow = (d: { id: string; data: () => DocumentData }) => ({ id: d.id, ...(plain(d.data()) as object) }) as T;
  const state = await localGet<SyncState<T>>(stateKey(userId, name));

  if (state && !noIndex.has(name)) {
    const userSnap = await readUser(userId, now).catch(() => undefined);
    const fields = (userSnap?.data() ?? {}) as Record<string, unknown>;
    const log = fields[LOG_FIELD];
    pruneLog(userId, log, now);
    const resetAt = typeof fields[RESET_FIELD] === "number" ? (fields[RESET_FIELD] as number) : undefined;

    if (!needsFullSync(state, now, resetAt)) {
      try {
        const since = Timestamp.fromMillis(Math.max(state.cursor - CURSOR_OVERLAP_MS, 0));
        const snap = await getDocs(query(collection(db, name), where("userId", "==", userId), where("updatedAt", ">", since)));
        meterRead(`${name} (changes)`, snap.size, snap.metadata.fromCache);
        const changed = snap.docs.map(toRow);
        const rows = mergeChanges(state.rows, changed, logEntries(log), name, updatedMs);
        // Offline the answer came from the device's cache: shown, but not
        // taken as the server's word, so nothing is moved forward.
        if (!snap.metadata.fromCache) {
          await localSet(stateKey(userId, name), { ...state, rows, cursor: Math.max(state.cursor, newestUpdate(changed, updatedMs)), syncedAt: now } satisfies SyncState<T>);
        }
        return rows;
      } catch (err) {
        // No index yet: read it whole, as before. Anything else also falls
        // back to the whole read rather than leaving the screen empty.
        if (errorCode(err) === "failed-precondition") {
          noIndex.add(name);
          // Firestore's message carries a link that creates the missing index in one click.
          console.warn(`[sync] ${name}: reading only what changed needs an index; until it exists the list is read whole.`, err);
        }
      }
    }
  }

  const snap = await getDocs(query(collection(db, name), where("userId", "==", userId)));
  meterRead(`${name} (whole)`, snap.size, snap.metadata.fromCache);
  const rows = snap.docs.map(toRow);
  if (!snap.metadata.fromCache) {
    await localSet(stateKey(userId, name), { v: SYNC_VERSION, rows, cursor: newestUpdate(rows, updatedMs), syncedAt: now, fullAt: now } satisfies SyncState<T>);
  }
  return rows;
}

/** Drops log entries past their keeping time. Best effort: a failure only leaves them for next time. */
function pruneLog(userId: string, log: unknown, now: number) {
  const expired = expiredLogKeys(log, now);
  void updateFields(
    userId,
    expired.map((key) => [new FieldPath(LOG_FIELD, key), deleteField()]),
  ).catch(() => {});
}

/**
 * After a delete has gone through: tells the user's other devices, through the
 * log, and takes the rows out of this device's copy at once.
 *
 * Best effort. If the log cannot be written — rules that do not allow the
 * field, say — the delete has still happened; other devices catch up at their
 * next whole read, within a week.
 */
export async function noteDeleted(userId: string, name: string, ids: string[]) {
  if (!userId || ids.length === 0) return;
  const at = Date.now();
  userRead = undefined;
  await Promise.all([updateFields(userId, ids.map((id) => [new FieldPath(LOG_FIELD, logKey(name, id)), at])).catch(() => {}), forgetLocally(userId, name, ids)]);
}

/**
 * Documents written again under an id that was deleted before — the records a
 * debt writes have fixed ids — take their deletion back out of the log, so no
 * device drops them as deleted.
 */
export async function noteRecreated(userId: string, name: string, ids: string[]) {
  if (!userId || ids.length === 0) return;
  userRead = undefined;
  await updateFields(
    userId,
    ids.map((id) => [new FieldPath(LOG_FIELD, logKey(name, id)), deleteField()]),
  ).catch(() => {});
}

/** Takes rows out of this device's copy of a list. */
export async function forgetLocally(userId: string, name: string, ids: string[]) {
  const key = stateKey(userId, name);
  const state = await localGet<SyncState<{ id: string }>>(key);
  if (!state || !Array.isArray(state.rows)) return;
  const gone = new Set(ids);
  await localSet(key, { ...state, rows: state.rows.filter((row) => !gone.has(row.id)) });
}

/** After a bulk clear: every device reads its lists whole next time. */
export async function noteReset(userId: string) {
  userRead = undefined;
  await updateDoc(doc(db, "users", userId), { [RESET_FIELD]: Date.now() }).catch(() => {});
  await localDeletePrefix(`sync:${userId}:`);
}

/** On sign-out: nothing of anyone's stays behind in this store. */
export const forgetAllLocal = () => localDeletePrefix("sync:");
