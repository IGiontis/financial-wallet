import type { Transaction } from "../../shared/types/IndexTypes";
import { isMoneyMove } from "../../shared/utils/moneyModel";

// What the Transactions page counts as money in and money out — the one rule
// its filter totals, the phone's summary, the day headings and the calendar
// tab all add up by, so the month on the calendar and the same month on the
// list can never say two different things.
//
// Deposits into goals and investments are left out (the money is still yours,
// set aside); taking money back out of one counts as money in, as on the
// Overview. A transfer between your own cards, or a loan's cash, moved money
// from one account to another and is neither.

/** Which side of the totals a record counts on — `null` for one that only moved money. */
export type TotalsSide = "in" | "out" | null;

export function totalsSide(tx: Transaction): TotalsSide {
  if (tx.isInvestmentTransaction) return tx.contributionType === "withdrawal" ? "in" : null;
  // A loan or a transfer moved a card; it did not come in or go out.
  if (isMoneyMove(tx)) return null;
  return tx.type === "income" ? "in" : "out";
}

export interface FilterTotals {
  earned: number;
  spent: number;
  net: number;
  count: number;
}

export function computeFilterTotals(transactions: Transaction[]): FilterTotals {
  let earned = 0;
  let spent = 0;

  for (const tx of transactions) {
    const side = totalsSide(tx);
    if (side === "in") earned += tx.amount;
    else if (side === "out") spent += Math.abs(tx.amount);
  }

  return { earned, spent, net: earned - spent, count: transactions.length };
}
