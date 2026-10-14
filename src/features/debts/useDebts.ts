import { useEffect, useMemo, useRef } from "react";
import { useIsMutating, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "react-toastify";
import i18n from "../../i18n";
import { useAuth } from "../../shared/hooks/useAuth";
import { createDebt, createDebtPayment, deleteDebt, deleteDebtPayment, editDebt, getDebtPayments, getDebts, syncDebtCash, updateDebt, updateDebtPayment } from "../../firebase/firestore";
import { transactionKeys } from "../transactions/hooks/useTransactions";
import { allDebtCashIds, debtCashDrift, debtCashIds, debtCashRecords, type DebtCashRecord } from "./debtCash";
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
 *
 * Two writes, then, and the first is the one that counts. Once the debt or the
 * repayment is saved, the save has happened: a failure in the second write is
 * said, not thrown — thrown, it left the form open over a debt already saved,
 * and saving it again wrote a second one. The money left behind is put right
 * by `useHealDebtCash` the next time the Debts page opens.
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
    /** The money's write failed after the debt's own succeeded: said, not thrown. */
    const moneyLater = (error: unknown) => {
      console.error("debt money not written", error);
      void queryClient.invalidateQueries({ queryKey: debtKeys.all(userId) });
      toast.warning(i18n.t("debts.moneyLater"));
    };
    const write = async (records: DebtCashRecord[], removing: string[]) => {
      await syncDebtCash(userId, records, removing, existing(removing));
      patchTransactions(records, removing);
    };
    return {
      userId,
      refresh: () => void queryClient.invalidateQueries({ queryKey: debtKeys.all(userId) }),
      /** Re-reads the debts, then writes this one's money again, clearing `alsoRemove` with it. */
      sync: async (debtId: string, alsoRemove: string[] = []) => {
        try {
          const debts = await queryClient.fetchQuery<DebtWithStatus[]>({ queryKey: debtKeys.all(userId), staleTime: 0 });
          const debt = debts.find((d) => d.id === debtId);
          const { records, remove } = debt ? debtCashRecords(debt) : { records: [], remove: [] };
          await write(records, [...new Set([...remove, ...alsoRemove])]);
        } catch (error) {
          moneyLater(error);
        }
      },
      /** The debt is gone: everything it and its repayments wrote goes with it. */
      clear: async (ids: string[]) => {
        try {
          await write([], ids);
        } catch (error) {
          moneyLater(error);
        }
        void queryClient.invalidateQueries({ queryKey: debtKeys.all(userId) });
      },
      /** Puts back whatever has drifted from what the debts say — see `debtCashDrift`. */
      heal: async (debts: DebtWithStatus[], transactions: Transaction[]) => {
        const { records, remove } = debtCashDrift(debts, transactions);
        if (records.length === 0 && remove.length === 0) return 0;
        await write(records, remove);
        return records.length + remove.length;
      },
    };
  }, [queryClient, userId]);
}

/** Said whenever the debt's own write fails: nothing was saved, so trying again is right. */
const failed = (key: string) => () => toast.error(i18n.t(key));

export function useCreateDebt() {
  const { userId, sync } = useDebtRefresh();
  return useMutation({ mutationFn: (data: CreateDebtDTO) => createDebt(userId, data), onSuccess: (id) => sync(id), onError: failed("debts.saveFailed") });
}

export function useUpdateDebt() {
  const { sync } = useDebtRefresh();
  return useMutation({ mutationFn: ({ debtId, data }: { debtId: string; data: UpdateDebtDTO }) => updateDebt(debtId, data), onSuccess: (_, { debtId }) => sync(debtId), onError: failed("debts.saveFailed") });
}

/** The whole loan form saved over an existing loan — see `editDebt`. */
export function useEditDebt() {
  const { sync } = useDebtRefresh();
  return useMutation({ mutationFn: ({ debtId, data }: { debtId: string; data: CreateDebtDTO }) => editDebt(debtId, data), onSuccess: (_, { debtId }) => sync(debtId), onError: failed("debts.saveFailed") });
}

export function useDeleteDebt() {
  const { clear } = useDebtRefresh();
  return useMutation({
    mutationFn: ({ debtId, paymentIds }: { debtId: string; paymentIds: string[] }) => deleteDebt(debtId, paymentIds),
    onSuccess: (_, { debtId, paymentIds }) => clear(allDebtCashIds(debtId, paymentIds)),
    onError: failed("debts.deleteFailed"),
  });
}

export function useRecordRepayment() {
  const { userId, sync } = useDebtRefresh();
  return useMutation({ mutationFn: (data: CreateDebtPaymentDTO) => createDebtPayment(userId, data), onSuccess: (_, data) => sync(data.debtId), onError: failed("debts.saveFailed") });
}

/** Deleting a repayment: its own records go, and the loan's later interest is worked out again. */
export function useDeleteRepayment() {
  const { sync } = useDebtRefresh();
  return useMutation({
    mutationFn: ({ paymentId }: { paymentId: string; debtId: string }) => deleteDebtPayment(paymentId),
    onSuccess: (_, { paymentId, debtId }) => sync(debtId, [debtCashIds.principal(paymentId), debtCashIds.interest(paymentId)]),
    onError: failed("debts.deleteFailed"),
  });
}

export function useUpdateRepayment() {
  const { sync } = useDebtRefresh();
  return useMutation({
    mutationFn: ({ paymentId, amount, date, accountId }: { paymentId: string; debtId: string; amount: number; date: Date; accountId?: string | null }) => updateDebtPayment(paymentId, { amount, date, accountId }),
    onSuccess: (_, { debtId }) => sync(debtId),
    onError: failed("debts.saveFailed"),
  });
}

/**
 * Once per visit to the Debts page, with the debts and the transactions both
 * loaded and nothing being saved: puts back any money that drifted from its
 * debt — a loan whose money never reached the card, a repayment's old figure,
 * a deleted loan's money still in an account. From what is already loaded, so
 * it costs no reads; it writes only what differs, and usually nothing.
 *
 * Only on both lists fully loaded and settled: a list still loading reads as
 * empty, and an empty list of debts would take every debt's money out.
 */
export function useHealDebtCash(debtsQuery: { data?: DebtWithStatus[]; isSuccess: boolean; isFetching: boolean }, transactionsQuery: { data?: Transaction[]; isSuccess: boolean; isFetching: boolean }) {
  const { heal } = useDebtRefresh();
  const saving = useIsMutating();
  const done = useRef(false);

  useEffect(() => {
    if (done.current || saving > 0) return;
    if (!debtsQuery.isSuccess || debtsQuery.isFetching || !debtsQuery.data) return;
    if (!transactionsQuery.isSuccess || transactionsQuery.isFetching || !transactionsQuery.data) return;
    if (typeof navigator !== "undefined" && navigator.onLine === false) return;
    done.current = true;
    heal(debtsQuery.data, transactionsQuery.data).catch((error) => {
      // Tried again on the next visit.
      done.current = false;
      console.error("debt money not healed", error);
    });
  }, [heal, saving, debtsQuery.isSuccess, debtsQuery.isFetching, debtsQuery.data, transactionsQuery.isSuccess, transactionsQuery.isFetching, transactionsQuery.data]);
}
