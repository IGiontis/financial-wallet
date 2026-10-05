import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";
import type { Income } from "./incomesUtils";
import { useSalaryIncome } from "./useSalaryIncome";
import { monthlyIncome, monthlySalary } from "../../test/incomes";

// The salary the Bills page («τι αφήνουν τα πάγια», pay day on the month) and
// the Allocation page set against a month's costs — from «Έσοδα» now, not the
// old Planner field.

const list = vi.hoisted(() => ({ incomes: [] as Income[] }));
vi.mock("./useIncomes", () => ({ useIncomeList: () => ({ incomes: list.incomes, isLoading: false }) }));
vi.mock("../transactions/hooks/useTransactions", () => ({ useTransactions: () => ({ data: [] }) }));

const NOW = new Date(2026, 9, 6);

beforeEach(() => {
  list.incomes = [];
});

describe("useSalaryIncome", () => {
  it("is the income marked as the salary: its month's figure and its day this month", () => {
    list.incomes = [monthlyIncome("rent", "Rent", 400, 5), monthlySalary(1450, 30)];
    const { result } = renderHook(() => useSalaryIncome(NOW));
    expect(result.current).toMatchObject({ monthly: 1450, thisMonth: { amount: 1450, dayOfMonth: 30 } });
    expect(result.current.income?.id).toBe("salary");
  });

  it("brings a weekly salary's month, 52 ⁄ 12 of it, and its first day this month", () => {
    // Fridays from 4 September: October's first is the 2nd.
    list.incomes = [monthlySalary(400, 5, { frequency: "weekly", start: "2026-09-04" })];
    const { result } = renderHook(() => useSalaryIncome(NOW));
    expect(result.current.monthly).toBe(Math.round(((400 * 52) / 12) * 100) / 100);
    expect(result.current.monthly).toBe(1733.33);
    expect(result.current.thisMonth).toEqual({ amount: 400, dayOfMonth: 2 });
  });

  it("is no salary at all without one — not another income, not an archived salary", () => {
    list.incomes = [monthlyIncome("rent", "Rent", 400, 5), monthlySalary(1450, 30, { active: false })];
    const { result } = renderHook(() => useSalaryIncome(NOW));
    expect(result.current).toMatchObject({ income: undefined, monthly: 0, thisMonth: undefined });
  });
});
