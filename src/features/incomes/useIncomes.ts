import { useCallback, useMemo, useState } from "react";
import { toast } from "react-toastify";
import { useTranslation } from "react-i18next";
import { useWorkspace, useWorkspaceSetting } from "../../shared/hooks/useWorkspaceSetting";
import { saveWithoutWaiting } from "../../shared/utils/saveWithoutWaiting";
import { useCreateTransaction, useTransactions } from "../transactions/hooks/useTransactions";
import { useMoneyAccounts } from "../accounts/useMoneyAccounts";
import type { OccurrenceOverride } from "../plannerPage/plannerActuals";
import { PLANNER_KEYS, cleanOverrides, withOverride } from "../plannerPage/plannerInputs";
import {
  DECLINED_SALARY_KEY,
  INCOMES_KEY,
  arrivalTransaction,
  cleanIncomes,
  incomeWindow,
  lateCount,
  needsYou,
  resolveIncomes,
  upsertIncome,
  type ArrivalInput,
  type Income,
  type IncomeOccurrence,
  type IncomeStatus,
} from "./incomesUtils";
import { useIncomesMigration } from "./useIncomesMigration";

/**
 * The list itself, checked — what the Planner, the Bills page and the
 * Allocation page read the money in from.
 *
 * Every screen that reads the incomes comes through here, which is why the
 * one-time move of the old Planner's salary and income lines starts here too
 * (`useIncomesMigration`): whichever screen is opened first after the update,
 * the salary is already in the list it reads.
 *
 * `isLoading` while the list may only look empty: the account's copy has not
 * arrived and this device has none, or the move is about to write it.
 */
export function useIncomeList() {
  const [stored] = useWorkspaceSetting<Income[]>(INCOMES_KEY, []);
  const incomes = useMemo(() => cleanIncomes(stored), [stored]);
  const { isLoading: workspaceLoading } = useWorkspace();
  const { pending } = useIncomesMigration();
  return { incomes, isLoading: (workspaceLoading && incomes.length === 0) || pending };
}

/**
 * The incomes, where each one stands, and the ways to change them.
 *
 * What the Incomes page and the Overview read; the Planner reads the list
 * (`useIncomeList`) and puts it through the same resolver inside its plan
 * (`planIncomes`) — one copy of the list and one answer to "has it come?", so
 * the three screens cannot disagree.
 *
 * Reads cost nothing new: the list and the words said per occurrence sit on
 * the user document (`useWorkspaceSetting`), and the records are the
 * transactions list every screen already holds.
 *
 * `now` is held for the visit rather than read on every render: everything
 * below is worked out from it, and a clock that moved between two renders
 * would make every memo below start again.
 */
export function useIncomes(now?: Date) {
  const [visit] = useState(() => new Date());
  const today = now ?? visit;

  const [, setStored] = useWorkspaceSetting<Income[]>(INCOMES_KEY, []);
  // Until the account's copy arrives the list is this device's cache, which
  // may be empty on a new device: say "loading" rather than "no incomes yet".
  const { incomes, isLoading: listLoading } = useIncomeList();

  const { data: transactions = [], isLoading: transactionsLoading } = useTransactions();
  const isLoading = transactionsLoading || listLoading;
  const { latest } = useMoneyAccounts();
  const lastReadingAt = latest?.at;

  // The Planner's own store of what was said about single occurrences. Shared
  // on purpose: «δεν θα έρθει αυτή τη φορά» said here has to be true there too.
  const [storedOverrides, setStoredOverrides] = useWorkspaceSetting<Record<string, OccurrenceOverride>>(PLANNER_KEYS.occurrences, {});
  const overrides = useMemo(() => cleanOverrides(storedOverrides), [storedOverrides]);

  const span = useMemo(() => incomeWindow(today), [today]);
  const statuses = useMemo(
    () => resolveIncomes(incomes, { transactions, overrides, lastReadingAt, now: today }, span.from, span.to),
    [incomes, transactions, overrides, lastReadingAt, today, span],
  );

  // Late, or waiting for the bank question — oldest first, for the badge and
  // for the Overview's «Θέλει εσένα».
  const attention = useMemo(() => statuses.filter(needsYou), [statuses]);

  const saveIncome = useCallback((income: Income) => setStored((previous) => upsertIncome(cleanIncomes(previous), income)), [setStored]);
  const removeIncome = useCallback((id: string) => setStored((previous) => cleanIncomes(previous).filter((i) => i.id !== id)), [setStored]);
  /** Says something about one occurrence, or (`undefined`) takes it back. */
  const setOverride = useCallback(
    (key: string, value: OccurrenceOverride | undefined) => setStoredOverrides((previous) => withOverride(previous, key, value, today)),
    [setStoredOverrides, today],
  );

  return {
    incomes,
    statuses,
    attention,
    /** For the amber badge in the menu. */
    lateCount: useMemo(() => lateCount(statuses), [statuses]),
    overrides,
    transactions,
    lastReadingAt,
    now: today,
    isLoading,
    saveIncome,
    removeIncome,
    setOverride,
  };
}

