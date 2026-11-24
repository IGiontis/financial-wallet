import type { Transaction } from "../../shared/types/IndexTypes";
import { firestoreToDate } from "../../shared/utils/dates";
import { isDebtTransfer } from "../../shared/utils/moneyModel";
import { computeFilterTotals, totalsSide, type FilterTotals } from "./filterTotals";
import { oneRowPerTransfer } from "./transfers";

// The Transactions page's calendar tab: a month of records, by day — what
// each day brought in and took out, by the page's own rule (`totalsSide`), so
// the month's two tiles are the list's totals for the same dates.
//
// Borrowed money is counted apart (owner, 2026-11-24): a loan of 100 landing
// on a day of 77,10 of shopping is true money in the card, but it is not the
// day's own — so the day says «Δικά σου −77,10» and, under it, «Μπήκαν
// δανεικά 100,00». What is «δανεικά» is the debts feature's own cash records,
// by `isDebtTransfer` — the very rule `totalsSide` leaves out of `in`/`out`,
// so the two figures cannot disagree. A repayment's INTEREST is not one of
// them: it is a real cost, and it counts in the day's own money.

export interface TransactionDay {
  /** The day's records, as the list shows them: a transfer once, newest written first. */
  records: Transaction[];
  in: number;
  out: number;
  /** In less out, to the cent — the day's OWN money, with no borrowed part in it. */
  net: number;
  /** Borrowed money that came in: a loan received, or a loan repaid to you. */
  borrowedIn: number;
  /** Borrowed money that went out: a loan given, or a repayment you made. */
  borrowedOut: number;
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
    const day = days.get(date.getDate()) ?? { records: [], in: 0, out: 0, net: 0, borrowedIn: 0, borrowedOut: 0 };
    day.records.push(tx);
    const side = totalsSide(tx);
    if (side === "in") day.in = round2(day.in + tx.amount);
    else if (side === "out") day.out = round2(day.out + Math.abs(tx.amount));
    // Never both: a debt's loan or principal record is exactly what
    // `totalsSide` answers `null` for.
    if (isDebtTransfer(tx)) {
      const moved = round2(Math.abs(tx.amount));
      if (tx.type === "income") day.borrowedIn = round2(day.borrowedIn + moved);
      else day.borrowedOut = round2(day.borrowedOut + moved);
    }
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
