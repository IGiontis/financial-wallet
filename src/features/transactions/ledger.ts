import { firestoreToDate } from "../../shared/utils/dates";
import { isEarning, isMoneyMove, isSpending, isTransfer } from "../../shared/utils/moneyModel";
import type { Transaction } from "../../shared/types/IndexTypes";
import { oneRowPerTransfer } from "./transfers";

// «Βιβλίο κινήσεων»: every record of a stretch, dense and read-only, by day,
// with what came in and went out and where that leaves the stretch so far.
//
// What counts as in and out is the money model's (`isEarning`, `isSpending`),
// so the totals here are the totals everywhere. Money that only changed
// pockets — a transfer, a loan's money, a deposit into a goal — is listed,
// signed by the way it moved, and counted in neither.

const round2 = (n: number) => Math.round(n * 100) / 100;
const dayKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

export type LedgerKind = "all" | "in" | "out" | "moves";

export interface LedgerRow {
  tx: Transaction;
  date: Date;
  /** When it was written down — the order within a day, and the time shown. */
  recordedAt?: Date;
  /** +1 money in, −1 money out, by the way it moved. */
  sign: 1 | -1;
  amount: number;
  /** Counted in the stretch's in and out; a move between pockets is not. */
  counted: boolean;
  /** The stretch's net, from its first record up to and including this one. */
  running: number;
}

export interface LedgerDay {
  key: string;
  date: Date;
  /** Newest first, as the transactions list has them. */
  rows: LedgerRow[];
  in: number;
  out: number;
}

export interface LedgerCategory {
  categoryId: string;
  amount: number;
  count: number;
  /** Of the side's total, 0–1. */
  share: number;
}

export interface Ledger {
  days: LedgerDay[];
  in: number;
  out: number;
  net: number;
  count: number;
  /** Spending per day over the days of the stretch that have begun. */
  perDay: number;
  spending: LedgerCategory[];
  earning: LedgerCategory[];
}

export interface LedgerOptions {
  from: Date;
  /** Inclusive, to the end of its day. */
  to: Date;
  now?: Date;
  kind?: LedgerKind;
  /** The account a record belongs to (see `accountOf`); with `account`, only that one's. */
  accountOf?: (tx: Transaction) => string | undefined;
  account?: string;
  /**
   * Only the records of these categories — several ids when one name is both
   * an income and an expense category, which the reader picks as one.
   */
  categories?: readonly string[];
  query?: string;
}

function signOf(tx: Transaction): 1 | -1 {
  if (isTransfer(tx)) return tx.contributionType === "withdrawal" ? 1 : -1;
  return tx.type === "income" ? 1 : -1;
}

const isMove = (tx: Transaction) => isMoneyMove(tx) || (isTransfer(tx) && tx.contributionType !== "withdrawal");

function categories(rows: LedgerRow[], pick: (row: LedgerRow) => boolean): LedgerCategory[] {
  const by = new Map<string, { amount: number; count: number }>();
  for (const row of rows) {
    if (!pick(row)) continue;
    const entry = by.get(row.tx.categoryId) ?? { amount: 0, count: 0 };
    entry.amount += row.amount;
    entry.count += 1;
    by.set(row.tx.categoryId, entry);
  }
  const total = [...by.values()].reduce((sum, e) => sum + e.amount, 0);
  return [...by.entries()]
    .map(([categoryId, e]) => ({ categoryId, amount: round2(e.amount), count: e.count, share: total > 0 ? e.amount / total : 0 }))
    .sort((a, b) => b.amount - a.amount);
}

export function buildLedger(transactions: Transaction[], options: LedgerOptions): Ledger {
  const { from, to, now = new Date(), kind = "all", account, categories: only, query = "" } = options;
  const start = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  const end = new Date(to.getFullYear(), to.getMonth(), to.getDate(), 23, 59, 59, 999);
  const needle = query.trim().toLowerCase();

  const rows: LedgerRow[] = [];
  for (const tx of oneRowPerTransfer(transactions)) {
    const date = firestoreToDate(tx.date);
    if (date < start || date > end) continue;
    if (account !== undefined && options.accountOf?.(tx) !== account) continue;
    if (only !== undefined && !only.includes(tx.categoryId)) continue;
    if (needle && !tx.description.toLowerCase().includes(needle)) continue;
    const counted = isEarning(tx) || isSpending(tx);
    const sign = signOf(tx);
    if (kind === "in" && !(counted && sign > 0)) continue;
    if (kind === "out" && !(counted && sign < 0)) continue;
    if (kind === "moves" && !isMove(tx)) continue;
    const created = tx.createdAt ? firestoreToDate(tx.createdAt) : undefined;
    rows.push({ tx, date, recordedAt: created && !Number.isNaN(created.getTime()) ? created : undefined, sign, amount: round2(Math.abs(tx.amount)), counted, running: 0 });
  }

  // Oldest first for the running net, by day and then by when each was written.
  const day = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  rows.sort((a, b) => day(a.date) - day(b.date) || (a.recordedAt?.getTime() ?? 0) - (b.recordedAt?.getTime() ?? 0));
  let running = 0;
  for (const row of rows) {
    if (row.counted) running += row.sign * row.amount;
    row.running = round2(running);
  }

  const byDay = new Map<string, LedgerDay>();
  for (const row of rows) {
    const key = dayKey(row.date);
    const entry = byDay.get(key) ?? { key, date: new Date(row.date.getFullYear(), row.date.getMonth(), row.date.getDate()), rows: [], in: 0, out: 0 };
    entry.rows.push(row);
    if (row.counted) {
      if (row.sign > 0) entry.in += row.amount;
      else entry.out += row.amount;
    }
    byDay.set(key, entry);
  }
  const days = [...byDay.values()]
    .map((d) => ({ ...d, rows: [...d.rows].reverse(), in: round2(d.in), out: round2(d.out) }))
    .sort((a, b) => b.date.getTime() - a.date.getTime());

  const totalIn = round2(days.reduce((sum, d) => sum + d.in, 0));
  const totalOut = round2(days.reduce((sum, d) => sum + d.out, 0));
  // The days of the stretch that have begun: a month half gone is divided by its half.
  const lastDay = end < now ? end : now;
  const daysRun = Math.max(1, Math.round((day(lastDay) - day(start)) / 86_400_000) + 1);

  return {
    days,
    in: totalIn,
    out: totalOut,
    net: round2(totalIn - totalOut),
    count: rows.length,
    perDay: round2(totalOut / daysRun),
    spending: categories(rows, (r) => r.counted && r.sign < 0),
    earning: categories(rows, (r) => r.counted && r.sign > 0),
  };
}
