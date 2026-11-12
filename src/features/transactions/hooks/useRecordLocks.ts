import { useCallback, useMemo, useSyncExternalStore } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../../../shared/hooks/useAuth";
import { getDebtPayments, getDebts } from "../../../firebase/firestore";
import { computeDebtStatus } from "../../debts/debtsUtils";
import { debtKeys } from "../../debts/useDebts";
import { investmentKeys } from "../../budget/useInvestments";
import { useTransactions } from "./useTransactions";
import { coveredExpenseIndex, mayBeCovered, recordLock, type RecordLock } from "../linkedRecords";
import type { DebtWithStatus, InvestmentGoal, Transaction } from "../../../shared/types/IndexTypes";

export interface LockState {
  lock: RecordLock | undefined;
  /** A plain expense whose debts aren't in yet: whether it is covered isn't known. */
  pending: boolean;
}

/**
 * Which records on the Transactions page are half of a linked set — see
 * `recordLock`.
 *
 * Costs no read in the usual case. The debts are the shared list under its own
 * key, already in from the Overview, and are taken as they are, however old
 * (`staleTime: Infinity`): a covered debt is only ever written from this
 * device's Debts or Goals screens, which update that list as they write. They
 * are read only when `fetch` asks — a record has been opened — and nothing has
 * loaded them yet. The goals' names, needed only for debts written before the
 * debt named its expense, come from the cache alone.
 */
export function useRecordLocks(fetch: boolean) {
  const { currentUser } = useAuth();
  const userId = currentUser?.uid ?? "";
  const debts = useQuery<DebtWithStatus[]>({
    queryKey: debtKeys.all(userId),
    enabled: fetch && !!userId,
    staleTime: Infinity,
    // The same read as `useDebts`, under the same key.
    queryFn: async () => {
      const [list, payments] = await Promise.all([getDebts(userId), getDebtPayments(userId)]);
      return list.map((debt) => computeDebtStatus(debt, payments));
    },
  });
  // Read from the cache without becoming one of the query's observers: an
  // observer with no way to fetch turned every refetch of the goals into a
  // "No queryFn" error, and an errored query on screen raised the app's
  // «δεν φόρτωσαν» bar for nothing.
  const client = useQueryClient();
  const goalsKey = investmentKeys.goals(userId);
  const goalsData = useSyncExternalStore(
    useCallback((onChange: () => void) => client.getQueryCache().subscribe(onChange), [client]),
    () => client.getQueryData<InvestmentGoal[]>(goalsKey),
  );
  const { data: transactions } = useTransactions();

  const covered = useMemo(() => coveredExpenseIndex(debts.data ?? [], transactions ?? [], goalsData ?? []), [debts.data, transactions, goalsData]);
  const known = !!debts.data || debts.isError;

  return useCallback(
    (tx: Transaction): LockState => ({ lock: recordLock(tx, covered, debts.data), pending: !known && mayBeCovered(tx) }),
    [covered, debts.data, known],
  );
}
