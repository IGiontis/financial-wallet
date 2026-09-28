import { useMemo } from "react";
import { useWorkspaceSetting } from "../../shared/hooks/useWorkspaceSetting";
import { useSettingsOpening } from "../../shared/hooks/useSettingsOpening";
import { useTransactions } from "../transactions/hooks/useTransactions";
import { ACCOUNTS_KEY, CHECK_INS_KEY, balanceAnchors, readCheckIns, type BalanceCheckIn, type MoneyAccount } from "./accountsUtils";

// Stored with the planner's state on the user document rather than in a
// collection of their own: a handful of accounts and a reading a week is a few
// kilobytes a year, it costs no extra read — the document is fetched anyway —
// and it needs no new security rule in the console before it works.

const isAccount = (a: unknown): a is MoneyAccount =>
  !!a && typeof (a as MoneyAccount).id === "string" && typeof (a as MoneyAccount).name === "string" && ((a as MoneyAccount).kind === "bank" || (a as MoneyAccount).kind === "cash");

const isCheckIn = (c: unknown): c is BalanceCheckIn =>
  !!c && typeof (c as BalanceCheckIn).id === "string" && typeof (c as BalanceCheckIn).at === "string" && !!(c as BalanceCheckIn).amounts && typeof (c as BalanceCheckIn).amounts === "object";

/** Only the list of accounts — for a form that offers them, without the readings' arithmetic. */
export function useAccountList(): MoneyAccount[] {
  const [stored] = useWorkspaceSetting<MoneyAccount[]>(ACCOUNTS_KEY, []);
  return useMemo(() => (Array.isArray(stored) ? stored.filter(isAccount) : []), [stored]);
}

/** The accounts, their readings, and everything worked out from them. */
export function useMoneyAccounts() {
  const [storedAccounts, setAccounts] = useWorkspaceSetting<MoneyAccount[]>(ACCOUNTS_KEY, []);
  const [storedCheckIns, setCheckIns] = useWorkspaceSetting<BalanceCheckIn[]>(CHECK_INS_KEY, []);
  const { data: transactions = [], isLoading: transactionsLoading } = useTransactions();
  const { opening: legacy, isLoading: openingLoading } = useSettingsOpening();

  // Whatever the document holds is checked before it is trusted: it is typed
  // by nobody, and one malformed entry should cost that entry, not the page.
  const accounts = useMemo(() => (Array.isArray(storedAccounts) ? storedAccounts.filter(isAccount) : []), [storedAccounts]);
  const checkIns = useMemo(() => (Array.isArray(storedCheckIns) ? storedCheckIns.filter(isCheckIn) : []), [storedCheckIns]);

  const readings = useMemo(() => readCheckIns(checkIns, accounts, transactions, legacy), [checkIns, accounts, transactions, legacy]);
  const anchors = useMemo(() => balanceAnchors(readings, transactions, legacy), [readings, transactions, legacy]);

  return {
    accounts,
    checkIns,
    setAccounts,
    setCheckIns,
    readings,
    latest: readings.at(-1),
    anchors,
    transactions,
    legacy,
    isLoading: transactionsLoading || openingLoading,
  };
}
