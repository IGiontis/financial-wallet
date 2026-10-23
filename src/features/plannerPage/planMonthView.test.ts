import { describe, it, expect } from "vitest";
import { addMonths, endOfMonth, getDaysInMonth } from "date-fns";
import { buildPlan, horizonEnd, MAX_HORIZON_MONTHS, THIS_MONTH, type BudgetLine, type PlanInput } from "./plannerUtils";
import { planMonths } from "./payCycles";
import { horizonForMonth, monthRange, planMonth } from "./planMonthView";
import { monthlySalary } from "../../test/incomes";
import { computeBillStatus } from "../bills/billsUtils";
import type { Bill } from "../../shared/types/IndexTypes";

// «Μήνας» on the Planner's card: one calendar month, any up to the farthest a
// plan reaches. Each figure is checked a second way — against the plan's own
// day-by-day walk, and against the same month read out of a longer plan — so
// the month shown is the month the list closes, whatever window it came from.

const NOW = new Date(2026, 9, 23, 12);
const JAN = new Date(2026, 0, 1);
const cents = (n: number) => Math.round(n * 100) / 100;

const RENT = computeBillStatus({ id: "rent", userId: "u", name: "Rent", amount: 400, categoryId: "c", frequency: "monthly", dueDay: 1, isActive: true, anchorDate: JAN, createdAt: JAN, updatedAt: JAN } as Bill, [], NOW);
const OWN: BudgetLine = { id: "own", label: "Mine", amount: 300, kind: "expense" };

const planTo = (horizon: number, over: Partial<PlanInput> = {}) =>
  buildPlan({ bills: [RENT], goals: [], lines: [OWN], incomes: [monthlySalary(1450, 30)], openingBalance: 1000, horizon, now: NOW, actuals: { transactions: [], debts: [], overrides: {} }, ...over });

const NOV_2027 = new Date(2027, 10, 1);

describe("the plan a month needs", () => {
  it("is the shortest window that reaches the month's last day", () => {
    const horizon = horizonForMonth(NOV_2027, NOW)!;
    expect(horizonEnd(horizon, NOW) >= endOfMonth(NOV_2027)).toBe(true);
    expect(horizonEnd(horizon - 1, NOW) < endOfMonth(NOV_2027)).toBe(true);
  });

  it("is this month's own for this month, and nothing past the longest window", () => {
    expect(horizonForMonth(new Date(2026, 9, 1), NOW)).toBe(THIS_MONTH);
    const { first, last } = monthRange(NOW);
    expect(first).toEqual(new Date(2026, 9, 1));
    expect(horizonForMonth(last, NOW)).toBe(MAX_HORIZON_MONTHS);
    expect(horizonForMonth(addMonths(last, 1), NOW)).toBeUndefined();
  });
});

describe("one month of the plan — November 2027", () => {
  const plan = planTo(horizonForMonth(NOV_2027, NOW)!);
  const month = planMonth(plan, NOV_2027)!;

  it("starts, takes in, gives out and ends as the month list's slice does", () => {
    const slice = planMonths(plan).find((s) => s.start.getTime() === NOV_2027.getTime())!;
    expect(month.slice).toEqual(slice);
    expect(cents(month.slice.carried + month.in - month.out)).toBe(month.slice.close);
    // By hand: 1,450 in on the 30th; 400 rent and 300 of one's own out.
    expect(month.in).toBe(1450);
    expect(month.out).toBe(700);
  });

  it("is drawn a day a point, every day of it, off the plan's daily walk", () => {
    expect(month.view.pointStep).toBe("day");
    expect(month.view.points).toHaveLength(getDaysInMonth(NOV_2027));
    expect(month.view.points[0].date).toEqual(NOV_2027);
    expect(month.view.points.at(-1)!.date).toEqual(new Date(2027, 10, 30));
    const offset = month.slice.from;
    month.view.points.forEach((p, i) => expect(p.balance).toBe(cents(plan.daily.balance[offset + i])));
    // The last day's balance is what the month ends with.
    expect(month.view.points.at(-1)!.balance).toBe(month.slice.close);
  });

  it("says its lowest day, and the line goes no lower", () => {
    const balances = month.view.points.map((p) => p.balance);
    expect(month.view.lowestBalance).toBe(Math.min(...balances));
    expect(month.view.points.find((p) => p.balance === month.view.lowestBalance)!.date).toEqual(month.view.lowestOn);
  });

  it("is the same month read out of a plan ten years long", () => {
    const long = planMonth(planTo(MAX_HORIZON_MONTHS), NOV_2027)!;
    expect([long.slice.carried, long.in, long.out, long.slice.close, long.slice.lowest]).toEqual([month.slice.carried, month.in, month.out, month.slice.close, month.slice.lowest]);
  });

  it("carries only the events inside it", () => {
    const events = month.view.points.flatMap((p) => p.events);
    expect(events.length).toBeGreaterThan(0);
    for (const e of events) expect(e.date >= NOV_2027 && e.date <= endOfMonth(NOV_2027)).toBe(true);
  });
});

describe("this month", () => {
  it("starts from today, with the money there is today", () => {
    const month = planMonth(planTo(THIS_MONTH), new Date(2026, 9, 1))!;
    expect(month.slice.carried).toBe(1000);
    expect(month.view.points[0].date.getDate()).toBe(23);
    expect(month.view.points).toHaveLength(31 - 23 + 1);
    expect(cents(month.slice.carried + month.in - month.out)).toBe(month.slice.close);
  });

  it("is undefined for a month the plan does not hold", () => {
    expect(planMonth(planTo(THIS_MONTH), NOV_2027)).toBeUndefined();
  });
});
