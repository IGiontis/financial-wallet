import { toast } from "react-toastify";
import i18n from "../../i18n";

/**
 * Which records have a write on its way to the server — so the screen can say
 * so, and nothing can be pressed on them meanwhile.
 *
 * Why (the owner, 2026-11-13): on his iPhone a Save sat locked for 15 s with no
 * toast, and the record had been saved all along. A Firestore write promise
 * settles only when the SERVER answers, and on a phone just back from the
 * background that answer can be a long way off (a fresh sign-in token, a fresh
 * App Check token from reCAPTCHA, a reconnecting stream). So no dialog waits
 * for it for long (`.claude/rules/ui.md`, «An action runs once, and the screen
 * never hangs»):
 *
 *   • a new record / an edit does not wait at all (`saveWithoutWaiting`): it is
 *     on screen at once, and marked here as `"save"` until the server has it —
 *     the Overview's items for it stay disabled meanwhile (the owner's ask);
 *   • an online-only action (a delete, a merge, a rename everywhere) is marked
 *     `"action"` and waits at most `LET_GO_MS` (`answerOrLetGo`): then the
 *     dialog lets go with «Συνεχίζει — θα σου πούμε μόλις γίνει», the record's
 *     rows and actions stay disabled everywhere it shows, and the real answer
 *     comes as a toast when it lands.
 *
 * A plain store outside React (a write outlives the dialog that started it),
 * read through `usePendingRecords`. Costs nothing in Firestore.
 */

/** A record: its collection and its id — `["bills", bill.id]`. */
export type PendingRef = readonly [collection: string, id: string];
export type PendingKind = "save" | "action";

/** How long an online-only action may hold its dialog before it lets go. */
export const LET_GO_MS = 7000;

const counts = new Map<string, { save: number; action: number }>();
const listeners = new Set<() => void>();
let version = 0;

const keyOf = (collection: string, id: string) => `${collection}/${id}`;

function changed() {
  version += 1;
  for (const listen of listeners) listen();
}

/**
 * Marks these records as having a write in flight. Returns the release — call
 * it when the write has settled; a second call does nothing. Two writes on the
 * same record are counted, so the first to finish does not clear the other.
 */
export function markPending(refs: readonly PendingRef[], kind: PendingKind): () => void {
  const keys = [...new Set(refs.filter(([, id]) => !!id).map(([c, id]) => keyOf(c, id)))];
  if (keys.length === 0) return () => undefined;
  for (const key of keys) {
    const entry = counts.get(key) ?? { save: 0, action: 0 };
    entry[kind] += 1;
    counts.set(key, entry);
  }
  changed();
  let released = false;
  return () => {
    if (released) return;
    released = true;
    for (const key of keys) {
      const entry = counts.get(key);
      if (!entry) continue;
      entry[kind] = Math.max(0, entry[kind] - 1);
      if (entry.save === 0 && entry.action === 0) counts.delete(key);
    }
    changed();
  };
}

/** `"action"` (an online-only action is running on it), `"save"` (a save not yet acknowledged) or `undefined`. */
export function pendingKindOf(collection: string, id: string): PendingKind | undefined {
  const entry = counts.get(keyOf(collection, id));
  if (!entry) return undefined;
  return entry.action > 0 ? "action" : entry.save > 0 ? "save" : undefined;
}

export function subscribePending(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export const pendingVersion = () => version;

/** Tests only: forget everything. */
export function resetPendingRecords() {
  counts.clear();
  changed();
}

export type AnswerOutcome = "done" | "failed" | "later";

export interface AnswerOrLetGo<T> {
  /** The records the action works on: their rows are disabled until it settles. */
  records?: readonly PendingRef[];
  /** It went through — on time or late. The success toast goes here. */
  succeeded?: (value: T) => void;
  /** It did not — on time or late. The error toast goes here (unless the hook already says it). */
  failed?: (error: unknown) => void;
  /**
   * Closes the dialog: after a success on time, or when it lets go at
   * `LET_GO_MS`. Not called on a failure on time — the dialog stays as it was.
   */
  close?: () => void;
  /** What happens at `LET_GO_MS` instead of `close`, for a dialog that shows its own result on time. */
  letGo?: () => void;
  /** Tests only. */
  limitMs?: number;
}

/**
 * Runs an online-only action (a delete, a merge, a rename everywhere) and waits
 * for the server's answer — but `LET_GO_MS` at most. Resolves with:
 *
 *   • `"done"` / `"failed"` when the answer came in time (the caller's dialog,
 *     locked by `DeleteButton` / `ConfirmSheet` / `useRunOnce` meanwhile, is
 *     released with it);
 *   • `"later"` when it did not: the dialog is closed (`close`), an info toast
 *     says it carries on, the records stay pending, and `succeeded` / `failed`
 *     are called — with their toasts — when the answer arrives.
 *
 * Never rejects. Report the result in `succeeded` / `failed`, never after the
 * await: a late answer has no caller left to hear it.
 */
export function answerOrLetGo<T>(work: () => Promise<T>, options: AnswerOrLetGo<T> = {}): Promise<AnswerOutcome> {
  const { records = [], succeeded, failed, close, letGo = close, limitMs = LET_GO_MS } = options;
  const release = markPending(records, "action");
  let running: Promise<T>;
  try {
    running = work();
  } catch (error) {
    running = Promise.reject(error);
  }

  return new Promise<AnswerOutcome>((resolve) => {
    let late = false;
    const timer = setTimeout(() => {
      late = true;
      letGo?.();
      toast.info(i18n.t("toasts.stillRunning"));
      resolve("later");
    }, limitMs);

    running.then(
      (value) => {
        clearTimeout(timer);
        release();
        succeeded?.(value);
        if (!late) {
          close?.();
          resolve("done");
        }
      },
      (error: unknown) => {
        clearTimeout(timer);
        release();
        failed?.(error);
        if (!late) resolve("failed");
      },
    );
  });
}
