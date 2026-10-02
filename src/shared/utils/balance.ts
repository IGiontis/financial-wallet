import type { Transaction } from "../types/IndexTypes";
import { firestoreToDate } from "./dates";

// ─── Current balance ─────────────────────────────────────────────────────────
// Everything else in the app measures a PERIOD — what came in and went out
// between two dates. This measures a POSITION: how much there is right now.
//
// The two need different arithmetic. A period total starts from zero, so it can
// simply add up whatever falls inside it. A position starts from a figure the
// user hands us — "I had €5000" — and that figure already contains the effect
// of everything that happened before it.
//
// Which is exactly the trap: enter €5000, then backfill last spring's rent, and
// a naive sum deducts rent that came out of the account months before the €5000
// was counted. The money would be subtracted twice — once in reality, once in
// the app. The opening date is what closes it: transactions before that day are
// history, kept for the charts and the averages, but the balance ignores them
// because the opening figure already speaks for them.

export interface OpeningBalance {
  amount: number;
  /** Transactions from this day onward move the balance; earlier ones don't. */
  date: Date;
  /**
   * The exact moment the figure was true, when it came from reading the banks
   * rather than from a day typed in Settings.
   *
   * A day is too coarse for that. Check in on Sunday evening, after logging
   * Sunday's lunch, and a day-level rule would deduct the lunch again — the
   * bank balance just read already had it taken off. On the check-in's own day
   * a record counts only if it was written afterwards.
   */
  at?: Date;
}

const startOfDay = (d: Date): Date => new Date(d.getFullYear(), d.getMonth(), d.getDate());

/**
 * True when a record is newer than a reading of the real balances taken at
 * `at` — so the reading does not include it yet.
 *
 * A later day is newer. An earlier day is not, even if it was typed in after the
 * reading: a forgotten expense backfilled on Tuesday for last Friday was already
 * gone from the bank when Sunday's reading was taken. On the reading's own day,
 * the time the record was written decides; a record the server has not stamped
 * yet was written moments ago, so it is newer.
 *
 * Except a record marked `inReading`: the answer "yes, it was already in the
 * bank" to the Incomes page's question about that reading. It is written after
 * the reading by definition, so on the reading's own day the time would count
 * it a second time on top of a balance that already holds it.
 */
export function isAfterReading(tx: Transaction, at: Date): boolean {
  const txDay = startOfDay(firestoreToDate(tx.date)).getTime();
  const readingDay = startOfDay(at).getTime();
  if (txDay !== readingDay) return txDay > readingDay;
  if (tx.inReading) return false;
  const created = tx.createdAt ? firestoreToDate(tx.createdAt) : undefined;
  if (!created || Number.isNaN(created.getTime())) return true;
  return created.getTime() > at.getTime();
}

/**
 * `isAfterReading` as sort keys, day first and time second: a record is after a
 * reading exactly when its key is the greater of the two.
 *
 * For a caller that holds many records up against many readings — every
 * reading ever taken, on every render of the balance — so it can put the
 * records in this order once and find each reading's place by searching,
 * instead of walking all of them per reading. Kept beside `isAfterReading` so
 * the two cannot drift: an unreadable day is never after anything, and a
 * record without a server stamp is after everything on its own day.
 */
export function recordReadingKey(tx: Transaction): [day: number, time: number] {
  const day = startOfDay(firestoreToDate(tx.date)).getTime();
  // Before every reading on its own day, as `isAfterReading` has it.
  if (tx.inReading) return [Number.isNaN(day) ? -Infinity : day, -Infinity];
  const created = tx.createdAt ? firestoreToDate(tx.createdAt).getTime() : Number.NaN;
  return [Number.isNaN(day) ? -Infinity : day, Number.isNaN(created) ? Infinity : created];
}

/** The key of a reading taken at `at`, to compare with `recordReadingKey`. */
export function readingTimeKey(at: Date): [day: number, time: number] {
  return [startOfDay(at).getTime(), at.getTime()];
}

/**
 * True when this transaction is one the balance should count.
 *
 * `tx.date` is typed as a Date but arrives from Firestore as a Timestamp — the
 * read casts the raw document straight to `Transaction`, so the type is a
 * promise the data does not keep. Every other screen normalises it the same
 * way; skipping that here crashed the balance card outright.
 */
export function affectsBalance(tx: Transaction, opening: OpeningBalance | undefined): boolean {
  if (!opening) return true; // no opening figure — every record is all we know
  if (opening.at) return isAfterReading(tx, opening.at);
  return startOfDay(firestoreToDate(tx.date)) >= startOfDay(firestoreToDate(opening.date));
}

/**
 * Signed effect of one transaction on the money available.
 *
 * Goal and investment contributions are expenses here even though they are not
 * losses: the cash has left the current account either way, and "what can I
 * spend" is the question this figure answers. A withdrawal from a goal comes
 * back the other way.
 */
export function balanceDelta(tx: Transaction): number {
  if (tx.isGoalTransaction || tx.isInvestmentTransaction) {
    return tx.contributionType === "withdrawal" ? tx.amount : -tx.amount;
  }
  return tx.type === "income" ? tx.amount : -tx.amount;
}

/**
 * Money available now: the opening figure plus everything that has moved since.
 *
 * Without an opening balance this is just the net of every record ever entered,
 * which is the honest answer when the user hasn't told us where they started.
 *
 * Rounded to the cent on the way out. A float sum of amounts that cancel exactly
 * — 0.1 + 0.2 in, 0.3 out — lands a hair either side of zero, and a hair below
 * it was printed as a red "-0,00 €": an overdraft of nothing. The `+ 0` turns a
 * rounded `-0` into a plain zero, which is what every sign test downstream
 * expects to see.
 */
export function currentBalance(transactions: Transaction[], opening?: OpeningBalance): number {
  const base = opening?.amount ?? 0;
  const raw = transactions.filter((tx) => affectsBalance(tx, opening)).reduce((sum, tx) => sum + balanceDelta(tx), base);
  return Math.round(raw * 100) / 100 + 0;
}

/** How many records the opening date is holding out of the balance. */
export function excludedByOpeningDate(transactions: Transaction[], opening: OpeningBalance | undefined): number {
  if (!opening) return 0;
  return transactions.filter((tx) => !affectsBalance(tx, opening)).length;
}
