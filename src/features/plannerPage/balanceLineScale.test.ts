import { describe, expect, it } from "vitest";
import { calendarTicks, markerIndexes, nearestIndex, niceStep, valueScale } from "./balanceLineScale";
import type { PlannerEvent, ProjectionPoint } from "./plannerUtils";

const point = (date: Date, balance: number, events: Partial<PlannerEvent>[] = []): ProjectionPoint =>
  ({ date, balance, events: events.map((e) => ({ kind: "bill", label: "x", amount: 0, date, ...e })) }) as ProjectionPoint;

describe("niceStep", () => {
  it("rounds up to 1, 2, 2.5 or 5 of a power of ten", () => {
    expect(niceStep(563)).toBe(1000);
    expect(niceStep(450)).toBe(500);
    expect(niceStep(180)).toBe(200);
    expect(niceStep(21)).toBe(25);
    expect(niceStep(0)).toBe(1);
  });
});

describe("valueScale", () => {
  it("labels round amounts from zero up past the highest balance", () => {
    const { min, max, ticks } = valueScale([640, 2252, 177]);
    expect(min).toBe(0);
    expect(max).toBe(2500);
    expect(ticks).toEqual([0, 500, 1000, 1500, 2000, 2500]);
  });

  it("does not let a small dip drag a large scale's floor down a whole step", () => {
    // Ten years ending near €66k with one −€908 month: the steps are €20k, and
    // rounding the floor would have put it at −20k.
    const { min, max, ticks } = valueScale([2250, -908, 66318]);
    expect(max).toBe(80000);
    expect(min).toBeLessThan(-908);
    // Just under the dip — 5% of the range — not a step of 20k under it.
    expect(min).toBeCloseTo(-908 - (80000 + 908) * 0.05, 6);
    expect(min).toBeGreaterThan(-5000);
    expect(ticks[0]).toBe(0);
    expect(ticks).toEqual([0, 20000, 40000, 60000, 80000]);
  });

  it("keeps every balance inside the range", () => {
    for (const values of [[5, 3, 1], [-400, -20], [0], [12.5, -0.3, 99999]]) {
      const { min, max } = valueScale(values);
      for (const v of values) {
        expect(v).toBeGreaterThanOrEqual(min);
        expect(v).toBeLessThanOrEqual(max);
      }
      expect(max).toBeGreaterThan(min);
    }
  });

  it("never labels minus zero", () => {
    expect(valueScale([-50, 400]).ticks.some((t) => Object.is(t, -0))).toBe(false);
  });
});

describe("calendarTicks", () => {
  const scale = (start: Date, end: Date, width = 276) => (time: number) => 8 + ((time - start.getTime()) / (end.getTime() - start.getTime())) * width;
  const fmt = { formatMonth: (d: Date) => `M${d.getMonth() + 1}`, formatDay: (d: Date) => `D${d.getDate()}` };

  it("reads a month in weeks", () => {
    const start = new Date(2026, 9, 2);
    const end = new Date(2026, 9, 31);
    const ticks = calendarTicks({ start, end, daily: true, x: scale(start, end), left: 8, right: 284, ...fmt });
    expect(ticks.map((t) => t.label)).toEqual(["D8", "D15", "D22"]);
  });

  it("reads ten years in years, never two labels closer than the gap", () => {
    const start = new Date(2026, 9, 2);
    const end = new Date(2036, 8, 30);
    const x = scale(start, end);
    const ticks = calendarTicks({ start, end, daily: false, x, left: 8, right: 284, ...fmt });

    expect(ticks.length).toBeGreaterThan(2);
    expect(ticks.every((t) => /^\d{4}$/.test(t.label))).toBe(true);
    for (let i = 1; i < ticks.length; i++) expect(ticks[i].x - ticks[i - 1].x).toBeGreaterThanOrEqual(46);
    // Each year label sits on its own 1 January.
    for (const t of ticks) {
      const d = new Date(t.time);
      expect([d.getMonth(), d.getDate(), String(d.getFullYear())]).toEqual([0, 1, t.label]);
    }
  });

  it("names the turn of the year by the year, not the month", () => {
    const start = new Date(2026, 9, 2);
    const end = new Date(2027, 8, 30);
    const labels = calendarTicks({ start, end, daily: false, x: scale(start, end), left: 8, right: 284, ...fmt }).map((t) => t.label);
    expect(labels).toContain("2027");
    expect(labels).not.toContain("M1");
  });

  it("keeps labels off the very edges, where they would be clipped", () => {
    const start = new Date(2026, 9, 2);
    const end = new Date(2026, 10, 30);
    const ticks = calendarTicks({ start, end, daily: true, x: scale(start, end), left: 8, right: 284, ...fmt });
    expect(ticks.every((t) => t.x >= 20 && t.x <= 272)).toBe(true);
  });
});

