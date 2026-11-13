import type { UseMutationResult } from "@tanstack/react-query";
import { cleanTextFields } from "./cleanText";
import { markPending, type PendingRef } from "./pendingRecords";

/**
 * Starts a mutation and hands the caller back a promise that is already done.
 *
 * Every save in this app used to be wrapped in `new Promise((resolve) =>
 * mutate(vars, { onSuccess: resolve }))`, so the dialog that awaited it stayed
 * on "Saving…" until Firestore answered. That is a reasonable-looking thing to
 * write and it is the bug: a Firestore write promise settles only when the
 * server acknowledges it, so on a dropped connection it does not settle at all.
 * The dialog waits for ever, and the app looks frozen — which is exactly what
 * it was. It came back once more (2026-11-13): a round of «wait for the
 * answer» handlers (`await mutation.mutateAsync(…)` before closing) held a Save
 * locked 15 s on the owner's iPhone, with no toast, over a record that had
 * been saved. New records and edits never wait — `actionsRunOnce.test.ts`
 * checks it; only online-only actions wait, 7 s at most (`answerOrLetGo`).
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
 * cache back the way it was. It hangs off the write's own promise, not
 * TanStack's per-call callbacks: those are dropped once the dialog that made
 * the call has gone, and the refusal was then never said.
 *
 * `records`, when given, are marked as having a save in flight until the
 * server has them (`pendingRecords`): the Overview's items for them stay
 * disabled meanwhile.
 */
export function saveWithoutWaiting<TData, TError, TVars, TCtx>(
  mutation: UseMutationResult<TData, TError, TVars, TCtx>,
  vars: TVars,
  onFailure?: (error: TError) => void,
  records: readonly PendingRef[] = [],
): Promise<void> {
  const release = markPending(records, "save");
  // User text is cleaned here too, so the row put on screen before the write is
  // the one stored: the same names, without stray spaces (`cleanTextFields`).
  let write: Promise<TData>;
  try {
    write = Promise.resolve(mutation.mutateAsync(cleanTextFields(vars)));
  } catch (error) {
    write = Promise.reject(error);
  }
  write.then(release, (error: TError) => {
    release();
    onFailure?.(error);
  });
  return Promise.resolve();
}
