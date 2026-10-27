import { isSameDay } from "date-fns";
import { firestoreToDate } from "../../shared/utils/dates";
import type { DebtWithStatus, InvestmentGoalWithStats, Transaction } from "../../shared/types/IndexTypes";

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
 * with — the same amount, the same day, the goal's name. Only an expense still
 * there is named, since deleting a missing one fails the whole write.
 */
export function coveredRefunds(goal: Pick<InvestmentGoalWithStats, "name" | "covered">, debts: DebtWithStatus[], transactions: Transaction[]): CoveredRefund[] {
  const taken = new Set<string>();
  const expenseOf = (debt: DebtWithStatus): string | undefined => {
    if (debt.coveredExpenseId) return transactions.some((t) => t.id === debt.coveredExpenseId) ? debt.coveredExpenseId : undefined;
    const day = firestoreToDate(debt.date);
    const match = transactions.find(
      (t) => !taken.has(t.id) && t.type === "expense" && !t.debtId && Math.abs(t.amount - debt.amount) < 0.005 && t.description === (debt.label || goal.name) && isSameDay(firestoreToDate(t.date), day),
    );
    if (match) taken.add(match.id);
    return match?.id;
  };

  return (goal.covered ?? []).flatMap((c) => {
    const items = c.debtIds.flatMap((id) => {
      const debt = debts.find((d) => d.id === id);
      if (!debt || debt.isSettled || debt.payments.length > 0) return [];
      return [{ debtId: debt.id, expenseId: expenseOf(debt), amount: round2(debt.remaining) }];
    });
    return items.length ? [{ person: c.person, amount: round2(items.reduce((sum, i) => sum + i.amount, 0)), items }] : [];
  });
}
