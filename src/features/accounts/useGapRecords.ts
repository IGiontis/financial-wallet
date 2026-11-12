import { useQueryClient } from "@tanstack/react-query";
import { sameCall, useOnceMutation } from "../../shared/hooks/useOnceMutation";
import { useAuth } from "../../shared/hooks/useAuth";
import { newDocId, saveGapRecords } from "../../firebase/firestore";
import { confirmList, withoutUndefined } from "../../lib/listCache";
import type { Transaction } from "../../shared/types/IndexTypes";
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
 * Saves a gap's records in one batch, then puts them in the transaction list
 * in place — re-reading the list to learn what this device has just written
 * would cost every record again — and refreshes the debts if any were written.
 */
export function useSaveGapRecords() {
  const { currentUser } = useAuth();
  const queryClient = useQueryClient();
  const userId = currentUser?.uid ?? "";

  return useOnceMutation<void, Error, GapWrites>({
    onceBy: sameCall,
    mutationFn: (writes) => saveGapRecords(userId, writes),
    onSuccess: (_void, writes) => {
      const key = transactionKeys.all(userId);
      for (const row of gapTransactionRows(writes, userId)) confirmList<Transaction>(queryClient, key, insertTransaction(row));
      if (writes.debts.length > 0 || writes.payments.length > 0) void queryClient.invalidateQueries({ queryKey: debtKeys.all(userId) });
    },
  });
}

/** One collection's fresh document id — what the batch names each record with. */
export const gapNewId = (collection: "transactions" | "debts" | "debtPayments" | "transfers") => newDocId(collection === "transfers" ? "transactions" : collection);
