import { initializeApp } from "firebase/app";
import { initializeAppCheck, ReCaptchaEnterpriseProvider } from "firebase/app-check";
import { connectAuthEmulator, getAuth } from "firebase/auth";
import { FirebaseError } from "firebase/app";
import { connectFirestoreEmulator, getFirestore, initializeFirestore, persistentLocalCache, persistentMultipleTabManager } from "firebase/firestore";

/**
 * Development against the local emulators instead of the real project
 * (`npm run emulators`, then `npm run dev:emu`).
 *
 * Development and the live app share one Firebase project and so one free
 * quota, and a development reload that cannot resume its cache re-reads the
 * whole account — about two thousand reads a time. The emulators cost nothing
 * and hold their own data. Only ever on in a development build, and only when
 * asked for, so a plain `npm run dev` still talks to the real project.
 *
 * The project id is a `demo-` one: the emulators know it has no real project
 * behind it and refuse to reach out to production for anything.
 */
const useEmulators = import.meta.env.DEV && import.meta.env.VITE_FIREBASE_EMULATOR === "true";
export const EMULATOR_PROJECT_ID = "demo-myfiwallet";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: useEmulators ? EMULATOR_PROJECT_ID : import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  // Google Analytics — see `lib/analytics`. Absent, nothing is measured.
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID,
};

const app = initializeApp(firebaseConfig);
export const firebaseApp = app;

/**
 * App Check: every request to Firestore and Auth carries a token saying it came
 * from this app, in a real browser — not from a script that copied the config
 * out of the bundle (which is public, and has to be). Once it is enforced in the
 * Console, a request without one is refused before the rules are even read.
 *
 * The token comes from reCAPTCHA (now Google Cloud Fraud Defense, the Enterprise
 * provider — the classic one is deprecated, and a key made today is a Cloud key),
 * which asks nothing of the person: it scores the visit in the background. Unlike
 * the classic one it needs no secret key in the Console, only this site key. On only with a site key, so a build without one
 * behaves exactly as before; never against the emulators, which do not check it.
 *
 * `npm run dev` against the real project runs on localhost, which reCAPTCHA
 * will not vouch for: there it uses a debug token instead — printed in the
 * console the first time, to be added under App Check → Manage debug tokens
 * (or set as VITE_APPCHECK_DEBUG_TOKEN to keep one across browsers).
 *
 * Before everything else on purpose: Auth and Firestore below must not send a
 * request before it can be signed.
 */
const appCheckSiteKey = import.meta.env.VITE_APPCHECK_SITE_KEY as string | undefined;
export const appCheckEnabled = !useEmulators && !!appCheckSiteKey;
if (appCheckEnabled) {
  if (import.meta.env.DEV) (self as unknown as { FIREBASE_APPCHECK_DEBUG_TOKEN?: string | boolean }).FIREBASE_APPCHECK_DEBUG_TOKEN = import.meta.env.VITE_APPCHECK_DEBUG_TOKEN || true;
  try {
    initializeAppCheck(app, { provider: new ReCaptchaEnterpriseProvider(appCheckSiteKey!), isTokenAutoRefreshEnabled: true });
  } catch (error) {
    // Vite's hot reload runs this module again, and a second initialisation
    // throws; the first one is still in force.
    if (!(error instanceof FirebaseError && error.code === "appCheck/already-initialized")) throw error;
  }
}

export const auth = getAuth(app);
if (useEmulators && !auth.emulatorConfig) connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
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

// Connecting twice throws, and Vite's hot reload re-runs this module; the flag
// on the instance is how the second run knows the first already did it.
const emulatorFlag = "__myfiwalletEmulator";
if (useEmulators && !(db as unknown as Record<string, unknown>)[emulatorFlag]) {
  connectFirestoreEmulator(db, "127.0.0.1", 8080);
  (db as unknown as Record<string, unknown>)[emulatorFlag] = true;
}
