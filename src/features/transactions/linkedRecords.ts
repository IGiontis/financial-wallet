import { coveredExpenses } from "../budget/coveredLink";
import type { Debt, InvestmentGoal, Transaction } from "../../shared/types/IndexTypes";

// A transaction that is one half of a linked set — written together with
// another record and kept in step with it — is not changed or deleted on its
// own from the Transactions page. Changed alone, the other half would say
// something else: a debt of 550 over an expense of 400, a transfer whose two
// halves move different sums.

/**
 * Why a record can't be changed freely here, and where it is changed instead.
 *
 * - `goal`: a goal's or an investment's mirror — changed from the goal.
 * - `transfer`: one half of a transfer — the pair is changed and deleted together.
 * - `debt`: the cash a loan moved through a card — changed from the debt.
 * - `covered`: the expense of what a friend paid toward a goal (see
 *   `coveredExpenses`). Its amount, date, card and type follow the debt; the
 *   payee and notes are its own, unless the debt finds it only by its figures
 *   — then the payee is one of them and stays too.
 * - `business`: the profit (or loss) of a «Κλείσιμο ημέρας» on the «Δουλειά»
 *   page — changed and deleted from there, with its business half.
 */
export type RecordLock =
  | { kind: "goal" }
  | { kind: "transfer"; transferId: string }
  | { kind: "debt"; debtId: string; person?: string }
  | { kind: "covered"; debtId: string; person: string; payeeLocked: boolean }
  | { kind: "business"; entryId: string };

export interface CoveredExpense {
  debtId: string;
  person: string;
  /** The debt names this expense (`coveredExpenseId`); otherwise it is found by its figures. */
  named: boolean;
}

type DebtLike = Pick<Debt, "id" | "person" | "forGoalId" | "coveredExpenseId" | "amount" | "date" | "label">;

/** Every covered expense on the device, by its id → the debt it belongs to. */
export function coveredExpenseIndex(debts: DebtLike[], transactions: Transaction[], goals: Pick<InvestmentGoal, "id" | "name">[]): Map<string, CoveredExpense> {
  const out = new Map<string, CoveredExpense>();
  const covered = debts.filter((d) => d.forGoalId);
  if (covered.length === 0) return out;
  const byDebt = coveredExpenses(covered, transactions, (d) => goals.find((g) => g.id === d.forGoalId)?.name);
  for (const debt of covered) {
    const expenseId = byDebt.get(debt.id);
    if (expenseId) out.set(expenseId, { debtId: debt.id, person: debt.person, named: debt.coveredExpenseId === expenseId });
  }
  return out;
}

/**
 * Could this record be a covered expense? Only a plain expense can — so for
 * every other one the lock is known without the debts.
 */
export const mayBeCovered = (tx: Transaction) => tx.type === "expense" && !tx.transferId && !tx.debtId && !tx.goalId && !tx.isGoalTransaction && !tx.isInvestmentTransaction && !tx.businessEntryId;

export function recordLock(tx: Transaction, covered: Map<string, CoveredExpense>, debts: Pick<Debt, "id" | "person">[] = []): RecordLock | undefined {
  if (tx.isGoalTransaction || tx.isInvestmentTransaction) return { kind: "goal" };
  if (tx.transferId) return { kind: "transfer", transferId: tx.transferId };
  // A debt's money kept when the debt was deleted from «Αρχείο» is an ordinary record now.
  if (tx.debtId && !tx.debtKept) return { kind: "debt", debtId: tx.debtId, person: debts.find((d) => d.id === tx.debtId)?.person };
  if (tx.businessEntryId) return { kind: "business", entryId: tx.businessEntryId };
  const c = covered.get(tx.id);
  if (c) return { kind: "covered", debtId: c.debtId, person: c.person, payeeLocked: !c.named };
  return undefined;
}

/** Nothing about it can be changed here: edit and delete both live elsewhere. */
export const isFullyLocked = (lock: RecordLock | undefined) => lock?.kind === "goal" || lock?.kind === "debt" || lock?.kind === "business";
