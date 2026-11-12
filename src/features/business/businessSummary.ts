import { firestoreToDate } from "../../shared/utils/dates";
import type { BusinessEntry, BusinessExpense } from "../../shared/types/IndexTypes";

// ─── «Δουλειά»: a day's closing, and a month of them ─────────────────────────
//
// The owner's own words: «Κάνω 800 ευρώ τζίρο. 40 βενζίνη, 350 εμπορεύματα,
// 50 υπάλληλος, 100 ΦΠΑ + άδεια. Τζίρος τόσο, έξοδα τόσο, κέρδος τόσο.»
//
//   Τζίρος   turnover = what the day took in
//   Έξοδα    expenses = Σ of the day's expense lines
//   Κέρδος   profit   = turnover − expenses   (negative: a loss)
//
// A month is the sum of its closings, figure by figure. The day's profit goes
// into the owner's own money (`personalMove`): an income of the profit, or —
// a loss — an expense of it, covered from their own money; nothing at 0.
//
// Counted in whole cents, so 0,10 + 0,20 is 0,30 and not 0,30000000000000004;
// a month runs from its 1st at 00:00 to the next 1st, local time.

type Closing = Pick<BusinessEntry, "date" | "turnover" | "expenses">;

const cents = (amount: unknown) => (typeof amount === "number" && Number.isFinite(amount) ? Math.round(amount * 100) : 0);
const linesOf = (entry: Pick<BusinessEntry, "expenses">): BusinessExpense[] => (Array.isArray(entry.expenses) ? entry.expenses : []);

export interface ClosingFigures {
  turnover: number;
  expenses: number;
  profit: number;
}

/** One closing's three figures. */
export function closingFigures(entry: Pick<BusinessEntry, "turnover" | "expenses">): ClosingFigures {
  const turnover = cents(entry.turnover);
  const expenses = linesOf(entry).reduce((sum, line) => sum + cents(line.amount), 0);
  return { turnover: turnover / 100, expenses: expenses / 100, profit: (turnover - expenses) / 100 };
}

export interface BusinessMonth extends ClosingFigures {
  /** How many closings the month holds. */
  days: number;
}

/** The first moment of the month `date` falls in, local time. */
export const monthStart = (date: Date) => new Date(date.getFullYear(), date.getMonth(), 1);

/** Whether a closing is dated inside the month that starts at `month` (any day of it will do). */
export function inMonth(entry: Pick<BusinessEntry, "date">, month: Date): boolean {
  const from = monthStart(month);
  const to = new Date(from.getFullYear(), from.getMonth() + 1, 1);
  const at = firestoreToDate(entry.date).getTime();
  return at >= from.getTime() && at < to.getTime();
}

/** The month's closings, newest first (then the latest written first). */
export function monthEntries<T extends Pick<BusinessEntry, "date"> & Partial<Pick<BusinessEntry, "createdAt">>>(entries: readonly T[], month: Date): T[] {
  return entries
    .filter((e) => inMonth(e, month))
    .sort((a, b) => firestoreToDate(b.date).getTime() - firestoreToDate(a.date).getTime() || (b.createdAt ? firestoreToDate(b.createdAt).getTime() : 0) - (a.createdAt ? firestoreToDate(a.createdAt).getTime() : 0));
}

/** The month's three figures — the sums of its closings — and how many there were. */
export function monthSummary(entries: readonly Closing[], month: Date): BusinessMonth {
  let turnover = 0;
  let expenses = 0;
  let days = 0;
  for (const entry of entries) {
    if (!inMonth(entry, month)) continue;
    turnover += cents(entry.turnover);
    expenses += linesOf(entry).reduce((sum, line) => sum + cents(line.amount), 0);
    days += 1;
  }
  return { turnover: turnover / 100, expenses: expenses / 100, profit: (turnover - expenses) / 100, days };
}

export interface CategoryTotal {
  /** The category's id; "" for lines whose category is not among the known ones (deleted since). */
  categoryId: string;
  total: number;
  /** How many lines. */
  count: number;
}

