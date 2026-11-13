import { firestoreToDate } from "../../shared/utils/dates";
import { nameKey } from "../../shared/utils/nameMatch";
import { BUSINESS_CATEGORY_ID } from "../../shared/utils/categories";
import type { BusinessEntry, BusinessEntryInput, BusinessExpense, BusinessIncome, CreateTransactionDTO } from "../../shared/types/IndexTypes";

// ─── «Δουλειά»: a day's closing, and a month of them ─────────────────────────
//
// A user has 0..n businesses, each with its own income lines («Ταμείο»,
// «Συνταγές ΕΟΠΥΥ») and expense lines («Εμπορεύματα», «Ενοίκιο»). A day's
// closing of one business is what each line took in or paid out:
//
//   Τζίρος   turnover = Σ the day's incomes
//   Έξοδα    expenses = Σ the day's expenses (lines and one-off «άλλο έξοδο»)
//   Κέρδος   profit   = turnover − expenses   (negative: a loss)
//
// A month is the sum of its closings, figure by figure — of one business, or
// of all of them («Όλες»). The day's profit goes into the owner's own money
// (`personalMove`): an income of the profit, or — a loss — an expense of it;
// nothing at 0.
//
// Counted in whole cents, so 0,10 + 0,20 is 0,30 and not 0,30000000000000004;
// a month runs from its 1st at 00:00 to the next 1st, local time.

type Closing = Pick<BusinessEntry, "date" | "incomes" | "expenses">;

const cents = (amount: unknown) => (typeof amount === "number" && Number.isFinite(amount) ? Math.round(amount * 100) : 0);
const incomesOf = (entry: Partial<Pick<BusinessEntry, "incomes">>): BusinessIncome[] => (Array.isArray(entry.incomes) ? entry.incomes : []);
const expensesOf = (entry: Partial<Pick<BusinessEntry, "expenses">>): BusinessExpense[] => (Array.isArray(entry.expenses) ? entry.expenses : []);
const sumCents = (rows: readonly { amount: number }[]) => rows.reduce((sum, row) => sum + cents(row.amount), 0);

export interface ClosingFigures {
  turnover: number;
  expenses: number;
  profit: number;
}

/** One closing's three figures. */
export function closingFigures(entry: Partial<Pick<BusinessEntry, "incomes" | "expenses">>): ClosingFigures {
  const turnover = sumCents(incomesOf(entry));
  const expenses = sumCents(expensesOf(entry));
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

/** The closings of one business; all of them when `businessId` is absent («Όλες»). */
export const forBusiness = <T extends Pick<BusinessEntry, "businessId">>(entries: readonly T[], businessId: string | undefined): T[] => (businessId ? entries.filter((e) => e.businessId === businessId) : [...entries]);

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
    turnover += sumCents(incomesOf(entry));
    expenses += sumCents(expensesOf(entry));
    days += 1;
  }
  return { turnover: turnover / 100, expenses: expenses / 100, profit: (turnover - expenses) / 100, days };
}

export interface ExpenseLineTotal {
  /** `line:<lineId>` for an expense line, `once:<businessId>:<name>` for one-off expenses of one name. */
  key: string;
  businessId: string;
  /** Set for an expense line of the business. */
  lineId?: string;
  /** Set for a one-off «άλλο έξοδο»: the name it was written with. */
  name?: string;
  total: number;
  /** How many expenses. */
  count: number;
}

/**
 * «Πού πήγαν τα έξοδα»: the month's expenses by expense line, biggest first.
 * One-off expenses («άλλο έξοδο») are grouped by their name within their
 * business. Every expense is in exactly one row, so the rows add up to the tile.
 */
/** Which row of «Πού πήγαν τα έξοδα» an expense of a closing falls in — see `ExpenseLineTotal.key`. */
const expenseKey = (businessId: string, line: BusinessExpense) => (line.lineId ? `line:${line.lineId}` : `once:${businessId}:${nameKey(line.name ?? "")}`);

export function monthByExpenseLine(entries: readonly (Closing & Pick<BusinessEntry, "businessId">)[], month: Date): ExpenseLineTotal[] {
  const totals = new Map<string, ExpenseLineTotal & { cents: number }>();
  for (const entry of entries) {
    if (!inMonth(entry, month)) continue;
    for (const line of expensesOf(entry)) {
      const key = expenseKey(entry.businessId, line);
      const row = totals.get(key) ?? { key, businessId: entry.businessId, ...(line.lineId ? { lineId: line.lineId } : { name: line.name?.trim() ?? "" }), total: 0, count: 0, cents: 0 };
      row.cents += cents(line.amount);
      row.count += 1;
      totals.set(key, row);
    }
  }
  return [...totals.values()].map(({ cents: c, ...row }) => ({ ...row, total: c / 100 })).sort((a, b) => b.total - a.total || a.key.localeCompare(b.key));
}

