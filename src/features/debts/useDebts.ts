import { useEffect, useMemo, useRef } from "react";
import { useIsMutating, useQuery, useQueryClient } from "@tanstack/react-query";
import { sameCall, useOnceMutation } from "../../shared/hooks/useOnceMutation";
import { toast } from "react-toastify";
import i18n from "../../i18n";
import { useAuth } from "../../shared/hooks/useAuth";
import {
  createDebt,
  createDebtPayment,
  deleteCoveredDebt,
  deleteDebt,
  deleteDebtPayment,
  editCoveredDebt,
  editDebt,
  getDebtPayments,
  getDebts,
  newDocId,
  syncDebtCash,
  updateDebt,
  updateDebtPayment,
} from "../../firebase/firestore";
import { setTransactionFields, transactionKeys } from "../transactions/hooks/useTransactions";
import { investmentKeys } from "../budget/useInvestments";
import { isEmptyEdit, type CoveredEdit } from "../budget/coveredLink";
import { allDebtCashIds, debtCashDrift, debtCashIds, debtCashRecords, type DebtCashRecord } from "./debtCash";
import { confirmList, editList, idsFor, removeWhere, restoreList, withoutUndefined, type ListSnapshot } from "../../lib/listCache";
import { computeDebtStatus, debtEdit, debtFields } from "./debtsUtils";
import type { CreateDebtDTO, CreateDebtPaymentDTO, Debt, DebtPayment, DebtWithStatus, InvestmentContribution, Transaction, UpdateDebtDTO } from "../../shared/types/IndexTypes";

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
export function useDebtRefresh() {
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
    /**
     * The save on screen before the server has it (`saveWithoutWaiting`): the
     * debts list edited, and the money the debt moves (`debtCashRecords`) put
     * in the transaction list as the sync after the save will write it — so
     * the card, the totals and the Overview move at once. Both lists come back
     * for `undo` if the write is refused.
     */
    const preview = async (edit: (debts: DebtWithStatus[]) => DebtWithStatus[], debtId: string): Promise<DebtPreview> => {
      const debts = await editList<DebtWithStatus>(queryClient, debtKeys.all(userId), edit);
      const debt = queryClient.getQueryData<DebtWithStatus[]>(debtKeys.all(userId))?.find((d) => d.id === debtId);
      if (!debt) return { debts };
      const { records, remove } = debtCashRecords(debt);
      const gone = new Set(remove);
      const written = new Map(records.map((record) => [record.id, { ...record, userId, updatedAt: new Date() } as unknown as Transaction]));
      const transactions = await editList<Transaction>(queryClient, key, (rows) => [...rows.filter((row) => !gone.has(row.id) && !written.has(row.id)), ...written.values()]);
      return { debts, transactions };
    };
    const undo = (shown: DebtPreview | undefined) => {
      restoreList(queryClient, shown?.transactions);
      restoreList(queryClient, shown?.debts);
    };
    return {
      userId,
      preview,
      undo,
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

/** The lists as they were before a save was put on screen — see `preview`. */
export interface DebtPreview {
  debts: ListSnapshot<DebtWithStatus>;
  transactions?: ListSnapshot<Transaction>;
}

/** Said whenever the debt's own write fails: nothing was saved, so trying again is right. */
const failed = (key: string) => () => toast.error(i18n.t(key));

/** One debt worked out again from new fields and/or payments; the others as they are. */
const reworked = (debtId: string, change: (debt: Debt, payments: DebtPayment[]) => { debt: Debt; payments: DebtPayment[] }) => (rows: DebtWithStatus[]) =>
  rows.map((row) => {
    if (row.id !== debtId) return row;
    const next = change(debtFields(row), row.payments);
    return computeDebtStatus(next.debt, next.payments);
  });
/** `UpdateDebtDTO` laid over a debt as `updateDebt` writes it: `forgiven: null` takes it off. */
const updated = (debt: Debt, data: UpdateDebtDTO): Debt => {
  const { forgiven, ...rest } = data;
  const next = { ...debt, ...withoutUndefined(rest), updatedAt: new Date() } as Debt & { forgiven?: unknown };
  if (forgiven === null) delete next.forgiven;
  else if (forgiven) next.forgiven = forgiven;
  return next as Debt;
};

/** One id per new debt / repayment, shared by the row on screen and the write — see `idsFor`. */
const debtIds = new WeakMap<CreateDebtDTO, string>();
const paymentIds = new WeakMap<CreateDebtPaymentDTO, string>();

export function useCreateDebt() {
  const { userId, sync, preview, undo } = useDebtRefresh();
  const idOf = (data: CreateDebtDTO) => idsFor(debtIds, data, () => newDocId("debts"));
  return useOnceMutation<string, Error, CreateDebtDTO, DebtPreview>({
    onceBy: sameCall,
    mutationFn: (data) => createDebt(userId, data, idOf(data)),
    onMutate: (data) => {
      const now = new Date();
      const debt = { ...withoutUndefined(data), id: idOf(data), userId, createdAt: now, updatedAt: now } as Debt;
      return preview((rows) => [...rows.filter((row) => row.id !== debt.id), computeDebtStatus(debt, [])], debt.id);
    },
    onSuccess: (id) => sync(id),
    onError: (_error, _data, shown) => {
      undo(shown);
      failed("debts.saveFailed")();
    },
  });
}

export function useUpdateDebt() {
  const { sync, preview, undo } = useDebtRefresh();
  return useOnceMutation<void, Error, { debtId: string; data: UpdateDebtDTO }, DebtPreview>({
    onceBy: sameCall,
    mutationFn: ({ debtId, data }) => updateDebt(debtId, data),
    onMutate: ({ debtId, data }) => preview(reworked(debtId, (debt, payments) => ({ debt: updated(debt, data), payments })), debtId),
    onSuccess: (_, { debtId }) => sync(debtId),
    onError: (_error, _vars, shown) => {
      undo(shown);
      failed("debts.saveFailed")();
    },
  });
}

/**
 * The whole loan form saved over an existing loan — see `editDebt`. A debt that
 * paid part of a goal brings `covered` (see `coveredEdit`): its deposit and its
 * expense are written in the same batch, and corrected on screen after it.
 */
export function useEditDebt() {
  const queryClient = useQueryClient();
  const { userId, sync, preview, undo } = useDebtRefresh();
  return useOnceMutation<void, Error, { debtId: string; data: CreateDebtDTO; covered?: CoveredEdit }, DebtPreview & { contributions?: ListSnapshot<InvestmentContribution>; expense?: ListSnapshot<Transaction> }>({
    onceBy: sameCall,
    // On screen at once, as `editDebt` will write it: the form's fields set,
    // the ones it now leaves empty taken off (`debtEdit`); a goal's deposit
    // and expense corrected with it. All put back if the write is refused.
    onMutate: async ({ debtId, data, covered }) => {
      const { set, clear } = debtEdit(data);
      const shown = await preview(
        reworked(debtId, (debt, payments) => {
          const next = { ...debt, ...set, updatedAt: new Date() } as Record<string, unknown>;
          for (const field of clear) delete next[field];
          return { debt: next as unknown as Debt, payments };
        }),
        debtId,
      );
      if (!covered || isEmptyEdit(covered)) return shown;
      const now = new Date();
      const contribution = covered.contribution;
      const contributions = contribution
        ? await editList<InvestmentContribution>(queryClient, investmentKeys.contributions(userId), (rows) => rows.map((row) => (row.id === contribution.id ? { ...row, ...withoutUndefined(contribution.set), updatedAt: now } : row)))
        : undefined;
      const expense = covered.expense ? await editList(queryClient, transactionKeys.all(userId), setTransactionFields(covered.expense.id, covered.expense.set)) : undefined;
      return { ...shown, contributions, expense };
    },
    mutationFn: async ({ debtId, data, covered }) => {
      if (!covered || isEmptyEdit(covered)) {
        await editDebt(debtId, data);
        return;
      }
      const wrote = await editCoveredDebt(debtId, data, covered);
      const now = new Date();
      if (wrote.contribution && covered.contribution) {
        const { id, set } = covered.contribution;
        confirmList<InvestmentContribution>(queryClient, investmentKeys.contributions(userId), (rows) => rows.map((row) => (row.id === id ? { ...row, ...set, updatedAt: now } : row)));
      }
      if (wrote.expense && covered.expense) confirmList(queryClient, transactionKeys.all(userId), setTransactionFields(covered.expense.id, covered.expense.set));
    },
    onSuccess: (_, { debtId }) => sync(debtId),
    onError: (_error, _vars, shown) => {
      restoreList(queryClient, shown?.expense);
      restoreList(queryClient, shown?.contributions);
      undo(shown);
      failed("debts.saveFailed")();
    },
  });
}

/**
 * Deleting a loan. One that paid part of a goal brings `covered`: the goal's
 * deposit and the expense go with it — see `deleteCoveredDebt`.
 */
export function useDeleteDebt() {
  const queryClient = useQueryClient();
  const { userId, clear } = useDebtRefresh();
  return useOnceMutation({
    onceBy: (vars: { debtId: string }) => vars.debtId,
    mutationFn: async ({ debtId, paymentIds, covered }: { debtId: string; paymentIds: string[]; covered?: { contributionId?: string; expenseId?: string } }) => {
      if (!covered?.contributionId && !covered?.expenseId) {
        await deleteDebt(userId, debtId, paymentIds);
        return;
      }
      const gone = await deleteCoveredDebt(userId, debtId, paymentIds, covered);
      if (gone.contributionId) confirmList(queryClient, investmentKeys.contributions(userId), removeWhere<InvestmentContribution>((c) => c.id === gone.contributionId));
      if (gone.expenseId) confirmList(queryClient, transactionKeys.all(userId), removeWhere<Transaction>((t) => t.id === gone.expenseId));
    },
    onSuccess: (_, { debtId, paymentIds }) => clear(allDebtCashIds(debtId, paymentIds)),
    onError: failed("debts.deleteFailed"),
  });
}

export function useRecordRepayment() {
  const { userId, sync, preview, undo } = useDebtRefresh();
  const idOf = (data: CreateDebtPaymentDTO) => idsFor(paymentIds, data, () => newDocId("debtPayments"));
  return useOnceMutation<string, Error, CreateDebtPaymentDTO, DebtPreview>({
    onceBy: sameCall,
    mutationFn: (data) => createDebtPayment(userId, data, idOf(data)),
    // The debt on screen with the repayment in, and the money it moves.
    onMutate: (data) => {
      const now = new Date();
      const payment = { ...withoutUndefined(data), id: idOf(data), userId, createdAt: now, updatedAt: now } as DebtPayment;
      return preview(reworked(data.debtId, (debt, payments) => ({ debt, payments: [...payments.filter((p) => p.id !== payment.id), payment] })), data.debtId);
    },
    onSuccess: (_, data) => sync(data.debtId),
    onError: (_error, _data, shown) => {
      undo(shown);
      failed("debts.saveFailed")();
    },
  });
}

/** Deleting a repayment: its own records go, and the loan's later interest is worked out again. */
export function useDeleteRepayment() {
  const { userId, sync } = useDebtRefresh();
  return useOnceMutation({
    onceBy: (vars: { paymentId: string }) => vars.paymentId,
    mutationFn: ({ paymentId }: { paymentId: string; debtId: string }) => deleteDebtPayment(userId, paymentId),
    onSuccess: (_, { paymentId, debtId }) => sync(debtId, [debtCashIds.principal(paymentId), debtCashIds.interest(paymentId)]),
    onError: failed("debts.deleteFailed"),
  });
}

export function useUpdateRepayment() {
  const { sync, preview, undo } = useDebtRefresh();
  return useOnceMutation<void, Error, { paymentId: string; debtId: string; amount: number; date: Date; accountId?: string | null; notes?: string | null }, DebtPreview>({
    onceBy: sameCall,
    mutationFn: ({ paymentId, amount, date, accountId, notes }) => updateDebtPayment(paymentId, { amount, date, accountId, notes }),
    // As `updateDebtPayment` writes it: `accountId: null` and an empty note take them off.
    onMutate: ({ paymentId, debtId, amount, date, accountId, notes }) =>
      preview(
        reworked(debtId, (debt, payments) => ({
          debt,
          payments: payments.map((p) => {
            if (p.id !== paymentId) return p;
            const next = { ...p, amount, date, updatedAt: new Date() } as DebtPayment & { accountId?: string; notes?: string };
            if (accountId === null) delete next.accountId;
            else if (accountId !== undefined) next.accountId = accountId;
            if (notes !== undefined) {
              if (notes && notes.trim()) next.notes = notes.trim();
              else delete next.notes;
            }
            return next;
          }),
        })),
        debtId,
      ),
    onSuccess: (_, { debtId }) => sync(debtId),
    onError: (_error, _vars, shown) => {
      undo(shown);
      failed("debts.saveFailed")();
    },
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
