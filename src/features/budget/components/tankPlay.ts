import { useEffect, useLayoutEffect, useState, useSyncExternalStore, type RefObject } from "react";
import { MODAL_MS } from "../../../shared/components/modalMotion";
import { onSaved } from "../../../shared/feedback/saveFeedback";

/**
 * The goal card's three tanks as CONNECTED vessels (item 95): «Έβαλες» fills
 * while «Μένουν» drains by the same amount, «Σύνολο» stays full and still.
 *
 * A deposit or a withdrawal is made in a dialog, over the card. Played there it
 * would be over before anyone saw it, so the card keeps showing the old levels
 * while a dialog is open, and once the save has said so
 * (`celebrateSave({ collection: "investmentContributions", id: goalId })`) and
 * the dialog has faded out, it plays old → new — once per save, scrolling the
 * tanks into view first if they are off screen. A level that changes for any
 * other reason (an edit, a sync) just eases to its new height, no stream, no
 * bubbles.
 *
 * All in the page: no reads, no writes.
 */

/** How full each tank is, 0–100, and the amount in the goal it was worked out from. */
export interface TankLevels {
  /** What is in the goal (`totalSaved`), so a play can tell a deposit from a withdrawal. */
  saved: number;
  /** «Έβαλες»: what is in, as a share of the target. */
  in: number;
  /** «Μένουν»: what is left (target − in), as a share of the target. */
  left: number;
  /** «Σύνολο»: always full. */
  total: number;
  /** The target the shares are of (0 without one), to size a play by the amount moved. */
  whole: number;
}

const clamp = (n: number) => (Number.isFinite(n) ? Math.max(0, Math.min(100, n)) : 0);

/** The three levels for `saved` of `target`. Without a target every tank is empty but the whole. */
export function tankLevels(saved: number, target: number): TankLevels {
  if (!(target > 0)) return { saved, in: 0, left: 0, total: 100, whole: 0 };
  return {
    saved,
    in: clamp((saved / target) * 100),
    left: clamp(((target - saved) / target) * 100),
    total: 100,
    whole: target,
  };
}

/** How big a play is: the stream's width, how long it pours, how many bubbles rise. */
export interface PourSize {
  /** The stream's width (and the drain's scale), px: 2–10. */
  width: number;
  /** How long the stream pours / the drain runs, ms: 300–900. */
  ms: number;
  /** Bubbles that rise: 1–5. */
  bubbles: number;
}

/** A move of half the target or more is the biggest pour there is. */
const FULL_POUR_SHARE = 0.5;

/**
 * The play scaled to the money moved (the owner, 2026-11-11): a big amount a
 * thick, long pour and more bubbles, a small one a thin, short trickle.
 * `share` is the amount over the target. The square root lets a small deposit
 * still be seen: 1% of the target is a fifth of the way from the least to the most.
 */
export function pourSize(share: number): PourSize {
  const s = Number.isFinite(share) ? Math.max(0, Math.min(1, Math.abs(share) / FULL_POUR_SHARE)) : 0;
  const t = Math.sqrt(s);
  return { width: Math.round((2 + 8 * t) * 10) / 10, ms: Math.round(300 + 600 * t), bubbles: 1 + Math.round(4 * t) };
}

/** Which way the money went: "in" (a deposit), "out" (a withdrawal), or null when the amount is the same. */
export type TankMove = "in" | "out" | null;

/** Half a cent either way is the same amount. */
export function moveOf(before: number, after: number): TankMove {
  const d = after - before;
  return Math.abs(d) < 0.005 ? null : d > 0 ? "in" : "out";
}

const sameLevels = (a: TankLevels, b: TankLevels) => moveOf(a.saved, b.saved) === null && Math.abs(a.in - b.in) < 1e-9 && Math.abs(a.left - b.left) < 1e-9;

/** After the last dialog lost `.show`: its fade-out (modalMotion.ts) and a frame. */
export const DIALOG_EXIT_MS = MODAL_MS + 30;
/** How often a held card looks whether the dialog has gone. */
const POLL_MS = 100;
/** The longest effect of a play (GoalCard.module.css: stream, splash, bubbles): then it is taken off. */
export const PLAY_MS = 2000;
/** A save whose new figures land a moment after the dialog went still plays, this long. */
const LATE_MS = 2000;

/** What the card draws. */
export interface TankSnapshot {
  /** The levels on screen now. */
  levels: TankLevels;
  /** The levels a play started from (for the reduced-motion fade); the same as `levels` otherwise. */
  from: TankLevels;
  /** The move being played, or null. */
  play: TankMove;
  /** One more for every play, so its effects start afresh. */
  key: number;
  /** The amount the play moved, over the target (0 at rest): sizes the stream, the drain, the bubbles. */
  share: number;
}

/** What the controller needs from the page — swapped for a fake in the tests. */
export interface TankEnv {
  /** Is a dialog showing (over the card)? */
  dialogOpen(): boolean;
  /** Bring the tanks into view if they are off screen; how long to wait for the scroll, in ms. */
  reveal(el: HTMLElement | null): number;
  now(): number;
}