export interface LineClosing<T> {
  entry: T;
  /** What the closing paid on the line (a one-off name written twice in one closing is added up). */
  amount: number;
}

/**
 * One row of «Πού πήγαν τα έξοδα» opened out: the month's closings that paid
 * on it (`key` as `monthByExpenseLine` gives it), newest first, with what each
 * paid. Built by the same rule as the row, so they add up to its total.
 */
export function expenseLineClosings<T extends Closing & Pick<BusinessEntry, "businessId"> & Partial<Pick<BusinessEntry, "createdAt">>>(entries: readonly T[], month: Date, key: string): LineClosing<T>[] {
  const out: LineClosing<T>[] = [];
  for (const entry of monthEntries(entries, month)) {
    const paid = expensesOf(entry).filter((line) => expenseKey(entry.businessId, line) === key);
    if (paid.length > 0) out.push({ entry, amount: sumCents(paid) / 100 });
  }
  return out;
}

/** The days of a month that closed at a loss: their profit under 0, to the cent. */
export const lossDays = (entries: readonly Pick<BusinessEntry, "incomes" | "expenses">[]) => entries.filter((e) => cents(closingFigures(e).profit) < 0).length;

/**
 * What a day's profit does to the owner's own money: an income of the profit,
 * an expense of the loss (covered from their own money), or nothing at 0.
 */
export function personalMove(profit: number): { type: "income" | "expense"; amount: number } | null {
  const c = cents(profit);
  if (c === 0) return null;
  return { type: c > 0 ? "income" : "expense", amount: Math.abs(c) / 100 };
}

/**
 * The day's record in the owner's own money, as a closing writes it: an income
 * of the profit or an expense of the loss, on the closing's day and card,
 * filed under no category of the owner's (`BUSINESS_CATEGORY_ID`, «Δουλειά»)
 * and named by `describe` («Κέρδος · Φαρμακείο» / «Ζημιά · Λαϊκή»). `null` at 0.
 */
export function personalRecord(closing: BusinessEntryInput, describe: (type: "income" | "expense") => string): CreateTransactionDTO | null {
  const move = personalMove(closingFigures(closing).profit);
  if (!move) return null;
  return {
    amount: move.amount,
    type: move.type,
    categoryId: BUSINESS_CATEGORY_ID,
    date: closing.date,
    description: describe(move.type),
    businessId: closing.businessId,
    ...(closing.accountId ? { accountId: closing.accountId } : {}),
  };
}

/** The distinct lines a closing names — its incomes', then its expenses' — in the order they first appear. */
export const closingLineIds = (closing: Partial<Pick<BusinessEntry, "incomes" | "expenses">>): string[] => [
  ...new Set([...incomesOf(closing).map((l) => l.lineId), ...expensesOf(closing).map((l) => l.lineId)].filter((id): id is string => !!id)),
];

/** How many closings name each line, from the closings on the device (no read). */
export function lineUses(entries: readonly Pick<BusinessEntry, "incomes" | "expenses">[]): Map<string, number> {
  const uses = new Map<string, number>();
  for (const e of entries) for (const id of closingLineIds(e)) uses.set(id, (uses.get(id) ?? 0) + 1);
  return uses;
}

export interface BusinessReach {
  /** Closings of the business. */
  closings: number;
  /** Their records in the owner's own money (profit incomes and loss expenses). */
  records: number;
  /** Σ of the profits those records brought in, and of the losses they took out. */
  profitIn: number;
  lossOut: number;
}

/**
 * What deleting a business takes with it, counted from the closings on the
 * device: its closings, and the records of their profits and losses in the
 * owner's own money — said in the question before anything is deleted.
 */
export function businessReach(entries: readonly Pick<BusinessEntry, "businessId" | "incomes" | "expenses" | "linkedTransactionId">[], businessId: string): BusinessReach {
  let closings = 0;
  let records = 0;
  let inCents = 0;
  let outCents = 0;
  for (const e of entries) {
    if (e.businessId !== businessId) continue;
    closings += 1;
    if (!e.linkedTransactionId) continue;
    const move = personalMove(closingFigures(e).profit);
    if (!move) continue;
    records += 1;
    if (move.type === "income") inCents += cents(move.amount);
    else outCents += cents(move.amount);
  }
  return { closings, records, profitIn: inCents / 100, lossOut: outCents / 100 };
}

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
export function monthCalendar<T extends Closing & Partial<Pick<BusinessEntry, "createdAt">>>(entries: readonly T[], month: Date): BusinessCalendarMonth<T> {
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
