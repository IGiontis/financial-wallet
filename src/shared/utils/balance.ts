import type { Transaction } from "../types/IndexTypes";

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
}

const startOfDay = (d: Date): Date => new Date(d.getFullYear(), d.getMonth(), d.getDate());

/** True when this transaction is one the balance should count. */
export function affectsBalance(tx: Transaction, opening: OpeningBalance | undefined): boolean {
  if (!opening) return true; // no opening figure — every record is all we know
  return startOfDay(tx.date) >= startOfDay(opening.date);
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
 */
export function currentBalance(transactions: Transaction[], opening?: OpeningBalance): number {
  const base = opening?.amount ?? 0;
  return transactions.filter((tx) => affectsBalance(tx, opening)).reduce((sum, tx) => sum + balanceDelta(tx), base);
}

/** How many records the opening date is holding out of the balance. */
export function excludedByOpeningDate(transactions: Transaction[], opening: OpeningBalance | undefined): number {
  if (!opening) return 0;
  return transactions.filter((tx) => !affectsBalance(tx, opening)).length;
}
