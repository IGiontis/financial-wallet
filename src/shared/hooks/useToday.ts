import { useSyncExternalStore } from "react";

// ─── One "today" for the whole app ──────────────────────────────────────────
//
// The bills' figures turn on the day: what is late, what falls due within the
// week, which period is the current one. The menu's badge and the Bills page
// each kept a clock of their own — the page read it once when it opened, the
// badge whenever the bills last changed — so on a phone that left the app open
// overnight they asked the same question about two different days. Pay one of
// two bills in the morning on a page opened last night and the tab said 1
// while the menu, counting today, said 2: a third bill had come within the
// week overnight.
//
// So there is one reading, shared. It moves only when the date does — at
// midnight, or the moment the app comes back to the screen on a later day —
// so everything that reads it changes together, and between those moments it
// is the same object everywhere, which keeps the memos built on it still.
// Reads nothing but the device's clock.

const dayKey = (d: Date) => d.getFullYear() * 10_000 + d.getMonth() * 100 + d.getDate();

let today: Date | undefined;
const listeners = new Set<() => void>();
let midnight: ReturnType<typeof setTimeout> | undefined;

/** The shared reading, moved on when the date has changed since it was taken. */
function read(): Date {
  const now = new Date();
  if (!today || dayKey(today) !== dayKey(now)) today = now;
  return today;
}

function notify() {
  const before = today;
  if (read() !== before) for (const listener of listeners) listener();
}

/** Wakes up just after the next midnight, and again after each one. */
function armMidnight() {
  clearTimeout(midnight);
  const now = new Date();
  const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 1);
  midnight = setTimeout(() => {
    notify();
    armMidnight();
  }, next.getTime() - now.getTime());
}

/** A phone puts timers to sleep with the app; coming back is when to look. */
const onVisible = () => {
  if (document.visibilityState !== "hidden") {
    notify();
    armMidnight();
  }
};

function subscribe(listener: () => void) {
  listeners.add(listener);
  if (listeners.size === 1) {
    armMidnight();
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) {
      clearTimeout(midnight);
      midnight = undefined;
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    }
  };
}

/**
 * Now, as one shared reading that moves when the date does. For figures that
 * turn on the day — bills late or due, the current period — where two parts
 * of the screen must never count from two different days.
 */
export function useToday(): Date {
  return useSyncExternalStore(subscribe, read, read);
}
