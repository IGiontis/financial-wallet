import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../../shared/hooks/useAuth";
import { createDebt, createDebtPayment, deleteDebt, deleteDebtPayment, getDebtPayments, getDebts, updateDebt } from "../../firebase/firestore";
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

/** Every write here refetches without blocking — see `useTransactions` for why. */
function useDebtRefresh() {
  const { currentUser } = useAuth();
  const queryClient = useQueryClient();
  const userId = currentUser?.uid ?? "";

  return useMemo(() => ({ userId, refresh: () => void queryClient.invalidateQueries({ queryKey: debtKeys.all(userId) }) }), [queryClient, userId]);
}

export function useCreateDebt() {
  const { userId, refresh } = useDebtRefresh();
  return useMutation({ mutationFn: (data: CreateDebtDTO) => createDebt(userId, data), onSuccess: refresh });
}

export function useUpdateDebt() {
  const { refresh } = useDebtRefresh();
  return useMutation({ mutationFn: ({ debtId, data }: { debtId: string; data: UpdateDebtDTO }) => updateDebt(debtId, data), onSuccess: refresh });
}

export function useDeleteDebt() {
  const { refresh } = useDebtRefresh();
  return useMutation({ mutationFn: ({ debtId, paymentIds }: { debtId: string; paymentIds: string[] }) => deleteDebt(debtId, paymentIds), onSuccess: refresh });
}

export function useRecordRepayment() {
  const { userId, refresh } = useDebtRefresh();
  return useMutation({ mutationFn: (data: CreateDebtPaymentDTO) => createDebtPayment(userId, data), onSuccess: refresh });
}

export function useDeleteRepayment() {
  const { refresh } = useDebtRefresh();
  return useMutation({ mutationFn: (paymentId: string) => deleteDebtPayment(paymentId), onSuccess: refresh });
}
