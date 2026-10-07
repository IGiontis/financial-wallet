import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../../shared/hooks/useAuth";
import { createDebt, createDebtPayment, deleteDebt, deleteDebtPayment, editDebt, getDebtPayments, getDebts, syncDebtCash, updateDebt, updateDebtPayment } from "../../firebase/firestore";
import { transactionKeys } from "../transactions/hooks/useTransactions";
import { allDebtCashIds, debtCashIds, debtCashRecords } from "./debtCash";
import { computeDebtStatus } from "./debtsUtils";
import type { CreateDebtDTO, CreateDebtPaymentDTO, DebtWithStatus, UpdateDebtDTO } from "../../shared/types/IndexTypes";

export const debtKeys = {
  all: (userId: string) => ["debts", userId] as const,
};

/**
 * Loans and their repayments in one query.
 *
 * Both collections are small and always read together — a loan without its
 * repayments has no balance — so they are fetched as a pair and paired up here
 * rather than leaving every screen to do it.
 */
export function useDebts() {
  const { currentUser } = useAuth();
  const userId = currentUser?.uid ?? "";

  const query = useQuery<DebtWithStatus[]>({
    queryKey: debtKeys.all(userId),
    enabled: !!userId,
    queryFn: async () => {
      const [debts, payments] = await Promise.all([getDebts(userId), getDebtPayments(userId)]);
      return debts.map((debt) => computeDebtStatus(debt, payments));
    },
  });

  return query;
}

/**
 * Every write here ends by refreshing the debts and putting the money they
 * moved right: the transactions a debt writes through its card (see
 * `debtCashRecords`) are rewritten from the debt as it now stands, so a
 * repayment corrected in March fixes April's interest too. Then the
 * transactions are refreshed, which is what every card reads.
 */
function useDebtRefresh() {
  const { currentUser } = useAuth();
  const queryClient = useQueryClient();
  const userId = currentUser?.uid ?? "";

  return useMemo(() => {
    const refreshTransactions = () => void queryClient.invalidateQueries({ queryKey: transactionKeys.all(userId) });
    return {
      userId,
      refresh: () => void queryClient.invalidateQueries({ queryKey: debtKeys.all(userId) }),
      /** Re-reads the debts, then writes this one's money again, clearing `alsoRemove` with it. */
      sync: async (debtId: string, alsoRemove: string[] = []) => {
        const debts = await queryClient.fetchQuery<DebtWithStatus[]>({ queryKey: debtKeys.all(userId), staleTime: 0 });
        const debt = debts.find((d) => d.id === debtId);
        const { records, remove } = debt ? debtCashRecords(debt) : { records: [], remove: [] };
        await syncDebtCash(userId, records, [...new Set([...remove, ...alsoRemove])]);
        refreshTransactions();
      },
      /** The debt is gone: everything it and its repayments wrote goes with it. */
      clear: async (ids: string[]) => {
        await syncDebtCash(userId, [], ids);
        void queryClient.invalidateQueries({ queryKey: debtKeys.all(userId) });
        refreshTransactions();
      },
    };
  }, [queryClient, userId]);
}

export function useCreateDebt() {
  const { userId, sync } = useDebtRefresh();
  return useMutation({ mutationFn: (data: CreateDebtDTO) => createDebt(userId, data), onSuccess: (id) => sync(id) });
}

export function useUpdateDebt() {
  const { sync } = useDebtRefresh();
  return useMutation({ mutationFn: ({ debtId, data }: { debtId: string; data: UpdateDebtDTO }) => updateDebt(debtId, data), onSuccess: (_, { debtId }) => sync(debtId) });
}

/** The whole loan form saved over an existing loan — see `editDebt`. */
export function useEditDebt() {
  const { sync } = useDebtRefresh();
  return useMutation({ mutationFn: ({ debtId, data }: { debtId: string; data: CreateDebtDTO }) => editDebt(debtId, data), onSuccess: (_, { debtId }) => sync(debtId) });
}

export function useDeleteDebt() {
  const { clear } = useDebtRefresh();
  return useMutation({
    mutationFn: ({ debtId, paymentIds }: { debtId: string; paymentIds: string[] }) => deleteDebt(debtId, paymentIds),
    onSuccess: (_, { debtId, paymentIds }) => clear(allDebtCashIds(debtId, paymentIds)),
  });
}

export function useRecordRepayment() {
  const { userId, sync } = useDebtRefresh();
  return useMutation({ mutationFn: (data: CreateDebtPaymentDTO) => createDebtPayment(userId, data), onSuccess: (_, data) => sync(data.debtId) });
}

/** Deleting a repayment: its own records go, and the loan's later interest is worked out again. */
export function useDeleteRepayment() {
  const { sync } = useDebtRefresh();
  return useMutation({
    mutationFn: ({ paymentId }: { paymentId: string; debtId: string }) => deleteDebtPayment(paymentId),
    onSuccess: (_, { paymentId, debtId }) => sync(debtId, [debtCashIds.principal(paymentId), debtCashIds.interest(paymentId)]),
  });
}

export function useUpdateRepayment() {
  const { sync } = useDebtRefresh();
  return useMutation({
    mutationFn: ({ paymentId, amount, date, accountId }: { paymentId: string; debtId: string; amount: number; date: Date; accountId?: string }) => updateDebtPayment(paymentId, { amount, date, accountId }),
    onSuccess: (_, { debtId }) => sync(debtId),
  });
}
