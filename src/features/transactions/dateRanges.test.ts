import { describe, it, expect } from "vitest";
import { matchPreset, monthRange, presetRange, rangeMonth, stepMonth, tapDay } from "./dateRanges";

// Read on Wednesday 7 October 2026, at noon.
const NOW = new Date(2026, 9, 7, 12);
const d = (y: number, m: number, day: number) => new Date(y, m - 1, day);

describe("the quick ranges", () => {
  it("reads this month up to today, and a whole month before it", () => {
    expect(presetRange("thisMonth", NOW)).toEqual({ from: d(2026, 10, 1), to: d(2026, 10, 7) });
    expect(presetRange("lastMonth", NOW)).toEqual({ from: d(2026, 9, 1), to: d(2026, 9, 30) });
  });

  it("reads three months as this one and the two before, and the year from January", () => {
    expect(presetRange("threeMonths", NOW)).toEqual({ from: d(2026, 8, 1), to: d(2026, 10, 7) });
    expect(presetRange("thisYear", NOW)).toEqual({ from: d(2026, 1, 1), to: d(2026, 10, 7) });
    expect(presetRange("all", NOW)).toEqual({ from: null, to: null });
  });

  it("recognises a range as the preset it is, whatever the time of day", () => {
    expect(matchPreset({ from: d(2026, 1, 1), to: new Date(2026, 9, 7, 18) }, NOW)).toBe("thisYear");
    expect(matchPreset({ from: d(2026, 9, 1), to: d(2026, 9, 30) }, NOW)).toBe("lastMonth");
    expect(matchPreset({ from: d(2026, 9, 3), to: d(2026, 9, 30) }, NOW)).toBeUndefined();
  });
});

describe("stepping through months", () => {
  it("goes back a whole month at a time, through the year's turn", () => {
    let range = presetRange("thisMonth", NOW);
    range = stepMonth(range, -1, NOW)!;
    expect(range).toEqual({ from: d(2026, 9, 1), to: d(2026, 9, 30) });
    // February in a common year: 28 days.
    for (let i = 0; i < 7; i++) range = stepMonth(range, -1, NOW)!;
    expect(range).toEqual({ from: d(2026, 2, 1), to: d(2026, 2, 28) });
    range = stepMonth(range, -1, NOW)!;
    range = stepMonth(range, -1, NOW)!;
    expect(range).toEqual({ from: d(2025, 12, 1), to: d(2025, 12, 31) });
  });

  it("does not step into a month that has not come", () => {
    expect(stepMonth(presetRange("thisMonth", NOW), 1, NOW)).toBeUndefined();
    expect(stepMonth(monthRange(2026, 8, NOW), 1, NOW)).toEqual({ from: d(2026, 10, 1), to: d(2026, 10, 7) });
  });

  it("from any other span, starts at the month its end falls in", () => {
    const span = { from: d(2026, 1, 1), to: d(2026, 10, 7) };
    expect(rangeMonth(span, NOW)).toBeUndefined();
    expect(stepMonth(span, -1, NOW)).toEqual({ from: d(2026, 10, 1), to: d(2026, 10, 7) });
  });
});

describe("tapping days in the calendar", () => {
  it("starts on the first tap and ends on the second", () => {
    const first = tapDay(null, d(2026, 9, 3));
    expect(first).toEqual({ range: { from: d(2026, 9, 3), to: d(2026, 9, 3) }, anchor: d(2026, 9, 3) });
    expect(tapDay(first.anchor, d(2026, 9, 20))).toEqual({ range: { from: d(2026, 9, 3), to: d(2026, 9, 20) }, anchor: null });
  });

  it("takes the two taps in either order", () => {
    expect(tapDay(d(2026, 9, 20), d(2026, 9, 3)).range).toEqual({ from: d(2026, 9, 3), to: d(2026, 9, 20) });
  });

  it("reads one day tapped twice as that day alone, and starts again after", () => {
    const twice = tapDay(d(2026, 9, 14), d(2026, 9, 14));
    expect(twice).toEqual({ range: { from: d(2026, 9, 14), to: d(2026, 9, 14) }, anchor: null });
    expect(tapDay(twice.anchor, d(2026, 9, 1)).anchor).toEqual(d(2026, 9, 1));
  });
});
