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
