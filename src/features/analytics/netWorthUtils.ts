import type { DebtWithStatus, Transaction } from "../../shared/types/IndexTypes";
import { firestoreToDate } from "../../shared/utils/dates";
import { affectsBalance, balanceDelta, type OpeningBalance } from "../../shared/utils/balance";
import { isLoan, loanState } from "../debts/debtsUtils";

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
 * Which pot a contribution belongs to. Records from before contributions
 * carried their goal share one pot, which is as much as can be said of them.
 */
const holdingOf = (tx: Transaction): string => tx.goalId ?? "";

/**
 * What is still open on one debt as of a date — the same figure the debts
 * screen shows for it.
 *
 * Between people that is the sum handed over less the sum repaid, floored at
 * zero because an overpayment settles a debt rather than reversing it.
 *
 * A loan is not that. Part of every instalment is the bank's interest, so
 * "borrowed less repaid" falls faster than the debt does: €10,000 at 7% over
 * five years, a year of €198.01 instalments in, is €8,291 still owed and not
 * the €7,624 the subtraction gives — net worth was flattered by the whole of
 * the interest paid so far. So a loan is read through `loanState`, which is
 * what `computeDebtStatus` gives the debts screen: the balance amortised from
 * the repayments made before the month closed, with interest accrued to
 * `accruedTo` — the month's end, or today for the month still running.
 */
function outstandingAt(debt: DebtWithStatus, at: Date, accruedTo: Date = at): number {
  if (firestoreToDate(debt.date) >= at) return 0;
  const madeBy = debt.payments.filter((payment) => firestoreToDate(payment.date) < at);

  if (isLoan(debt)) return loanState({ ...debt, payments: madeBy }, accruedTo)?.balance ?? 0;

  const repaid = madeBy.reduce((sum, payment) => sum + payment.amount, 0);
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
export function netWorthSeries(
  transactions: Transaction[],
  debts: DebtWithStatus[],
  /**
   * Where the cash is counted from. A list when the banks have been read more
   * than once: each month is counted from the latest reading before it closes,
   * so a month after a reading shows the truth, not a sum drifted from an older
   * starting point.
   */
  openings: OpeningBalance | OpeningBalance[] | undefined,
  from: Date,
  to: Date,
): NetWorthPoint[] {
  const anchors = openings === undefined ? [] : Array.isArray(openings) ? openings : [openings];
  const opening = anchors[0];
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

  // The starting point in force when a month closes: the latest one taken before.
  const inForce = (closes: Date): OpeningBalance | undefined => {
    let found = opening;
    for (const anchor of anchors) {
      const day = firestoreToDate(anchor.date);
      const from = anchor.at ?? new Date(day.getFullYear(), day.getMonth(), day.getDate());
      if (from < closes) found = anchor;
    }
    return found;
  };

  // What each goal or investment holds, carried from one month end to the next.
  //
  // A holding is never worth less than nothing. Taking €1,200 out of an
  // investment that €1,000 went into is €200 of gain, not a pot at -€200 — the
  // withdrawal form allows exactly that — and the whole €1,200 has already
  // arrived in the cash below. Summed as it stood, the -€200 cancelled the gain
  // and the net worth never moved. So each pot is floored at zero at every
  // month end, including the months before the window, and the floor is
  // carried: the gain was realised, and what goes in afterwards starts from an
  // empty pot. Month ends rather than each record, so a withdrawal entered a
  // day before the deposit it came out of — the same month, typed in the
  // wrong order — is not mistaken for a gain.
  const holdings = new Map<string, number>();
  const floorHoldings = () => {
    for (const [id, held] of holdings) holdings.set(id, Math.max(held, 0));
  };
  let heldMonth: number | undefined;
  let cursorIndex = 0;

  return months.map((start) => {
    const closes = endOfMonth(start);
    // A loan's interest in a month still running is accrued only to the
    // window's end — today, on both screens that draw this — not to a month end
    // that has not come, so the last point owes what the debts screen says.
    const accruedTo = closes > to ? to : closes;

    while (cursorIndex < sorted.length && firestoreToDate(sorted[cursorIndex].date) < closes) {
      // Money set aside before the opening date is still set aside: the opening
      // figure speaks for the cash account, not for the goals beside it.
      const tx = sorted[cursorIndex];
      const delta = savedDelta(tx);
      if (delta !== 0) {
        const date = firestoreToDate(tx.date);
        const month = date.getFullYear() * 12 + date.getMonth();
        // A month has closed since the last contribution: its pots are settled.
        if (heldMonth !== undefined && month > heldMonth) floorHoldings();
        heldMonth = month;
        holdings.set(holdingOf(tx), (holdings.get(holdingOf(tx)) ?? 0) + delta);
      }
      cursorIndex += 1;
    }

    floorHoldings();
    let saved = 0;
    for (const held of holdings.values()) saved += held;

    // Counted afresh each month from whichever starting point applies, rather
    // than carried forward: a reading replaces the running sum, it does not add
    // to it.
    const anchor = inForce(closes);
    let cash = anchor?.amount ?? 0;
    for (let i = 0; i < cursorIndex; i++) {
      if (affectsBalance(sorted[i], anchor)) cash += balanceDelta(sorted[i]);
    }

    let owedToMe = 0;
    let owedByMe = 0;
    for (const debt of debts) {
      const open = outstandingAt(debt, closes, accruedTo);
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
    .filter((tx) => tx.type === "expense" && !tx.isGoalTransaction && !tx.isInvestmentTransaction && !tx.debtId)
    .map((tx) => ({ amount: Math.abs(tx.amount), time: firestoreToDate(tx.date).getTime() }));

  const WINDOW = 3 * 24 * 60 * 60 * 1000;
  const claimed = new Set<number>();
  let matched = 0;
  let unmatched = 0;

  for (const debt of debts) {
    if (debt.direction !== "owed_by_me") continue;
    for (const payment of debt.payments) {
      // Paid from a card it names: the cash moved with it — see `syncDebtCash`.
      if (payment.accountId !== undefined) {
        matched += 1;
        continue;
      }
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
