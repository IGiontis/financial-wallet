import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { FirebaseError } from "firebase/app";
import { getFirestore, initializeFirestore, persistentLocalCache, persistentMultipleTabManager } from "firebase/firestore";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
/**
 * Firestore with an on-disk cache rather than the default in-memory one.
 *
 * Three things follow from it, all of which this app had promised and not kept:
 *
 * 1. Pending writes survive the app being closed. Without it the queue lives in
 *    memory, so marking a bill paid on a train and then killing the tab lost
 *    the payment silently — no error, no row, nothing to retry.
 * 2. The screens open with data when there is no connection. The offline banner
 *    already told the reader the app "stays usable"; now it is.
 * 3. Fewer reads. Queries are answered from disk and only the changes since are
 *    fetched, which matters on a free tier that bills by the document.
 *
 * The multi-tab manager is what lets a second tab share the same cache instead
 * of one of them failing to acquire it.
 *
 * Note what this does *not* do: a write promise still only settles when the
 * server acknowledges it, offline or not. Not waiting for that is the caller's
 * job — see `saveWithoutWaiting`.
 */
function openFirestore() {
  try {
    return initializeFirestore(app, {
      localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
    });
  } catch (error) {
    // `initializeFirestore` may only be called once per app, and Vite's hot
    // reload re-evaluates this module every time anything in its graph is
    // edited — so in development the second call throws and takes the whole
    // app down until a full refresh. The instance from the first call is
    // already configured; hand that back instead.
    //
    // Narrowed to the one code that means "already initialised": a genuinely
    // bad option should still be loud rather than silently downgraded to a
    // memory cache that only shows up as mystery reads on the bill.
    if (error instanceof FirebaseError && error.code === "failed-precondition") return getFirestore(app);
    throw error;
  }
}

export const db = openFirestore();
