import { describe, it, expect } from "vitest";
import { asHorizon, buildPlan, horizonEnd, THIS_MONTH, type BudgetLine } from "./plannerUtils";
import { planDays } from "./planDays";
import { monthlySalary } from "../../test/incomes";
import type { BillWithStatus, InvestmentGoalWithStats } from "../../shared/types/IndexTypes";

const round = (n: number) => Math.round(n * 100) / 100;
const endOfDayOn = (year: number, month: number, day: number) => new Date(year, month, day, 23, 59, 59, 999);

const bill = (overrides: Partial<BillWithStatus> = {}): BillWithStatus =>
  ({
    id: `b${Math.random()}`,
    userId: "u1",
    name: "Bill",
    amount: 50,
    categoryId: "c1",
    frequency: "monthly",
    isActive: true,
    createdAt: new Date(2026, 0, 1),
    anchorDate: new Date(2026, 0, 1),
    updatedAt: new Date(2026, 0, 1),
    currentPeriodKey: "2026-10",
    isPaidThisPeriod: false,
    payments: [],
    monthlyEquivalent: 50,
    ...overrides,
  }) as BillWithStatus;

const food: BudgetLine = { id: "l1", label: "Φαγητό", amount: 310, kind: "expense" };

describe("only this month", () => {
  it("ends on the last day of the month you are in, whatever the day", () => {
    expect(horizonEnd(THIS_MONTH, new Date(2026, 9, 16))).toEqual(endOfDayOn(2026, 9, 31));
    expect(horizonEnd(THIS_MONTH, new Date(2026, 9, 1))).toEqual(endOfDayOn(2026, 9, 31));
    // The last day: the plan is that one day, not the next month.
    expect(horizonEnd(THIS_MONTH, new Date(2026, 9, 31))).toEqual(endOfDayOn(2026, 9, 31));
    // February, in a leap year and not.
    expect(horizonEnd(THIS_MONTH, new Date(2028, 1, 10))).toEqual(endOfDayOn(2028, 1, 29));
    expect(horizonEnd(THIS_MONTH, new Date(2027, 1, 10))).toEqual(endOfDayOn(2027, 1, 28));
  });

  it("stops short of where one month goes, except from the 1st, where the two are the same", () => {
    const mid = new Date(2026, 9, 16);
    expect(horizonEnd(1, mid)).toEqual(endOfDayOn(2026, 10, 30));
    expect(horizonEnd(THIS_MONTH, mid).getTime()).toBeLessThan(horizonEnd(1, mid).getTime());
    const first = new Date(2026, 9, 1);
    expect(horizonEnd(THIS_MONTH, first)).toEqual(horizonEnd(1, first));
  });

  it("is kept as 0 when read back, and a plan built on it covers only this month", () => {
    expect(asHorizon(0)).toBe(THIS_MONTH);
    expect(asHorizon("0")).toBe(THIS_MONTH);
    const plan = buildPlan({ bills: [], goals: [], incomes: [monthlySalary(2000, 20)], now: new Date(2026, 9, 16), horizon: THIS_MONTH, openingBalance: 100 });
    expect(plan.end).toEqual(endOfDayOn(2026, 9, 31));
    expect(plan.days).toBe(15);
    // The 20th's pay is in it, November's is not.
    expect(plan.events.filter((e) => e.amount > 0).map((e) => e.date.getDate())).toEqual([20]);
  });
});

describe("planDays — the balance line as a list of days", () => {
  const now = new Date(2026, 9, 16);
  const plan = buildPlan({
    bills: [bill({ name: "Ρεύμα", amount: 80, anchorDate: new Date(2026, 0, 25) }), bill({ name: "Νερό", amount: 25, anchorDate: new Date(2026, 0, 20) })],
    goals: [] as InvestmentGoalWithStats[],
    incomes: [monthlySalary(1500, 20)],
    lines: [food],
    now,
    horizon: 3,
    openingBalance: 400,
  });
  const days = planDays(plan);

  it("lists only days something lands on, in order, each with the walk's own balance", () => {
    expect(days.length).toBeGreaterThan(0);
    for (let i = 1; i < days.length; i++) expect(days[i].date.getTime()).toBeGreaterThan(days[i - 1].date.getTime());
    for (const day of days) {
      const offset = Math.round((day.date.getTime() - plan.start.getTime()) / 86_400_000);
      expect(day.balance).toBe(round(plan.daily.balance[offset]));
    }
  });

  it("adds up: from the money you start with, each day's things and lines give the next day's balance", () => {
    // A second way to the same figures — not read off the walk, rebuilt from what the list prints.
    let running = plan.openingBalance;
    for (const day of days) {
      running += day.events.reduce((sum, e) => sum + e.amount, 0) + day.lines;
      expect(Math.abs(running - day.balance)).toBeLessThanOrEqual(0.01 * (days.indexOf(day) + 1));
    }
    // And it ends on the figure the plan ends on.
    expect(days.at(-1)!.balance).toBe(plan.endingBalance);
  });

  it("holds every dated thing exactly once", () => {
    const listed = days.flatMap((d) => d.events);
    expect(listed.length).toBe(plan.events.length);
    expect(round(listed.reduce((s, e) => s + e.amount, 0))).toBe(round(plan.events.reduce((s, e) => s + e.amount, 0)));
  });

  it("carries the budget lines, whose whole is what the plan spends on them", () => {
    const lines = round(days.reduce((s, d) => s + d.lines, 0));
    expect(lines).toBeLessThan(0);
    expect(Math.abs(-lines - plan.budgetTotal)).toBeLessThanOrEqual(0.01 * days.length);
  });

  it("is empty-handed with nothing in the plan but still says where it starts", () => {
    const empty = buildPlan({ bills: [], goals: [], incomes: [], now, horizon: THIS_MONTH, openingBalance: 50 });
    expect(planDays(empty)).toEqual([]);
  });
});
