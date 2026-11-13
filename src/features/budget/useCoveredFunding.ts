import { useQueryClient } from "@tanstack/react-query";
import { sameCall, useOnceMutation } from "../../shared/hooks/useOnceMutation";
import { useAuth } from "../../shared/hooks/useAuth";
import { createCoveredFunding, newDocId } from "../../firebase/firestore";
import { investmentKeys } from "./useInvestments";
import { debtKeys, useDebtRefresh } from "../debts/useDebts";
import { computeDebtStatus } from "../debts/debtsUtils";
import { insertTransaction, transactionKeys } from "../transactions/hooks/useTransactions";
import { confirmList, editList, idsFor, restoreList, upsertById, withoutUndefined, type ListSnapshot } from "../../lib/listCache";
import type { Debt, DebtWithStatus, InvestmentContribution, Transaction } from "../../shared/types/IndexTypes";
import type { CoveredFundingVars } from "./coveredFunding";

export type { CoveredFundingVars } from "./coveredFunding";

/** Every covered-funding save carries this key, so a goal's delete can wait for one in flight (`useGoalLoans`). */
export const coveredFundingKey = ["coveredFunding"] as const;

/** One set of ids per save, shared by the rows on screen and the write — see `idsFor`. */
const fundingIds = new WeakMap<CoveredFundingVars, { contributionId: string; debtId: string; expenseId: string }>();

interface Context {
  contribution: InvestmentContribution;
  expense: Transaction;
  debt: DebtWithStatus;
  contributions: ListSnapshot<InvestmentContribution>;
  transactions: ListSnapshot<Transaction>;
  debts: ListSnapshot<DebtWithStatus>;
}

/**
 * "Someone paid it for me", saved: the goal's contribution, the debt to them and
 * the expense — see `createCoveredFunding`. All three are on screen at once —
 * the debt too, or a goal deleted the moment after found its deposit but not
 * the debt it names, and left the debt without asking (`useGoalLoans`). The
 * debt's money follows through the debts' own sync.
 */
export function useCoveredFunding() {
  const { currentUser } = useAuth();
  const queryClient = useQueryClient();
  const userId = currentUser?.uid ?? "";
  const { sync, refresh } = useDebtRefresh();
  const idsOf = (vars: CoveredFundingVars) =>
    idsFor(fundingIds, vars, () => ({ contributionId: newDocId("investmentContributions"), debtId: newDocId("debts"), expenseId: newDocId("transactions") }));

  return useOnceMutation<unknown, Error, CoveredFundingVars, Context>({
    onceBy: sameCall,
    mutationKey: coveredFundingKey,
    mutationFn: async (vars) => {
      const ids = idsOf(vars);
      await createCoveredFunding(userId, ids, vars);
      // The debt is saved; its money is the second write, and a failure of it is
      // said by the sync rather than thrown — see `useDebtRefresh`.
      await sync(ids.debtId);
      return ids;
    },
    onMutate: async (vars) => {
      const ids = idsOf(vars);
      const now = new Date();
      const contribution = { ...withoutUndefined(vars.contribution), debtId: ids.debtId, id: ids.contributionId, userId, createdAt: now, updatedAt: now } as InvestmentContribution;
      const expense = { ...withoutUndefined(vars.expense), id: ids.expenseId, userId, createdAt: now, updatedAt: now } as Transaction;
      const debt = computeDebtStatus({ ...withoutUndefined(vars.debt), id: ids.debtId, userId, coveredExpenseId: ids.expenseId, createdAt: now, updatedAt: now } as Debt, []);
      return {
        contribution,
        expense,
        debt,
        contributions: await editList(queryClient, investmentKeys.contributions(userId), upsertById(contribution)),
        transactions: await editList(queryClient, transactionKeys.all(userId), insertTransaction(expense)),
        debts: await editList(queryClient, debtKeys.all(userId), upsertById(debt)),
      };
    },
    onError: (_error, _vars, context) => {
      restoreList(queryClient, context?.contributions);
      restoreList(queryClient, context?.transactions);
      restoreList(queryClient, context?.debts);
    },
    onSuccess: (_ids, _vars, context) => {
      if (!context) return;
      confirmList(queryClient, investmentKeys.contributions(userId), upsertById(context.contribution));
      confirmList(queryClient, transactionKeys.all(userId), insertTransaction(context.expense));
      refresh();
    },
  });
}
