import { addDays, startOfDay } from "date-fns";
import { el, enUS } from "date-fns/locale";

// ─── Firestore date helper ────────────────────────────────────────────────────
// Firestore returns Timestamp objects ({ seconds, nanoseconds }), not JS Dates.
// Our types annotate these fields as `Date` for ergonomics, so every read site
// must normalize before using date methods. Use this single helper everywhere.

export function firestoreToDate(value: unknown): Date {
  if (!value) return new Date();
  if (value instanceof Date) return value;
  // Firestore Timestamp — has a toDate() method
  if (typeof (value as { toDate?: unknown }).toDate === "function") {
    return (value as { toDate: () => Date }).toDate();
  }
  // Plain serialized Timestamp — { seconds, nanoseconds }
  if (typeof (value as { seconds?: unknown }).seconds === "number") {
    return new Date((value as { seconds: number }).seconds * 1000);
  }
  return new Date(value as string | number);
}

/** Same conversion, but a missing value stays missing instead of becoming today. */
export function firestoreToDateOrUndefined(value: unknown): Date | undefined {
  return value ? firestoreToDate(value) : undefined;
}

// ─── date-fns locale ───────────────────────────────────────────────────────
// date-fns's `format()` renders month/day names in English unless given a
// `locale` option explicitly — it doesn't read i18next's active language.
// Pass this alongside every `format(date, "...MMM...")` call.

export function dateFnsLocale(language: string | undefined) {
  return language?.startsWith("el") ? el : enUS;
}
// ─── ISO day strings ─────────────────────────────────────────────────────────
// The shape every date field and Formik form in the app holds: "2026-09-14".
// Both directions go through local calendar fields on purpose. `toISOString()`
// converts to UTC first, so a date at midnight local time comes back as the
// PREVIOUS day anywhere west of Greenwich — and `new Date("2026-09-14")` reads
// the string as UTC and lands a day early for the same reason.

/** Parses "yyyy-MM-dd" as a local date. Null for anything else. */
export function parseISODay(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const [, year, month, day] = match;
  const date = new Date(Number(year), Number(month) - 1, Number(day));
  return Number.isNaN(date.getTime()) ? null : date;
}

// ─── The app's one rule for "a day" (2026-11-16) ─────────────────────────────
//
// A day the user picks is SAVED as local midnight of that day (`dayToDate`,
// which is `parseISODay`), and a stored date is READ back as the local
// calendar day it falls on (`toISODay`). Every form — add, edit, wizard — goes
// through these two and nothing else; `toISOString()` and `new Date("yyyy-MM-dd")`
// are never used for a day (`dayValues.test.ts` refuses them outside this file).
//
// Why midnight and not noon: midnight is what `parseISODay` has always given
// and what almost every writer already stored, so no record and no figure
// moves; Greece's clocks change at 03:00/04:00, so local midnight exists and is
// unique on both DST Sundays; and the money code compares records by local day
// (`balance.ts`), where any hour of the day reads the same. Older records saved
// as `new Date("yyyy-MM-dd")` (UTC midnight = 02:00/03:00 in Greece) still read
// as the right day through `toISODay`.

/**
 * The Date a form stores for a picked "yyyy-MM-dd": local midnight of that day.
 * Anything that is not a day gives an Invalid Date (as `new Date("")` did), so
 * a writer's own check still catches it.
 */
export function dayToDate(value: string): Date {
  return parseISODay(value) ?? new Date(Number.NaN);
}

/** Formats a Date (or a Firestore Timestamp) as "yyyy-MM-dd" in local time. */
export function toISODay(value: unknown): string {
  const date = firestoreToDate(value);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

/** Parses "yyyy-MM" as the first day of that month, local. Null for anything else. */
export function parseISOMonth(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})$/.exec(value);
  if (!match) return null;
  const month = Number(match[2]) - 1;
  if (month < 0 || month > 11) return null;
  const date = new Date(Number(match[1]), month, 1);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** Formats a Date as "yyyy-MM" in local time. */
