import { startOfMonth, subMonths } from "date-fns";
import type { Transaction } from "../../shared/types/IndexTypes";
import { firestoreToDate } from "../../shared/utils/dates";
import { isEarning } from "../../shared/utils/moneyModel";

// The salary as the records suggest it — never as the plan uses it.
//
// It used to fill the Planner's salary field and, left alone, to be planned
// with. Now the plan's money in comes only from the incomes the user typed on
// «Έσοδα», and this is only ever a suggestion: the Incomes page offers it as
// «Μισθός 1.450 € γύρω στις 30 — τον προσθέτεις;», and the Planner, with no
// incomes yet, says it found one and where to add it.

const round2 = (n: number) => Math.round(n * 100) / 100;

export interface SalaryPattern {
  /** Median of the recent occurrences — resistant to one unusual month. */
  amount: number;
  /** Day of month it usually lands on. */
  dayOfMonth: number;
  /** How many separate months it was seen in. Two is the minimum to call it a pattern. */
  occurrences: number;
}

const median = (values: number[]): number => {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
};

/**
 * Finds the recurring salary by taking the largest income in each recent month
 * and checking it repeats.
 *
 * "Largest per month" rather than "anything that looks regular" on purpose: a
 * salary is almost always the biggest thing that arrives, and that rule needs
 * no threshold to tune. Returns undefined rather than guessing from a single
 * month — one payment is a payment, not a pattern.
 */
export function detectSalary(transactions: Transaction[], now: Date = new Date(), lookbackMonths = 4): SalaryPattern | undefined {
  const earliest = startOfMonth(subMonths(now, lookbackMonths));

  const biggestPerMonth = new Map<string, { amount: number; day: number }>();
  for (const tx of transactions.filter(isEarning)) {
    const date = firestoreToDate(tx.date);
    if (date < earliest || date > now) continue;

    const key = `${date.getFullYear()}-${date.getMonth()}`;
    const amount = Math.abs(tx.amount);
    const current = biggestPerMonth.get(key);
    if (!current || amount > current.amount) biggestPerMonth.set(key, { amount, day: date.getDate() });
  }

  const found = Array.from(biggestPerMonth.values());
  if (found.length < 2) return undefined;

  return {
    amount: round2(median(found.map((f) => f.amount))),
    dayOfMonth: Math.round(median(found.map((f) => f.day))),
    occurrences: found.length,
  };
}
