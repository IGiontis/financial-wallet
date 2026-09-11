import type { DebtWithStatus, Transaction } from "../../shared/types/IndexTypes";
import { firestoreToDate } from "../../shared/utils/dates";
import { affectsBalance, balanceDelta, type OpeningBalance } from "../../shared/utils/balance";

// What you are worth, month by month.
//
// Every other chart on this page measures a PERIOD — what came in and went out
// between two dates. This measures a POSITION, and the app had none: analytics
// never touched debts, investments or goals at all, so a page about money said
// nothing about how much of it there was.
//
// The sum is the ordinary one:
//
//     cash + money set aside + what people owe you − what you owe
//
// Money moved into a goal leaves the cash figure and arrives in the set-aside
// one, so saving changes where your money is and not how much of it there is —
// which is correct, and is the reason the two are counted separately rather
// than netted.
//
// The one thing to know about the debt half: repayments are their own records,
// not spending, so a repayment lowers what you owe without lowering your cash.
// If a loan instalment is only ever entered as a repayment and never as an
// expense, this line will climb on the day it is paid. That is not an error in
// the sum — it means the cash figure is already too high, everywhere in the app.
// Drawing the parts separately is what lets that be seen rather than hidden
// inside one total.

export interface NetWorthPoint {
  /** "2026-09". */
  key: string;
  /** First day of the month this point closes. */
  start: Date;
  /** Money available to spend at the end of the month. */
  cash: number;
  /** Held in goals and investments. */
  saved: number;
  /** Still to come back from other people. */
  owedToMe: number;
  /** Still owed to other people. Positive. */
  owedByMe: number;
  /** cash + saved + owedToMe − owedByMe. */
  net: number;
}

const round2 = (n: number) => Math.round(n * 100) / 100;
const monthKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
/** Midnight on the first of the month after this one — everything before it counts. */
const endOfMonth = (d: Date) => new Date(d.getFullYear(), d.getMonth() + 1, 1);

/** Money parked in a goal or an investment, signed the way it moves. */
const savedDelta = (tx: Transaction): number => {
  if (!tx.isGoalTransaction && !tx.isInvestmentTransaction) return 0;
  return tx.contributionType === "withdrawal" ? -tx.amount : tx.amount;
};

/**
 * What is still open on one debt as of a date.
 *
 * Deliberately the same definition the debts screen uses — the sum handed over
 * less the sum repaid, floored at zero because an overpayment settles a debt
 * rather than reversing it. For a loan carrying interest the true outstanding
 * principal is not quite this, since part of each instalment is the bank's
 * charge; using anything else here would put two different figures for the same
 * loan on two screens, which is worse than the approximation.
 */
function outstandingAt(debt: DebtWithStatus, at: Date): number {
  if (firestoreToDate(debt.date) >= at) return 0;
  const repaid = debt.payments.reduce((sum, payment) => (firestoreToDate(payment.date) < at ? sum + payment.amount : sum), 0);
  return Math.max(0, debt.amount - repaid);
}

/**
 * The position at the end of each month between `from` and `to`.
 *
 * A position is cumulative, so every record ever entered counts toward it, not
 * just the ones inside the window — the window only decides which months are
 * drawn.
 *
 * When an opening balance exists the series cannot start before it: earlier
 * months have no cash figure to report, only the opening one repeated, which
 * would draw a flat run that never happened. Those months are left out rather
 * than invented.
 */
export function netWorthSeries(transactions: Transaction[], debts: DebtWithStatus[], opening: OpeningBalance | undefined, from: Date, to: Date): NetWorthPoint[] {
  const firstDrawable = opening ? new Date(Math.max(from.getTime(), firestoreToDate(opening.date).getTime())) : from;
  if (firstDrawable > to) return [];

  const months: Date[] = [];
  const cursor = new Date(firstDrawable.getFullYear(), firstDrawable.getMonth(), 1);
  const last = new Date(to.getFullYear(), to.getMonth(), 1);
  while (cursor <= last) {
    months.push(new Date(cursor));
    cursor.setMonth(cursor.getMonth() + 1);
  }
  if (months.length === 0) return [];

  const sorted = [...transactions].sort((a, b) => firestoreToDate(a.date).getTime() - firestoreToDate(b.date).getTime());

  let cash = opening?.amount ?? 0;
  let saved = 0;
  let cursorIndex = 0;

  return months.map((start) => {
    const closes = endOfMonth(start);

    while (cursorIndex < sorted.length && firestoreToDate(sorted[cursorIndex].date) < closes) {
      const tx = sorted[cursorIndex];
      if (affectsBalance(tx, opening)) cash += balanceDelta(tx);
      // Money set aside before the opening date is still set aside: the opening
      // figure speaks for the cash account, not for the goals beside it.
      saved += savedDelta(tx);
      cursorIndex += 1;
    }

    let owedToMe = 0;
    let owedByMe = 0;
    for (const debt of debts) {
      const open = outstandingAt(debt, closes);
      if (open === 0) continue;
      if (debt.direction === "owed_to_me") owedToMe += open;
      else owedByMe += open;
    }

    return {
      key: monthKey(start),
      start,
      cash: round2(cash),
      saved: round2(saved),
      owedToMe: round2(owedToMe),
      owedByMe: round2(owedByMe),
      net: round2(cash + saved + owedToMe - owedByMe),
    };
  });
}

/**
 * How many loan repayments have no matching spending beside them.
 *
 * The number that says whether the line above can be trusted. A repayment is
 * counted as matched when an expense of the same amount was entered within
 * three days of it; if most repayments go unmatched, the cash figure is not
 * being reduced when the money leaves, and the position is overstated.
 *
 * Three days because a standing order lands when the bank feels like it, and
 * people enter things at the weekend.
 */
export function repaymentsOutsideCash(debts: DebtWithStatus[], transactions: Transaction[]): { matched: number; unmatched: number } {
  const spending = transactions
    .filter((tx) => tx.type === "expense" && !tx.isGoalTransaction && !tx.isInvestmentTransaction)
    .map((tx) => ({ amount: Math.abs(tx.amount), time: firestoreToDate(tx.date).getTime() }));

  const WINDOW = 3 * 24 * 60 * 60 * 1000;
  const claimed = new Set<number>();
  let matched = 0;
  let unmatched = 0;

  for (const debt of debts) {
    if (debt.direction !== "owed_by_me") continue;
    for (const payment of debt.payments) {
      const at = firestoreToDate(payment.date).getTime();
      // One expense can only account for one repayment, or a single rent
      // payment would vouch for a year of instalments.
      const hit = spending.findIndex((tx, i) => !claimed.has(i) && Math.abs(tx.amount - payment.amount) < 0.01 && Math.abs(tx.time - at) <= WINDOW);
      if (hit === -1) unmatched += 1;
      else {
        claimed.add(hit);
        matched += 1;
      }
    }
  }

  return { matched, unmatched };
}
