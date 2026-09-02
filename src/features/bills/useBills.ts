import { useQuery, useMutation, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { useAuth } from "../../shared/hooks/useAuth";
import { getBills, createBill, updateBill, deleteBill, getBillPayments, markBillPaid, unmarkBillPaid, updateBillPayment } from "../../firebase/firestore";
import { computeBillStatus } from "./billsUtils";
import { transactionKeys } from "../transactions/hooks/useTransactions";
import type { BillPayment, BillWithStatus, CreateBillDTO, UpdateBillDTO } from "../../shared/types/IndexTypes";

// ─── Query keys ───────────────────────────────────────────────────────────────

export const billKeys = {
  all: (userId: string) => ["bills", userId] as const,
};

// ─── Optimistic payment edits ─────────────────────────────────────────────────
//
// Marking a bill paid writes to Firestore, and `writeBatch.commit()` only
// settles once the server has acknowledged it. With no offline persistence
// configured that promise simply never resolves on a dropped connection, so a
// UI that waits for it waits for ever — which is what "the app freezes" was.
//
// So the cache is updated first and the write is left to catch up. The screen
// answers immediately, and a write that fails is rolled back with a message
// rather than being silently believed.

/** Unpaid first, then by name — the order `useBills` hands to the page. */
const byUrgency = (a: BillWithStatus, b: BillWithStatus) => Number(a.isPaidThisPeriod) - Number(b.isPaidThisPeriod) || a.name.localeCompare(b.name);

/**
 * Re-derives every bill's status from an edited payment list.
 *
 * Deliberately routed back through `computeBillStatus` rather than patching the
 * flags by hand: "paid" pulls a dozen derived fields with it, and a shortcut
 * here would drift from what a refetch produces.
 */
function applyPayments(bills: BillWithStatus[], edit: (payments: BillPayment[]) => BillPayment[]): BillWithStatus[] {
  const now = new Date();
  const payments = edit(bills.flatMap((b) => b.payments));
  return bills.map((bill) => computeBillStatus(bill, payments, now)).sort(byUrgency);
}

/** Swaps in an edited list and hands back the old one to roll back to. */
function patchBills(queryClient: QueryClient, userId: string, edit: (payments: BillPayment[]) => BillPayment[]) {
  const key = billKeys.all(userId);
  const previous = queryClient.getQueryData<BillWithStatus[]>(key);
  if (previous) queryClient.setQueryData<BillWithStatus[]>(key, applyPayments(previous, edit));
  return previous;
}

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
      return bills.map((bill) => computeBillStatus(bill, payments, now)).sort(byUrgency);
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

export interface MarkPaidVars {
  bill: BillWithStatus;
  paidDate: Date;
  paidAmount?: number;
  periodKey?: string;
  /** Which instalment of the period this settles. Defaults to the next one owed. */
  installmentIndex?: number;
}

export function useMarkBillPaid() {
  const { currentUser } = useAuth();
  const queryClient = useQueryClient();
  const userId = currentUser?.uid ?? "";

  return useMutation({
    // `paidAmount` carries the real figure for variable bills (electricity, water).
    // `periodKey` defaults to the period we're in, but can name a later one when
    // the user settles a bill ahead of time.
    mutationFn: ({ bill, paidDate, paidAmount, periodKey, installmentIndex }: MarkPaidVars) =>
      markBillPaid(
        userId,
        { id: bill.id, name: bill.name, amount: bill.amount, categoryId: bill.categoryId },
        periodKey ?? bill.currentPeriodKey,
        paidDate,
        paidAmount,
        installmentIndex,
      ),

    onMutate: async ({ bill, paidDate, paidAmount, periodKey, installmentIndex }: MarkPaidVars) => {
      // Stop an in-flight refetch from landing on top of the optimistic state
      // and flipping the row back for a moment.
      await queryClient.cancelQueries({ queryKey: billKeys.all(userId) });

      // A stand-in id until the real document comes back. Nothing keys off it
      // beyond the rollback below, and the refetch in `onSettled` replaces it.
      const pending: BillPayment = {
        id: `pending-${Date.now()}`,
        userId,
        billId: bill.id,
        periodKey: periodKey ?? bill.currentPeriodKey,
        installmentIndex,
        amount: paidAmount ?? bill.amount,
        paidDate,
        createdAt: new Date(),
      };

      return { previous: patchBills(queryClient, userId, (payments) => [...payments, pending]) };
    },

    onError: (_error, _vars, context) => {
      if (context?.previous) queryClient.setQueryData(billKeys.all(userId), context.previous);
    },

    // Settled, not success: a rolled-back failure still needs the server's own
    // answer rather than whatever the cache was left holding.
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: billKeys.all(userId) });
      void queryClient.invalidateQueries({ queryKey: transactionKeys.all(userId) });
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

    onMutate: async ({ paymentId }: { paymentId: string; transactionId?: string }) => {
      await queryClient.cancelQueries({ queryKey: billKeys.all(userId) });
      return { previous: patchBills(queryClient, userId, (payments) => payments.filter((p) => p.id !== paymentId)) };
    },

    onError: (_error, _vars, context) => {
      if (context?.previous) queryClient.setQueryData(billKeys.all(userId), context.previous);
    },

    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: billKeys.all(userId) });
      void queryClient.invalidateQueries({ queryKey: transactionKeys.all(userId) });
    },
  });
}

// ─── useUpdateBillPayment ─────────────────────────────────────────────────────

export interface UpdatePaymentVars {
  paymentId: string;
  transactionId?: string;
  amount?: number;
  paidDate?: Date;
}

/**
 * Corrects one recorded payment. Optimistic for the same reason as the two
 * above: the write may never settle, and the screen should not wait on it.
 */
export function useUpdateBillPayment() {
  const { currentUser } = useAuth();
  const queryClient = useQueryClient();
  const userId = currentUser?.uid ?? "";

  return useMutation({
    mutationFn: ({ paymentId, transactionId, amount, paidDate }: UpdatePaymentVars) => updateBillPayment({ id: paymentId, transactionId }, { amount, paidDate }),

    onMutate: async ({ paymentId, amount, paidDate }: UpdatePaymentVars) => {
      await queryClient.cancelQueries({ queryKey: billKeys.all(userId) });
      return {
        previous: patchBills(queryClient, userId, (payments) =>
          payments.map((p) => (p.id === paymentId ? { ...p, ...(amount !== undefined && { amount }), ...(paidDate !== undefined && { paidDate }) } : p)),
        ),
      };
    },

    onError: (_error, _vars, context) => {
      if (context?.previous) queryClient.setQueryData(billKeys.all(userId), context.previous);
    },

    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: billKeys.all(userId) });
      void queryClient.invalidateQueries({ queryKey: transactionKeys.all(userId) });
    },
  });
}
