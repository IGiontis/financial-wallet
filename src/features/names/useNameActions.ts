import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../../shared/hooks/useAuth";
import { useWorkspaceSetting } from "../../shared/hooks/useWorkspaceSetting";
import { exchangeRateKeys } from "../../shared/hooks/useCurrencyConverter";
import { confirmList, removeWhere } from "../../lib/listCache";
import { cleanLine } from "../../shared/utils/cleanText";
import { requireConnection } from "../../shared/utils/offlinePolicy";
import { mergeCategoriesEverywhere, renamePayeeEverywhere } from "../../firebase/names";
import { transactionKeys } from "../transactions/hooks/useTransactions";
import { billKeys } from "../bills/billCache";
import { INCOMES_KEY } from "../incomes/incomesUtils";
import { PLANNER_KEYS } from "../plannerPage/plannerInputs";
import type { Bill, Category, Transaction, User } from "../../shared/types/IndexTypes";
import type { CategoryMergePlan } from "./categoryMerge";

/**
 * A payee renamed on every record that carries it, or merged into another.
 * `ids` and `saved` are worked out on screen (`payeeRenameIds`,
 * `savedAfterRename`) and stated in the confirmation; this writes exactly
 * those, then puts the same change in the lists the app holds, so no read
 * follows.
 */
export function useRenamePayee() {
  const { currentUser } = useAuth();
  const queryClient = useQueryClient();
  const userId = currentUser?.uid ?? "";

  return useMutation({
    mutationFn: ({ ids, to, saved }: { ids: string[]; to: string; saved?: string[] }) => renamePayeeEverywhere(userId, ids, to, saved),
    onSuccess: (_written, { ids, to, saved }) => {
      const description = cleanLine(to);
      const set = new Set(ids);
      const now = new Date();
      confirmList<Transaction>(queryClient, transactionKeys.all(userId), (rows) => rows.map((row) => (set.has(row.id) ? { ...row, description, updatedAt: now } : row)));
      if (saved) queryClient.setQueryData<User | null>(exchangeRateKeys.user(userId), (old) => (old ? { ...old, savedPayees: saved } : old));
    },
  });
}

/**
 * One category merged into another. The incomes and Planner lines on the user
 * document move first, through their own settings (which keep the device copy
 * in step); then the transactions and bills, and the dropped categories last.
 */
export function useMergeCategories() {
  const { currentUser } = useAuth();
  const queryClient = useQueryClient();
  const userId = currentUser?.uid ?? "";
  const [, setIncomes] = useWorkspaceSetting<unknown[]>(INCOMES_KEY, []);
  const [, setLines] = useWorkspaceSetting<unknown[]>(PLANNER_KEYS.lines, []);

  return useMutation({
    mutationFn: async (plan: CategoryMergePlan) => {
      // Before anything is written: the setters below would queue offline.
      requireConnection("delete");
      if (plan.incomes) setIncomes(plan.incomes);
      if (plan.plannerLines) setLines(plan.plannerLines);
      return mergeCategoriesEverywhere(userId, plan);
    },
    onSuccess: (_written, plan) => {
      const now = new Date();
      const txTo = new Map(plan.transactions.map((m) => [m.id, m.to]));
      const billTo = new Map(plan.bills.map((m) => [m.id, m.to]));
      confirmList<Transaction>(queryClient, transactionKeys.all(userId), (rows) => rows.map((row) => (txTo.has(row.id) ? { ...row, categoryId: txTo.get(row.id)!, updatedAt: now } : row)));
      confirmList<Bill>(queryClient, billKeys.all(userId), (rows) => rows.map((row) => (billTo.has(row.id) ? { ...row, categoryId: billTo.get(row.id)!, updatedAt: now } : row)));
      confirmList<Category>(queryClient, transactionKeys.categories(userId), removeWhere((c) => plan.deleteIds.includes(c.id)));
    },
  });
}
