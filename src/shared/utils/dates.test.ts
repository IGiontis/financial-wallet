import { describe, it, expect } from "vitest";
import { el, enUS } from "date-fns/locale";
import { dateFnsLocale, firestoreToDate, firestoreToDateOrUndefined, parseISODay, parseISOMonth, standaloneMonthName, toISODay, toISOMonth } from "./dates";
import { FutureDateError, happenedDayError, happenedLimit, isFutureDay, NOT_IN_FUTURE, refuseFutureDates } from "./dates";
import {
  daysBetween, endOfDay, formatDay, formatDayLong, formatDayLongYear, formatDayMonthWeekday, formatDayNumber, formatDayShort, formatDayShortTime,
  formatMonthName, formatMonthShort, formatMonthYear, formatMonthYearCompact, formatMonthYearShort, formatNumericDay, formatRecordDay,
  formatRelativeDays, formatTime, formatWeekday, formatWeekdayDay, formatWeekdayDayYear, isToday, monthKey, sameDay, startOfDay, today as todayOf, tomorrow,
} from "./dates";



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

describe("standaloneMonthName", () => {
  it("names a Greek month the way a sentence would", () => {
    // "Δεκεμβρίου" belongs in a date; on its own the month is "Δεκέμβριος".
    expect(standaloneMonthName("el", new Date(2026, 11, 1))).toBe("Δεκέμβριος");
    expect(standaloneMonthName("el", new Date(2026, 3, 1))).toBe("Απρίλιος");
  });

  it("leaves English alone, which has only the one form", () => {
    expect(standaloneMonthName("en", new Date(2026, 11, 1))).toBe("December");
  });

  it("carries no year with it", () => {
    expect(standaloneMonthName("el", new Date(2026, 11, 1))).not.toMatch(/2026/);
    expect(standaloneMonthName("en", new Date(2026, 11, 1))).not.toMatch(/2026/);
  });
});

// ─── Things that happened: today or earlier (owner, 2026-11-14) ─────────────

describe("isFutureDay", () => {
  const today = new Date(2026, 10, 16, 23, 59);
  it("is false for today and earlier, true from tomorrow", () => {
    expect(isFutureDay("2026-11-16", today)).toBe(false);
    expect(isFutureDay("2025-12-31", today)).toBe(false);
    expect(isFutureDay("2026-11-17", today)).toBe(true);
  });
  it("crosses month and year ends by the calendar, not by string luck", () => {
    expect(isFutureDay("2027-01-01", new Date(2026, 11, 31, 22))).toBe(true);
    expect(isFutureDay("2026-12-31", new Date(2026, 11, 31, 0, 1))).toBe(false);
    expect(isFutureDay("2026-12-01", new Date(2026, 10, 30))).toBe(true);
  });
  it("says nothing about an empty or broken value (the required check does)", () => {
    expect(isFutureDay("", today)).toBe(false);
    expect(isFutureDay("17/11/2026", today)).toBe(false);
  });
});

describe("happenedDayError", () => {
  const today = new Date(2026, 10, 16, 9);
  it("refuses a future day with the shared message, accepts today", () => {
    expect(happenedDayError("2026-11-17", today)).toBe(NOT_IN_FUTURE);
    expect(happenedDayError("2026-11-16", today)).toBeUndefined();
  });
  it("lets an edit keep the future day it already had, but not move to another", () => {
    expect(happenedDayError("2026-11-30", today, "2026-11-30")).toBeUndefined();
    expect(happenedDayError("2026-11-29", today, "2026-11-30")).toBe(NOT_IN_FUTURE);
    expect(happenedDayError("2026-11-10", today, "2026-11-30")).toBeUndefined();
  });
});

describe("refuseFutureDates (the money writers' guard)", () => {
  const now = new Date(2026, 10, 16, 15, 30);
  it("lets through today and, as slack for time zones, tomorrow", () => {
    expect(happenedLimit(now)).toEqual(new Date(2026, 10, 18));
    expect(() => refuseFutureDates([new Date(2026, 10, 16, 23, 59), new Date("2026-11-16"), new Date(2026, 10, 17, 23, 59)], { now })).not.toThrow();
  });
  it("refuses the day after tomorrow and later", () => {
    expect(() => refuseFutureDates([new Date(2026, 10, 18)], { now })).toThrow(FutureDateError);
    expect(() => refuseFutureDates([new Date(2026, 10, 1), new Date(2027, 0, 1)], { now })).toThrow(FutureDateError);
  });
  it("skips what an update leaves out, and reads Firestore timestamps", () => {
    expect(() => refuseFutureDates([undefined, null], { now })).not.toThrow();
    expect(() => refuseFutureDates([{ seconds: new Date(2026, 11, 1).getTime() / 1000, nanoseconds: 0 }], { now })).toThrow(FutureDateError);
  });
  it("lets a whole-record correction keep its stored day", () => {
    expect(() => refuseFutureDates([new Date(2026, 11, 1, 0, 0)], { now, stored: new Date(2026, 11, 1, 14) })).not.toThrow();
    expect(() => refuseFutureDates([new Date(2026, 11, 2)], { now, stored: new Date(2026, 11, 1) })).toThrow(FutureDateError);
  });
});

// ─── Calendar days and the shared date looks (2026-11-16) ─────────────────────