export function toISOMonth(value: unknown): string {
  const date = firestoreToDate(value);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

/**
 * A month's name on its own, in the form you would use to name it in a list.
 *
 * Greek has two: "Δεκεμβρίου" is the one that goes in a date ("1 Δεκεμβρίου"),
 * and "Δεκέμβριος" is the one that goes in a sentence about the month itself.
 * Asked for the month alone, Intl hands back the first — so "the heavy one is
 * Δεκεμβρίου", which is not something anyone would write.
 *
 * Asking for the month *with* a year switches the platform to the stand-alone
 * form, so that is what this asks for, and then keeps only the month. English
 * and every language without the distinction are unaffected.
 */
export function standaloneMonthName(locale: string, date: Date): string {
  const parts = new Intl.DateTimeFormat(locale, { month: "long", year: "numeric" }).formatToParts(date);
  return parts.find((part) => part.type === "month")?.value ?? new Intl.DateTimeFormat(locale, { month: "long" }).format(date);
}

// ─── Things that happened are dated today or earlier ───────────────────────
//
// The owner's rule (2026-11-14): a record of something that HAPPENED — a
// transaction, a transfer, a goal deposit or withdrawal, a payment, a
// repayment, «Ήρθε», a reading, a business closing — takes a day from the past
// up to today, never later. A goal deposit dated next week counted money that
// had not moved yet. PLANNED things (a bill's due day, an income's schedule, a
// goal's deadline, a planner line) may still be in the future.
//
// Three layers say it the same way:
//  1. the calendar greys the days after today out (`DateField happened`,
//     which reads the shared `useToday`, so it moves on at midnight);
//  2. each form's check refuses one anyway (`happenedDayError`), with the
//     message `validation.notInFuture`;
//  3. the money writers in `src/firebase` refuse it before writing
//     (`refuseFutureDates`), with a day of slack for time zones.
//
// A record already stored with a future day (written before the rule) still
// opens and saves: the check speaks only when the day is changed, and an edit
// that leaves the day alone does not send it again.

/** The i18n key every "happened" date field shows for a day after today. */
export const NOT_IN_FUTURE = "validation.notInFuture";

/** Whether an ISO day ("yyyy-MM-dd") is after `today`'s calendar day, on this device. */
export function isAfterToday(iso: string, today: Date = new Date()): boolean {
  if (!parseISODay(iso)) return false;
  return iso > toISODay(today);
}

/**
 * What stops a "happened" day, as the i18n key that says so — or `undefined`.
 *
 * `stored` is the day the record already has (edits): keeping it is always
 * allowed, even when it is in the future, so a record written before the rule
 * can still be corrected in its other fields. Only a day the user picks must be
 * today or earlier.
 */
export function happenedDayError(iso: string, today: Date = new Date(), stored?: string): string | undefined {
  if (stored !== undefined && iso === stored) return undefined;
  return isAfterToday(iso, today) ? NOT_IN_FUTURE : undefined;
}

// ─── The data layer's guard ─────────────────────────────────────────────────

/** Thrown by a money writer handed a "happened" date after today. */
export class FutureDateError extends Error {
  readonly date: Date;
  constructor(date: Date) {
    super(`A record of something that happened cannot be dated ${date.toISOString()} — after today.`);
    this.date = date;
    this.name = "FutureDateError";
  }
}

/**
 * The first moment a "happened" record may NOT carry: the start of the day
 * after tomorrow, local time.
 *
 * Tomorrow is let through on purpose. Forms store a day as local midnight
 * (`dayToDate`), but older records were written as `new Date("yyyy-MM-dd")`
 * (UTC midnight — up to 14 hours later in local time east of Greenwich), and a phone that crossed a time
 * zone may be a day ahead of the one that wrote it. The forms already refuse
 * tomorrow; this layer only has to stop what is plainly wrong — a deposit
 * dated next week — without ever refusing a real "today".
 */
export function happenedLimit(now: Date = new Date()): Date {
  return startOfDay(addDays(now, 2));
}

/**
 * Refuses, before anything is written, any of `dates` that is after today
 * (with a day of slack, see `happenedLimit`). `undefined`/`null` are skipped:
 * an update that leaves the day alone does not name it.
 *
 * `stored`: for a writer that rewrites a whole record (a corrected transfer),
 * the day the record already had — written again unchanged, it is let
 * through even if it is in the future (dated before the rule).
 */
export function refuseFutureDates(dates: readonly unknown[], { now = new Date(), stored }: { now?: Date; stored?: unknown } = {}): void {
  const limit = happenedLimit(now).getTime();
  const kept = stored == null ? undefined : toISODay(stored);
  for (const value of dates) {
    if (value == null) continue;
    const date = firestoreToDate(value);
    if (Number.isNaN(date.getTime())) continue;
    if (kept !== undefined && toISODay(date) === kept) continue;
    if (date.getTime() >= limit) throw new FutureDateError(date);
  }
}
