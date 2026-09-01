import { describe, it, expect } from "vitest";
import { parseISODay, toISODay } from "./dates";



describe("parseISODay", () => {
  it("reads the day as local, not UTC", () => {
    // `new Date("2026-09-14")` is UTC midnight, which is 13 Sep anywhere west
    // of Greenwich. This must be the 14th wherever the tests run.
    const date = parseISODay("2026-09-14")!;
    expect(date.getFullYear()).toBe(2026);
    expect(date.getMonth()).toBe(8);
    expect(date.getDate()).toBe(14);
  });

  it("rejects anything that isn't a plain day string", () => {
    expect(parseISODay("")).toBeNull();
    expect(parseISODay("14/09/2026")).toBeNull();
    expect(parseISODay("2026-09-14T10:00:00Z")).toBeNull();
  });
});

describe("toISODay", () => {
  it("formats from local fields rather than UTC", () => {
    // Late evening local time still belongs to that day, even where the UTC
    // clock has already rolled over.
    expect(toISODay(new Date(2026, 8, 14, 23, 30))).toBe("2026-09-14");
  });

  it("pads single-digit months and days", () => {
    expect(toISODay(new Date(2026, 0, 5))).toBe("2026-01-05");
  });

  it("accepts a Firestore Timestamp", () => {
    const stamp = { toDate: () => new Date(2026, 8, 14) };
    expect(toISODay(stamp)).toBe("2026-09-14");
  });

  it("round-trips with parseISODay", () => {
    expect(toISODay(parseISODay("2026-02-28")!)).toBe("2026-02-28");
  });
});
