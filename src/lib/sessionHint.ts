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
    else {
      localStorage.removeItem(SESSION_HINT);
      // Who it was goes with the session: the next person here is not greeted by it.
      localStorage.removeItem(WELCOME_NAME);
      localStorage.removeItem(LAST_OPEN);
    }
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

// Whether someone signed in on this device and has not signed out since.
//
// The other half of the same question, kept for a different reader: the demo
// (see `demo/demoMode`). A first visit opens the app filled with made-up data;
// a device someone uses opens on their account — or, when the session ended
// without them asking (it expired, the password changed elsewhere), on the
// sign-in form, not in a stranger's wallet. So unlike the hint above this
// outlives a session that merely ended.
//
// Signing out on purpose («Αποσύνδεση») is different (owner, 2026-11-12): it
// lands on the public demo, what anyone who has never signed in sees — and so
// does every visit after it, until someone signs in again. `rememberSignedOut`
// takes the mark away and leaves `SIGNED_OUT_KEY`, which also outweighs the
// older evidence below.

export const KNOWN_DEVICE_KEY = "auth:known-device";

/** Set by a deliberate sign-out, gone with the next sign-in. Kept with the device's own keys. */
export const SIGNED_OUT_KEY = "auth:signed-out";

/**
 * Set by `seedDefaultCategories` for anyone signed in, since long before the
 * hints here existed, and never by the demo — so a device signed out before
 * them is still known by it.
 */
const SIGNED_IN_BEFORE = "categories-seeded-version";

/** Set by the auth listener whenever someone is signed in. A sign-in undoes a sign-out's mark. */
export function rememberKnownDevice() {
  try {
    localStorage.setItem(KNOWN_DEVICE_KEY, "1");
    localStorage.removeItem(SIGNED_OUT_KEY);
  } catch {
    // Storage blocked: the device stays unknown, and opens on the demo.
  }
}

/**
 * «Αποσύνδεση», on purpose: from now until the next sign-in this device opens
 * like one nobody has signed in on — on the public demo. The session hint and
 * who it was go too (as `rememberSession(false)` does), here rather than
 * waiting for the auth listener, since the page is about to load again.
 */
export function rememberSignedOut() {
  rememberSession(false);
  try {
    localStorage.removeItem(KNOWN_DEVICE_KEY);
    localStorage.setItem(SIGNED_OUT_KEY, "1");
  } catch {
    // Storage blocked: nothing was remembered in it either — an unknown device.
  }
}

/**
 * Someone has signed in here and not signed out on purpose since. A device
 * signed in before this hint existed still carries the session hint, or —
 * signed out since — the seeded categories' flag, and counts as known by
 * either; the flag only while no deliberate sign-out has come after it.
 */
export function isKnownDevice(): boolean {
  try {
    if (localStorage.getItem(KNOWN_DEVICE_KEY) === "1" || hadSession()) return true;
    return localStorage.getItem(SIGNED_IN_BEFORE) !== null && localStorage.getItem(SIGNED_OUT_KEY) !== "1";
  } catch {
    return false;
  }
}

/**
 * The device's own preferences, kept for whoever uses it next: language,
 * theme, the nav style, the motion setting, the analytics answer, whether
 * someone signed in here (and whether they signed out on purpose), the
 * category seed's flag (shared defaults, not the account's), the exchange
 * rates, and that the demo's tour hint was shown. Every other key belonged to
 * the account — its plan, its banks, its view choices and picks (a category, a
 * person's name), the welcome name — and goes.
 */
export const DEVICE_KEEPS: ReadonlySet<string> = new Set([
  "app-language",
  "theme-preference",
  "nav-style",
  "sidebar-collapsed",
  "motion-effects",
  "analytics-consent",
  KNOWN_DEVICE_KEY,
  SIGNED_OUT_KEY,
  SIGNED_IN_BEFORE,
  "myfiwallet:exchange-rates",
  "demo:tour-hinted",
]);

/** Nothing of the account left in this browser's storage: every key but the device's own, and the tab's session storage. */
export function forgetAccountStorage() {
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

// Who was signed in, for the welcome while the app opens.
//
// The first thing an app open shows is «Καλώς ήρθες πίσω, <name>» (see
// `WelcomeSplash`) — before Firebase has said who is signed in, let alone
// before their profile has been read. So the name is the one the profile had
// last time, kept here as it is read anyway (see SessionGate): no read of its
// own. With it, when this device last opened the app, for «Τελευταία είσοδος».

const WELCOME_NAME = "auth:welcome-name";
const LAST_OPEN = "auth:last-open";

/** The signed-in person's first name, as their profile last said. Empty forgets it. */
export function rememberWelcomeName(name: string) {
  try {
    const trimmed = name.trim();
    if (trimmed) localStorage.setItem(WELCOME_NAME, trimmed);
    else localStorage.removeItem(WELCOME_NAME);
  } catch {
    // Storage blocked: the welcome has no name, and says so neutrally.
  }
}

export function welcomeName(): string {
  try {
    return localStorage.getItem(WELCOME_NAME) ?? "";
  } catch {
    return "";
  }
}

let openedBefore: { previous?: Date } | undefined;

/**
 * When the app was opened before this time, if it was — and from now on, this
 * time. Answered once per page load: asked again, it gives the same answer
 * rather than "just now".
 */
export function previousOpen(now: Date = new Date()): Date | undefined {
  if (openedBefore) return openedBefore.previous;
  let previous: Date | undefined;
  try {
    const stored = Number(localStorage.getItem(LAST_OPEN));
    if (Number.isFinite(stored) && stored > 0 && stored <= now.getTime()) previous = new Date(stored);
    localStorage.setItem(LAST_OPEN, String(now.getTime()));
  } catch {
    // Storage blocked: no «last time» to tell.
  }
  openedBefore = { previous };
  return previous;
}

/** For tests: forget this page load's answer. */
export function resetPreviousOpen() {
  openedBefore = undefined;
}
