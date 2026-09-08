import { describe, it, expect } from "vitest";
import { el, enUS } from "date-fns/locale";
import { dateFnsLocale, firestoreToDate, firestoreToDateOrUndefined, parseISODay, parseISOMonth, toISODay, toISOMonth } from "./dates";



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

// ─── Firestore dates ─────────────────────────────────────────────────────────
// Every figure in the app is bucketed by one of these. A date read an hour out
// is a transaction in the wrong month, and nothing on screen says so.

describe("firestoreToDate", () => {
  it("passes a Date straight through, same instant", () => {
    const date = new Date(2026, 8, 14, 13, 45, 30);
    expect(firestoreToDate(date)).toBe(date);
  });

  it("calls toDate() on a real Firestore Timestamp", () => {
    const stamp = { toDate: () => new Date(2026, 8, 14) };
    expect(firestoreToDate(stamp)).toEqual(new Date(2026, 8, 14));
  });

  it("reads a serialized timestamp's seconds", () => {
    // What comes back out of the offline cache or a JSON round-trip.
    const instant = new Date(2026, 8, 14, 10, 30);
    const serialized = { seconds: Math.floor(instant.getTime() / 1000), nanoseconds: 0 };

    expect(firestoreToDate(serialized).getTime()).toBe(Math.floor(instant.getTime() / 1000) * 1000);
  });

  it("accepts a string or a number of milliseconds", () => {
    expect(firestoreToDate(new Date(2026, 8, 14).getTime())).toEqual(new Date(2026, 8, 14));
    expect(firestoreToDate("2026-09-14T00:00:00").getFullYear()).toBe(2026);
  });

  it("falls back to now for nothing at all", () => {
    // Deliberate: a row with no date still has to render somewhere.
    const before = Date.now();
    const fallback = firestoreToDate(undefined).getTime();

    expect(fallback).toBeGreaterThanOrEqual(before);
    expect(firestoreToDate(null).getTime()).toBeGreaterThanOrEqual(before);
  });

  it("keeps a missing date missing when asked to", () => {
    expect(firestoreToDateOrUndefined(undefined)).toBeUndefined();
    expect(firestoreToDateOrUndefined(null)).toBeUndefined();
    expect(firestoreToDateOrUndefined(0)).toBeUndefined();
    expect(firestoreToDateOrUndefined(new Date(2026, 8, 14))).toEqual(new Date(2026, 8, 14));
  });
});

describe("month strings", () => {
  it("reads a month as the first day of it, local", () => {
    const parsed = parseISOMonth("2026-12");

    expect(parsed).toEqual(new Date(2026, 11, 1));
    expect(parsed?.getDate()).toBe(1);
    expect(parsed?.getHours()).toBe(0);
  });

  it("rejects a month that does not exist", () => {
    expect(parseISOMonth("2026-13")).toBeNull();
    expect(parseISOMonth("2026-00")).toBeNull();
    expect(parseISOMonth("2026-9")).toBeNull();
    expect(parseISOMonth("2026")).toBeNull();
    expect(parseISOMonth("")).toBeNull();
  });

  it("formats from local fields, so a month never slips to the previous one", () => {
    // The 1st at midnight is exactly where `toISOString()` would go back a day
    // west of Greenwich, and a season would start a month early.
    expect(toISOMonth(new Date(2026, 0, 1))).toBe("2026-01");
    expect(toISOMonth(new Date(2026, 11, 31, 23, 59))).toBe("2026-12");
    expect(toISOMonth({ toDate: () => new Date(2027, 3, 30) })).toBe("2027-04");
  });

  it("round-trips every month of a year", () => {
    for (let month = 0; month < 12; month++) {
      const key = toISOMonth(new Date(2026, month, 15));
      expect(parseISOMonth(key)).toEqual(new Date(2026, month, 1));
    }
  });
});

describe("dateFnsLocale", () => {
  it("gives Greek names for Greek, English for everything else", () => {
    expect(dateFnsLocale("el")).toBe(el);
    expect(dateFnsLocale("el-GR")).toBe(el);
    expect(dateFnsLocale("en")).toBe(enUS);
    expect(dateFnsLocale(undefined)).toBe(enUS);
  });
});
