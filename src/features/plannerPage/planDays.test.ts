import { describe, it, expect } from "vitest";
import { asHorizon, buildPlan, horizonEnd, planPeriods, THIS_MONTH, type BudgetLine } from "./plannerUtils";
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
    // To the cent on every row: one row less the next lands on what is printed between them.
    let running = round(plan.openingBalance);
    for (const day of days) {
      running = round(running + day.events.reduce((sum, e) => sum + e.amount, 0) + day.lines);
      expect(running).toBe(day.balance);
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

  it("lists the lowest day, with the figure the tile shows, even when nothing lands on it", () => {
    const low = days.filter((d) => d.lowest);
    expect(low).toHaveLength(1);
    expect(low[0].date.toDateString()).toBe(plan.lowestOn.toDateString());
    expect(low[0].balance).toBe(round(plan.lowestBalance));
    // Nothing printed is lower than it.
    expect(Math.min(...days.map((d) => d.balance))).toBe(low[0].balance);
  });

  it("has nothing to list when nothing comes in or goes out", () => {
    const empty = buildPlan({ bills: [], goals: [], incomes: [], now, horizon: THIS_MONTH, openingBalance: 50 });
    expect(planDays(empty)).toEqual([]);
  });
});

describe("the months of the lowest-point sheet", () => {
  it("add up: each month starts where the last ended, and in less out is exactly how far it moves", () => {
    const now = new Date(2026, 9, 16);
    // An overdue bill (the 2nd, unpaid) lands on today; the daily lines run through every month.
    const plan = buildPlan({
      bills: [bill({ name: "Νερό", amount: 60, anchorDate: new Date(2026, 0, 2) }), bill({ name: "ΔΕΗ", amount: 85, anchorDate: new Date(2026, 0, 28) })],
      goals: [] as InvestmentGoalWithStats[],
      incomes: [monthlySalary(1450, 30)],
      lines: [food],
      now,
      horizon: 12,
      openingBalance: 1600,
    });
    const periods = planPeriods(plan);
    expect(periods.length).toBeGreaterThan(10);
    let start = plan.openingBalance;
    for (const period of periods) {
      // Start + in − out = end, to the cent, month by month.
      expect(Math.abs(round(start + period.income - period.outgoing) - period.balance), period.key).toBeLessThanOrEqual(0.01);
      start = period.balance;
    }
    expect(start).toBe(plan.endingBalance);
  });
});

describe("a goal that starts later", () => {
  const now = new Date(2026, 9, 16);
  const trip = (over: Partial<InvestmentGoalWithStats> = {}) =>
    ({
      id: "trip",
      name: "Διακοπές",
      goalType: "targeted",
      targetPeriod: "custom",
      targetAmount: 1200,
      totalSaved: 0,
      remaining: 1200,
      currentPeriodSaved: 0,
      deadline: new Date(2027, 5, 30),
      isActive: true,
      isCompleted: false,
      createdAt: new Date(2026, 8, 1),
      ...over,
    }) as unknown as InvestmentGoalWithStats;
  const planOf = (goal: InvestmentGoalWithStats, horizon = 12) => buildPlan({ bills: [], goals: [goal], incomes: [], now, horizon, openingBalance: 0 });
  const slices = (goal: InvestmentGoalWithStats, horizon = 12) => planOf(goal, horizon).events.filter((e) => e.kind === "goal");

  it("asks nothing before its start, and from 12 January lands on the 12th of each month to the deadline", () => {
    const events = slices(trip({ planFrom: "2027-01-12" }));
    // January to June: six months.
    expect(events.map((e) => [e.date.getMonth(), e.date.getDate()])).toEqual([
      [0, 12],
      [1, 12],
      [2, 12],
      [3, 12],
      [4, 12],
      [5, 12],
    ]);
    // Nothing in October to December.
    expect(events.every((e) => e.date >= new Date(2027, 0, 12))).toBe(true);
  });

  it("spreads exactly what is left over those months — a second way: 1.200 over six is 200 each", () => {
    const events = slices(trip({ planFrom: "2027-01-12" }));
    expect(round(events.reduce((s, e) => s - e.amount, 0))).toBe(1200);
    expect(events.map((e) => -e.amount)).toEqual([200, 200, 200, 200, 200, 200]);
    // Against starting now: the same 1.200, over nine months instead.
    const fromNow = slices(trip());
    expect(round(fromNow.reduce((s, e) => s - e.amount, 0))).toBe(1200);
    expect(fromNow.length).toBe(9);
  });

  it("keeps the cents: 1.000 over six months still adds to exactly 1.000", () => {
    const events = slices(trip({ remaining: 1000, targetAmount: 1000, planFrom: "2027-01-12" }));
    expect(round(events.reduce((s, e) => s - e.amount, 0))).toBe(1000);
  });

  it("counts only what falls in the window: a one-month view from October holds none of it", () => {
    const plan = planOf(trip({ planFrom: "2027-01-12" }), 1);
    expect(plan.events.filter((e) => e.kind === "goal")).toEqual([]);
    expect(plan.rows.find((r) => r.id === "trip")?.total).toBe(0);
  });

  it("is ignored once its start has come — planned from today as before", () => {
    const passed = slices(trip({ planFrom: "2026-09-01" }));
    expect(passed).toEqual(slices(trip()));
  });

  it("starts a monthly goal's usual figure from the start month", () => {
    const monthly = trip({ targetPeriod: "monthly", monthlyRequired: 100, targetAmount: 100, deadline: undefined, planFrom: "2027-01-05" });
    const events = slices(monthly);
    expect(events[0].date).toEqual(new Date(2027, 0, 5));
    expect(events.every((e) => e.amount === -100)).toBe(true);
  });
});