/**
 * The month's expense lines by category, biggest first. A line whose category
 * is not among `known` is counted under "" so the bars still add up to the tile.
 */
export function monthByCategory(entries: readonly Closing[], month: Date, known?: ReadonlySet<string>): CategoryTotal[] {
  const totals = new Map<string, { cents: number; count: number }>();
  for (const entry of entries) {
    if (!inMonth(entry, month)) continue;
    for (const line of linesOf(entry)) {
      const id = line.categoryId && (!known || known.has(line.categoryId)) ? line.categoryId : "";
      const row = totals.get(id) ?? { cents: 0, count: 0 };
      row.cents += cents(line.amount);
      row.count += 1;
      totals.set(id, row);
    }
  }
  return [...totals]
    .map(([categoryId, row]) => ({ categoryId, total: row.cents / 100, count: row.count }))
    .sort((a, b) => b.total - a.total || a.categoryId.localeCompare(b.categoryId));
}

/**
 * What a day's profit does to the owner's own money: an income of the profit,
 * an expense of the loss (covered from their own money), or nothing at 0.
 */
export function personalMove(profit: number): { type: "income" | "expense"; amount: number } | null {
  const c = cents(profit);
  if (c === 0) return null;
  return { type: c > 0 ? "income" : "expense", amount: Math.abs(c) / 100 };
}

/** The distinct categories a closing's lines name, in the order they first appear. */
export const lineCategoryIds = (expenses: readonly BusinessExpense[]): string[] => [...new Set(expenses.map((line) => line.categoryId).filter(Boolean))];

export interface BusinessDay<T> {
  /** The day's closings, newest first. */
  entries: T[];
  /** What the day came to: the sum of its closings' profits (negative: a loss). */
  profit: number;
  /** Whether any closing of the day made a profit, and whether any made a loss. */
  gained: boolean;
  lost: boolean;
}

export interface BusinessCalendarMonth<T> {
  /** The month's days that have a closing, by day of the month (1–31). */
  days: Map<number, BusinessDay<T>>;
  /**
   * What reached the owner's money, closing by closing: `in` the profits that
   * came in, `out` the losses that went out — `in − out` is the month's
   * profit. With how many closings of each.
   */
  totals: { in: number; out: number; inCount: number; outCount: number };
}

/**
 * The month as the «Ημερολόγιο» tab draws it: each day's closings and what the
 * day came to, and the month's money in (profits) and out (losses) — the very
 * moves `personalMove` writes into the owner's own money, so the two tiles are
 * what the personal records of the month add up to.
 */
export function monthCalendar<T extends Pick<BusinessEntry, "date" | "turnover" | "expenses"> & Partial<Pick<BusinessEntry, "createdAt">>>(entries: readonly T[], month: Date): BusinessCalendarMonth<T> {
  const days = new Map<number, BusinessDay<T> & { cents: number }>();
  let inCents = 0;
  let outCents = 0;
  let inCount = 0;
  let outCount = 0;
  for (const entry of monthEntries(entries, month)) {
    const { profit } = closingFigures(entry);
    const c = cents(profit);
    const n = firestoreToDate(entry.date).getDate();
    const day = days.get(n) ?? { entries: [], profit: 0, cents: 0, gained: false, lost: false };
    day.entries.push(entry);
    day.cents += c;
    day.profit = day.cents / 100;
    if (c > 0) {
      day.gained = true;
      inCents += c;
      inCount += 1;
    } else if (c < 0) {
      day.lost = true;
      outCents -= c;
      outCount += 1;
    }
    days.set(n, day);
  }
  const out = new Map<number, BusinessDay<T>>();
  for (const [n, { entries: list, profit, gained, lost }] of days) out.set(n, { entries: list, profit, gained, lost });
  return { days: out, totals: { in: inCents / 100, out: outCents / 100, inCount, outCount } };
}