describe("calendar days", () => {
  it("startOfDay / endOfDay bracket the local day and leave the argument alone", () => {
    const at = new Date(2026, 10, 16, 14, 5, 7);
    expect(startOfDay(at)).toEqual(new Date(2026, 10, 16));
    expect(endOfDay(at)).toEqual(new Date(2026, 10, 16, 23, 59, 59, 999));
    expect(at.getHours()).toBe(14);
  });
  it("today / tomorrow come from the given now, across a month and a year end", () => {
    expect(todayOf(new Date(2026, 11, 31, 23, 59))).toEqual(new Date(2026, 11, 31));
    expect(tomorrow(new Date(2026, 11, 31, 23, 59))).toEqual(new Date(2027, 0, 1));
    expect(tomorrow(new Date(2026, 1, 28, 8))).toEqual(new Date(2026, 2, 1));
  });
  it("sameDay / isToday compare calendar days, and a missing date is never the same", () => {
    expect(sameDay(new Date(2026, 10, 16, 0, 0), new Date(2026, 10, 16, 23, 59))).toBe(true);
    expect(sameDay(new Date(2026, 10, 16, 23, 59), new Date(2026, 10, 17, 0, 0))).toBe(false);
    expect(sameDay(null, new Date())).toBe(false);
    expect(isToday(new Date(2026, 10, 16, 1), new Date(2026, 10, 16, 22))).toBe(true);
    expect(isToday(undefined, new Date())).toBe(false);
  });
  it("daysBetween counts calendar days, not 24-hour blocks, and is signed", () => {
    expect(daysBetween(new Date(2026, 10, 16, 23, 50), new Date(2026, 10, 17, 0, 10))).toBe(1);
    expect(daysBetween(new Date(2026, 10, 17), new Date(2026, 10, 14))).toBe(-3);
    // Across the March clock change (a 23-hour day) and a leap February —
    // counted a second way: 29 (rest of Feb 2028 from the 1st) + 31 (March) = 60.
    expect(daysBetween(new Date(2028, 1, 1), new Date(2028, 3, 1))).toBe(29 + 31);
    expect(daysBetween(new Date(2026, 2, 28), new Date(2026, 2, 30))).toBe(2);
    expect(daysBetween(new Date(2026, 9, 24), new Date(2026, 9, 26))).toBe(2);
  });
  it("monthKey is the local yyyy-MM", () => {
    expect(monthKey(new Date(2026, 0, 31, 23, 30))).toBe("2026-01");
  });
  it("isFutureDay also takes a Date", () => {
    expect(isFutureDay(new Date(2026, 10, 17, 0, 1), new Date(2026, 10, 16, 23))).toBe(true);
    expect(isFutureDay(new Date(2026, 10, 16, 23, 59), new Date(2026, 10, 16, 0))).toBe(false);
  });
});

describe("the shared date looks", () => {
  const d = new Date(2026, 10, 16, 14, 5);
  it("Greek", () => {
    expect(formatDay(d, "el")).toBe("16 Νοε 2026");
    expect(formatDayShort(d, "el")).toBe("16 Νοε");
    expect(formatWeekdayDay(d, "el")).toBe("Δευ 16 Νοε");
    expect(formatWeekdayDayYear(d, "el")).toBe("Δευ 16 Νοε 2026");
    expect(formatDayMonthWeekday(d, "el")).toBe("Δευτέρα 16 Νοεμβρίου");
    expect(formatDayLong(d, "el")).toBe("16 Νοεμβρίου");
    expect(formatDayLongYear(d, "el")).toBe("16 Νοεμβρίου 2026");
    expect(formatNumericDay(new Date(2026, 0, 5), "el")).toBe("05/01/2026");
    expect(formatMonthYear(d, "el")).toBe("Νοέμβριος 2026");
    expect(formatMonthYearShort(d, "el")).toBe("Νοε 2026");
    expect(formatMonthYearCompact(d, "el")).toBe("Νοε 26");
    expect(formatMonthShort(d, "el")).toBe("Νοε");
    expect(formatMonthName(d, "el")).toBe("Νοέμβριος");
    expect(formatWeekday(d, "el")).toBe("Δευτέρα");
    expect(formatWeekday(d, "el", "short")).toBe("Δευ");
    expect(formatDayNumber(d, "el")).toBe("16");
    expect(formatTime(d, "el")).toBe("14:05");
    expect(formatDayShortTime(d, "el")).toBe("16 Νοε, 14:05");
    expect(formatRecordDay(new Date(2026, 8, 6), "el")).toBe("06, Σεπτ 2026");
  });
  it("English puts the day first, like the date fields", () => {
    expect(formatDay(d, "en")).toBe("16 Nov 2026");
    expect(formatDayShort(d, "en")).toBe("16 Nov");
    expect(formatWeekdayDay(d, "en")).toBe("Mon 16 Nov");
    expect(formatDayMonthWeekday(d, "en")).toBe("Monday 16 November");
    expect(formatMonthYear(d, "en")).toBe("November 2026");
    expect(formatNumericDay(d, "en")).toBe("16/11/2026");
    expect(formatRecordDay(new Date(2026, 8, 6), "en")).toBe("06, Sep 2026");
    expect(formatDay(d, undefined)).toBe("16 Nov 2026");
  });
  it("a region in the language changes nothing", () => {
    expect(formatDay(d, "el-GR")).toBe(formatDay(d, "el"));
    expect(formatDay(d, "en-US")).toBe(formatDay(d, "en"));
  });
  it("relative days", () => {
    expect([0, 1, -1, 3, -3].map((n) => formatRelativeDays(n, "en"))).toEqual(["today", "tomorrow", "yesterday", "in 3 days", "3 days ago"]);
    expect(formatRelativeDays(0, "el")).toBe("σήμερα");
    expect(formatRelativeDays(1, "el")).toBe("αύριο");
  });
});
