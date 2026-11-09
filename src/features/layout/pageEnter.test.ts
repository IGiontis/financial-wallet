import { afterEach, describe, expect, it } from "vitest";

import { pageEnterFrames, prefersReducedMotion, REDUCED_MOTION_QUERY } from "./pageEnter";

const original = window.matchMedia;

const asking = (reduce: boolean) => {
  window.matchMedia = ((query: string) => ({ matches: reduce && query === REDUCED_MOTION_QUERY, media: query })) as unknown as typeof window.matchMedia;
};

afterEach(() => {
  window.matchMedia = original;
});

describe("a page arriving", () => {
  it("fades up from a little above when nothing else is asked", () => {
    const [from, to] = pageEnterFrames(false);
    expect(from).toEqual({ opacity: 0, top: "-0.5rem" });
    expect(to).toEqual({ opacity: 1, top: "0" });
  });

  // The owner's laptop asks for less motion and he still wants to see a page arrive.
  it("still fades under reduced motion, without moving", () => {
    const frames = pageEnterFrames(true);
    expect(frames.map((f) => f.opacity)).toEqual([0, 1]);
    for (const frame of frames) {
      expect(frame).not.toHaveProperty("top");
      expect(frame).not.toHaveProperty("transform");
    }
  });

  it("reads the device's wish", () => {
    asking(true);
    expect(prefersReducedMotion()).toBe(true);
    asking(false);
    expect(prefersReducedMotion()).toBe(false);
  });

  it("counts a browser that cannot be asked as no wish at all", () => {
    window.matchMedia = undefined as unknown as typeof window.matchMedia;
    expect(prefersReducedMotion()).toBe(false);
  });
});
