import { useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../../shared/hooks/useAuth";
import { getBills, createBill, updateBill, deleteBill, getBillPayments, markBillPaid, unmarkBillPaid, updateBillPayment, newDocId } from "../../firebase/firestore";
import { billsNeedingAttention, computeBillStatus } from "./billsUtils";
import { billKeys, byUrgency, editBills, editPayments } from "./billCache";
import { insertTransaction, setTransactionFields, transactionKeys } from "../transactions/hooks/useTransactions";
import { confirmList, editList, idsFor, removeWhere, restoreList, upsertById, withoutUndefined, type ListSnapshot } from "../../lib/listCache";
import type { Bill, BillPayment, BillWithStatus, CreateBillDTO, Transaction, UpdateBillDTO } from "../../shared/types/IndexTypes";

export { billKeys };

// ─── Optimistic edits ─────────────────────────────────────────────────────────
//
// Marking a bill paid writes to Firestore, and `writeBatch.commit()` only
// settles once the server has acknowledged it — on a dropped connection, not
// at all. A UI that waits for it waits for ever, which is what "the app
// freezes" was.
//
// So the cache is updated first and the write is left to catch up. The screen
// answers immediately, and a write that fails is rolled back with a message
// rather than being silently believed. Ids are made on this device up front,
// so the payment and its mirrored expense are on screen under the ids they
// will keep — undoing a payment before the server has answered deletes the
// right documents — and once the write lands both lists are only marked stale,
// not re-read: see `listCache`.

/** Rolls both lists back to what they were if the write turns out to have failed. */
interface Rollback {
  bills?: ListSnapshot<BillWithStatus>;
  transactions?: ListSnapshot<Transaction>;
}

// ─── useBills ─────────────────────────────────────────────────────────────────

/**
 * How many bills are asking to be paid, for the badge in the navigation.
 *
 * Reads the same query as the Bills screen, so a reader who has been there
 * this session pays nothing for it, and the count corrects itself the moment a
 * payment is marked rather than waiting for a visit. It does mean the bills are
 * fetched on arrival anywhere in the app — one query, and with the on-disk
 * cache usually answered from there.
 */
export function useBillsNeedingAttention(): number {
  const { data: bills } = useBills();
  return useMemo(() => billsNeedingAttention(bills ?? []), [bills]);
}

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

/** One id per save, shared by the optimistic bill and the write — see `idsFor`. */
const createdBillIds = new WeakMap<CreateBillDTO, string>();

/** The bill `createBill` stores, as the cache holds it. */
function newBill(userId: string, id: string, data: CreateBillDTO): Bill {
  const { pause, ...rest } = data;
  const now = new Date();
  return { ...withoutUndefined(rest), ...(pause ? { pause: withoutUndefined(pause) } : {}), id, userId, isActive: true, createdAt: now, updatedAt: now } as Bill;
}

/** What `updateBill` leaves in the document: `pause: null` removes the pause. */
function applyBillUpdate(bill: Bill, data: UpdateBillDTO): Bill {
  const { pause, ...rest } = data;
  const next: Bill = { ...bill, ...withoutUndefined(rest), updatedAt: new Date() };
  if (pause === null) delete next.pause;
  else if (pause) next.pause = withoutUndefined(pause) as Bill["pause"];
  return next;
}

export function useCreateBill() {
  const { currentUser } = useAuth();
  const queryClient = useQueryClient();
  const userId = currentUser?.uid ?? "";
  const key = billKeys.all(userId);
  const idFor = (data: CreateBillDTO) => idsFor(createdBillIds, data, () => newDocId("bills"));

  return useMutation<string, Error, CreateBillDTO, Rollback & { bill: Bill }>({
    mutationFn: (data: CreateBillDTO) => createBill(userId, data, idFor(data)),

    // Shown at once, like every other save behind `saveWithoutWaiting`: the
    // dialog closes before the server has answered, so the bill has to be there.
    onMutate: async (data) => {
      const bill = newBill(userId, idFor(data), data);
      return { bill, bills: await editList(queryClient, key, editBills(upsertById(bill))) };
    },

    onError: (_error, _data, context) => restoreList(queryClient, context?.bills),

    onSuccess: (_id, _data, context) => {
      if (context) confirmList(queryClient, key, editBills(upsertById(context.bill)));
    },
  });
}

// ─── useUpdateBill ────────────────────────────────────────────────────────────

export function useUpdateBill() {
  const { currentUser } = useAuth();
  const queryClient = useQueryClient();
  const userId = currentUser?.uid ?? "";
  const key = billKeys.all(userId);
  const edit = (billId: string, data: UpdateBillDTO) => editBills((bills) => bills.map((b) => (b.id === billId ? applyBillUpdate(b, data) : b)));

  return useMutation<void, Error, { billId: string; data: UpdateBillDTO }, Rollback>({
    mutationFn: ({ billId, data }) => updateBill(billId, data),
    onMutate: async ({ billId, data }) => ({ bills: await editList(queryClient, key, edit(billId, data)) }),
    onError: (_error, _vars, context) => restoreList(queryClient, context?.bills),
    onSuccess: (_void, { billId, data }) => confirmList(queryClient, key, edit(billId, data)),
  });
}

// ─── useDeleteBill ────────────────────────────────────────────────────────────

export function useDeleteBill() {
  const { currentUser } = useAuth();
  const queryClient = useQueryClient();
  const userId = currentUser?.uid ?? "";

  return useMutation({
    mutationFn: (billId: string) => deleteBill(billId),
    // Deletes wait for a connection and the dialog waits for the answer, so
    // the bill goes from the list once the server has agreed.
    onSuccess: (_void, billId) => confirmList(queryClient, billKeys.all(userId), editBills(removeWhere<Bill>((b) => b.id === billId))),
  });
}

// ─── useMarkBillPaid ──────────────────────────────────────────────────────────
// Also edits the transactions — paying a bill creates a mirrored expense.

export interface MarkPaidVars {
  bill: BillWithStatus;
  paidDate: Date;
  paidAmount?: number;
  periodKey?: string;
  /** Which instalment of the period this settles. Defaults to the next one owed. */
  installmentIndex?: number;
}

const paymentIds = new WeakMap<MarkPaidVars, { paymentId: string; transactionId: string }>();

export function useMarkBillPaid() {
  const { currentUser } = useAuth();
  const queryClient = useQueryClient();
  const userId = currentUser?.uid ?? "";
  const idsOf = (vars: MarkPaidVars) => idsFor(paymentIds, vars, () => ({ paymentId: newDocId("billPayments"), transactionId: newDocId("transactions") }));

  /** The payment and the expense `markBillPaid` writes, as the two caches hold them. */
  const rowsFor = (vars: MarkPaidVars) => {
    const { bill, paidDate, paidAmount, periodKey, installmentIndex } = vars;
    const { paymentId, transactionId } = idsOf(vars);
    const amount = paidAmount ?? bill.amount;
    const now = new Date();
    const payment = withoutUndefined({
      id: paymentId,
      userId,
      billId: bill.id,
      periodKey: periodKey ?? bill.currentPeriodKey,
      installmentIndex,
      amount,
      paidDate,
      transactionId,
      createdAt: now,
    }) as BillPayment;
    const expense = withoutUndefined({
      id: transactionId,
      userId,
      amount,
      type: "expense",
      categoryId: bill.categoryId,
      date: paidDate,
      description: bill.name,
      billId: bill.id,
      createdAt: now,
      updatedAt: now,
    }) as Transaction;
    return { payment, expense };
  };

  return useMutation<{ paymentId: string; transactionId: string }, Error, MarkPaidVars, Rollback & { payment: BillPayment; expense: Transaction }>({
    // `paidAmount` carries the real figure for variable bills (electricity, water).
    // `periodKey` defaults to the period we're in, but can name a later one when
    // the user settles a bill ahead of time.
    mutationFn: (vars: MarkPaidVars) => {
      const { bill, paidDate, paidAmount, periodKey, installmentIndex } = vars;
      return markBillPaid(
        userId,
        { id: bill.id, name: bill.name, amount: bill.amount, categoryId: bill.categoryId },
        periodKey ?? bill.currentPeriodKey,
        paidDate,
        paidAmount,
        installmentIndex,
        idsOf(vars),
      );
    },

    onMutate: async (vars: MarkPaidVars) => {
      const { payment, expense } = rowsFor(vars);
      return {
        payment,
        expense,
        bills: await editList(queryClient, billKeys.all(userId), editPayments(upsertById(payment))),
        transactions: await editList(queryClient, transactionKeys.all(userId), insertTransaction(expense)),
      };
    },

    onError: (_error, _vars, context) => {
      restoreList(queryClient, context?.bills);
      restoreList(queryClient, context?.transactions);
    },

    onSuccess: (_ids, _vars, context) => {
      if (!context) return;
      confirmList(queryClient, billKeys.all(userId), editPayments(upsertById(context.payment)));
      confirmList(queryClient, transactionKeys.all(userId), insertTransaction(context.expense));
    },
  });
}

// ─── useUnmarkBillPaid ────────────────────────────────────────────────────────

export function useUnmarkBillPaid() {
  const { currentUser } = useAuth();
  const queryClient = useQueryClient();
  const userId = currentUser?.uid ?? "";
  const dropPayment = (paymentId: string) => editPayments(removeWhere<BillPayment>((p) => p.id === paymentId));
  const dropExpense = (transactionId: string) => removeWhere<Transaction>((t) => t.id === transactionId);

  return useMutation<void, Error, { paymentId: string; transactionId?: string }, Rollback>({
    mutationFn: ({ paymentId, transactionId }) => unmarkBillPaid({ id: paymentId, transactionId }),

    onMutate: async ({ paymentId, transactionId }) => ({
      bills: await editList(queryClient, billKeys.all(userId), dropPayment(paymentId)),
      transactions: transactionId ? await editList(queryClient, transactionKeys.all(userId), dropExpense(transactionId)) : undefined,
    }),

    onError: (_error, _vars, context) => {
      restoreList(queryClient, context?.bills);
      restoreList(queryClient, context?.transactions);
    },

    onSuccess: (_void, { paymentId, transactionId }) => {
      confirmList(queryClient, billKeys.all(userId), dropPayment(paymentId));
      if (transactionId) confirmList(queryClient, transactionKeys.all(userId), dropExpense(transactionId));
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
  const editPayment = ({ paymentId, amount, paidDate }: UpdatePaymentVars) =>
    editPayments((payments) => payments.map((p) => (p.id === paymentId ? { ...p, ...(amount !== undefined && { amount }), ...(paidDate !== undefined && { paidDate }) } : p)));
  // The expense calls the same day `date`; the payment calls it `paidDate`.
  const editExpense = (transactionId: string, { amount, paidDate }: UpdatePaymentVars) => setTransactionFields(transactionId, { amount, date: paidDate });

  return useMutation<void, Error, UpdatePaymentVars, Rollback>({
    mutationFn: ({ paymentId, transactionId, amount, paidDate }: UpdatePaymentVars) => updateBillPayment({ id: paymentId, transactionId }, { amount, paidDate }),

    onMutate: async (vars: UpdatePaymentVars) => ({
      bills: await editList(queryClient, billKeys.all(userId), editPayment(vars)),
      transactions: vars.transactionId ? await editList(queryClient, transactionKeys.all(userId), editExpense(vars.transactionId, vars)) : undefined,
    }),

    onError: (_error, _vars, context) => {
      restoreList(queryClient, context?.bills);
      restoreList(queryClient, context?.transactions);
    },

    onSuccess: (_void, vars) => {
      confirmList(queryClient, billKeys.all(userId), editPayment(vars));
      if (vars.transactionId) confirmList(queryClient, transactionKeys.all(userId), editExpense(vars.transactionId, vars));
    },
  });
}
