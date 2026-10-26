import { useMemo } from "react";
import { addMonths, endOfMonth, startOfMonth, subMonths } from "date-fns";
import { useWorkspaceSetting } from "../../shared/hooks/useWorkspaceSetting";
import { useBills } from "../bills/useBills";
import { useDebts } from "../debts/useDebts";
import { plannableDebts } from "../debts/debtsUtils";
import { useIncomes } from "../incomes/useIncomes";
import { resolveIncomes } from "../incomes/incomesUtils";
import { useInvestmentGoals } from "../budget/useInvestments";
import { PLANNER_KEYS, cleanOneOffs, cleanSkipped } from "../plannerPage/plannerInputs";
import type { OneOff } from "../plannerPage/plannerUtils";
import { calendarPlans, type CalendarSources } from "./calendarDays";

/** How many months either way the calendar — and every timeline — goes. */
export const MONTHS_EACH_WAY = 12;

/**
 * What every day of the calendar is read from — bills, incomes, the planner's
 * extra incomes, loans and goals — gathered once for the stretch the calendar
 * pages through. The calendar and the three timelines all take it, so a day on
 * any of them and the same day on another cannot disagree.
 */
export function useCalendarSources(): { sources: CalendarSources; first: Date; last: Date; isLoading: boolean } {
  const { data: bills = [], isLoading: billsLoading } = useBills();
  const { data: allDebts = [], isLoading: debtsLoading } = useDebts();
  const { data: goals = [], isLoading: goalsLoading } = useInvestmentGoals();
  const { incomes, transactions, overrides, lastReadingAt, now, isLoading: incomesLoading } = useIncomes();
  const [storedOneOffs] = useWorkspaceSetting<OneOff[]>(PLANNER_KEYS.oneOffs, []);
  const [storedSkipped] = useWorkspaceSetting<string[]>(PLANNER_KEYS.skip, []);

  const debts = useMemo(() => plannableDebts(allDebts), [allDebts]);
  const skipIds = useMemo(() => new Set(cleanSkipped(storedSkipped)), [storedSkipped]);
  // An extra income the planner has switched off is not on the calendar either.
  const oneOffs = useMemo(() => cleanOneOffs(storedOneOffs).filter((o) => !skipIds.has(o.id)), [storedOneOffs, skipIds]);

  const first = useMemo(() => startOfMonth(subMonths(now, MONTHS_EACH_WAY)), [now]);
  const last = useMemo(() => startOfMonth(addMonths(now, MONTHS_EACH_WAY)), [now]);

  // Every time of every income over the whole stretch the calendar pages
  // through — wider than the Incomes page resolves, which stops two months out.
  const statuses = useMemo(
    () => resolveIncomes(incomes, { transactions, overrides, lastReadingAt, now }, first, endOfMonth(last)),
    [incomes, transactions, overrides, lastReadingAt, now, first, last],
  );
  const incomeName = useMemo(() => {
    const names = new Map(incomes.map((i) => [i.id, i.name]));
    return (id: string) => names.get(id) ?? "—";
  }, [incomes]);

  const actuals = useMemo(() => ({ transactions, debts, overrides, lastReadingAt }), [transactions, debts, overrides, lastReadingAt]);
  const plans = useMemo(() => calendarPlans({ goals, debts, actuals, skipIds, now }), [goals, debts, actuals, skipIds, now]);

  // The instalments to come are the open debts' (above); the payments made are every debt's.
  const sources = useMemo<CalendarSources>(() => ({ now, bills, statuses, incomeName, oneOffs, debts: allDebts, ...plans }), [now, bills, statuses, incomeName, oneOffs, allDebts, plans]);

  return { sources, first, last, isLoading: billsLoading || debtsLoading || goalsLoading || incomesLoading };
}