describe("markerIndexes", () => {
  const days = (n: number, build: (i: number) => [number, Partial<PlannerEvent>[]]) =>
    Array.from({ length: n }, (_, i) => point(new Date(2026, 9, 2 + i), ...build(i)));
  const x = (i: number) => i * 4;

  it("dots every day that carries something while there are few", () => {
    const points = days(30, (i) => [1000 - i, i % 5 === 0 ? [{ amount: -10 }] : []]);
    expect(markerIndexes(points, x)).toEqual([0, 5, 10, 15, 20, 25]);
  });

  it("past that, keeps the low, the high, the first day under zero and the steepest drops", () => {
    // Every day carries an event. A sawtooth, with one day far steeper and one
    // day that goes under.
    const points = days(90, (i) => [i === 40 ? -300 : i === 41 ? 200 : 1000 + (i % 7) * 50 - (i === 70 ? 800 : 0), [{ amount: -1 }]]);
    const kept = markerIndexes(points, x);

    const low = points.reduce((m, p, i) => (p.balance < points[m].balance ? i : m), 0);
    const high = points.reduce((m, p, i) => (p.balance > points[m].balance ? i : m), 0);
    expect(kept).toContain(low);
    expect(kept).toContain(high);
    expect(kept).toContain(40); // first under zero
    expect(kept).toContain(70); // the steepest drop that is not the dip itself
    expect(kept.length).toBeLessThanOrEqual(3 + 6);
    expect(kept.length).toBeLessThan(points.length);
  });

  it("marks the day it first goes under even when that is neither the low nor a steep drop", () => {
    // A gentle slide under zero on day 20, a deeper low later on day 60, and a
    // dozen steeper weekly drops that fill every "steepest" slot first.
    const slide: Record<number, number> = { 15: 400, 16: 300, 17: 200, 18: 100, 19: 50, 20: -10 };
    const points = days(90, (i) => [slide[i] ?? (i === 60 ? -400 : 1000 + (i % 7) * 50), [{ amount: -1 }]]);
    const kept = markerIndexes(points, x);

    expect(points.findIndex((p) => p.balance < 0)).toBe(20);
    expect(kept).toContain(20);
    expect(kept).toContain(60);
  });
});

describe("nearestIndex", () => {
  const points = [0, 7, 14, 30].map((d) => point(new Date(2026, 0, 1 + d), 0));
  const at = (day: number) => new Date(2026, 0, 1 + day).getTime();

  it("snaps to the closest point in time", () => {
    expect(nearestIndex(points, at(-5))).toBe(0);
    expect(nearestIndex(points, at(3))).toBe(0);
    expect(nearestIndex(points, at(4))).toBe(1);
    expect(nearestIndex(points, at(10))).toBe(1);
    expect(nearestIndex(points, at(11))).toBe(2);
    expect(nearestIndex(points, at(23))).toBe(3);
    expect(nearestIndex(points, at(400))).toBe(3);
  });

  it("agrees with a plain scan everywhere", () => {
    for (let day = -3; day <= 33; day++) {
      const t = at(day) + 3600_000;
      const scan = points.reduce((best, p, i) => (Math.abs(p.date.getTime() - t) < Math.abs(points[best].date.getTime() - t) ? i : best), 0);
      expect(nearestIndex(points, t)).toBe(scan);
    }
  });

  it("has nothing to point at on an empty line", () => {
    expect(nearestIndex([], at(0))).toBe(-1);
  });
});
