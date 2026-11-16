import { useQueryClient } from "@tanstack/react-query";
import { sameCall, useOnceMutation } from "../../../shared/hooks/useOnceMutation";
import { useAuth } from "../../../shared/hooks/useAuth";
import { deleteTransfer, saveTransfer } from "../../../firebase/firestore";
import type { Transaction } from "../../../shared/types/IndexTypes";
import { confirmList, editList, removeWhere, restoreList, upsertById, type ListEdit, type ListSnapshot } from "../../../lib/listCache";
import type { TransferRecord } from "../transfers";
import { transactionKeys } from "./useTransactions";
import { sameAsStored } from "../../../shared/utils/sameValues";

/** Both halves into the list — or over the old pair, for a corrected transfer. */
const putPair =
  (rows: Transaction[]): ListEdit<Transaction> =>
  (list) =>
    rows.reduce((acc, row) => upsertById(row)(acc), list);

/**
 * Saving a transfer, new or corrected. The pair is on screen before the write
 * leaves, as every other save here; a write the server refuses puts the list
 * back as it was.
 */
export function useSaveTransfer() {
  const { currentUser } = useAuth();
  const queryClient = useQueryClient();
  const userId = currentUser?.uid ?? "";
  const key = transactionKeys.all(userId);
  const rowsOf = (records: TransferRecord[], createdAt?: Date) => {
    const now = new Date();
    return records.map((record) => ({ ...record, userId, createdAt: createdAt ?? now, updatedAt: now }) as Transaction);
  };

  return useOnceMutation<void, Error, { records: TransferRecord[]; createdAt?: Date }, { transactions: ListSnapshot<Transaction> }>({
    onceBy: sameCall,
    // A correction whose two halves are already stored exactly so: nothing is written.
    unchangedWhen: ({ records }) => {
      const rows = queryClient.getQueryData<Transaction[]>(key) ?? [];
      return records.length > 0 && records.every((record) => sameAsStored(rows.find((row) => row.id === record.id), record));
    },
    mutationFn: ({ records, createdAt }) => saveTransfer(userId, records, createdAt),
    onMutate: async ({ records, createdAt }) => ({ transactions: await editList(queryClient, key, putPair(rowsOf(records, createdAt))) }),
    onError: (_err, _vars, context) => restoreList(queryClient, context?.transactions),
    onSuccess: (_void, { records, createdAt }) => confirmList(queryClient, key, putPair(rowsOf(records, createdAt))),
  });
}

/** Deleting a transfer takes both halves; there is no half a transfer. */
export function useDeleteTransfer() {
  const { currentUser } = useAuth();
  const queryClient = useQueryClient();
  const userId = currentUser?.uid ?? "";
  const key = transactionKeys.all(userId);
  const dropPair = (transferId: string) => removeWhere<Transaction>((row) => row.transferId === transferId);

  return useOnceMutation<void, Error, string, { transactions: ListSnapshot<Transaction> }>({
    onceBy: (transferId) => transferId,
    mutationFn: (transferId) => deleteTransfer(userId, transferId),
    onMutate: async (transferId) => ({ transactions: await editList(queryClient, key, dropPair(transferId)) }),
    onError: (_err, _id, context) => restoreList(queryClient, context?.transactions),
    onSuccess: (_void, transferId) => confirmList(queryClient, key, dropPair(transferId)),
  });
}
