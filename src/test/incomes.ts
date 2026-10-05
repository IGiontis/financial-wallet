import type { Income } from "../features/incomes/incomesUtils";

// Incomes for tests, in the shape «Έσοδα» stores them.
//
// The plan's money in used to be a `salary: { amount, dayOfMonth }` handed to
// `buildPlan`, and income lines among the budget lines. Both now come from the
// incomes, so the tests that pinned the plan's figures with them set up the
// same money this way: the salary as a monthly income running since long
// before any test's today, an income line as a monthly income with no day —
// which the plan spreads over its month exactly as it did the line.

/** The salary's id in tests — the id the migration gives the old Planner's salary, too. */
export const SALARY_ID = "salary";

/** «Μισθός», monthly on `day`, marked «ο μισθός μου». */
export const monthlySalary = (amount: number, day: number, over: Partial<Income> = {}): Income => ({
  id: SALARY_ID,
  name: "Salary",
  kind: "salary",
  amount,
  frequency: "monthly",
  day,
  start: "2020-01",
  isSalary: true,
  ...over,
});

/** Any other monthly income on `day`. */
export const monthlyIncome = (id: string, name: string, amount: number, day: number, over: Partial<Income> = {}): Income => ({
  id,
  name,
  kind: "other",
  amount,
  frequency: "monthly",
  day,
  start: "2020-01",
  ...over,
});

/** What an old income line became: monthly, with no day, spread over each month. */
export const undatedIncome = (id: string, name: string, amount: number, over: Partial<Income> = {}): Income => ({
  id,
  name,
  kind: "other",
  amount,
  frequency: "monthly",
  start: "2020-01",
  ...over,
});
