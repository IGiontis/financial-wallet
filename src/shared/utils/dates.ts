import { addDays } from "date-fns";
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

/**
 * Whether a day is after `now`'s calendar day, on this device. Takes an ISO
 * day ("yyyy-MM-dd" — anything else is not a day and gives false) or a Date.
 */
export function isFutureDay(day: string | Date, now: Date = new Date()): boolean {
  const iso = typeof day === "string" ? day : toISODay(day);
  if (typeof day === "string" && !parseISODay(day)) return false;
  return iso > toISODay(now);
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
  return isFutureDay(iso, today) ? NOT_IN_FUTURE : undefined;
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

// ─── Calendar days (2026-11-16) ──────────────────────────────────────────────
//
// Every "which day is it" question in the app goes through these — one local
// midnight, one way to compare two days, one way to count the days between
// them. Pure: each takes the moment it measures from (`now`) instead of reading
// the clock, so a figure built on `useToday()` stays on that one reading. Money
// code (balances by day, bills late/due, the planner) counts with them, so
// they keep exactly the arithmetic the local copies had: local calendar
// fields, whole days rounded across a DST change.

const DAY_MS = 86_400_000;

/** Local midnight of `date`'s calendar day (a new Date; the argument is untouched). */
export function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

/** The last millisecond of `date`'s calendar day, local. */
export function endOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59, 999);
}

/** Local midnight of today — of `now`'s day. */
export function today(now: Date = new Date()): Date {
  return startOfDay(now);
}

/** Local midnight of the day after `now`'s. */
export function tomorrow(now: Date = new Date()): Date {
  return new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
}

