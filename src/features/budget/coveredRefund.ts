import type { DebtWithStatus, InvestmentGoalWithStats, Transaction } from "../../shared/types/IndexTypes";
import { coveredExpenses } from "./coveredLink";

/** One debt to call off, and the expense written beside it, if it is still there. */
export interface RefundItem {
  debtId: string;
  expenseId?: string;
  amount: number;
}

/** What one person paid of a goal that can be called off with it. */
export interface CoveredRefund {
  person: string;
  amount: number;
  items: RefundItem[];
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * For a goal being deleted: each person who paid part of it, whose debt can be
 * called off because what it paid for was cancelled and refunded to them.
 *
 * Only a debt still owed in full: once some of it has been paid back, a refund
 * to them is money they owe you, which is a different thing to say.
 *
 * The expense is the one the debt names (`coveredExpenseId`); a debt written
 * before that link existed is matched to its expense by what both were written
 * with — the same amount, the same day, the goal's name (see `coveredExpenses`:
 * compared as a reader would, so a trailing space typed into the goal's name
 * does not leave the expense behind, and worked out over every debt at once, so
 * no two claim one expense). Only an expense still there is named, since
 * deleting a missing one fails the whole write.
 */
export function coveredRefunds(goal: Pick<InvestmentGoalWithStats, "name" | "covered">, debts: DebtWithStatus[], transactions: Transaction[]): CoveredRefund[] {
  const ours = new Set((goal.covered ?? []).flatMap((c) => c.debtIds));
  const expenses = coveredExpenses(debts, transactions, (debt) => (ours.has(debt.id) ? goal.name : undefined));

  return (goal.covered ?? []).flatMap((c) => {
    const items = c.debtIds.flatMap((id) => {
      const debt = debts.find((d) => d.id === id);
      if (!debt || debt.isSettled || debt.payments.length > 0) return [];
      return [{ debtId: debt.id, expenseId: expenses.get(debt.id), amount: round2(debt.remaining) }];
    });
    return items.length ? [{ person: c.person, amount: round2(items.reduce((sum, i) => sum + i.amount, 0)), items }] : [];
  });
}
