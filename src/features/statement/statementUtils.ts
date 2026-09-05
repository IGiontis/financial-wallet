import { firestoreToDate } from "../../shared/utils/dates";
import { monthlyFlows, type MonthlyFlow } from "../analytics/analyticsUtils";
import { categorySplit } from "../transactions/transactionInsights";
import type { Transaction } from "../../shared/types/IndexTypes";

/**
 * A period's figures, arranged for reading on paper.
 *
 * Every number here comes from the same functions the screens use —
 * `categorySplit` for the breakdowns, `monthlyFlows` for the months — so a
 * printed statement and the app can never quietly disagree. That matters more
 * here than anywhere else in the app: this is the copy that gets handed to
 * somebody else, and it has no way to be corrected once it has.
 *
 * Nothing is folded into an "other" bucket. On screen that keeps a chart
 * readable; on a statement it would be a hole where a figure should be, and
 * paper has as many rows as it needs.
 */

export interface StatementLine {
  categoryId: string;
  label: string;
  icon: string;
  amount: number;
  /** Fraction of that side's total, 0–1. */
  share: number;
  count: number;
}

export interface StatementMonth {
  key: string;
  start: Date;
  income: number;
  expenses: number;
  net: number;
}

export interface Statement {
  from: Date;
  to: Date;
  income: number;
  expenses: number;
  /** income − expenses. Negative means the period ran past what came in. */
  net: number;
  /** Rows counted, so a statement of nothing says so rather than showing zeros. */
  count: number;
  expenseLines: StatementLine[];
  incomeLines: StatementLine[];
  /** One row per month in the period. A single-month statement gets one. */
  months: StatementMonth[];
}

/** Names and icons come from the caller, which is where the translations live. */
export type CategoryNamer = (categoryId: string) => { label: string; icon: string };

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Inclusive of both ends: a statement "for 2026" has to contain 31 December. */
export function withinPeriod(transactions: Transaction[], from: Date, to: Date): Transaction[] {
  return transactions.filter((tx) => {
    const date = firestoreToDate(tx.date);
    return date >= from && date <= to;
  });
}

const linesFrom = (transactions: Transaction[], mode: "expense" | "income", nameFor: CategoryNamer): StatementLine[] =>
  categorySplit(transactions, mode, Number.MAX_SAFE_INTEGER).map((slice) => ({
    categoryId: slice.categoryId,
    ...nameFor(slice.categoryId),
    amount: round2(slice.amount),
    share: slice.percentage / 100,
    count: slice.count,
  }));

export function buildStatement(transactions: Transaction[], from: Date, to: Date, nameFor: CategoryNamer): Statement {
  const scoped = withinPeriod(transactions, from, to);

  const expenseLines = linesFrom(scoped, "expense", nameFor);
  const incomeLines = linesFrom(scoped, "income", nameFor);

  // Summed from the lines rather than from a second pass over the rows, so the
  // total on the page is by construction the total of the rows above it.
  const expenses = round2(expenseLines.reduce((sum, line) => sum + line.amount, 0));
  const income = round2(incomeLines.reduce((sum, line) => sum + line.amount, 0));

  const months: StatementMonth[] = monthlyFlows(scoped, from, to).map((flow: MonthlyFlow) => ({
    key: flow.key,
    start: flow.start,
    income: round2(flow.income),
    expenses: round2(flow.expenses),
    net: round2(flow.income - flow.expenses),
  }));

  return {
    from,
    to,
    income,
    expenses,
    net: round2(income - expenses),
    count: expenseLines.reduce((n, l) => n + l.count, 0) + incomeLines.reduce((n, l) => n + l.count, 0),
    expenseLines,
    incomeLines,
    months,
  };
}

// ─── Periods ────────────────────────────────────────────────────────────────

/** Whole year, both ends inclusive. */
export const yearRange = (year: number): { from: Date; to: Date } => ({
  from: new Date(year, 0, 1),
  to: new Date(year, 11, 31, 23, 59, 59, 999),
});

/** One month, `month` being 0-based as everywhere else in this codebase. */
export const monthRange = (year: number, month: number): { from: Date; to: Date } => ({
  from: new Date(year, month, 1),
  to: new Date(year, month + 1, 0, 23, 59, 59, 999),
});

/**
 * Years the user actually has records in, newest first.
 *
 * Offering a dropdown of years that produce an empty page is a way of making
 * someone prove your data is missing. The current year is always included so a
 * brand-new account has something to pick.
 */
export function yearsWithRecords(transactions: Transaction[], now: Date = new Date()): number[] {
  const years = new Set<number>([now.getFullYear()]);
  for (const tx of transactions) years.add(firestoreToDate(tx.date).getFullYear());
  return Array.from(years).sort((a, b) => b - a);
}
