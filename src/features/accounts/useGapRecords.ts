import { useQueryClient } from "@tanstack/react-query";
import { sameCall, useOnceMutation } from "../../shared/hooks/useOnceMutation";
import { useAuth } from "../../shared/hooks/useAuth";
import { newDocId, saveGapRecords } from "../../firebase/firestore";
import { confirmList, editList, restoreList, withoutUndefined, type ListSnapshot } from "../../lib/listCache";
import type { Debt, DebtPayment, DebtWithStatus, Transaction } from "../../shared/types/IndexTypes";
import { computeDebtStatus, debtFields } from "../debts/debtsUtils";
import { insertTransaction, transactionKeys } from "../transactions/hooks/useTransactions";
import { debtKeys } from "../debts/useDebts";
import type { GapWrites } from "./gapRecords";

/**
 * The rows a gap's writes add to the transaction list, shaped as the documents
 * the batch produces — what the check-in's expectation is worked out from.
 * The clock is this device's until the server's copy arrives, as for any
 * record just written (see `useCreateTransaction`).
 */
export function gapTransactionRows(writes: GapWrites, userId: string, now: Date = new Date()): Transaction[] {
  return [
    ...writes.transactions.map(({ id, data }) => ({ ...withoutUndefined(data), id, userId, createdAt: now, updatedAt: now }) as Transaction),
    ...writes.transfers.map((record) => ({ ...withoutUndefined(record), userId, createdAt: now, updatedAt: now }) as Transaction),
    ...writes.debtCash.map((record) => ({ ...withoutUndefined(record), userId, updatedAt: now }) as unknown as Transaction),
  ];
}

/**
 * The debts list with a gap's new debts and repayments in, worked out as the
 * debts query will once it reads them back (`computeDebtStatus`).
 */
export function gapDebtRows(writes: GapWrites, userId: string, now: Date = new Date()): (rows: DebtWithStatus[]) => DebtWithStatus[] {
  const payments = writes.payments.map(({ id, data }) => ({ ...withoutUndefined(data), id, userId, createdAt: now, updatedAt: now }) as DebtPayment);
  const fresh = writes.debts.map(({ id, data }) => ({ ...withoutUndefined(data), id, userId, createdAt: now, updatedAt: now }) as Debt);
  return (rows) => {
    if (fresh.length === 0 && payments.length === 0) return rows;
    const freshIds = new Set(fresh.map((d) => d.id));
    const paidIds = new Set(payments.map((p) => p.id));
    const kept = rows.filter((row) => !freshIds.has(row.id));
    const allPayments = [...kept.flatMap((row) => row.payments.filter((p) => !paidIds.has(p.id))), ...payments];
    return [...kept.map((row) => (payments.some((p) => p.debtId === row.id) ? computeDebtStatus(debtFields(row), allPayments) : row)), ...fresh.map((debt) => computeDebtStatus(debt, allPayments))];
  };
}

/**
 * Saves a gap's records in one batch. Never waited for (`saveWithoutWaiting`):
 * the records are put in the transaction list — and any debts and repayments
 * in the debts list — before the write leaves, so the sheet closes at once;
 * a refused write puts both back. Re-reading the list to learn what this
 * device has just written would cost every record again; the debts are
 * refreshed once the server has them.
 */
export function useSaveGapRecords() {
  const { currentUser } = useAuth();
  const queryClient = useQueryClient();
  const userId = currentUser?.uid ?? "";
  const putRows = (writes: GapWrites) => (rows: Transaction[]) => gapTransactionRows(writes, userId).reduce((acc, row) => insertTransaction(row)(acc), rows);

  return useOnceMutation<void, Error, GapWrites, { transactions: ListSnapshot<Transaction>; debts: ListSnapshot<DebtWithStatus> }>({
    onceBy: sameCall,
    mutationFn: (writes) => saveGapRecords(userId, writes),
    onMutate: async (writes) => ({
      transactions: await editList<Transaction>(queryClient, transactionKeys.all(userId), putRows(writes)),
      debts: await editList<DebtWithStatus>(queryClient, debtKeys.all(userId), gapDebtRows(writes, userId)),
    }),
    onError: (_error, _writes, shown) => {
      restoreList(queryClient, shown?.transactions);
      restoreList(queryClient, shown?.debts);
    },
    onSuccess: (_void, writes) => {
      const key = transactionKeys.all(userId);
      for (const row of gapTransactionRows(writes, userId)) confirmList<Transaction>(queryClient, key, insertTransaction(row));
      if (writes.debts.length > 0 || writes.payments.length > 0) void queryClient.invalidateQueries({ queryKey: debtKeys.all(userId) });
    },
  });
}

/** One collection's fresh document id — what the batch names each record with. */
export const gapNewId = (collection: "transactions" | "debts" | "debtPayments" | "transfers") => newDocId(collection === "transfers" ? "transactions" : collection);
