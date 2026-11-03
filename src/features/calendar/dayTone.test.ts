import { describe, it, expect } from "vitest";
import { dayTone, DAY_TONE as c } from "./dayTone";

const has = (classes: string, ...names: string[]) => names.every((n) => classes.split(" ").includes(n));

describe("dayTone — every calendar's colours from what is on a square", () => {
  it("paints money in green and out red, both as the diagonal", () => {
    expect(has(dayTone({ in: "todo" }), c.cell, c.in)).toBe(true);
    expect(has(dayTone({ out: "todo" }), c.cell, c.out)).toBe(true);
    expect(has(dayTone({ in: "todo", out: "todo" }), c.both)).toBe(true);
  });

  it("pales each side once it happened, and strikes the square through only when all of it did", () => {
    const paidBill = dayTone({ out: "done" });
    expect(has(paidBill, c.out, c.outDone, c.allDone)).toBe(true);
    const halfDone = dayTone({ in: "done", out: "todo" });
    expect(has(halfDone, c.both, c.inDone)).toBe(true);
    expect(has(halfDone, c.allDone)).toBe(false);
  });

  it("draws what is later as a dashed edge, a month off as grey, and the late dot on top", () => {
    expect(has(dayTone({ out: "ahead" }), c.aheadOut)).toBe(true);
    expect(has(dayTone({ in: "ahead" }), c.aheadIn)).toBe(true);
    expect(has(dayTone({ off: true, out: "todo" }), c.off)).toBe(true);
    expect(has(dayTone({ off: true, out: "todo" }), c.out)).toBe(false);
    expect(has(dayTone({ out: "todo", late: true, today: true }), c.late, c.today)).toBe(true);
  });
});
