/**
 * What the app refuses to do with no connection, and what it is happy to queue.
 *
 * Firestore's on-disk cache takes any write offline and sends it when the
 * connection returns, and for most of what this app is used for that is exactly
 * right: an expense at the till, a bill ticked as paid. Those are additive, the
 * screen shows them the moment they are entered, and one going missing would be
 * obvious and trivial to enter again. Locking those would make the app useless
 * in the one place a phone is most likely to be offline.
 *
 * Two kinds of thing are not like that.
 *
 * A deletion is judged against what is on the screen, and offline that screen is
 * the account as it was — possibly hours old, possibly already changed on
 * another device. It is also the only action with nothing to undo it. So a
 * delete waits for the live account rather than being taken on trust.
 *
 * A settings change is the other one. The display currency decides what every
 * amount on every screen means, and switching it needs a rate the app cannot go
 * and fetch; doing it against no rate would quietly redraw the whole app at
 * 1:1. Email and password are not ours to change offline at all.
 */
export type OfflineAction =
  /** Additive, and queued offline: a transaction, a payment, a goal. */
  | "entry"
  /** Destructive, and judged against a copy: waits for a connection. */
  | "delete"
  /** Changes what every other screen means: waits for a connection. */
  | "settings";

export function isLockedOffline(action: OfflineAction, online: boolean): boolean {
  if (online) return false;
  return action !== "entry";
}

/**
 * Raised when something gets past a disabled control — a tab left open since
 * before the connection dropped, a second window, a keyboard shortcut.
 */
export class OfflineActionError extends Error {
  readonly action: OfflineAction;

  constructor(action: OfflineAction) {
    super(`This action needs a connection: ${action}`);
    this.name = "OfflineActionError";
    this.action = action;
  }
}

/**
 * The backstop, called from the data layer rather than the screen.
 *
 * Disabling a button states the rule; this one is what enforces it, so a path
 * nobody remembered to guard cannot quietly queue a deletion instead.
 */
export function requireConnection(action: Exclude<OfflineAction, "entry">, online: boolean = navigator.onLine): void {
  if (isLockedOffline(action, online)) throw new OfflineActionError(action);
}
