import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "./useAuth";
import { getUser, saveWorkspaceValue } from "../../firebase/firestore";

// The planner's and the allocation page's own state, kept with the account.
//
// Both screens used `useLocalStorage`, which is per browser and per device — so
// a plan typed on a phone and the same plan on a laptop were two separate
// copies that never met, and clearing site data threw one away. This keeps the
// shape `useLocalStorage` had (a value and a setter, like `useState`) and
// changes only where the value ends up.
//
// localStorage does not go away: it is the cache. The page paints from it on the
// first frame rather than waiting for a round trip, it is what the app reads
// offline, and it is what gets pushed up the first time this runs on a device
// that has a plan and an account with none.

export const workspaceKeys = {
  all: (userId: string) => ["workspace", userId] as const,
};

/** How long to wait after the last change before writing. Dragging a slider
 *  fires sixty times a second; the account does not need to hear about each. */
const SETTLE_MS = 700;

const readRaw = (key: string): string | null => {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
};

const parseRaw = <T,>(raw: string | null): T | undefined => {
  if (raw === null) return undefined;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return undefined;
  }
};

const readCache = <T,>(key: string): T | undefined => parseRaw<T>(readRaw(key));

const writeCache = (key: string, value: unknown) => {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // A full or blocked store is not a reason to lose the edit — the account
    // copy is the one that matters, and it is already on its way.
  }
};

/**
 * When each key was last written on this device.
 *
 * A read that was already in flight cannot know about an edit made while it was
 * running — it was assembled before that edit existed — so its answer must not
 * be allowed to undo one. This is deliberately outside React: it is a fact about
 * writes in flight, not about any one component, and two screens share it.
 */
const writtenAt = new Map<string, number>();

/** The whole workspace object for the signed-in user. */
export function useWorkspace() {
  const { currentUser } = useAuth();
  const userId = currentUser?.uid ?? "";

  return useQuery<Record<string, unknown>>({
    queryKey: workspaceKeys.all(userId),
    enabled: !!userId,
    // Read rarely: it changes only when this user changes it, and every change
    // is written into this cache before it is sent.
    staleTime: 1000 * 60 * 30,
    queryFn: async () => {
      const startedAt = Date.now();
      const remote = (await getUser(userId))?.workspace ?? {};

      // Whatever this device changed while the answer was on its way is newer
      // than the answer. The device's own copy is the value being saved, so it
      // is the one to keep.
      const merged: Record<string, unknown> = { ...remote };
      for (const [key, at] of writtenAt) {
        if (at < startedAt) continue;
        const pending = readCache<unknown>(key);
        if (pending !== undefined) merged[key] = pending;
      }
      return merged;
    },
  });
}

/**
 * One value out of it, with the shape `useState` has.
 *
 * There is deliberately no local copy of the value. The query cache is the one
 * place it lives, and every edit is written into that cache before it is sent —
 * so the screen updates immediately, and a slow or failed write can never leave
 * the page showing something different from what it is about to save. Until the
 * account's copy arrives — first paint, or offline — this device's cache stands
 * in, so the screen is never blank and never loses an edit made without a
 * connection.
 */
export function useWorkspaceSetting<T>(key: string, initial: T): [T, (value: T | ((previous: T) => T)) => void] {
  const { currentUser } = useAuth();
  const userId = currentUser?.uid ?? "";
  const queryClient = useQueryClient();
  const { data: workspace, isSuccess } = useWorkspace();

  const stored = workspace && key in workspace ? (workspace[key] as T) : undefined;

  // The stand-in has to be the same object from one render to the next. Parsed
  // afresh each time — or taken from an `initial` written inline by the caller —
  // it was a new object on every render, and anything that waited for the value
  // to settle never saw it settle: the planner debounces the salary built from
  // this, so a salary not yet saved to the account set state every 250ms, which
  // rendered, which made a new salary, for as long as the page was open. The
  // device's copy is parsed again only when its text changes, and the default is
  // the one from the first render.
  const raw = stored === undefined || stored === null ? readRaw(key) : null;
  const cached = useMemo(() => parseRaw<T>(raw), [raw]);
  const [firstInitial] = useState(initial);
  const value = stored ?? cached ?? firstInitial;

  // Nothing up there yet, and something down here: this device's plan is the
  // plan, so it goes up once. Writes only — the value on screen is already the
  // one being sent, so there is no state to set and nothing to re-render.
  const pushed = useRef(false);
  useEffect(() => {
    if (!isSuccess || !workspace || !userId || pushed.current) return;
    if (key in workspace) return;
    // A write of its own already carries the value up; this is only for the
    // device that arrives with a plan and never touches it.
    if (writtenAt.has(key)) return;

    const cached = readCache<T>(key);
    if (cached === undefined) return;

    pushed.current = true;
    void saveWorkspaceValue(userId, key, cached);
    queryClient.setQueryData<Record<string, unknown>>(workspaceKeys.all(userId), (old) => ({ ...(old ?? {}), [key]: cached }));
  }, [isSuccess, workspace, key, userId, queryClient]);

  // The save waiting for the typing to stop. Leaving the screen — or the app —
  // inside that pause used to cancel it: the edit stayed on this device only,
  // and the next cold start, which prefers the account's copy, quietly put the
  // old value back. Now a pending save is sent at once instead: when the screen
  // goes, and when the page is hidden or closed.
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pending = useRef<(() => void) | null>(null);

  useEffect(() => {
    const flush = () => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = null;
      const send = pending.current;
      pending.current = null;
      send?.();
    };
    const onVisibility = () => {
      if (document.visibilityState === "hidden") flush();
    };
    window.addEventListener("pagehide", flush);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("pagehide", flush);
      document.removeEventListener("visibilitychange", onVisibility);
      flush();
    };
  }, []);

  const update = useCallback(
    (next: T | ((previous: T) => T)) => {
      const previous = (queryClient.getQueryData<Record<string, unknown>>(workspaceKeys.all(userId))?.[key] as T) ?? readCache<T>(key) ?? initial;
      const resolved = next instanceof Function ? next(previous) : next;

      // The screen and this device change now; the account catches up once the
      // typing, or the dragging, stops.
      writeCache(key, resolved);
      writtenAt.set(key, Date.now());
      queryClient.setQueryData<Record<string, unknown>>(workspaceKeys.all(userId), (old) => ({ ...(old ?? {}), [key]: resolved }));

      if (!userId) return;
      if (timer.current) clearTimeout(timer.current);
      pending.current = () => void saveWorkspaceValue(userId, key, resolved);
      timer.current = setTimeout(() => {
        timer.current = null;
        const send = pending.current;
        pending.current = null;
        send?.();
      }, SETTLE_MS);
    },
    [key, userId, initial, queryClient],
  );

  return [value, update];
}
