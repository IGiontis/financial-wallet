// Whether this device was signed in.
//
// Firebase finds the session asynchronously, so every cold start begins not
// knowing. Someone signed in should see the app taking shape; someone who is
// not should see the sign-in form's — not the app's sidebar and dashboard
// for a moment, then the form: a fresh install on a phone did exactly that.
// So the device remembers which it was last time (see SessionGate).

const SESSION_HINT = "auth:signed-in";

/** Kept by the auth listener: signed in or not, as Firebase last said. */
export function rememberSession(signedIn: boolean) {
  try {
    if (signedIn) localStorage.setItem(SESSION_HINT, "1");
    else localStorage.removeItem(SESSION_HINT);
  } catch {
    // Storage blocked: every cold start shows the form's outline, the safe guess.
  }
}

export function hadSession(): boolean {
  try {
    return localStorage.getItem(SESSION_HINT) === "1";
  } catch {
    return false;
  }
}

// Whether anyone has ever signed in on this device.
//
// The other half of the same question, kept for a different reader: the demo
// (see `demo/demoMode`). A first visit opens the app filled with made-up data;
// someone who has an account and signed out should land on the sign-in form
// instead, not in a stranger's wallet. So unlike the hint above this is set the
// first time a session appears and is never taken away — signing out leaves it.

export const KNOWN_DEVICE_KEY = "auth:known-device";

/**
 * Set by `seedDefaultCategories` for anyone signed in, since long before the
 * hints here existed, and never by the demo — so a device signed out before
 * them is still known by it.
 */
const SIGNED_IN_BEFORE = "categories-seeded-version";

/** Set by the auth listener whenever someone is signed in. */
export function rememberKnownDevice() {
  try {
    localStorage.setItem(KNOWN_DEVICE_KEY, "1");
  } catch {
    // Storage blocked: the device stays unknown, and opens on the demo.
  }
}

/**
 * Someone has signed in here before. A device signed in before this hint
 * existed still carries the session hint, or — signed out since — the seeded
 * categories' flag, and counts as known by either.
 */
export function isKnownDevice(): boolean {
  try {
    return localStorage.getItem(KNOWN_DEVICE_KEY) === "1" || hadSession() || localStorage.getItem(SIGNED_IN_BEFORE) !== null;
  } catch {
    return false;
  }
}
