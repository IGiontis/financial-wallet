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
