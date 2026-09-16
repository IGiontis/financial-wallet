/**
 * Asking whether there is a new version, at the moments it could have appeared.
 *
 * The browser checks for a new worker on its own schedule, and for an installed
 * app that schedule is roughly "when the page is loaded". A phone keeps the app
 * suspended in the background for days without ever loading it again, which is
 * why a new version used to show up only after force-quitting and reopening.
 *
 * So: ask on a timer while the app is open, ask when it comes back to the
 * foreground, and ask when the connection returns. Never ask while hidden or
 * offline — there is nothing to find, and each ask is a request.
 */

export interface UpdateCheckOptions {
  /** While the app is open and in front. Hourly by default. */
  intervalMs?: number;
  /** The least time between two asks, however many events arrive. */
  minGapMs?: number;
  isOnline?: () => boolean;
  isVisible?: () => boolean;
  now?: () => number;
}

export function scheduleUpdateChecks(check: () => void, options: UpdateCheckOptions = {}): () => void {
  const {
    intervalMs = 60 * 60 * 1000,
    minGapMs = 60 * 1000,
    isOnline = () => navigator.onLine,
    isVisible = () => document.visibilityState === "visible",
    now = Date.now,
  } = options;

  // Registering the worker already asked once; this is the clock from there.
  let lastAsked = now();

  const ask = () => {
    if (!isOnline() || !isVisible()) return;
    const at = now();
    if (at - lastAsked < minGapMs) return;
    lastAsked = at;
    check();
  };

  const timer = setInterval(ask, intervalMs);
  document.addEventListener("visibilitychange", ask);
  window.addEventListener("online", ask);

  return () => {
    clearInterval(timer);
    document.removeEventListener("visibilitychange", ask);
    window.removeEventListener("online", ask);
  };
}
