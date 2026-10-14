import type { Query, QueryClient } from "@tanstack/react-query";

// A screen whose data failed to load used to stay failed: one quick retry, then
// nothing until the connection dropped and came back. On a phone that had
// merely stalled for a moment, that was an empty page until a manual reload.
//
// Now a failed load that something is still showing is tried again on its own
// — after 5, 15 and 45 seconds, while the page is visible and the device
// online — and at once when the connection returns or the app comes back to
// the front. Three tries, then it waits for the user (the «Δοκίμασε τώρα» on
// the page) or a reconnect: a query that fails for good, a rule that refuses
// it, must not keep spending reads.

/** The waits before each automatic try, in milliseconds. */
export const AUTO_RETRY_DELAYS = [5_000, 15_000, 45_000];

type AnyQuery = Query<unknown, Error, unknown, readonly unknown[]>;

export function installQueryAutoRetry(client: QueryClient) {
  const tries = new Map<string, number>();
  const timers = new Map<string, ReturnType<typeof setTimeout>>();

  const online = () => typeof navigator === "undefined" || navigator.onLine !== false;
  const visible = () => typeof document === "undefined" || document.visibilityState !== "hidden";
  const wanted = (query: AnyQuery) => query.state.status === "error" && query.getObserversCount() > 0;

  const refetch = (query: AnyQuery) => void client.refetchQueries({ queryKey: query.queryKey, exact: true, type: "active" });

  const schedule = (query: AnyQuery) => {
    const hash = query.queryHash;
    if (timers.has(hash)) return;
    const done = tries.get(hash) ?? 0;
    if (done >= AUTO_RETRY_DELAYS.length) return;
    timers.set(
      hash,
      setTimeout(() => {
        timers.delete(hash);
        if (!wanted(query)) return;
        // Not counted while it could not have worked: tried again on the way back.
        if (!online() || !visible()) return;
        tries.set(hash, done + 1);
        refetch(query);
      }, AUTO_RETRY_DELAYS[done]),
    );
  };

  const unsubscribe = client.getQueryCache().subscribe((event) => {
    const query = event.query as AnyQuery;
    if (event.type === "removed") {
      clearTimeout(timers.get(query.queryHash));
      timers.delete(query.queryHash);
      tries.delete(query.queryHash);
      return;
    }
    if (event.type !== "updated" && event.type !== "observerAdded") return;
    if (query.state.status === "success") {
      tries.delete(query.queryHash);
      return;
    }
    if (wanted(query)) schedule(query);
  });

  // Back online, or back to the app: every failed load still on screen, now — with its tries renewed.
  const retryAllFailed = () => {
    for (const query of client.getQueryCache().getAll() as AnyQuery[]) {
      if (!wanted(query)) continue;
      tries.delete(query.queryHash);
      refetch(query);
    }
  };
  const onVisible = () => {
    if (visible()) retryAllFailed();
  };
  if (typeof window !== "undefined") {
    window.addEventListener("online", retryAllFailed);
    document.addEventListener("visibilitychange", onVisible);
  }

  return () => {
    unsubscribe();
    for (const timer of timers.values()) clearTimeout(timer);
    if (typeof window !== "undefined") {
      window.removeEventListener("online", retryAllFailed);
      document.removeEventListener("visibilitychange", onVisible);
    }
  };
}
