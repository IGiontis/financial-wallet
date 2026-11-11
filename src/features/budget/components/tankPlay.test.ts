import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { DIALOG_EXIT_MS, PLAY_MS, moveOf, pourSize, tankController, tankLevels, type TankEnv, type TankSnapshot } from "./tankPlay";

// The goal card's connected tanks (item 95): the levels, and when a save plays.

describe("the tanks' levels", () => {
  it("«put in» is what is in over the target, «left» the rest, the whole full", () => {
    const l = tankLevels(280, 690);
    expect(l.in).toBeCloseTo((280 / 690) * 100, 9);
    expect(l.left).toBeCloseTo((410 / 690) * 100, 9);
    expect(l.total).toBe(100);
    // A second way: «left» is the remaining amount (690 − 280 = 410) as a share,
    // and the two connected tanks hold exactly the whole between them.
    expect(l.left).toBeCloseTo(100 - l.in, 9);
    expect(((690 - 280) / 690) * 100).toBeCloseTo(l.left, 9);
    expect(l.in + l.left).toBeCloseTo(100, 9);
  });

  it("caps both at 0–100: over the target «put in» is full and nothing is left", () => {
    expect(tankLevels(800, 690)).toMatchObject({ in: 100, left: 0, total: 100 });
    expect(tankLevels(690, 690)).toMatchObject({ in: 100, left: 0 });
    expect(tankLevels(0, 690)).toMatchObject({ in: 0, left: 100 });
    // A negative balance (a withdrawal larger than the deposits) is an empty tank, not a negative one.
    expect(tankLevels(-50, 690)).toMatchObject({ in: 0, left: 100 });
  });

  it("is empty without a target, never NaN or Infinity", () => {
    for (const target of [0, -10, NaN]) {
      const l = tankLevels(100, target);
      expect([l.in, l.left]).toEqual([0, 0]);
    }
  });

  it("every share in a run of deposits adds up, checked against the amounts", () => {
    const target = 1234.56;
    let saved = 0;
    for (const deposit of [100, 33.33, 250.07, 0.01, 851.15]) {
      saved = Math.round((saved + deposit) * 100) / 100;
      const l = tankLevels(saved, target);
      // Back from the levels to euros: what is in and what is left are the target, to the cent.
      const inEuros = (l.in / 100) * target;
      const leftEuros = (l.left / 100) * target;
      expect(inEuros).toBeCloseTo(saved, 6);
      expect(leftEuros).toBeCloseTo(target - saved, 6);
      expect(inEuros + leftEuros).toBeCloseTo(target, 6);
    }
    expect(saved).toBeCloseTo(1234.56, 9);
    expect(tankLevels(saved, target)).toMatchObject({ in: 100, left: 0 });
  });

  it("sizes the pour by the amount: clamped at both ends", () => {
    expect(pourSize(0)).toEqual({ width: 2, ms: 300, bubbles: 1 });
    expect(pourSize(0.5)).toEqual({ width: 10, ms: 900, bubbles: 5 });
    // More than the target, a negative (withdrawal) share, nonsense: still in range.
    expect(pourSize(3)).toEqual(pourSize(0.5));
    expect(pourSize(-0.5)).toEqual(pourSize(0.5));
    expect(pourSize(NaN)).toEqual(pourSize(0));
    expect(pourSize(Infinity)).toEqual(pourSize(0));
  });

  it("sizes the pour by the amount: a bigger amount is never a smaller pour", () => {
    let last = pourSize(0);
    for (let i = 1; i <= 120; i++) {
      const now = pourSize(i / 200);
      expect(now.width).toBeGreaterThanOrEqual(last.width);
      expect(now.ms).toBeGreaterThanOrEqual(last.ms);
      expect(now.bubbles).toBeGreaterThanOrEqual(last.bubbles);
      for (const [v, lo, hi] of [[now.width, 2, 10], [now.ms, 300, 900], [now.bubbles, 1, 5]]) {
        expect(v).toBeGreaterThanOrEqual(lo);
        expect(v).toBeLessThanOrEqual(hi);
      }
      last = now;
    }
    // A trickle and a flood are visibly different, and a 1% deposit is still seen.
    expect(pourSize(0.01).width).toBeLessThan(pourSize(0.3).width);
    expect(pourSize(0.01).width).toBeGreaterThan(2);
  });

  it("tells a deposit from a withdrawal, and half a cent from nothing", () => {
    expect(moveOf(100, 150)).toBe("in");
    expect(moveOf(150, 100)).toBe("out");
    expect(moveOf(100, 100.004)).toBeNull();
    expect(moveOf(100, 100.01)).toBe("in");
  });
});

/** A page with a dialog that can be open or shut. */
function page() {
  const env = { open: false, revealed: 0, scrollMs: 0 };
  const api: TankEnv = {
    dialogOpen: () => env.open,
    reveal: () => (env.revealed++, env.scrollMs),
    now: () => Date.now(),
  };
  return { env, api };
}

