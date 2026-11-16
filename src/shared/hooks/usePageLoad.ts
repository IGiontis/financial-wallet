import { useEffect, useState } from "react";

// How long a page may show its loading skeleton (the owner, 2026-11-12; 8 s
// since 2026-11-16 — tune it here, `SKELETON_MAX_MS`, nowhere else).
//
// A skeleton promises that something is about to arrive. When a load hangs — a
// phone just back from the background waiting on a fresh App Check token, a
// network that drops every answer, a read that fails and is retried for minutes
// (`queryAutoRetry`) — that promise was kept open for ever, and the page never
// became usable. Now it is kept for `SKELETON_MAX_MS` (8 s) at most; after that the page
// shows its natural state: whatever it already has, or, when it has nothing at
// all yet, its frame and its add with a quiet line in the middle
// (`PageWaiting`) — never an error, never "try again", never an empty state
// that claims there is nothing. Retries go on silently and the page fills in
// the moment the data arrives.

/** The longest a page shows its skeleton — the one place to tune it. */
export const SKELETON_MAX_MS = 8_000;

/**
 * Where a page's data stands:
 * - `loading` — nothing to show yet, inside `SKELETON_MAX_MS`: the skeleton;
 * - `ready` — everything it needs has an answer (from the server, or cached):
 *   the page, its true empty state included;
 * - `waiting` — still nothing after that: the page's frame and add, with
 *   `PageWaiting` where its content goes.
 */
export type PageLoad = "loading" | "ready" | "waiting";

/** A TanStack query result, or a data hook's own answer (`missing`) when its `data` is always filled. */
type QueryLike = { data?: unknown; missing?: boolean } | null | undefined;

/**
 * Whether any of these queries has nothing to show yet: never answered, or only
 * failed, and nothing cached. TanStack's `isLoading` is not this — it turns
 * false the moment a load fails (and stays false while it is retried), which
 * left pages showing «nothing here» for lists that had never been read, or —
 * those that also checked `isError` — their skeleton for ever.
 */
export function noAnswerYet(...queries: QueryLike[]): boolean {
  return queries.some((query) => !!query && (query.missing ?? query.data === undefined));
}

/**
 * The page's loading state, from `missing` — whether something it needs has
 * no answer yet (`noAnswerYet`, or a data hook's `missing`). The skeleton for
 * at most `ms`; the clock starts when the page opens with something missing.
 */
export function usePageLoad(missing: boolean, ms: number = SKELETON_MAX_MS): PageLoad {
  const [waitedOut, setWaitedOut] = useState(false);
  useEffect(() => {
    if (!missing || waitedOut) return;
    const timer = setTimeout(() => setWaitedOut(true), ms);
    return () => clearTimeout(timer);
  }, [missing, waitedOut, ms]);
  if (!missing) return "ready";
  return waitedOut ? "waiting" : "loading";
}
