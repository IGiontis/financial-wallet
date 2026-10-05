import { describe, it, expect } from "vitest";
import type { BillWithStatus, Transaction } from "../../shared/types/IndexTypes";
import type { BudgetLine } from "../plannerPage/plannerUtils";
import { cumulativeNet, monthlyFlows, type MonthlyFlow } from "./analyticsUtils";
import { cleanSavingsGoal, firstRecordMonth, goalMonths, hasLastYear, keyPoints, lastYearWindow, percentChange, periodTotals, planByMonth } from "./dashboardUtils";

const month = (y: number, m: number) => new Date(y, m - 1, 1);

// The twelve months of the design (Oct 2025 – Sep 2026), income and spending.
const INCOME = [1800, 1800, 3600, 1800, 1950, 1800, 2700, 1800, 2700, 1800, 1800, 2000];
const EXPENSES = [1520, 1460, 2240, 1610, 1380, 1450, 1790, 1420, 1560, 1840, 2310, 1540];
const flows: MonthlyFlow[] = INCOME.map((income, i) => ({
  key: `m${i}`,
  start: month(2025, 10 + i),
  income,
  expenses: EXPENSES[i],
  invested: 0,
  goals: 0,
  net: income - EXPENSES[i],
}));

describe("the four totals", () => {
  it("adds the year up: 25.550 in, 20.120 out, 5.430 kept, 21,25%", () => {
    const totals = periodTotals(flows);
    // By hand: 7 × 1.800 + 3.600 + 1.950 + 2 × 2.700 + 2.000 = 25.550.
    expect(7 * 1800 + 3600 + 1950 + 2 * 2700 + 2000).toBe(25550);
    expect(totals.income).toBe(25550);
    expect(totals.expenses).toBe(20120);
    expect(totals.net).toBe(5430);
    expect(totals.rate).toBe(21.25); // 5.430 / 25.550
  });

  it("ends the net on the same cent as the running net position", () => {
    expect(periodTotals(flows).net).toBe(cumulativeNet(flows).at(-1)!.cumulative);
  });

  it("has no rate without income", () => {
    expect(periodTotals([{ ...flows[0], income: 0, net: -1520 }]).rate).toBeUndefined();
  });
});

describe("last year", () => {
  it("is the same months a year back, and this month only up to the same day", () => {
    expect(lastYearWindow(month(2026, 4), new Date(2026, 8, 30, 10, 0))).toEqual({ from: month(2025, 4), to: new Date(2025, 8, 30) });
  });

  it("takes 29 February to the 28th", () => {
    expect(lastYearWindow(month(2024, 1), new Date(2024, 1, 29))!.to).toEqual(new Date(2023, 1, 28));
  });

  it("does not exist for everything on record", () => {
    expect(lastYearWindow(null, new Date(2026, 8, 30))).toBeUndefined();
  });

  it("only counts when the records reach back to its first month", () => {
    const window = lastYearWindow(month(2026, 4), new Date(2026, 8, 30))!;
    expect(hasLastYear(window, month(2025, 3))).toBe(true);
    expect(hasLastYear(window, month(2025, 4))).toBe(true);
    expect(hasLastYear(window, month(2025, 5))).toBe(false);
    expect(hasLastYear(window, undefined)).toBe(false);
  });

  it("finds the first month on record", () => {
    const tx = (date: Date) => ({ date }) as Transaction;
    expect(firstRecordMonth([tx(new Date(2026, 2, 14)), tx(new Date(2025, 10, 3)), tx(new Date(2026, 0, 1))])).toEqual(month(2025, 11));
    expect(firstRecordMonth([])).toBeUndefined();
  });

  it("compares a cut-off month fairly: last year's October only to the 5th", () => {
    const records = [
      { id: "a", date: new Date(2025, 9, 3), amount: 100, type: "expense" },
      { id: "b", date: new Date(2025, 9, 20), amount: 900, type: "expense" },
    ] as unknown as Transaction[];
    const window = lastYearWindow(month(2026, 10), new Date(2026, 9, 5))!;
    const lastYear = monthlyFlows(records.filter((r) => (r.date as unknown as Date) <= window.to), window.from, window.to);
    expect(lastYear.map((f) => f.expenses)).toEqual([100]);
  });

  it("says the change in percent, one decimal, and nothing from zero", () => {
    expect(percentChange(25550, 24900)).toBe(2.6); // 650 / 24.900
    expect(percentChange(20120, 20470)).toBe(-1.7); // −350 / 20.470
    expect(percentChange(100, 0)).toBeUndefined();
    expect(percentChange(100, -50)).toBeUndefined();
  });
});

