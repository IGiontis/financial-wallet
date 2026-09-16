/**
 * Surviving a deploy that happened while the app was open.
 *
 * Every route in this app is a separate file with the build's hash in its name.
 * Publish a new build and those names change, and the server stops serving the
 * old ones — so a page that has been open since before the deploy is holding
 * references to files that no longer exist anywhere. It runs perfectly until
 * the reader opens a screen it has not opened yet, and then the import fails.
 *
 * On Netlify it fails in the least helpful way available: the missing file is
 * caught by the SPA rewrite and comes back as index.html with a 200, so the
 * browser reports a module that is not a module rather than a 404.
 *
 * The version prompt keeps this from happening in the ordinary case. This is
 * the net underneath it — for the deploy that lands between one tap and the
 * next, and for the one transition where the old worker is still in charge.
 * The fix is always the same: load the page again and it comes back on the
 * current build.
 */

/** Marks that a reload has already been spent on this, so a genuine failure cannot loop. */
export const RELOAD_KEY = "myfiwallet:stale-chunk-reload";

/**
 * How long a reload counts as "just tried".
 *
 * Long enough to cover a load and a first navigation — if the page comes back
 * and fails again inside it, reloading is not the answer and the error should
 * be allowed to surface. A later deploy is minutes away at least, so this never
 * stands in the way of a real one.
 */
export const RELOAD_GUARD_MS = 30_000;

// What browsers call it. Chrome and Firefox say the import failed, Safari says
// the module script failed, and Vite's own preloader raises the CSS one itself.
const SIGNS = [
  "failed to fetch dynamically imported module",
  "error loading dynamically imported module",
  "importing a module script failed",
  "unable to preload css",
  "expected a javascript module script",
  "failed to load module script",
];

export function isStaleChunkError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : typeof error === "string" ? error : "";
  const text = message.toLowerCase();
  return SIGNS.some((sign) => text.includes(sign));
}

export interface ReloadDeps {
  storage: Pick<Storage, "getItem" | "setItem">;
  now: () => number;
  reload: () => void;
}

/**
 * Reloads onto the current build — at most once per guard window.
 *
 * Returns whether it reloaded, so a caller can fall back to showing the error
 * when it refuses.
 */
export function reloadForNewVersion({ storage, now, reload }: ReloadDeps): boolean {
  const at = now();
  let previous = 0;
  try {
    previous = Number(storage.getItem(RELOAD_KEY) ?? 0);
  } catch {
    // Private mode, or storage turned off. A reload with no memory of the last
    // one could loop, so treat an unreadable flag as "just tried".
    return false;
  }
  if (Number.isFinite(previous) && previous > 0 && at - previous < RELOAD_GUARD_MS) return false;

  try {
    storage.setItem(RELOAD_KEY, String(at));
  } catch {
    return false;
  }
  reload();
  return true;
}

/**
 * Catches the failed import before it reaches the screen.
 *
 * Vite routes every dynamic import through a helper that dispatches
 * `vite:preloadError` — cancelable — before rethrowing, which is the one place
 * that sees both the missing chunk and the stylesheet that went with it.
 * Cancelling keeps the error out of the console on the way to the reload.
 */
export function installStaleChunkRecovery(deps: ReloadDeps = { storage: sessionStorage, now: Date.now, reload: () => window.location.reload() }): () => void {
  const onPreloadError = (event: Event) => {
    if (reloadForNewVersion(deps)) event.preventDefault();
  };
  window.addEventListener("vite:preloadError", onPreloadError);
  return () => window.removeEventListener("vite:preloadError", onPreloadError);
}
