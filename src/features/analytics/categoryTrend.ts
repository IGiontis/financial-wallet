import { firestoreToDate, monthKey } from "../../shared/utils/dates";
import { isSpending } from "../../shared/utils/moneyModel";
import type { Transaction } from "../../shared/types/IndexTypes";

// «Πώς πήγε μια κατηγορία»: the spending of the categories picked, month by
// month over a stretch of up to a year, or year by year beyond that.
//
// From the transactions every screen already holds — no read of its own. What
// counts as spending is the money model's (`isSpending`), so a category's month
// here is the same figure as its line in the ledger: a transfer, a loan's money
// or a goal deposit filed under «Σούπερ μάρκετ» is not groceries.

const round2 = (n: number) => Math.round(n * 100) / 100;

/** The stretches a month view can take. A year is as far as months stay readable. */
export const TREND_SPANS = [3, 6, 12] as const;
export type TrendSpan = (typeof TREND_SPANS)[number];

/** The first year the year view offers, whatever the records say. */
export const TREND_FIRST_YEAR = 2024;

export interface TrendBucket {
  /** "2026-03" for a month, "2026" for a year. */
  key: string;
  start: Date;
  /** Spent per category picked; every picked category has a figure, 0 included. */
  values: Record<string, number>;
  /** All the picked categories together. */
  total: number;
}

/** Spending per picked category, keyed by bucket — the one walk both views share. */
function tally(transactions: Transaction[], categoryIds: readonly string[], keyOf: (d: Date) => string, keys: Set<string>) {
  const picked = new Set(categoryIds);
  const sums = new Map<string, Map<string, number>>();
  for (const tx of transactions) {
    if (!picked.has(tx.categoryId) || !isSpending(tx)) continue;
    const key = keyOf(firestoreToDate(tx.date));
    if (!keys.has(key)) continue;
    const row = sums.get(key) ?? new Map<string, number>();
    row.set(tx.categoryId, (row.get(tx.categoryId) ?? 0) + Math.abs(tx.amount));
    sums.set(key, row);
  }
  return (key: string) => {
    const row = sums.get(key);
    const values = Object.fromEntries(categoryIds.map((id) => [id, round2(row?.get(id) ?? 0)]));
    return { values, total: round2(categoryIds.reduce((sum, id) => sum + values[id], 0)) };
  };
}

/**
 * `span` months ending with the month `end` falls in, oldest first.
 *
 * Every month of the stretch is there, a month with nothing in it at 0 — a gap
 * in the axis would draw February's groceries straight on to April's.
 */
export function monthlyTrend(transactions: Transaction[], categoryIds: readonly string[], end: Date, span: TrendSpan): TrendBucket[] {
  const starts = Array.from({ length: span }, (_, i) => new Date(end.getFullYear(), end.getMonth() - (span - 1) + i, 1));
  const read = tally(transactions, categoryIds, monthKey, new Set(starts.map(monthKey)));
  return starts.map((start) => ({ key: monthKey(start), start, ...read(monthKey(start)) }));
}

/** The years the year view compares: from 2024 (or the first record, if earlier) to next year. */
export function trendYears(transactions: Transaction[], now: Date): number[] {
  let first = TREND_FIRST_YEAR;
  for (const tx of transactions) {
    const year = firestoreToDate(tx.date).getFullYear();
    if (year < first) first = year;
  }
  const last = now.getFullYear() + 1;
  return Array.from({ length: last - first + 1 }, (_, i) => first + i);
}

/** Each year's total per picked category, oldest first. */
export function yearlyTrend(transactions: Transaction[], categoryIds: readonly string[], years: readonly number[]): TrendBucket[] {
  const read = tally(transactions, categoryIds, (d) => String(d.getFullYear()), new Set(years.map(String)));
  return years.map((year) => ({ key: String(year), start: new Date(year, 0, 1), ...read(String(year)) }));
}

/** The categories with anything spent in them, biggest first — what the picker lists. */
export function spendingCategories(transactions: Transaction[]): { categoryId: string; total: number }[] {
  const totals = new Map<string, number>();
  for (const tx of transactions) {
    if (!isSpending(tx)) continue;
    totals.set(tx.categoryId, (totals.get(tx.categoryId) ?? 0) + Math.abs(tx.amount));
  }
  return [...totals].map(([categoryId, total]) => ({ categoryId, total: round2(total) })).sort((a, b) => b.total - a.total);
}
