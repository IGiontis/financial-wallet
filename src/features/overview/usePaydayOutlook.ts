import { useMemo } from "react";
import { useTransactions } from "../transactions/hooks/useTransactions";
import { useInvestmentGoals } from "../budget/useInvestments";
import { useBills } from "../bills/useBills";
import { useDebts } from "../debts/useDebts";
import { plannableDebts } from "../debts/debtsUtils";
import { useWorkspaceSetting } from "../../shared/hooks/useWorkspaceSetting";
import { buildPlan, type BudgetLine, type OneOff } from "../plannerPage/plannerUtils";
import type { OccurrenceOverride } from "../plannerPage/plannerActuals";
import { cleanLines, cleanOneOffs, cleanOverrides, cleanSkipped, PLANNER_KEYS } from "../plannerPage/plannerInputs";
import { useIncomeList } from "../incomes/useIncomes";
import { PAYDAY_HORIZON, paydayOutlook } from "./overviewTabs";

/**
 * The Planner's answer to "will I make it to pay day?", for the Overview.
 *
 * Built from exactly what the Planner builds from — the incomes on «Έσοδα»,
 * the same saved lines, one-offs, switched-off rows and words about single
 * occurrences, read through the same checks — but always starting from the
 * money there is now, the figure on the card above it. The Planner can be
 * pointed at a figure of your own for "what if I had…"; the Overview is about
 * what is.
 *
 * Two months of plan: enough to reach the next pay day even when this month's
 * came early — or is waiting on the question below — and the next is a month
 * away. A day's balance does not depend on how far ahead the plan looks, so
 * the shorter window changes nothing.
 *
 * `lastReadingAt` is when the banks were last read (`useMoneyAccounts().latest
 * ?.at`), which the page already has. The balance starts from that reading, so
 * pay that arrived early and was never written down is already in it; the
 * plan needs the time to stop counting that pay again — see `mayBeInReading`.
 *
 * Only reads: the Overview is for looking, and every answer is given on the
 * page the row links to.
 */
export function usePaydayOutlook(now: Date, balance: number, lastReadingAt?: Date) {
  const { data: transactions = [] } = useTransactions();
  const { data: bills = [] } = useBills();
  const { data: goals = [] } = useInvestmentGoals();
  const { data: allDebts = [] } = useDebts();
  const { incomes } = useIncomeList();

  const [storedLines] = useWorkspaceSetting<BudgetLine[]>(PLANNER_KEYS.lines, []);
  const [storedOneOffs] = useWorkspaceSetting<OneOff[]>(PLANNER_KEYS.oneOffs, []);
  const [storedSkipped] = useWorkspaceSetting<string[]>(PLANNER_KEYS.skip, []);
  const [storedOverrides] = useWorkspaceSetting<Record<string, OccurrenceOverride>>(PLANNER_KEYS.occurrences, {});

  const lines = useMemo(() => cleanLines(storedLines), [storedLines]);
  const oneOffs = useMemo(() => cleanOneOffs(storedOneOffs), [storedOneOffs]);
  const skipIds = useMemo(() => new Set(cleanSkipped(storedSkipped)), [storedSkipped]);
  const overrides = useMemo(() => cleanOverrides(storedOverrides), [storedOverrides]);
  const debts = useMemo(() => plannableDebts(allDebts), [allDebts]);
  const actuals = useMemo(() => ({ transactions, debts, overrides, lastReadingAt }), [transactions, debts, overrides, lastReadingAt]);

  const plan = useMemo(
    () => buildPlan({ bills, goals, lines, oneOffs, debts, incomes, openingBalance: balance, skipIds, horizon: PAYDAY_HORIZON, now, actuals }),
    [bills, goals, lines, oneOffs, debts, incomes, balance, skipIds, now, actuals],
  );
  const outlook = useMemo(() => paydayOutlook(plan, now), [plan, now]);

  // What the Planner found overdue — an instalment not seen, a one-off not in
  // — for the list of things that want you. Not the incomes: those are listed
  // from «Έσοδα» itself (`useIncomes().attention`), and answered there.
  const late = useMemo(() => plan.occurrences.filter((o) => o.status === "late" && o.source !== "income"), [plan.occurrences]);
  // A one-off with no record that the last reading may already hold: left out
  // of the walk above until the user says whether it has come.
  const unconfirmed = useMemo(() => plan.occurrences.filter((o) => o.status === "unconfirmed" && o.source !== "income"), [plan.occurrences]);

  return { outlook, late, unconfirmed };
}
