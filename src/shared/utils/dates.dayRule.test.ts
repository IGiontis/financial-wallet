import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import { dayToDate, firestoreToDate, happenedDayError, parseISODay, refuseFutureDates, toISODay } from "./dates";
import { sameValues } from "./sameValues";

// The app's one rule for "a day" (dates.ts): a picked day is saved as local
// midnight (`dayToDate`), a stored date is read as its local calendar day
// (`toISODay`). Run on Greek time, where the old `toISOString()` read a record
// at local midnight as the day before.
//
// Greece: UTC+2 in winter, UTC+3 in summer. Clocks go forward at 03:00 on the
// last Sunday of March (29 Mar 2026) and back at 04:00 on the last Sunday of
// October (25 Oct 2026).

beforeAll(() => {
  vi.stubEnv("TZ", "Europe/Athens");
});
afterAll(() => {
  vi.unstubAllEnvs();
});

/** A Firestore Timestamp as the SDK hands it back. */
const stamp = (date: Date) => ({ seconds: Math.floor(date.getTime() / 1000), nanoseconds: 0, toDate: () => new Date(Math.floor(date.getTime() / 1000) * 1000) });

describe("the zone the tests run in", () => {
  it("is Greek time (so the cases below mean what they say)", () => {
    expect(new Date(2026, 0, 15).getTimezoneOffset()).toBe(-120);
    expect(new Date(2026, 6, 15).getTimezoneOffset()).toBe(-180);
  });
});

describe("a stored date reads as the day the list shows", () => {
  // How each kind of writer has stored a day, all meaning 14 Oct 2026.
  const shapes: [string, Date][] = [
    ["local midnight (parseISODay / dayToDate writers, gap records)", new Date(2026, 9, 14)],
    ["UTC midnight (the old `new Date(\"yyyy-MM-dd\")` writers)", new Date(Date.UTC(2026, 9, 14))],
    ["an hour of the day (written with the time it was saved)", new Date(2026, 9, 14, 18, 40)],
    ["a minute before local midnight", new Date(2026, 9, 14, 23, 59)],
  ];

  it.each(shapes)("%s → 2026-10-14", (_, stored) => {
    // The list formats `firestoreToDate(date)` in local fields; the form reads `toISODay`.
    const list = firestoreToDate(stamp(stored));
    expect(toISODay(stamp(stored))).toBe("2026-10-14");
    expect(`${list.getFullYear()}-${list.getMonth() + 1}-${list.getDate()}`).toBe("2026-10-14");
  });

  it("the bug it replaces: toISOString() put local midnight on the 13th", () => {
    expect(new Date(2026, 9, 14).toISOString().slice(0, 10)).toBe("2026-10-13");
    expect(toISODay(new Date(2026, 9, 14))).toBe("2026-10-14");
  });
});

describe("a picked day is saved as local midnight and reads back as itself", () => {
  it("dayToDate gives local midnight of that day", () => {
    const saved = dayToDate("2026-10-14");
    expect([saved.getFullYear(), saved.getMonth(), saved.getDate(), saved.getHours(), saved.getMinutes()]).toEqual([2026, 9, 14, 0, 0]);
    expect(saved.getTime()).toBe(parseISODay("2026-10-14")!.getTime());
  });

  it("anything that is not a day is an Invalid Date, never today", () => {
    expect(Number.isNaN(dayToDate("").getTime())).toBe(true);
    expect(Number.isNaN(dayToDate("14/10/2026").getTime())).toBe(true);
  });

  it("every day of 2026 survives save → Firestore → read (DST Sundays included)", () => {
    const wrong: string[] = [];
    for (let d = new Date(2026, 0, 1); d.getFullYear() === 2026; d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1)) {
      const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      if (toISODay(stamp(dayToDate(iso))) !== iso) wrong.push(iso);
    }
    expect(wrong).toEqual([]);
  });

  it.each([
    ["2026-03-29", "spring forward (last Sunday of March)", 120],
    ["2026-10-25", "fall back (last Sunday of October)", 180],
  ])("%s, %s: midnight exists, is the start of the day, and reads back", (iso, _, offsetMinutes) => {
    const saved = dayToDate(iso);
    // Midnight is before the change on both Sundays (03:00 / 04:00), so it is
    // still on the winter/summer offset the night before had.
    expect(-saved.getTimezoneOffset()).toBe(offsetMinutes);
    expect(saved.getHours()).toBe(0);
    expect(toISODay(saved)).toBe(iso);
    // The day before and after are still themselves.
    const before = new Date(saved.getTime() - 1);
    expect(toISODay(before)).not.toBe(iso);
    // 29 Mar has 23 hours and 25 Oct has 25: 22 h 59 min after midnight is
    // still the same day on both, and the day's own end is the next midnight.
    expect(toISODay(new Date(saved.getTime() + (22 * 60 + 59) * 60_000))).toBe(iso);
    expect(toISODay(new Date(saved.getTime() + (offsetMinutes === 120 ? 23 : 25) * 3_600_000))).not.toBe(iso);
  });

  it("a record stored at UTC midnight on a DST Sunday reads as that Sunday", () => {
    // 00:00Z = 02:00 (29 Mar, before the jump) and 03:00 (25 Oct, before the fall-back).
    expect(toISODay(new Date(Date.UTC(2026, 2, 29)))).toBe("2026-03-29");
    expect(toISODay(new Date(Date.UTC(2026, 9, 25)))).toBe("2026-10-25");
  });
});

describe("an untouched date is still «unchanged», and the future rule holds", () => {
  const today = new Date(2026, 9, 26, 12, 0); // Mon 26 Oct 2026, the day after the fall-back

  it("the form's day of a stored record compares equal to the stored record", () => {
    for (const stored of [new Date(2026, 9, 25), new Date(Date.UTC(2026, 9, 25)), new Date(2026, 2, 29), new Date(Date.UTC(2026, 2, 29))]) {
      const shown = toISODay(stamp(stored));
      expect(sameValues({ date: stored }, { date: dayToDate(shown) })).toBe(true);
    }
  });

  it("a stored future day, kept, is not refused; a picked future day is", () => {
    const stored = toISODay(new Date(2026, 9, 30)); // written before the rule
    expect(happenedDayError(stored, today, stored)).toBeUndefined();
    expect(happenedDayError("2026-10-27", today, stored)).toBe("validation.notInFuture");
    expect(happenedDayError("2026-10-26", today, stored)).toBeUndefined();
  });

  it("the writers' guard lets today (saved the new way) through and stops next week", () => {
    expect(() => refuseFutureDates([dayToDate("2026-10-26")], { now: today })).not.toThrow();
    expect(() => refuseFutureDates([dayToDate("2026-11-02")], { now: today })).toThrow();
  });
});
