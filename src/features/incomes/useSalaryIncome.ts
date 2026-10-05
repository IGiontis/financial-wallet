import { useMemo } from "react";
import { useTransactions } from "../transactions/hooks/useTransactions";
import { incomeInMonth, monthlyEquivalent, salaryIncome, type Income } from "./incomesUtils";
import { useIncomeList } from "./useIncomes";

/**
 * The salary, for the screens that set one month's pay against one month's
 * costs: the Bills page («τι αφήνουν τα πάγια», and pay day on the month's
 * timeline) and the Allocation page.
 *
 * They read the old Planner's salary field until the salary moved to
 * «Έσοδα». Now it is the income marked «ο μισθός μου» — the same one the
 * Planner cuts its pay cycles at — so no screen can be paid on another day.
 * Without one, they show what they always showed with no salary set.
 *
 * `monthly`: what it brings in an average month (`monthlyEquivalent`) — its
 * figure for a monthly salary, 52 ⁄ 12 of it for a weekly one. `thisMonth`:
 * when it comes in the month of `now` and how much, for a month drawn day by
 * day.
 */
export function useSalaryIncome(now: Date): { income?: Income; monthly: number; thisMonth?: { amount: number; dayOfMonth: number }; isLoading: boolean } {
  const { incomes, isLoading } = useIncomeList();
  const { data: transactions = [] } = useTransactions();
  const income = useMemo(() => salaryIncome(incomes), [incomes]);
  const monthly = useMemo(() => (income ? monthlyEquivalent(income, transactions) : 0), [income, transactions]);
  const thisMonth = useMemo(() => (income ? incomeInMonth(income, transactions, now) : undefined), [income, transactions, now]);
  return { income, monthly, thisMonth, isLoading };
}
