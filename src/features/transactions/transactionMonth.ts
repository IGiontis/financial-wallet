import type { Transaction } from "../../shared/types/IndexTypes";
import { firestoreToDate } from "../../shared/utils/dates";
import { computeFilterTotals, totalsSide, type FilterTotals } from "./filterTotals";
import { oneRowPerTransfer } from "./transfers";

// The Transactions page's calendar tab: a month of records, by day — what
// each day brought in and took out, by the page's own rule (`totalsSide`), so
// the month's two tiles are the list's totals for the same dates.

export interface TransactionDay {
  /** The day's records, as the list shows them: a transfer once, newest written first. */
  records: Transaction[];
  in: number;
  out: number;
  /** In less out, to the cent. */
  net: number;
}

export interface TransactionMonth {
  /** By day of the month (1–31); a day with no record is not in it. */
  days: Map<number, TransactionDay>;
  totals: FilterTotals;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

export function transactionMonth(transactions: Transaction[], month: Date): TransactionMonth {
  const year = month.getFullYear();
  const index = month.getMonth();
  const inMonth = oneRowPerTransfer(transactions)
    .map((tx) => ({ tx, date: firestoreToDate(tx.date), createdAt: firestoreToDate(tx.createdAt) }))
    .filter(({ date }) => date.getFullYear() === year && date.getMonth() === index)
    .sort((a, b) => (b.createdAt.getTime() || 0) - (a.createdAt.getTime() || 0));

  const days = new Map<number, TransactionDay>();
  for (const { tx, date } of inMonth) {
    const day = days.get(date.getDate()) ?? { records: [], in: 0, out: 0, net: 0 };
    day.records.push(tx);
    const side = totalsSide(tx);
    if (side === "in") day.in = round2(day.in + tx.amount);
    else if (side === "out") day.out = round2(day.out + Math.abs(tx.amount));
    day.net = round2(day.in - day.out);
    days.set(date.getDate(), day);
  }

  return { days, totals: computeFilterTotals(inMonth.map(({ tx }) => tx)) };
}

/** The months one can step between: from the first record's to the last's, and always this one. */
export function transactionMonthRange(transactions: Transaction[], now: Date): { first: Date; last: Date } {
  let first = new Date(now.getFullYear(), now.getMonth(), 1);
  let last = first;
  for (const tx of transactions) {
    const date = firestoreToDate(tx.date);
    if (Number.isNaN(date.getTime())) continue;
    const start = new Date(date.getFullYear(), date.getMonth(), 1);
    if (start < first) first = start;
    if (start > last) last = start;
  }
  return { first, last };
}
