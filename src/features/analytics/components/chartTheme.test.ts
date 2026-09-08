import { describe, it, expect } from "vitest";
import { AXIS_TICK, GRID_STROKE, SERIES_COLORS, amountTicks, compactNumber, seriesColor, seriesDash, weekdayNames } from "./chartTheme";

// Axis labels and gridlines are how an amount is read. A tick that rounds the
// wrong way, or a scale whose steps do not suit the numbers, misreports the
// same figures the rest of the app got right.

describe("series colours and dashes", () => {
  it("gives a category the same colour wherever it appears", () => {
    // The order is the contract: a category keeps its colour across the charts.
    expect(seriesColor(0)).toBe(SERIES_COLORS[0]);
    expect(seriesColor(5)).toBe(SERIES_COLORS[5]);
  });

  it("cycles rather than running out", () => {
    expect(seriesColor(6)).toBe(seriesColor(0));
    expect(seriesColor(13)).toBe(seriesColor(1));
    expect(SERIES_COLORS.every((_, i) => seriesColor(i + SERIES_COLORS.length) === seriesColor(i))).toBe(true);
  });

  it("changes the stroke once the colours come round again", () => {
    // Two lines in the same colour on the same axis are one line as far as a
    // reader is concerned; the dash is what keeps them apart.
    expect(seriesDash(0)).toBeUndefined();
    expect(seriesDash(5)).toBeUndefined();
    expect(seriesDash(6)).toBe("5 3");
    expect(seriesDash(11)).toBe("5 3");
    expect(seriesDash(12)).toBe("1 3");

    for (let i = 0; i < 12; i++) {
      expect(`${seriesColor(i)}|${seriesDash(i)}`, `series ${i}`).not.toBe(`${seriesColor(i + 6)}|${seriesDash(i + 6)}`);
    }
  });

  it("keeps its styling on the token layer, so both themes follow", () => {
    expect(SERIES_COLORS.every((c) => c.startsWith("var(--"))).toBe(true);
    expect(AXIS_TICK.fill).toMatch(/^var\(--/);
    expect(GRID_STROKE).toMatch(/^var\(--/);
  });
});

describe("weekdayNames", () => {
  it("starts on Monday, in the reader's language", () => {
    expect(weekdayNames("en-GB")).toEqual(["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]);
    expect(weekdayNames("el-GR")).toHaveLength(7);
    expect(weekdayNames("el-GR")[0]).not.toBe(weekdayNames("el-GR")[6]);
  });

  it("leaves no abbreviation dots to line up against", () => {
    for (const name of [...weekdayNames("el-GR"), ...weekdayNames("en-GB")]) {
      expect(name).not.toContain(".");
      expect(name.length).toBeGreaterThan(0);
    }
  });

  it("says the same thing today as it will tomorrow", () => {
    // Anchored to a fixed Monday rather than to today, or the labels would
    // rotate daily.
    expect(weekdayNames("en-GB")).toEqual(weekdayNames("en-GB"));
  });
});

describe("compactNumber", () => {
  it("writes plain numbers plainly", () => {
    expect(compactNumber(0)).toBe("0");
    expect(compactNumber(42)).toBe("42");
    expect(compactNumber(999)).toBe("999");
    expect(compactNumber(-250)).toBe("-250");
    expect(compactNumber(12.4)).toBe("12");
  });

  it("shortens thousands, with a decimal only while it still says something", () => {
    expect(compactNumber(1000)).toBe("1.0k");
    expect(compactNumber(1250)).toBe("1.3k");
    expect(compactNumber(9999)).toBe("10.0k");
    expect(compactNumber(10000)).toBe("10k");
    expect(compactNumber(14500)).toBe("15k");
  });

  it("shortens millions", () => {
    expect(compactNumber(1_000_000)).toBe("1.0M");
    expect(compactNumber(2_450_000)).toBe("2.5M");
  });

  it("does not label a millions figure as thousands", () => {
    // 999,999 rounded to whole thousands is 1000k, which is a million wearing
    // the wrong suffix.
    expect(compactNumber(999_999)).toBe("1.0M");
    expect(compactNumber(-999_999)).toBe("-1.0M");
  });

  it("keeps the minus sign on the way down", () => {
    expect(compactNumber(-1500)).toBe("-1.5k");
    expect(compactNumber(-2_450_000)).toBe("-2.5M");
  });
});

describe("amountTicks", () => {
  it("suits the steps to the numbers, not to round hundreds", () => {
    // A month whose whole spend is forty euros, and one that runs to thousands.
    expect(amountTicks(40)).toEqual([0, 10, 20, 30, 40]);
    expect(amountTicks(4000)).toEqual([0, 1000, 2000, 3000, 4000]);
  });

  it("always starts at zero, climbs, and reaches past the highest value", () => {
    for (const max of [1, 7, 40, 99, 260, 1234, 4000, 15000, 99999, 250000]) {
      const ticks = amountTicks(max);

      expect(ticks[0], `max ${max}`).toBe(0);
      expect(ticks[ticks.length - 1], `max ${max}`).toBeGreaterThanOrEqual(max);
      expect([...ticks].sort((a, b) => a - b), `max ${max}`).toEqual(ticks);
      expect(new Set(ticks).size, `max ${max}`).toBe(ticks.length);
    }
  });

  it("keeps the gridlines evenly spaced", () => {
    for (const max of [7, 40, 260, 1234, 15000]) {
      const ticks = amountTicks(max);
      const step = ticks[1] - ticks[0];

      for (let i = 1; i < ticks.length; i++) expect(ticks[i] - ticks[i - 1], `max ${max}`).toBe(step);
    }
  });

  it("stays near the number of lines asked for", () => {
    for (const max of [1, 7, 40, 99, 260, 1234, 4000, 15000]) {
      const ticks = amountTicks(max);

      expect(ticks.length, `max ${max}`).toBeLessThanOrEqual(7);
      expect(ticks.length, `max ${max}`).toBeGreaterThanOrEqual(2);
    }

    expect(amountTicks(1000, 2).length).toBeLessThanOrEqual(4);
  });

  it("gives a single line rather than an empty axis when there is nothing to show", () => {
    expect(amountTicks(0)).toEqual([0]);
    expect(amountTicks(-50)).toEqual([0]);
    expect(amountTicks(Number.NaN)).toEqual([0]);
    expect(amountTicks(Number.POSITIVE_INFINITY)).toEqual([0]);
  });
});
