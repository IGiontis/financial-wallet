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