/** Whether two moments fall on the same local calendar day. A missing one never does. */
export function sameDay(a: Date | null | undefined, b: Date | null | undefined): boolean {
  if (!a || !b) return false;
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

/** Whether `date` falls on `now`'s calendar day. */
export function isToday(date: Date | null | undefined, now: Date = new Date()): boolean {
  return sameDay(date, now);
}

/**
 * Whole calendar days from `from` to `to` (negative when `to` is earlier):
 * 23:50 to 00:10 the next morning is 1. Rounded, so the 23- and 25-hour days
 * of a clock change still count as one.
 */
export function daysBetween(from: Date, to: Date): number {
  return Math.round((startOfDay(to).getTime() - startOfDay(from).getTime()) / DAY_MS);
}

/** A month's key, "yyyy-MM", from local fields — the same as `toISOMonth`. */
export function monthKey(value: unknown): string {
  return toISOMonth(value);
}

// ─── Showing a date (2026-11-16) ─────────────────────────────────────────────
//
// The app's ONE set of date looks. Nothing outside this file builds an
// `Intl.DateTimeFormat`, calls `toLocaleDateString` or hands date-fns a
// display pattern (`dateHelpers.convention.test.ts`); a screen picks the
// formatter for the kind of date it shows, so the same kind of date reads the
// same everywhere.
//
// `language` is the app's language as i18next has it (`i18n.resolvedLanguage`,
// "el"/"en"; a region such as "el-GR" is fine). Greek is el-GR. English is
// en-GB on purpose: the day comes before the month in every language, as the
// date fields already write it ("16 Nov 2026", never "Nov 16, 2026").
//
// Greek month names come in two forms, and these pick the right one: a month
// inside a date is genitive («16 Νοεμβρίου»), a month on its own or with only
// its year is the nominative («Νοέμβριος 2026»).

/** The Intl locale dates are written in for an app language. */
export function dateLocale(language: string | undefined): string {
  return language?.toLowerCase().startsWith("el") ? "el-GR" : "en-GB";
}

/**
 * Every look the app writes a date in, by name. A screen asks for one by name
 * (`formatDay(date, lang)`, or `dateFormat("day", lang)` where an
 * `Intl.DateTimeFormat` is handed on to a chart or a child) — never for options
 * of its own.
 */
export const DATE_LOOKS = {
  /** «16 Νοε 2026» / "16 Nov 2026" — the default look for a date. */
  day: { day: "numeric", month: "short", year: "numeric" },
  /** «16 Νοε» / "16 Nov" — a date near now (this period, this month). */
  dayShort: { day: "numeric", month: "short" },
  /** «Δευ 16 Νοε» / "Mon 16 Nov" — day-by-day lists and plans. */
  weekdayDay: { weekday: "short", day: "numeric", month: "short" },
  /** «Δευ 16 Νοε 2026» / "Mon, 16 Nov 2026". */
  weekdayDayYear: { weekday: "short", day: "numeric", month: "short", year: "numeric" },
  /** «Δευτέρα 16 Νοεμβρίου» / "Monday 16 November" — page subtitles, a day's title. */
  dayMonthWeekday: { weekday: "long", day: "numeric", month: "long" },
  /** «16 Νοεμβρίου» / "16 November". */
  dayLong: { day: "numeric", month: "long" },
  /** «16 Νοεμβρίου 2026» / "16 November 2026" — documents (statement, terms). */
  dayLongYear: { day: "numeric", month: "long", year: "numeric" },
  /** «16/11/2026». */
  numericDay: { day: "2-digit", month: "2-digit", year: "numeric" },
  /** «Νοέμβριος 2026» / "November 2026" (Greek nominative) — month titles. */
  monthYear: { month: "long", year: "numeric" },
  /** «Νοε 2026» / "Nov 2026" — a month in a fact or a row. */
  monthYearShort: { month: "short", year: "numeric" },
  /** «Νοε 26» / "Nov 26" — chart axes and tight chips. */
  monthYearCompact: { month: "short", year: "2-digit" },
  /** «Νοε» / "Nov" — chart axes, ranges within a year. */
  monthShort: { month: "short" },
  /** «Δευτέρα» / "Monday". */
  weekday: { weekday: "long" },
  /** «Νοεμβρίου» / "November" — a month inside a phrase («από τέλος Νοεμβρίου»; Greek genitive). */
  monthOf: { month: "long" },
  /** «Δευ» / "Mon". */
  weekdayShort: { weekday: "short" },
  /** «Δ» / "M" — calendar column heads. */
  weekdayNarrow: { weekday: "narrow" },
  /** «16» — calendar cells and timelines. */
  dayNumber: { day: "numeric" },
  /** «14:05», 24-hour. */
  time: { hour: "2-digit", minute: "2-digit", hourCycle: "h23" },
  /** «16 Νοε, 14:05» / "16 Nov, 14:05" — when something was written. */
  dayShortTime: { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" },
} as const satisfies Record<string, Intl.DateTimeFormatOptions>;

export type DateLook = keyof typeof DATE_LOOKS;

const formatters = new Map<string, Intl.DateTimeFormat>();

/** The cached Intl formatter for one of the app's date looks, in the app's language. */
export function dateFormat(look: DateLook, language: string | undefined): Intl.DateTimeFormat {
  const locale = dateLocale(language);
  const key = `${locale}|${look}`;
  let made = formatters.get(key);
  if (!made) {
    made = new Intl.DateTimeFormat(locale, DATE_LOOKS[look]);
    formatters.set(key, made);
  }
  return made;
}

const show = (look: DateLook) => (date: Date, language: string | undefined) => dateFormat(look, language).format(date);

/** «16 Νοε 2026» / "16 Nov 2026". The default look for a date. */
export const formatDay = show("day");
/** «16 Νοε» / "16 Nov". */
export const formatDayShort = show("dayShort");
/** «Δευ 16 Νοε» / "Mon 16 Nov". */
export const formatWeekdayDay = show("weekdayDay");
/** «Δευ 16 Νοε 2026» / "Mon, 16 Nov 2026". */
export const formatWeekdayDayYear = show("weekdayDayYear");
/** «Δευτέρα 16 Νοεμβρίου» / "Monday 16 November". */
export const formatDayMonthWeekday = show("dayMonthWeekday");
/** «16 Νοεμβρίου» / "16 November". */
export const formatDayLong = show("dayLong");
/** «16 Νοεμβρίου 2026» / "16 November 2026". */
export const formatDayLongYear = show("dayLongYear");
/** «16/11/2026». */
export const formatNumericDay = show("numericDay");
/** «Νοέμβριος 2026» / "November 2026". */
export const formatMonthYear = show("monthYear");
/** «Νοε 2026» / "Nov 2026". */
export const formatMonthYearShort = show("monthYearShort");
/** «Νοε 26» / "Nov 26". */
export const formatMonthYearCompact = show("monthYearCompact");
/** «Νοε» / "Nov". */
export const formatMonthShort = show("monthShort");
/** «Νοεμβρίου» / "November" — inside a phrase («από τέλος Νοεμβρίου»). */
export const formatMonthOf = show("monthOf");
/** «16». */
export const formatDayNumber = show("dayNumber");
/** «14:05». */
export const formatTime = show("time");
/** «16 Νοε, 14:05». */
export const formatDayShortTime = show("dayShortTime");

/** A month's name alone, in the form that names it: «Νοέμβριος» / "November". */
export function formatMonthName(date: Date, language: string | undefined): string {
  return standaloneMonthName(dateLocale(language), date);
}

/** A weekday's name: «Δευτέρα» (long), «Δευ» (short), «Δ» (narrow, calendar heads). */
export function formatWeekday(date: Date, language: string | undefined, width: "long" | "short" | "narrow" = "long"): string {
  return dateFormat(width === "long" ? "weekday" : width === "short" ? "weekdayShort" : "weekdayNarrow", language).format(date);
}

const clocks = new Map<string, Intl.DateTimeFormat>();

/**
 * A ticking clock with seconds: 24-hour in Greek («06:55:22»); in English the
 * reader's own way ("5:23:55 PM"). The one place the time keeps US English.
 */
export function formatClock(date: Date, language: string | undefined): string {
  const greek = !!language?.toLowerCase().startsWith("el");
  const key = greek ? "el" : "en";
  let made = clocks.get(key);
  if (!made) {
    made = greek
      ? new Intl.DateTimeFormat("el-GR", { hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" })
      : new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", second: "2-digit" });
    clocks.set(key, made);
  }
  return made.format(date);
}

/** Greek months as they are shortened in writing — "Σεπτ", where Intl gives "Σεπ". */
const ENGLISH_MONTHS = new Intl.DateTimeFormat("en-US", { month: "short" });
const GREEK_MONTHS = ["Ιαν", "Φεβ", "Μαρ", "Απρ", "Μαΐ", "Ιουν", "Ιουλ", "Αυγ", "Σεπτ", "Οκτ", "Νοε", "Δεκ"];

/**
 * A record's date in the transactions table and every wizard's review step:
 * «06, Οκτ 2026» — the day in two digits, then the month and year.
 */
export function formatRecordDay(date: Date, language: string | undefined): string {
  // English keeps "Sep" here, as the date fields write it (en-GB would say "Sept").
  const month = language?.toLowerCase().startsWith("el") ? GREEK_MONTHS[date.getMonth()] : ENGLISH_MONTHS.format(date);
  return `${String(date.getDate()).padStart(2, "0")}, ${month} ${date.getFullYear()}`;
}

/**
 * A day counted from today in words: «σήμερα», «αύριο», «χθες», «σε 3 ημέρες»,
 * «πριν από 3 ημέρες» / "today", "in 3 days". `days` as `daysBetween(now, day)`.
 */
export function formatRelativeDays(days: number, language: string | undefined): string {
  return new Intl.RelativeTimeFormat(language?.toLowerCase().startsWith("el") ? "el" : "en", { numeric: "auto" }).format(days, "day");
}
