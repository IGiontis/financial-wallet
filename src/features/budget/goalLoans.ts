import type { DebtWithStatus, InvestmentGoalWithStats, Transaction } from "../../shared/types/IndexTypes";
import { firestoreToDate } from "../../shared/utils/dates";
import { coveredExpenses } from "./coveredLink";

/**
 * One loan someone took on to pay part of a goal, as the goal's delete sees it.
 *
 *   • `open`: nothing paid back, not settled — asked: still owed, or nothing is
 *     owed and it goes with the goal (debt, expense, deposit, its cash records).
 *   • `repaid`: some of it paid back already — stays, whatever becomes of the
 *     goal. Taking it back would delete the repayments too, and each of them
 *     moved a card: the balance would change for money that really left it.
 *   • `closed`: settled or let go of — history, nothing to ask.
 */
export interface GoalLoan {
  debtId: string;
  person: string;
  /** What they paid — the debt as written. */
  amount: number;
  /** Paid back so far, and what is still owed. */
  repaid: number;
  remaining: number;
  date: Date;
  /** The expense of what they paid, only if it is still there — see `coveredExpenses`. */
  expenseId?: string;
  state: "open" | "repaid" | "closed";
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/** The debt ids a goal's deposits carry: the stored link, there the moment the deposit is (`createCoveredFunding`). */
export const linkedDebtIds = (goal: Pick<InvestmentGoalWithStats, "covered">) => [...new Set((goal.covered ?? []).flatMap((c) => c.debtIds))];

/**
 * A goal's loans, found by their stored links — never by what happens to be on
 * screen or by their figures: the debt ids its deposits carry
 * (`contribution.debtId`, gathered into `goal.covered`), and any debt that
 * names the goal (`debt.forGoalId`). `debts` must hold every linked one that
 * exists — the caller reads from the server whatever its list lacks
 * (`useGoalLoans`); a linked id not in it was deleted and is not asked about.
 *
 * The expense is the one the debt names (`coveredExpenseId`); a debt written
 * before that link existed is matched to its expense by what both were written
 * with — the same amount, the same day, the goal's name (`coveredExpenses`,
 * worked out over every debt at once so no two claim one expense). Only an
 * expense still there is named: deleting a missing one fails the whole write.
 *
 * In a fixed order — the day, then the id — so the same person's two loans are
 * always asked about in the same order.
 */
export function goalLoans(goal: Pick<InvestmentGoalWithStats, "id" | "name" | "covered">, debts: DebtWithStatus[], transactions: Transaction[]): GoalLoan[] {
  const linked = new Set(linkedDebtIds(goal));
  const ours = debts.filter((d) => d.direction === "owed_by_me" && (linked.has(d.id) || d.forGoalId === goal.id));
  const ourIds = new Set(ours.map((d) => d.id));
  const expenses = coveredExpenses(debts, transactions, (debt) => (ourIds.has(debt.id) ? goal.name : undefined));
  return ours
    .map((debt): GoalLoan => {
      const state = debt.isSettled || debt.forgiven ? "closed" : debt.payments.length > 0 ? "repaid" : "open";
      return {
        debtId: debt.id,
        person: debt.person,
        amount: round2(debt.amount),
        repaid: round2(debt.paid),
        remaining: round2(debt.remaining),
        date: firestoreToDate(debt.date),
        expenseId: expenses.get(debt.id),
        state,
      };
    })
    .sort((a, b) => a.date.getTime() - b.date.getTime() || (a.debtId < b.debtId ? -1 : a.debtId > b.debtId ? 1 : 0));
}

/** The owner's answer for one open loan: still owed, or nothing owed — erase it with the goal. */
export type LoanAnswer = "kept" | "erase";
