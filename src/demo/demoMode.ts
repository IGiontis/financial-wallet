import { isKnownDevice, KNOWN_DEVICE_KEY } from "../lib/sessionHint";

// ─── The demo ────────────────────────────────────────────────────────────────
//
// Someone who opens the site without an account sees the whole app at once,
// filled with a made-up account they can use as their own: add a coffee, pay a
// bill, move money to a goal. None of it leaves the page. Every read and write
// that would go to Firestore goes to an in-memory copy instead (see
// `firebase/firestoreApi` and `demo/memoryFirestore`), the signed-in user is a
// stand-in (see `AuthContext`), and a refresh starts again from the same
// made-up account.
//
// Whether this is the demo is decided once, as the page loads, and never
// changes while it is open. Leaving it is a full page load (`leaveDemo`): the
// query cache, the in-memory store and every module that read this switch go
// with the page, so nothing of the demo can follow anyone into a real session.

/**
 * Pages that are never the demo: signing in or up, where a real session
 * begins, and the legal texts, which must read as they are wherever the link
 * to them came from.
 */
export const NON_DEMO_PATHS = ["/login", "/register", "/terms", "/privacy"] as const;

/**
 * The rule for a page load: the demo, unless someone has signed in on this
 * device before — a returning user who signed out wants the sign-in form, not a
 * stranger's wallet — or the page asked for is one of `NON_DEMO_PATHS`.
 */
export function startsInDemo(pathname: string, knownDevice: boolean): boolean {
  if (knownDevice) return false;
  // The router matches «/Login» as «/login»; so must this, or that page opens signed in as the demo.
  const path = pathname.toLowerCase();
  return !NON_DEMO_PATHS.some((p) => path === p || path.startsWith(`${p}/`));
}

function decideAtStart(): boolean {
  // Tests start every module outside the demo, as the app was before it
  // existed, and switch it on themselves where it is what they test.
  if (import.meta.env.MODE === "test") return false;
  if (typeof window === "undefined") return false;
  return startsInDemo(window.location.pathname, isKnownDevice());
}

let demo = decideAtStart();

/** Whether this page is the demo. Read at call time by everything that would reach Firebase. */
export const isDemo = (): boolean => demo;

/**
 * Switches the demo on for this page. The page load already does this when
 * the rule says so; called by hand only in tests. Firebase itself is set up
 * (or not) as the page loads, so turning it on later routes the data to memory
 * but does not undo a Firestore that was already opened.
 */
export function enterDemo() {
  demo = true;
}

/**
 * Switches it off again — for tests. The app never calls this: a page that
 * started as the demo has no Firebase behind it to switch back to, so it
 * leaves with `leaveDemo` instead.
 */
export function exitDemo() {
  demo = false;
}

/**
 * Out of the demo, to the sign-in or sign-up page, as a full page load. Every
 * trace of the demo stays behind with the page; the one that opens is the app
 * as it is without it.
 *
 * It replaces the demo in the history rather than adding to it: after signing
 * in, Back must not bring the demo's page back out of the browser's cache.
 */
export function leaveDemo(path: string = "/login") {
  window.location.replace(path);
}

/**
 * While the page is the demo: someone has signed in since it loaded — the page
 * came back out of the back-forward cache, or another tab signed in — so it
 * loads again, and the rule then opens the real app instead. Returns the
 * removal, for tests.
 */
export function watchForSignIn(): () => void {
  const onPageShow = (event: PageTransitionEvent) => {
    if (event.persisted && isKnownDevice()) window.location.reload();
  };
  const onStorage = (event: StorageEvent) => {
    if (event.key === KNOWN_DEVICE_KEY && event.newValue === "1") window.location.reload();
  };
  window.addEventListener("pageshow", onPageShow);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener("pageshow", onPageShow);
    window.removeEventListener("storage", onStorage);
  };
}

// What else keeps a copy of the demo's account, and must drop it when the
// account is made again — see `demoSession`. Registered here, by the modules
// that keep one, so that making it again needs none of them loaded.
const reseedListeners = new Set<() => void>();

/** Called whenever the demo's account is made afresh. Returns the removal. */
export function onDemoReseed(listener: () => void): () => void {
  reseedListeners.add(listener);
  return () => reseedListeners.delete(listener);
}

/** Tells every copy-keeper the account was made afresh. */
export function notifyDemoReseed() {
  reseedListeners.forEach((listener) => listener());
}
