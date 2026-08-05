import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../../shared/hooks/useAuth";
import { getBills, createBill, updateBill, deleteBill, getBillPayments, markBillPaid, unmarkBillPaid } from "../../firebase/firestore";
import { computeBillStatus } from "./billsUtils";
import { transactionKeys } from "../transactions/hooks/useTransactions";
import type { BillWithStatus, CreateBillDTO, UpdateBillDTO } from "../../shared/types/IndexTypes";

// ─── Query keys ───────────────────────────────────────────────────────────────

export const billKeys = {
  all: (userId: string) => ["bills", userId] as const,
};

// ─── useBills ─────────────────────────────────────────────────────────────────

export function useBills() {
  const { currentUser } = useAuth();
  const userId = currentUser?.uid ?? "";

  return useQuery<BillWithStatus[]>({
    queryKey: billKeys.all(userId),
    enabled: !!userId,
    queryFn: async () => {
      const [bills, payments] = await Promise.all([getBills(userId), getBillPayments(userId)]);
      const now = new Date();
      return bills
        .map((bill) => computeBillStatus(bill, payments, now))
        .sort((a, b) => Number(a.isPaidThisPeriod) - Number(b.isPaidThisPeriod) || a.name.localeCompare(b.name));
    },
  });
}

// ─── useCreateBill ────────────────────────────────────────────────────────────

export function useCreateBill() {
  const { currentUser } = useAuth();
  const queryClient = useQueryClient();
  const userId = currentUser?.uid ?? "";

  return useMutation({
    mutationFn: (data: CreateBillDTO) => createBill(userId, data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: billKeys.all(userId) }),
  });
}

// ─── useUpdateBill ────────────────────────────────────────────────────────────

export function useUpdateBill() {
  const { currentUser } = useAuth();
  const queryClient = useQueryClient();
  const userId = currentUser?.uid ?? "";

  return useMutation({
    mutationFn: ({ billId, data }: { billId: string; data: UpdateBillDTO }) => updateBill(billId, data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: billKeys.all(userId) }),
  });
}

// ─── useDeleteBill ────────────────────────────────────────────────────────────

export function useDeleteBill() {
  const { currentUser } = useAuth();
  const queryClient = useQueryClient();
  const userId = currentUser?.uid ?? "";

  return useMutation({
    mutationFn: (billId: string) => deleteBill(billId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: billKeys.all(userId) }),
  });
}

// ─── useMarkBillPaid ──────────────────────────────────────────────────────────
// Also invalidates transactions — paying a bill creates a mirrored expense.

export function useMarkBillPaid() {
  const { currentUser } = useAuth();
  const queryClient = useQueryClient();
  const userId = currentUser?.uid ?? "";

  return useMutation({
    // `paidAmount` carries the real figure for variable bills (electricity, water).
    mutationFn: ({ bill, paidDate, paidAmount }: { bill: BillWithStatus; paidDate: Date; paidAmount?: number }) =>
      markBillPaid(userId, { id: bill.id, name: bill.name, amount: bill.amount, categoryId: bill.categoryId }, bill.currentPeriodKey, paidDate, paidAmount),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: billKeys.all(userId) }),
        queryClient.invalidateQueries({ queryKey: transactionKeys.all(userId) }),
      ]);
    },
  });
}

// ─── useUnmarkBillPaid ────────────────────────────────────────────────────────

export function useUnmarkBillPaid() {
  const { currentUser } = useAuth();
  const queryClient = useQueryClient();
  const userId = currentUser?.uid ?? "";

  return useMutation({
    mutationFn: ({ paymentId, transactionId }: { paymentId: string; transactionId?: string }) => unmarkBillPaid({ id: paymentId, transactionId }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: billKeys.all(userId) }),
        queryClient.invalidateQueries({ queryKey: transactionKeys.all(userId) }),
      ]);
    },
  });
}