describe("the plan, laid over each month", () => {
  const bill = (over: Partial<BillWithStatus>) =>
    ({ id: over.name, frequency: "monthly", isActive: true, anchorDate: month(2026, 1), createdAt: month(2026, 1), payments: [], ...over }) as BillWithStatus;
  const bills = [
    bill({ name: "water", amount: 60 }),
    bill({ name: "insurance", amount: 120, frequency: "yearly" }), // 10 a month
    bill({ name: "power", amount: 80, isVariableAmount: true, averagePaidAmount: 90 }), // what it really costs
    bill({ name: "gym", amount: 30, intervalCount: 3 }), // every 3 months: 10 a month
    bill({ name: "new", amount: 40, anchorDate: new Date(2026, 7, 10) }), // from August
    bill({ name: "summer", amount: 50, pause: { from: "2026-07", to: "2026-08" } }), // off Jul–Aug
    bill({ name: "old", amount: 999, isActive: false }),
  ];
  const lines: BudgetLine[] = [
    { id: "food", label: "food", amount: 200, kind: "expense" },
    { id: "ski", label: "ski", amount: 100, kind: "expense", from: "2025-12", to: "2026-04", yearly: true },
    { id: "trip", label: "trip", amount: 300, kind: "expense", from: "2026-08", to: "2026-08" },
    { id: "pay", label: "pay", amount: 1450, kind: "income" },
  ];
  const now = new Date(2026, 8, 15, 12, 0); // 15 of September's 30 days

  it("adds the bills and the expense lines of each month, by hand", () => {
    const plan = planByMonth(bills, lines, [month(2026, 7), month(2026, 8), month(2026, 9)], now);
    // July: 60 + 10 + 90 + 10 (not "new" yet, "summer" off) + food 200.
    expect(plan[0]).toMatchObject({ bills: 170, lines: 200, amount: 370 });
    // August: + "new" 40, still no "summer"; food 200 + trip 300.
    expect(plan[1]).toMatchObject({ bills: 210, lines: 500, amount: 710 });
    // September, half gone: (260 + 200) × 15 / 30.
    expect(plan[2]).toMatchObject({ bills: 130, lines: 100, amount: 230 });
    expect((60 + 10 + 90 + 10 + 40 + 50) / 2).toBe(130);
  });

  it("is nothing with no bills and no expense lines", () => {
    expect(planByMonth([], [lines[3]], [month(2026, 7)], now)[0].amount).toBe(0);
  });

  it("charges a yearly season in its months only", () => {
    const plan = planByMonth([], [lines[1]], [month(2026, 11), month(2026, 12), month(2027, 4), month(2027, 5)], now);
    expect(plan.map((p) => p.amount)).toEqual([0, 100, 100, 0]);
  });
});

describe("the labelled points", () => {
  it("are the highest, the lowest and the last", () => {
    expect([...keyPoints([5, 3, 9, 3, 7])].sort()).toEqual([1, 2, 4]);
  });

  it("skip the gaps, and keep the first of two equal highs", () => {
    expect([...keyPoints([1800, 1800, 3600, 3600, null, 1500])].sort()).toEqual([2, 5]);
    expect(keyPoints([null, undefined]).size).toBe(0);
  });
});

describe("the savings goal", () => {
  it("is two numbers between 0 and 100, the floor below the ceiling", () => {
    expect(cleanSavingsGoal({ min: 20, max: 30 })).toEqual({ min: 20, max: 30 });
    expect(cleanSavingsGoal({ min: 0, max: 100 })).toEqual({ min: 0, max: 100 });
    expect(cleanSavingsGoal({ min: 30, max: 20 })).toBeUndefined();
    expect(cleanSavingsGoal({ min: 20, max: 20 })).toBeUndefined();
    expect(cleanSavingsGoal({ min: -1, max: 20 })).toBeUndefined();
    expect(cleanSavingsGoal({ min: 20, max: 101 })).toBeUndefined();
    expect(cleanSavingsGoal({ min: "20", max: 30 })).toBeUndefined();
    expect(cleanSavingsGoal(undefined)).toBeUndefined();
  });

  it("counts the design's year: 6 of 12 months reached 20%, 3 inside 20–30, 3 above, 6 below", () => {
    const rates = flows.map((f) => Math.round((f.net / f.income) * 1000) / 10);
    expect(rates).toEqual([15.6, 18.9, 37.8, 10.6, 29.2, 19.4, 33.7, 21.1, 42.2, -2.2, -28.3, 23]);
    expect(goalMonths(rates, { min: 20, max: 30 })).toEqual({ counted: 12, reached: 6, inBand: 3, above: 3, below: 6 });
  });

  it("leaves a month without income out of the count", () => {
    expect(goalMonths([null, 25, 10], { min: 20, max: 30 })).toEqual({ counted: 2, reached: 1, inBand: 1, above: 0, below: 1 });
  });
});
