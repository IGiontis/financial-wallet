import { useCallback, useLayoutEffect, useMemo, useRef } from "react";
import { useMutation, type MutateOptions, type UseMutationOptions, type UseMutationResult } from "@tanstack/react-query";

/**
 * The one way the app declares a write: `useMutation` with a guard, so the same
 * action never runs twice at once.
 *
 * Why (the owner, 2026-11-12): «delete goal» pressed again while the first
 * delete was still running sent a second batch naming the documents the first
 * had just deleted. The live rules refuse a delete of a missing document and
 * fail the whole batch — so an error toast came up for a goal that was gone.
 * The screen locks its controls while an action runs (`DeleteButton`,
 * `useRunOnce`); this is the same lock one layer down, where nothing can miss
 * it: a second call that is the SAME action, made while the first is still in
 * flight, starts nothing — `mutate` drops it, `mutateAsync` hands back the
 * first call's promise, so its caller hears the first call's answer.
 *
 * What counts as the same action is `onceBy` — required, so every mutation
 * says it:
 *   • a delete / online-only change: the record it acts on (`(id) => id`,
 *     `(tx) => tx.id`) — a second press on the same record is the same action;
 *     another record is another action and runs.
 *   • an optimistic save (`saveWithoutWaiting`): `sameCall` — only the very same
 *     vars object. Two saves with equal figures are two records (two deposits
 *     of 50 € made offline stay pending side by side and must both land); a
 *     double Save is stopped in the form, which closes on the first.
 *
 * No timers: the guard lasts exactly as long as the mutation's own promise.
 */
export type OnceMutationOptions<TData, TError, TVars, TCtx> = UseMutationOptions<TData, TError, TVars, TCtx> & {
  onceBy: (vars: TVars) => unknown;
};

/** `onceBy` for an optimistic save: only the very same vars object is a repeat. */
export const sameCall = <T,>(vars: T): unknown => vars;

export function useOnceMutation<TData = unknown, TError = Error, TVars = void, TCtx = unknown>(
  options: OnceMutationOptions<TData, TError, TVars, TCtx>,
): UseMutationResult<TData, TError, TVars, TCtx> {
  const { onceBy, ...rest } = options;
  const mutation = useMutation<TData, TError, TVars, TCtx>(rest);
  const running = useRef(new Map<unknown, Promise<TData>>());
  // The latest `onceBy`, read when a call is made (always after a commit).
  const keyOf = useRef(onceBy);
  useLayoutEffect(() => {
    keyOf.current = onceBy;
  });
  const start = mutation.mutateAsync;

  const mutateAsync = useCallback(
    (vars: TVars, callbacks?: MutateOptions<TData, TError, TVars, TCtx>): Promise<TData> => {
      const key = keyOf.current(vars);
      const already = running.current.get(key);
      if (already) return already;
      const call = start(vars, callbacks).finally(() => {
        if (running.current.get(key) === call) running.current.delete(key);
      });
      running.current.set(key, call);
      return call;
    },
    [start],
  );

  const mutate = useCallback(
    (vars: TVars, callbacks?: MutateOptions<TData, TError, TVars, TCtx>) => {
      // As TanStack's own `mutate`: the error is the callbacks' and the
      // mutation's `onError`'s to report, not an unhandled rejection.
      mutateAsync(vars, callbacks).catch(() => undefined);
    },
    [mutateAsync],
  );

  return useMemo(() => ({ ...mutation, mutate, mutateAsync }) as UseMutationResult<TData, TError, TVars, TCtx>, [mutation, mutate, mutateAsync]);
}
