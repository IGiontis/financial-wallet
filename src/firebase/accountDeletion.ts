import { db } from "./config";
import { DEMO_UNAVAILABLE, deleteAccount, logout, reauthenticate, reauthenticateWithGoogle } from "./auth";
import { deleteAllUserData, type AccountWipe } from "./firestore";
import { beginAccountDeletion, endAccountDeletion } from "./deletionGate";
import { clearIndexedDbPersistence, terminate } from "./firestoreApi";
import { queryClient } from "../lib/queryClient";
import { localDeletePrefix } from "../lib/localStore";
import { isDemo } from "../demo/demoMode";
import { requireConnection } from "../shared/utils/offlinePolicy";

// ─── Deleting an account, start to end ───────────────────────────────────────
//
// The order is what keeps a failure from leaving half an account:
//
// 1. Who it is, before anything is touched — the password, or Google's own
//    window again. Firebase refuses to delete a sign-in that was not used in
//    the last few minutes; asked only at the end, after the data was gone,
//    that refusal left a Google account signed in with nothing behind it.
// 2. The write gate closes (see `deletionGate`) and the screens stop loading.
// 3. The data, swept until a sweep finds nothing, the profile last
//    (`deleteAllUserData`). A failure here opens the gate again; the account
//    still has its profile and its sign-in, so deleting again finishes the job.
// 4. The sign-in itself. Seconds after step 1 this does not ask again. If it
//    fails all the same, the device signs out and forgets the account; signing
//    in again and deleting again finishes it.
// 5. This device forgets the account: the lists kept for the sync, the screens'
//    cache, Firestore's own copy on disk, the account's keys in localStorage.
//    The page then loads again, on the sign-in form, with nothing of it.
//
// What this cannot reach: a user deleted in the Firebase Console's
// Authentication tab. That removes only the sign-in; the Firestore documents
// stay until removed by hand (no Cloud Functions on the free plan).

export type DeletionStage = "identity" | "data" | "sign-in";

/** A deletion that stopped, with where: what is left differs at each stage. */
export class AccountDeletionError extends Error {
  readonly stage: DeletionStage;
  readonly code: string;

  constructor(stage: DeletionStage, cause: unknown) {
    super(cause instanceof Error ? cause.message : String(cause));
    this.name = "AccountDeletionError";
    this.stage = stage;
    this.code = cause && typeof cause === "object" && "code" in cause ? String((cause as { code: unknown }).code) : "";
    this.cause = cause;
  }
}

/**
 * The device's own preferences, kept for whoever uses it next: language,
 * theme, the nav style, the analytics answer, that someone has signed in here
 * (so it opens on the sign-in form rather than the demo), the category seed's
 * flag (shared defaults, not the account's) and the exchange rates. Every
 * other key belonged to the account — its plan, its banks, its view choices,
 * the welcome name — and goes.
 */
const DEVICE_KEEPS = new Set(["app-language", "theme-preference", "nav-style", "sidebar-collapsed", "analytics-consent", "auth:known-device", "categories-seeded-version", "myfiwallet:exchange-rates"]);

function forgetInStorage() {
  try {
    for (const key of Object.keys(localStorage)) if (!DEVICE_KEEPS.has(key)) localStorage.removeItem(key);
  } catch {
    // Storage blocked: nothing was kept in it either.
  }
  try {
    sessionStorage.clear();
  } catch {
    // As above.
  }
}

/**
 * Signed out, and nothing of the account kept on this device: the screens'
 * cache, the lists kept for the sync (`sync:` — the shared defaults under
 * `ref:` are nobody's and stay), its keys in storage. Firestore itself keeps
 * running, so the page can go on to the sign-in form without a reload.
 */
async function signOutAndForget() {
  await logout().catch(() => {});
  queryClient.clear();
  await localDeletePrefix("sync:");
  forgetInStorage();
}

/** Step 5. Each part on its own: one that fails does not keep the others from running. */
async function forgetOnThisDevice() {
  await signOutAndForget();
  // Firestore's cache on disk. Cleared only once Firestore is shut down, and
  // refused while another tab still has it open — then it holds no more than
  // what the sweep left it: the deleted documents are already gone from it.
  try {
    await terminate(db);
    await clearIndexedDbPersistence(db);
  } catch {
    // See above.
  }
}

export interface DeleteMyAccount {
  uid: string;
  /** Signs in with Google: confirmed in Google's window rather than with a password. */
  google: boolean;
  password?: string;
  /** Where the page goes at the end, as a full load. Replaced in tests. */
  leave?: (path: string) => void;
}

/** Deletes the signed-in account and everything in it. See the order above. */
export async function deleteMyAccount({ uid, google, password = "", leave = (path) => window.location.replace(path) }: DeleteMyAccount): Promise<AccountWipe> {
  // The demo's account is made up, and there is no Firebase behind it.
  if (isDemo()) throw Object.assign(new Error("Not available in the demo."), { code: DEMO_UNAVAILABLE });
  requireConnection("delete");

  try {
    if (google) await reauthenticateWithGoogle();
    else await reauthenticate(password);
  } catch (err) {
    throw new AccountDeletionError("identity", err);
  }

  beginAccountDeletion(uid);
  await queryClient.cancelQueries().catch(() => {});

  let wipe: AccountWipe;
  try {
    wipe = await deleteAllUserData(uid);
  } catch (err) {
    endAccountDeletion();
    throw new AccountDeletionError("data", err);
  }

  try {
    await deleteAccount();
  } catch (err) {
    // The data is gone and only the sign-in is left. Kept signed in, every
    // save would be refused by the gate with nothing to say why; so this
    // device signs out and forgets the account instead, and the gate opens
    // again — signed out, nothing can write as it. Signing in again and
    // deleting again asks who it is, finds nothing (or only the profile a
    // Google sign-in makes) and removes the sign-in.
    await signOutAndForget();
    endAccountDeletion();
    throw new AccountDeletionError("sign-in", err);
  }

  await forgetOnThisDevice();
  leave("/login");
  return wipe;
}
