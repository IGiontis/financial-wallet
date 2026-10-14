import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../../shared/hooks/useAuth";
import { createDebt, createDebtPayment, deleteDebt, deleteDebtPayment, editDebt, getDebtPayments, getDebts, syncDebtCash, updateDebt, updateDebtPayment } from "../../firebase/firestore";
import { transactionKeys } from "../transactions/hooks/useTransactions";
import { allDebtCashIds, debtCashIds, debtCashRecords, type DebtCashRecord } from "./debtCash";
import { confirmList } from "../../lib/listCache";
import { computeDebtStatus } from "./debtsUtils";
import type { CreateDebtDTO, CreateDebtPaymentDTO, DebtWithStatus, Transaction, UpdateDebtDTO } from "../../shared/types/IndexTypes";

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
 * repayment corrected in March fixes April's interest too. The transactions
 * on screen are then corrected to match, in place: re-reading the whole list
 * to learn what this device has just written cost every record again.
 */
function useDebtRefresh() {
  const { currentUser } = useAuth();
  const queryClient = useQueryClient();
  const userId = currentUser?.uid ?? "";

  return useMemo(() => {
    const key = transactionKeys.all(userId);
    /** Of these ids, the ones this device knows exist; all of them when the list is not loaded. */
    const existing = (ids: string[]) => {
      const rows = queryClient.getQueryData<Transaction[]>(key);
      return rows ? ids.filter((id) => rows.some((row) => row.id === id)) : ids;
    };
    /** The written records in, the removed ones out — the list as the server now holds it. */
    const patchTransactions = (records: DebtCashRecord[], removed: string[]) => {
      const gone = new Set(removed);
      const written = new Map(records.map((record) => [record.id, { ...record, userId, updatedAt: new Date() } as unknown as Transaction]));
      confirmList<Transaction>(queryClient, key, (rows) => [...rows.filter((row) => !gone.has(row.id) && !written.has(row.id)), ...written.values()]);
    };
    return {
      userId,
      refresh: () => void queryClient.invalidateQueries({ queryKey: debtKeys.all(userId) }),
      /** Re-reads the debts, then writes this one's money again, clearing `alsoRemove` with it. */
      sync: async (debtId: string, alsoRemove: string[] = []) => {
        const debts = await queryClient.fetchQuery<DebtWithStatus[]>({ queryKey: debtKeys.all(userId), staleTime: 0 });
        const debt = debts.find((d) => d.id === debtId);
        const { records, remove } = debt ? debtCashRecords(debt) : { records: [], remove: [] };
        const removing = [...new Set([...remove, ...alsoRemove])];
        await syncDebtCash(userId, records, removing, existing(removing));
        patchTransactions(records, removing);
      },
      /** The debt is gone: everything it and its repayments wrote goes with it. */
      clear: async (ids: string[]) => {
        await syncDebtCash(userId, [], ids, existing(ids));
        void queryClient.invalidateQueries({ queryKey: debtKeys.all(userId) });
        patchTransactions([], ids);
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
    mutationFn: ({ paymentId, amount, date, accountId }: { paymentId: string; debtId: string; amount: number; date: Date; accountId?: string | null }) => updateDebtPayment(paymentId, { amount, date, accountId }),
    onSuccess: (_, { debtId }) => sync(debtId),
  });
}
