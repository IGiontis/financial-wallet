import * as sdk from "firebase/firestore";
import { isDemo } from "../demo/demoMode";
import * as memory from "../demo/memoryFirestore";
import { accountDeletingError, isDeletingAccount, refuseWhileDeleting } from "./deletionGate";

// ─── Firestore, or the demo's copy of it ─────────────────────────────────────
//
// The data layer imports its Firestore calls from here rather than from the SDK.
// Each one is the SDK's own outside the demo, and the in-memory store's inside
// it (`demo/memoryFirestore`), chosen when it is called — so the demo is one
// switch in one place, and not a branch in every function that reads or writes.
//
// Nothing of the SDK is touched until a call is made: the tests replace the
// module with stand-ins that have only the functions they need, and a value read
// here as the module loads would trip over the ones they leave out.
//
// The types are the SDK's throughout. In the demo they describe objects of the
// in-memory store, which have the same shape where the app looks.
//
// The one exception to "chosen when called" is `Timestamp`, re-exported as the
// module loads: a value class that is the same in both worlds (see below).

/** One call, sent where the page is. */
function routed<F extends (...args: never[]) => unknown>(real: () => F, demo: unknown): F {
  return ((...args: Parameters<F>) => (isDemo() ? (demo as F) : real())(...args)) as F;
}

export const collection = routed(() => sdk.collection, memory.collection);
export const doc = routed(() => sdk.doc, memory.doc);
export const query = routed(() => sdk.query, memory.query);
export const where = routed(() => sdk.where, memory.where);

export const getDoc = routed(() => sdk.getDoc, memory.getDoc);
export const getDocs = routed(() => sdk.getDocs, memory.getDocs);
export const getCountFromServer = routed(() => sdk.getCountFromServer, memory.getCountFromServer);
// The server's answer or an error, never the device's cache: what the account
// deletion sweeps and checks has to be what is really there. The demo has only
// the one store.
export const getDocsFromServer = routed(() => sdk.getDocsFromServer, memory.getDocs);
export const getDocFromServer = routed(() => sdk.getDocFromServer, memory.getDoc);

const nothingToWaitFor = async () => {};
export const waitForPendingWrites = routed(() => sdk.waitForPendingWrites, nothingToWaitFor);
export const terminate = routed(() => sdk.terminate, nothingToWaitFor);
export const clearIndexedDbPersistence = routed(() => sdk.clearIndexedDbPersistence, nothingToWaitFor);

/**
 * A write that waits on the account-deletion gate (see `deletionGate`): while
 * an account is being deleted it is refused instead of sent. A rejected promise
 * rather than a throw, so a caller that fires and forgets still gets a promise.
 */
function gated<F extends (...args: never[]) => Promise<unknown>>(write: F): F {
  return ((...args: Parameters<F>) => (isDeletingAccount() ? Promise.reject(accountDeletingError()) : write(...args))) as F;
}

export const setDoc = gated(routed<typeof sdk.setDoc>(() => sdk.setDoc, memory.setDoc));
export const addDoc = gated(routed<typeof sdk.addDoc>(() => sdk.addDoc, memory.addDoc));
export const updateDoc = gated(routed<typeof sdk.updateDoc>(() => sdk.updateDoc, memory.updateDoc));
export const deleteDoc = routed(() => sdk.deleteDoc, memory.deleteDoc);

const openBatch = routed(() => sdk.writeBatch, memory.writeBatch);
/** A batch whose sets and updates wait on the same gate; its deletes do not, being what the deletion itself is made of. */
export const writeBatch = ((...args: Parameters<typeof sdk.writeBatch>) => {
  const batch = openBatch(...args);
  const set = batch.set.bind(batch) as (...a: unknown[]) => typeof batch;
  const update = batch.update.bind(batch) as (...a: unknown[]) => typeof batch;
  return Object.assign(batch, {
    set: (...a: unknown[]) => {
      refuseWhileDeleting();
      return set(...a);
    },
    update: (...a: unknown[]) => {
      refuseWhileDeleting();
      return update(...a);
    },
  });
}) as typeof sdk.writeBatch;

export const serverTimestamp = routed(() => sdk.serverTimestamp, memory.serverTimestamp);
export const deleteField = routed(() => sdk.deleteField, memory.deleteField);

/**
 * `new FieldPath(...)`. A function that returns the object it builds is what
 * `new` hands back, so the one name serves both worlds.
 */
export const FieldPath = function FieldPath(...fieldNames: string[]) {
  return isDemo() ? new memory.MemoryFieldPath(...fieldNames) : new sdk.FieldPath(...fieldNames);
} as unknown as typeof sdk.FieldPath;
export type FieldPath = sdk.FieldPath;

// A plain value class: no connection behind it in either world. The demo store
// keeps Dates, and turns any Timestamp handed to it into one.
export { Timestamp } from "firebase/firestore";

export type { DocumentData, DocumentSnapshot, Query } from "firebase/firestore";