/**
 * How many incomes are late or wait for the bank question — the amber badge on
 * «Έσοδα» in the menu. The same count the page works out, from the same inputs.
 *
 * The menu is on every screen, so this costs no read of its own: with no
 * incomes kept it has nothing to count, and the transactions are only listened
 * for (`fetch: false`). Until some screen has loaded them it shows nothing —
 * counted against an empty list, every income would look late.
 */
export function useIncomesNeedingAttention(): number {
  const [stored] = useWorkspaceSetting<Income[]>(INCOMES_KEY, []);
  const incomes = useMemo(() => cleanIncomes(stored), [stored]);
  const { data: transactions } = useTransactions({ fetch: false });
  const { latest } = useMoneyAccounts({ fetch: false });
  const lastReadingAt = latest?.at;
  const [storedOverrides] = useWorkspaceSetting<Record<string, OccurrenceOverride>>(PLANNER_KEYS.occurrences, {});
  const overrides = useMemo(() => cleanOverrides(storedOverrides), [storedOverrides]);

  return useMemo(() => {
    if (incomes.length === 0 || !transactions) return 0;
    // Read afresh whenever the inputs change rather than held for the visit:
    // the menu stays mounted for as long as the app is open, and an installed
    // app can stay open for days.
    const now = new Date();
    const span = incomeWindow(now);
    return lateCount(resolveIncomes(incomes, { transactions, overrides, lastReadingAt, now }, span.from, span.to));
  }, [incomes, transactions, overrides, lastReadingAt]);
}

/** The salary suggestions answered «Όχι», kept with the account so no device asks again. */
export function useDeclinedSalaries(): [string[], (signature: string) => void] {
  const [stored, setStored] = useWorkspaceSetting<string[]>(DECLINED_SALARY_KEY, []);
  const declined = useMemo(() => (Array.isArray(stored) ? stored.filter((s): s is string => typeof s === "string") : []), [stored]);
  const decline = useCallback(
    (signature: string) => setStored((previous) => (Array.isArray(previous) && previous.includes(signature) ? previous : [...(Array.isArray(previous) ? previous : []), signature])),
    [setStored],
  );
  return [declined, decline];
}

/**
 * «Ήρθε»: writes the income transaction through the ordinary create hook, so
 * it is on screen — in the list, the balance, the month bar — before the
 * network has answered, and a failed write puts everything back and says so.
 */
export function useRecordArrival() {
  const { t } = useTranslation();
  const createTransaction = useCreateTransaction();
  return useCallback(
    (income: Pick<Income, "id" | "name">, occurrence: Pick<IncomeOccurrence | IncomeStatus, "due">, input: ArrivalInput) =>
      saveWithoutWaiting(createTransaction, arrivalTransaction(income, occurrence, input), () => toast.error(t("incomes.arrived.failed"))),
    [createTransaction, t],
  );
}
