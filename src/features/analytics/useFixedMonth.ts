import { useMemo } from "react";
import type { Transaction } from "../../shared/types/IndexTypes";
import { useWorkspaceSetting } from "../../shared/hooks/useWorkspaceSetting";
import { useIncomeList } from "../incomes/useIncomes";
import { useBills } from "../bills/useBills";
import { PLANNER_KEYS, cleanOverrides } from "../plannerPage/plannerInputs";
import type { OccurrenceOverride } from "../plannerPage/plannerActuals";
import { incomesVsBills } from "./incomesVsBills";

/**
 * The FIXED part of this month, for a marker on the Statistics charts: what
 * the Incomes page says comes in and what the Bills page says goes out — the
 * very figures of «Έσοδα και πάγια» for this month (`incomesVsBills`), so the
 * marker and that chart can't disagree. The same lists that card holds: no read.
 * Zero for a side with nothing on its page.
 */
export function useFixedMonth(transactions: Transaction[], now: Date): { income: number; bills: number } {
  const { incomes } = useIncomeList();
  const { data: bills = [] } = useBills();
  const [storedOverrides] = useWorkspaceSetting<Record<string, OccurrenceOverride>>(PLANNER_KEYS.occurrences, {});
  return useMemo(() => {
    const month = incomesVsBills(now.getFullYear(), { incomes, overrides: cleanOverrides(storedOverrides), transactions, bills, now }).months[now.getMonth()];
    return { income: month?.income ?? 0, bills: month?.bills ?? 0 };
  }, [incomes, bills, storedOverrides, transactions, now]);
}
