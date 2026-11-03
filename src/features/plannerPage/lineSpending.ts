import { endOfMonth, startOfMonth } from "date-fns";
import { firestoreToDate } from "../../shared/utils/dates";
import { categorySplit } from "../transactions/transactionInsights";
import type { Transaction } from "../../shared/types/IndexTypes";
import type { BudgetLine } from "./plannerUtils";

// A budget line that knows what it pays for.
//
// «Φαγητό 250 € τον μήνα» is a limit as well as a rate: linked to the
// categories it covers, the plan can say how much of it this month has used,
// and charge the rest of the month what is left of it rather than a share of
// the days — the 210 already spent has left the bank, and the balance the plan
// starts from has already paid it.

const round2 = (n: number) => Math.round(n * 100) / 100;

/** What actually left, per category, between two dates — the sum and how many times. */
function spendingByCategory(transactions: Transaction[], from: Date, to: Date): Map<string, { amount: number; count: number }> {
  const inRange = transactions.filter((tx) => {
    const date = firestoreToDate(tx.date);
    return date >= from && date <= to;
  });

  // Through `categorySplit` rather than a fresh sum: it already knows that a
  // goal deposit is a transfer and not spending, and a second opinion on that
  // is the last thing this app needs.
  return new Map(categorySplit(inRange, "expense", Number.MAX_SAFE_INTEGER).map((slice) => [slice.categoryId, { amount: round2(slice.amount), count: slice.count }]));
}

/** What actually left, per category, between two dates. */
export function spentByCategory(transactions: Transaction[], from: Date, to: Date): Map<string, number> {
  return new Map([...spendingByCategory(transactions, from, to)].map(([id, { amount }]) => [id, amount]));
}

/**
 * What each line with categories has spent in the month `now` is in — the
 * whole month, a dated expense later in it included. A line with none is not
 * listed: nothing about it can be measured, and 0 would read as "nothing spent".
 */
export function lineSpentThisMonth(lines: Pick<BudgetLine, "id" | "categoryIds">[], transactions: Transaction[], now: Date): Map<string, number> {
  const tracked = lines.filter((line) => (line.categoryIds?.length ?? 0) > 0);
  if (tracked.length === 0) return new Map();
  const spent = spentByCategory(transactions, startOfMonth(now), endOfMonth(now));
  return new Map(tracked.map((line) => [line.id, round2((line.categoryIds ?? []).reduce((sum, id) => sum + (spent.get(id) ?? 0), 0))]));
}

/**
 * Of every line's categories, which line has each — so one category is never
 * counted by two lines, each reporting it in full.
 */
export function categoryOwners(lines: Pick<BudgetLine, "id" | "label" | "categoryIds">[]): Map<string, { id: string; label: string }> {
  const owners = new Map<string, { id: string; label: string }>();
  for (const line of lines) for (const id of line.categoryIds ?? []) if (!owners.has(id)) owners.set(id, { id: line.id, label: line.label });
  return owners;
}

/** What one line's categories took in one month: each on its own, biggest first, and their sum. */
export interface LineMonthSpend {
  total: number;
  /** `count`: how many times it was spent on — «Φαγητό (12)». */
  byCategory: { categoryId: string; amount: number; count: number }[];
}

/**
 * One line's month, category by category — what its view shows. The same
 * `spentByCategory` the limit is charged from, so the total here is the
 * «ξοδεύτηκαν» the plan uses for this month, to the cent. A category with
 * nothing spent is listed at zero: it is one the line covers.
 */
export function lineMonthSpend(line: Pick<BudgetLine, "categoryIds">, transactions: Transaction[], month: Date): LineMonthSpend {
  const spent = spendingByCategory(transactions, startOfMonth(month), endOfMonth(month));
  const byCategory = (line.categoryIds ?? [])
    .map((categoryId) => ({ categoryId, amount: spent.get(categoryId)?.amount ?? 0, count: spent.get(categoryId)?.count ?? 0 }))
    .sort((a, b) => b.amount - a.amount);
  return { total: round2(byCategory.reduce((sum, row) => sum + row.amount, 0)), byCategory };
}

/**
 * The records behind each of a line's categories in one month, newest first —
 * what a category of the line's view opens on. Each record is asked of
 * `categorySplit` on its own, so exactly the ones that make up that category's
 * figure are listed (a goal deposit filed under «Σούπερ μάρκετ» is a transfer
 * there too, and is left out here as well): the rows under a category add up
 * to the figure beside it.
 */
export function lineMonthRecords(line: Pick<BudgetLine, "categoryIds">, transactions: Transaction[], month: Date): Map<string, Transaction[]> {
  const covered = new Set(line.categoryIds ?? []);
  const from = startOfMonth(month);
  const to = endOfMonth(month);
  const records = new Map<string, Transaction[]>();
  for (const tx of transactions) {
    if (!covered.has(tx.categoryId)) continue;
    const date = firestoreToDate(tx.date);
    if (date < from || date > to) continue;
    const slice = categorySplit([tx], "expense", 1)[0];
    if (slice?.categoryId !== tx.categoryId) continue;
    records.set(tx.categoryId, [...(records.get(tx.categoryId) ?? []), tx]);
  }
  for (const list of records.values()) list.sort((a, b) => firestoreToDate(b.date).getTime() - firestoreToDate(a.date).getTime());
  return records;
}
