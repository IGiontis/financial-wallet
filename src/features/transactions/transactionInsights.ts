import { firestoreToDate } from "../../shared/utils/dates";
import type { Transaction } from "../../shared/types/IndexTypes";

// Analytics for whatever the Transactions filter currently shows. Everything
// here is derived from transactions the page has already fetched, so the whole
// panel costs zero extra Firestore reads.
//
// Deposits into goals/investments are transfers, not spending — they're left
// out of every "spent" figure, matching the model the Overview page uses.

const isSpending = (tx: Transaction) => !tx.isInvestmentTransaction && !tx.isGoalTransaction && tx.type === "expense";

const isEarning = (tx: Transaction) =>
  (!tx.isInvestmentTransaction && !tx.isGoalTransaction && tx.type === "income") ||
  // Pulling money back out of an investment is money returning to you.
  ((tx.isInvestmentTransaction || tx.isGoalTransaction) && tx.contributionType === "withdrawal");

export type InsightMode = "expense" | "income";

const matcher = (mode: InsightMode) => (mode === "expense" ? isSpending : isEarning);

// ─── Headline stats ─────────────────────────────────────────────────────────

export interface InsightStats {
  total: number;
  count: number;
  /** Spread across the days the filter actually covers, not just days with activity. */
  perDay: number;
  /** Middle transaction — resistant to one huge outlier the way a mean isn't. */
  median: number;
  largest?: { amount: number; description: string; date: Date };
}

export function computeStats(transactions: Transaction[], mode: InsightMode, spanDays: number): InsightStats {
  const rows = transactions.filter(matcher(mode));
  const amounts = rows.map((tx) => Math.abs(tx.amount)).sort((a, b) => a - b);
  const total = amounts.reduce((s, a) => s + a, 0);

  let median = 0;
  if (amounts.length > 0) {
    const mid = Math.floor(amounts.length / 2);
    median = amounts.length % 2 === 0 ? (amounts[mid - 1] + amounts[mid]) / 2 : amounts[mid];
  }

  const biggest = rows.reduce<Transaction | undefined>((best, tx) => (!best || Math.abs(tx.amount) > Math.abs(best.amount) ? tx : best), undefined);

  return {
    total,
    count: rows.length,
    perDay: spanDays > 0 ? total / spanDays : 0,
    median,
    largest: biggest ? { amount: Math.abs(biggest.amount), description: biggest.description, date: firestoreToDate(biggest.date) } : undefined,
  };
}

// ─── Category split ─────────────────────────────────────────────────────────

export interface CategorySlice {
  categoryId: string;
  amount: number;
  percentage: number;
  count: number;
}

/**
 * Ranked biggest-first. Anything past `limit` is folded into a single
 * `__other__` slice so the donut stays readable no matter how many categories
 * the user has.
 */
export const OTHER_CATEGORY_ID = "__other__";

export function categorySplit(transactions: Transaction[], mode: InsightMode, limit = 5): CategorySlice[] {
  const rows = transactions.filter(matcher(mode));
  const total = rows.reduce((s, tx) => s + Math.abs(tx.amount), 0);
  if (total === 0) return [];

  const byCategory = new Map<string, { amount: number; count: number }>();
  for (const tx of rows) {
    const key = tx.isInvestmentTransaction || tx.isGoalTransaction ? "__investment__" : tx.categoryId;
    const entry = byCategory.get(key) ?? { amount: 0, count: 0 };
    entry.amount += Math.abs(tx.amount);
    entry.count += 1;
    byCategory.set(key, entry);
  }

  const ranked = Array.from(byCategory.entries())
    .map(([categoryId, v]) => ({ categoryId, amount: v.amount, count: v.count, percentage: (v.amount / total) * 100 }))
    .sort((a, b) => b.amount - a.amount);

  if (ranked.length <= limit) return ranked;

  const head = ranked.slice(0, limit);
  const tail = ranked.slice(limit);
  const rest = tail.reduce((acc, s) => ({ amount: acc.amount + s.amount, count: acc.count + s.count }), { amount: 0, count: 0 });

  return [...head, { categoryId: OTHER_CATEGORY_ID, amount: rest.amount, count: rest.count, percentage: (rest.amount / total) * 100 }];
}

// ─── Over time ──────────────────────────────────────────────────────────────

