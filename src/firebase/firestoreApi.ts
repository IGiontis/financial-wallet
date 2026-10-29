import * as sdk from "firebase/firestore";
import { isDemo } from "../demo/demoMode";
import * as memory from "../demo/memoryFirestore";

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

export const setDoc = routed(() => sdk.setDoc, memory.setDoc);
export const addDoc = routed(() => sdk.addDoc, memory.addDoc);
export const updateDoc = routed(() => sdk.updateDoc, memory.updateDoc);
export const deleteDoc = routed(() => sdk.deleteDoc, memory.deleteDoc);
export const writeBatch = routed(() => sdk.writeBatch, memory.writeBatch);

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
