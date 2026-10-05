import type { TFunction } from "i18next";
import { standaloneMonthName } from "../../shared/utils/dates";
import { EARLY_LABEL_DAYS, everyOf, type Income, type IncomeStatus } from "./incomesUtils";

// The words the page puts on an income and on one of its times. Kept out of
// the components so the list, the calendar and the card say "late 2 days" the
// same way, and so the formats are built once per language rather than per row.

export interface IncomeFormats {
  /** The locale every date here is written in — day first, in English too. */
  lang: string;
  /** "Δευ 28 Σεπ 2026". */
  weekdayDate: Intl.DateTimeFormat;
  /** "28 Σεπ 2026" — a date with its year, the way the date fields show it. */
  dayMonth: Intl.DateTimeFormat;
  /** "28 Σεπ". */
  dayMonthShort: Intl.DateTimeFormat;
  /** "Σεπ". */
  monthShort: Intl.DateTimeFormat;
  /** "Παρασκευή". */
  weekdayLong: Intl.DateTimeFormat;
  /** "Σεπτέμβριος" — the month named on its own, not the genitive. */
  monthName: (date: Date) => string;
  /** "Σεπ 2026". */
  monthYearShort: Intl.DateTimeFormat;
}

/**
 * Day before month, always. The app writes dates as dd/mm/yyyy and its date
 * fields as "10 Οκτ 2026"; plain "en" would print "Oct 10" and "9/25", so
 * English takes the British order.
 */
export const dayFirstLocale = (lang: string) => (lang.toLowerCase().startsWith("en") ? "en-GB" : lang);

export function makeFormats(language: string): IncomeFormats {
  const lang = dayFirstLocale(language);
  return {
    lang,
    weekdayDate: new Intl.DateTimeFormat(lang, { weekday: "short", day: "numeric", month: "short", year: "numeric" }),
    dayMonth: new Intl.DateTimeFormat(lang, { day: "numeric", month: "short", year: "numeric" }),
    dayMonthShort: new Intl.DateTimeFormat(lang, { day: "numeric", month: "short" }),
    monthShort: new Intl.DateTimeFormat(lang, { month: "short" }),
    weekdayLong: new Intl.DateTimeFormat(lang, { weekday: "long" }),
    monthName: (date: Date) => standaloneMonthName(lang, date),
    monthYearShort: new Intl.DateTimeFormat(lang, { month: "short", year: "numeric" }),
  };
}

/** A weekday by number, Sunday = 0, in the reader's language. */
export const weekdayName = (f: IncomeFormats, weekday: number) => f.weekdayLong.format(new Date(2024, 0, 7 + weekday));

/** «κάθε μήνα στις 30», «κάθε 2 εβδομάδες, Παρασκευή», «κάθε χρόνο, 20 Δεκ». */
export function scheduleText(income: Income, t: TFunction, f: IncomeFormats): string {
  const every = everyOf(income);
  if (income.frequency === "weekly") {
    const weekday = weekdayName(f, income.day ?? 1);
    return every > 1 ? t("incomes.schedule.everyWeeks", { count: every, weekday }) : t("incomes.schedule.weekly", { weekday });
  }
  if (income.day === undefined) return t("incomes.schedule.undated");
  if (income.frequency === "yearly") {
    const date = f.dayMonthShort.format(new Date(2024, income.month ?? 0, income.day));
    return every > 1 ? t("incomes.schedule.everyYears", { count: every, date }) : t("incomes.schedule.yearly", { date });
  }
  return every > 1 ? t("incomes.schedule.everyMonths", { count: every, day: income.day }) : t("incomes.schedule.monthly", { day: income.day });
}

/** The short form for a list row: «στις 30», «κάθε Παρασκευή», «20 Δεκ». */
export function shortSchedule(income: Income, t: TFunction, f: IncomeFormats): string {
  if (income.frequency === "weekly") return t("incomes.schedule.weekly", { weekday: weekdayName(f, income.day ?? 1) });
  if (income.day === undefined) return t("incomes.status.undated");
  if (income.frequency === "yearly") return f.dayMonthShort.format(new Date(2024, income.month ?? 0, income.day));
  return t("incomes.schedule.onDay", { day: income.day });
}

export type StatusTone = "paid" | "late" | "ask" | "due" | "muted";

/**
 * One time's state as a tag: «✓ 25/9 · 5 μέρες νωρίς», «αργεί 2 μέρες», «σε 3 μέρες · Δευ 28/9».
 * A day either side is on time — an allowance due on a Sunday that lands on the
 * Monday is not "late" — so early and late both speak from two days.
 */
export function statusTag(status: IncomeStatus, t: TFunction, f: IncomeFormats): { text: string; tone: StatusTone } {
  switch (status.state) {
    case "arrived":
    case "found": {
      const parts = [t("incomes.status.arrived", { date: f.dayMonth.format(status.arrival!.date) })];
      if (status.earlyDays) parts.push(t("incomes.status.early", { count: status.earlyDays }));
      else if (status.lateDays && status.lateDays >= EARLY_LABEL_DAYS) parts.push(t("incomes.status.lateArrival", { count: status.lateDays }));
      if (status.state === "found") parts.push(t("incomes.status.found"));
      return { text: parts.join(" · "), tone: "paid" };
    }
    case "late":
      return { text: t("incomes.status.late", { count: status.lateDays ?? 0 }), tone: "late" };
    case "ask":
      return { text: t("incomes.status.ask"), tone: "ask" };
    case "skipped":
      return { text: t("incomes.status.skipped"), tone: "muted" };
    case "missed":
      return { text: t("incomes.status.missed"), tone: "muted" };
    case "due":
    case "upcoming": {
      if (status.undated) return { text: t("incomes.status.undated"), tone: "due" };
      if (status.daysUntil === 0) return { text: t("incomes.status.today"), tone: "due" };
      return { text: t("incomes.status.inDays", { count: status.daysUntil ?? 0, date: f.dayMonth.format(status.expectedDate) }), tone: status.state === "due" ? "due" : "muted" };
    }
  }
}