describe("a save played on the tanks", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  const start = tankLevels(280, 690);
  const after = tankLevels(380, 690);

  /** Every snapshot the card was handed, in order. */
  const record = (ctl: ReturnType<typeof tankController>) => {
    const seen: TankSnapshot[] = [];
    ctl.subscribe(() => seen.push(ctl.get()));
    return seen;
  };

  it("holds the old level while the dialog is open, then plays old → new once it has faded", () => {
    const { env, api } = page();
    const ctl = tankController(start, api);
    const seen = record(ctl);
    env.open = true;
    ctl.setTarget(after); // the optimistic patch lands under the dialog
    ctl.announce(); // celebrateSave
    vi.advanceTimersByTime(5000);
    expect(ctl.get().levels).toBe(start); // still the old level behind the dialog
    expect(seen).toHaveLength(0);

    env.open = false; // the dialog closes
    vi.advanceTimersByTime(DIALOG_EXIT_MS - 1);
    expect(ctl.get().play).toBeNull(); // its fade-out is not over yet
    vi.advanceTimersByTime(200);
    expect(ctl.get()).toMatchObject({ levels: after, from: start, play: "in", key: 1 });
    // The play is sized by the amount moved: 100 of a 690 target, worked out the
    // second way from the two levels.
    expect(ctl.get().share).toBeCloseTo(100 / 690, 9);
    expect(ctl.get().share).toBeCloseTo((after.in - start.in) / 100, 9);

    vi.advanceTimersByTime(PLAY_MS);
    expect(ctl.get()).toMatchObject({ levels: after, play: null, key: 1, share: 0 });
    // Played exactly once.
    expect(seen.filter((s) => s.play).length).toBe(1);
  });

  it("plays once per save: later re-renders and changes without a save only settle", () => {
    const { env, api } = page();
    const ctl = tankController(start, api);
    const seen = record(ctl);
    env.open = true;
    ctl.announce();
    ctl.setTarget(after); // the other order: the save said so first
    env.open = false;
    vi.advanceTimersByTime(DIALOG_EXIT_MS + 200 + PLAY_MS);
    expect(ctl.get().key).toBe(1);

    // The same figures again (a server echo): nothing.
    ctl.setTarget(tankLevels(380, 690));
    // A change nobody saved here (a sync from another device): straight to it, no play.
    ctl.setTarget(tankLevels(400, 690));
    vi.advanceTimersByTime(5000);
    expect(ctl.get()).toMatchObject({ levels: tankLevels(400, 690), play: null, key: 1 });
    expect(seen.filter((s) => s.play).length).toBe(1);

    // A second save is a second play.
    ctl.announce();
    ctl.setTarget(tankLevels(350, 690));
    vi.advanceTimersByTime(DIALOG_EXIT_MS + 200);
    expect(ctl.get()).toMatchObject({ play: "out", key: 2 });
    expect(seen.filter((s) => s.play).length).toBe(2);
  });

  it("plays a withdrawal as «out»", () => {
    const { api } = page();
    const ctl = tankController(after, api);
    ctl.announce();
    ctl.setTarget(start);
    vi.advanceTimersByTime(DIALOG_EXIT_MS + 200);
    expect(ctl.get()).toMatchObject({ levels: start, from: after, play: "out" });
  });

  it("plays nothing — no bubbles, no splash — when the amount did not change", () => {
    const { api } = page();
    const ctl = tankController(start, api);
    const seen = record(ctl);
    ctl.announce();
    vi.advanceTimersByTime(10_000);
    expect(seen).toHaveLength(0);
    // A target edit (same amount in, a new whole) only settles.
    ctl.setTarget(tankLevels(280, 1000));
    vi.advanceTimersByTime(10_000);
    expect(seen.every((s) => s.play === null)).toBe(true);
  });

  it("waits for a dialog that stays open — the next one, or the sheet behind it", () => {
    const { env, api } = page();
    const ctl = tankController(start, api);
    env.open = true;
    ctl.announce();
    ctl.setTarget(after);
    env.open = false;
    vi.advanceTimersByTime(100);
    env.open = true; // another dialog opened before the fade was over
    vi.advanceTimersByTime(DIALOG_EXIT_MS + 5000);
    expect(ctl.get().play).toBeNull();
    env.open = false;
    vi.advanceTimersByTime(DIALOG_EXIT_MS + 200);
    expect(ctl.get().play).toBe("in");
  });

  it("scrolls the tanks into view first, then plays", () => {
    const { env, api } = page();
    env.scrollMs = 450;
    const ctl = tankController(start, api);
    ctl.announce();
    ctl.setTarget(after);
    vi.advanceTimersByTime(DIALOG_EXIT_MS + 150);
    expect(env.revealed).toBe(1);
    expect(ctl.get().play).toBeNull(); // still scrolling
    vi.advanceTimersByTime(450);
    expect(ctl.get()).toMatchObject({ play: "in", levels: after });
    expect(env.revealed).toBe(1);
  });

  it("still plays figures that land a moment after the dialog went", () => {
    const { api } = page();
    const ctl = tankController(start, api);
    ctl.announce();
    vi.advanceTimersByTime(DIALOG_EXIT_MS + 200);
    expect(ctl.get().play).toBeNull();
    ctl.setTarget(after);
    vi.advanceTimersByTime(DIALOG_EXIT_MS + 200);
    expect(ctl.get().play).toBe("in");
    // …but not long after: a save announced and never seen is let go.
    ctl.announce();
    vi.advanceTimersByTime(DIALOG_EXIT_MS + 200 + 5000);
    ctl.setTarget(start);
    vi.advanceTimersByTime(DIALOG_EXIT_MS + 200);
    expect(ctl.get()).toMatchObject({ levels: start, play: null });
  });

  it("with no dialog and no save, a change is drawn at once", () => {
    const { api } = page();
    const ctl = tankController(start, api);
    ctl.setTarget(after);
    expect(ctl.get()).toMatchObject({ levels: after, from: after, play: null, key: 0 });
  });
});
