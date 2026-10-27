import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../../shared/hooks/useAuth";
import { createCoveredFunding, newDocId } from "../../firebase/firestore";
import { investmentKeys } from "./useInvestments";
import { useDebtRefresh } from "../debts/useDebts";
import { insertTransaction, transactionKeys } from "../transactions/hooks/useTransactions";
import { confirmList, editList, idsFor, restoreList, upsertById, withoutUndefined, type ListSnapshot } from "../../lib/listCache";
import type { InvestmentContribution, Transaction } from "../../shared/types/IndexTypes";
import type { CoveredFundingVars } from "./coveredFunding";

export type { CoveredFundingVars } from "./coveredFunding";

/** One set of ids per save, shared by the rows on screen and the write — see `idsFor`. */
const fundingIds = new WeakMap<CoveredFundingVars, { contributionId: string; debtId: string; expenseId: string }>();

interface Context {
  contribution: InvestmentContribution;
  expense: Transaction;
  contributions: ListSnapshot<InvestmentContribution>;
  transactions: ListSnapshot<Transaction>;
}

/**
 * "Someone paid it for me", saved: the goal's contribution, the debt to them and
 * the expense — see `createCoveredFunding`. The goal and the expense are on
 * screen at once; the debt's money follows through the debts' own sync.
 */
export function useCoveredFunding() {
  const { currentUser } = useAuth();
  const queryClient = useQueryClient();
  const userId = currentUser?.uid ?? "";
  const { sync, refresh } = useDebtRefresh();
  const idsOf = (vars: CoveredFundingVars) =>
    idsFor(fundingIds, vars, () => ({ contributionId: newDocId("investmentContributions"), debtId: newDocId("debts"), expenseId: newDocId("transactions") }));

  return useMutation<unknown, Error, CoveredFundingVars, Context>({
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
      return {
        contribution,
        expense,
        contributions: await editList(queryClient, investmentKeys.contributions(userId), upsertById(contribution)),
        transactions: await editList(queryClient, transactionKeys.all(userId), insertTransaction(expense)),
      };
    },
    onError: (_error, _vars, context) => {
      restoreList(queryClient, context?.contributions);
      restoreList(queryClient, context?.transactions);
    },
    onSuccess: (_ids, _vars, context) => {
      if (!context) return;
      confirmList(queryClient, investmentKeys.contributions(userId), upsertById(context.contribution));
      confirmList(queryClient, transactionKeys.all(userId), insertTransaction(context.expense));
      refresh();
    },
  });
}
