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

/** What actually left, per category, between two dates. */
export function spentByCategory(transactions: Transaction[], from: Date, to: Date): Map<string, number> {
  const inRange = transactions.filter((tx) => {
    const date = firestoreToDate(tx.date);
    return date >= from && date <= to;
  });

  // Through `categorySplit` rather than a fresh sum: it already knows that a
  // goal deposit is a transfer and not spending, and a second opinion on that
  // is the last thing this app needs.
  return new Map(categorySplit(inRange, "expense", Number.MAX_SAFE_INTEGER).map((slice) => [slice.categoryId, round2(slice.amount)]));
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
