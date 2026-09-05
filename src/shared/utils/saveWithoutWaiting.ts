import type { UseMutationResult } from "@tanstack/react-query";

/**
 * Starts a mutation and hands the caller back a promise that is already done.
 *
 * Every save in this app used to be wrapped in `new Promise((resolve) =>
 * mutate(vars, { onSuccess: resolve }))`, so the dialog that awaited it stayed
 * on "Saving…" until Firestore answered. That is a reasonable-looking thing to
 * write and it is the bug: a Firestore write promise settles only when the
 * server acknowledges it, so on a dropped connection it does not settle at all.
 * The dialog waits for ever, and the app looks frozen — which is exactly what
 * it was.
 *
 * There is nothing to wait for. Every one of these mutations applies an
 * optimistic update first, so the row the reader is waiting to see is already
 * on screen before the request leaves, and with the on-disk cache the write is
 * durably queued whether or not there is a connection. Waiting only postpones
 * closing the dialog.
 *
 * The trade, stated plainly: a write that is going to be rejected — a rules
 * failure, say — is reported after the dialog has closed rather than in it.
 * `onFailure` is where that lands, and the mutation's own `onError` puts the
 * cache back the way it was.
 */
export function saveWithoutWaiting<TData, TError, TVars, TCtx>(
  mutation: UseMutationResult<TData, TError, TVars, TCtx>,
  vars: TVars,
  onFailure?: (error: TError) => void,
): Promise<void> {
  mutation.mutate(vars, onFailure ? { onError: onFailure } : undefined);
  return Promise.resolve();
}