/**
 * The tanks' state, outside React: the levels on screen, the levels the goal
 * has now, and whether a save is waiting to be played. React reads it through
 * `useSyncExternalStore` (`useTankPlay` below).
 */
export function tankController(initial: TankLevels, env: TankEnv) {
  let target = initial;
  let snap: TankSnapshot = {
    levels: initial,
    from: initial,
    play: null,
    key: 0,
    share: 0,
  };
  /** A save announced for this goal and not yet played: until when it still may be (Infinity: until the dialog has gone). */
  let pendingUntil = -1;
  let wait: ReturnType<typeof setTimeout> | undefined;
  let end: ReturnType<typeof setTimeout> | undefined;
  const subscribers = new Set<() => void>();
  let anchor: () => HTMLElement | null = () => null;

  const pending = () => pendingUntil > env.now();
  const set = (next: TankSnapshot) => {
    snap = next;
    for (const s of subscribers) s();
  };

  /** Draw `target`, playing `move` if there is one. */
  const show = (move: TankMove) => {
    if (move) {
      const share = target.whole > 0 ? Math.abs(target.saved - snap.levels.saved) / target.whole : 0;
      set({ levels: target, from: snap.levels, play: move, key: snap.key + 1, share });
      clearTimeout(end);
      end = setTimeout(() => set({ ...snap, from: snap.levels, play: null, share: 0 }), PLAY_MS);
    } else if (!sameLevels(snap.levels, target)) {
      set({ ...snap, levels: target, from: target });
    }
  };

  /** The dialog has gone and faded: play the save, or settle on the new levels. */
  const fire = () => {
    wait = undefined;
    if (env.dialogOpen()) return hold();
    const move = pending() ? moveOf(snap.levels.saved, target.saved) : null;
    if (!move) {
      // Announced but its figures have not arrived yet: they may, for a moment.
      if (pending()) pendingUntil = Math.min(pendingUntil, env.now() + LATE_MS);
      return show(null);
    }
    pendingUntil = -1;
    const scroll = env.reveal(anchor());
    if (scroll > 0) wait = setTimeout(() => ((wait = undefined), show(moveOf(snap.levels.saved, target.saved))), scroll);
    else show(move);
  };

  /** Keep what is on screen until no dialog is open, then `fire` after its fade. */
  const hold = () => {
    if (wait) return;
    const look = () => {
      wait = env.dialogOpen() ? setTimeout(look, POLL_MS) : setTimeout(fire, DIALOG_EXIT_MS);
    };
    look();
  };

  return {
    get: () => snap,
    subscribe(fn: () => void) {
      subscribers.add(fn);
      return () => subscribers.delete(fn);
    },
    /** The goal's figures now. */
    setTarget(next: TankLevels) {
      if (sameLevels(next, target)) return;
      target = next;
      if (wait) return; // already waiting: it reads the newest target when it fires
      if (pending() || env.dialogOpen()) return hold();
      show(null);
    },
    /** A deposit or a withdrawal on this goal was saved. */
    announce() {
      pendingUntil = Infinity;
      if (!wait) hold();
    },
    /** Where the tanks are on the page, to scroll them into view. */
    setAnchor(get: () => HTMLElement | null) {
      anchor = get;
    },
    dispose() {
      clearTimeout(wait);
      clearTimeout(end);
      wait = undefined;
    },
  };
}

const reducedMotion = () => typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** The browser's side: an open dialog is one with `.show`; the tanks are scrolled to the middle of the screen when not wholly on it. */
const BROWSER: TankEnv = {
  dialogOpen: () => typeof document !== "undefined" && document.querySelector(".modal.show") !== null,
  now: () => Date.now(),
  reveal(el) {
    if (!el || typeof window === "undefined") return 0;
    const box = el.getBoundingClientRect();
    // The header above and the floating «+» / bottom bar below cover a strip each.
    if (box.top >= 56 && box.bottom <= window.innerHeight - 80) return 0;
    const calm = reducedMotion();
    el.scrollIntoView?.({
      block: "center",
      behavior: calm ? "auto" : "smooth",
    });
    return calm ? 0 : 450;
  },
};

/**
 * The card's tanks: what to draw, and when to play a save. `anchor` is the
 * row of tiles, scrolled into view for a play.
 */
export function useTankPlay(goalId: string, target: TankLevels, anchor: RefObject<HTMLElement | null>, env?: TankEnv): TankSnapshot {
  const [ctl] = useState(() => tankController(target, env ?? BROWSER));
  useEffect(() => ctl.setAnchor(() => anchor.current), [ctl, anchor]);
  // Before paint, so a change with nothing to wait for is drawn in the same frame.
  useLayoutEffect(() => ctl.setTarget(target), [ctl, target]);
  useEffect(() => onSaved("investmentContributions", (id) => id === goalId && ctl.announce()), [ctl, goalId]);
  useEffect(() => () => ctl.dispose(), [ctl]);
  return useSyncExternalStore(ctl.subscribe, ctl.get, ctl.get);
}