export type Bucket = "day" | "week" | "month";

export interface TimeBucket {
  key: string;
  label: string;
  start: Date;
  amount: number;
}

/** Picks a granularity that yields a readable number of bars for the range. */
export function pickBucket(spanDays: number): Bucket {
  if (spanDays <= 31) return "day";
  if (spanDays <= 180) return "week";
  return "month";
}

const startOfBucket = (d: Date, bucket: Bucket): Date => {
  if (bucket === "month") return new Date(d.getFullYear(), d.getMonth(), 1);
  if (bucket === "week") {
    const r = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    // Monday-started weeks, matching the rest of the app.
    r.setDate(r.getDate() - ((r.getDay() + 6) % 7));
    return r;
  }
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
};

export function bucketOverTime(transactions: Transaction[], mode: InsightMode, bucket: Bucket, labelFor: (start: Date, bucket: Bucket) => string): TimeBucket[] {
  const rows = transactions.filter(matcher(mode));

  const byKey = new Map<string, { start: Date; amount: number }>();
  for (const tx of rows) {
    const start = startOfBucket(firestoreToDate(tx.date), bucket);
    const key = start.toISOString();
    const entry = byKey.get(key) ?? { start, amount: 0 };
    entry.amount += Math.abs(tx.amount);
    byKey.set(key, entry);
  }

  return Array.from(byKey.entries())
    .map(([key, v]) => ({ key, start: v.start, amount: v.amount, label: labelFor(v.start, bucket) }))
    .sort((a, b) => a.start.getTime() - b.start.getTime());
}

// ─── Top payees ─────────────────────────────────────────────────────────────

export interface Payee {
  name: string;
  amount: number;
  count: number;
}

/** Groups by description, case-insensitively, keeping the first spelling seen. */
export function topPayees(transactions: Transaction[], mode: InsightMode, limit = 5): Payee[] {
  const rows = transactions.filter(matcher(mode));

  const byName = new Map<string, Payee>();
  for (const tx of rows) {
    const label = tx.description.trim();
    if (!label) continue;
    const key = label.toLowerCase();
    const entry = byName.get(key) ?? { name: label, amount: 0, count: 0 };
    entry.amount += Math.abs(tx.amount);
    entry.count += 1;
    byName.set(key, entry);
  }

  return Array.from(byName.values())
    .sort((a, b) => b.amount - a.amount)
    .slice(0, limit);
}

// ─── Comparison with the preceding stretch ──────────────────────────────────

export interface Comparison {
  previousTotal: number;
  difference: number;
  /** Undefined when there's no previous activity to compare against. */
  percentage?: number;
}

/**
 * Compares the filtered total against the equally long window immediately
 * before it — "am I spending more than last time?". `allTransactions` is the
 * unfiltered list, since the earlier window sits outside the current filter.
 */
export function compareWithPrevious(allTransactions: Transaction[], mode: InsightMode, from: Date, to: Date, currentTotal: number): Comparison | undefined {
  const spanMs = to.getTime() - from.getTime();
  if (spanMs <= 0) return undefined;

  const prevTo = new Date(from.getTime() - 1);
  const prevFrom = new Date(prevTo.getTime() - spanMs);

  const previousTotal = allTransactions
    .filter(matcher(mode))
    .filter((tx) => {
      const d = firestoreToDate(tx.date).getTime();
      return d >= prevFrom.getTime() && d <= prevTo.getTime();
    })
    .reduce((s, tx) => s + Math.abs(tx.amount), 0);

  if (previousTotal === 0) return undefined;

  const difference = currentTotal - previousTotal;
  return { previousTotal, difference, percentage: (difference / previousTotal) * 100 };
}

// ─── Span helper ────────────────────────────────────────────────────────────

/** Whole days covered by the filter, inclusive. Falls back to the data's own span. */
export function spanInDays(from: Date | null, to: Date | null, transactions: Transaction[]): number {
  let start = from;
  let end = to;

  if (!start || !end) {
    const dates = transactions.map((tx) => firestoreToDate(tx.date).getTime());
    if (dates.length === 0) return 1;
    start = start ?? new Date(Math.min(...dates));
    end = end ?? new Date(Math.max(...dates));
  }

  const days = Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1;
  return Math.max(days, 1);
}
