import { createUser, getUser } from "../../firebase/firestore";
import { ensureGoogleProfile } from "./googleProfile";
import { queryClient } from "../../lib/queryClient";
import { exchangeRateKeys } from "../../shared/hooks/useCurrencyConverter";

// ─── What a new sign-in still has to write ───────────────────────────────────
//
// Signing in is Firebase Auth; a new account also needs its profile document —
// the names typed into the sign-up form, or the ones Google gave. On the sign-in
// pages that is written straight after (`completeSignUp`). From the demo's
// dialog it cannot be: that page has no Firestore behind it (see
// `demo/demoSignIn`). So the step is noted here, the page loads again as the
// real app, and the session gate finishes it (`finishPendingSignUp`).
//
// Both ways check first and write only a profile that is missing: `createUser`
// replaces the whole document, and a step run twice — a reload at the wrong
// moment — must never empty an account that already has one.

export type PendingSignUp =
  /** Google: a profile from the name it gave, if there is none yet. */
  | { kind: "google"; uid: string; email: string | null; displayName: string | null; locale: string }
  /** The sign-up form: the profile from what was typed. */
  | { kind: "profile"; uid: string; profile: { email: string; username: string; firstName: string; lastName: string; locale: string } };

const PENDING_KEY = "auth:pending-sign-up";

/** Writes what `step` needs, if it is still missing. */
export async function completeSignUp(step: PendingSignUp): Promise<void> {
  if (step.kind === "google") {
    await ensureGoogleProfile({ uid: step.uid, email: step.email, displayName: step.displayName }, step.locale);
    return;
  }
  if (await getUser(step.uid)) return;
  await createUser(step.uid, step.profile);
}

/** Notes a step for the real app to finish once the page has loaded again. */
export function savePendingSignUp(step: PendingSignUp) {
  try {
    localStorage.setItem(PENDING_KEY, JSON.stringify(step));
  } catch {
    // Nothing to keep it in. The account works; its names are filled in from
    // Settings, and Google's from the next sign-in with it.
  }
}

function readPendingSignUp(): PendingSignUp | undefined {
  try {
    const raw = localStorage.getItem(PENDING_KEY);
    if (!raw) return undefined;
    const step = JSON.parse(raw) as PendingSignUp;
    return step && typeof step.uid === "string" && (step.kind === "google" || step.kind === "profile") ? step : undefined;
  } catch {
    return undefined;
  }
}

const forgetPendingSignUp = () => {
  try {
    localStorage.removeItem(PENDING_KEY);
  } catch {
    // See `savePendingSignUp`.
  }
};

/**
 * For the session gate, once someone is signed in: finishes a step noted for
 * them, then has the profile read again so every screen shows the names.
 * A step left for another account is dropped. One that fails (offline) stays,
 * for the next start. Returns whether anything was finished.
 */
export async function finishPendingSignUp(uid: string): Promise<boolean> {
  const step = readPendingSignUp();
  if (!step) return false;
  if (step.uid !== uid) {
    forgetPendingSignUp();
    return false;
  }
  await completeSignUp(step);
  forgetPendingSignUp();
  await queryClient.invalidateQueries({ queryKey: exchangeRateKeys.user(uid) });
  return true;
}

/** How long before the one quiet retry, when the connection did not come back sooner. */
export const PENDING_RETRY_MS = 8000;

/**
 * `finishPendingSignUp`, and if it fails — offline, a refusal — once more:
 * when the connection comes back, or after `PENDING_RETRY_MS`, whichever is
 * first. Without its profile document the account cannot save a setting, so a
 * second failure is said (`onGiveUp`) rather than swallowed; the step is still
 * kept, and the next start tries again. Returns the cancel, for an unmount.
 */
export function finishPendingSignUpWithRetry(uid: string, onGiveUp: () => void): () => void {
  let cancelled = false;
  let timer: number | undefined;
  const onOnline = () => void retry();
  const stopWaiting = () => {
    window.clearTimeout(timer);
    window.removeEventListener("online", onOnline);
  };
  const retry = async () => {
    stopWaiting();
    if (cancelled) return;
    try {
      await finishPendingSignUp(uid);
    } catch {
      if (!cancelled) onGiveUp();
    }
  };
  void finishPendingSignUp(uid).catch(() => {
    if (cancelled) return;
    window.addEventListener("online", onOnline);
    timer = window.setTimeout(() => void retry(), PENDING_RETRY_MS);
  });
  return () => {
    cancelled = true;
    stopWaiting();
  };
}
