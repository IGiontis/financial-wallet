import { describe, it, expect } from "vitest";
import { billOccurrences, buildPlan, horizonEnd } from "./plannerUtils";
import type { BillWithStatus, InvestmentGoalWithStats, Transaction } from "../../shared/types/IndexTypes";

const now = new Date(2026, 7, 14); // 14 Aug 2026
const salary = { amount: 2000, dayOfMonth: 1, occurrences: 4 };

const tx = (overrides: Partial<Transaction> = {}): Transaction =>
  ({
    id: Math.random().toString(),
    userId: "u1",
    amount: 10,
    type: "expense",
    categoryId: "food",
    date: new Date(2026, 7, 10),
    description: "Shop",
    createdAt: new Date(2026, 7, 10),
    updatedAt: new Date(2026, 7, 10),
    ...overrides,
  }) as Transaction;

const income = (amount: number, date: Date) => tx({ amount, type: "income", categoryId: "salary", description: "Salary", date });

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
    currentPeriodKey: "2026-08",
    isPaidThisPeriod: false,
    payments: [],
    monthlyEquivalent: 50,
    ...overrides,
  }) as BillWithStatus;

const base = { transactions: [] as Transaction[], bills: [] as BillWithStatus[], goals: [] as InvestmentGoalWithStats[], salary, now };

describe("horizonEnd", () => {
  it("stops the day before payday for the pay cycle", () => {
    expect(horizonEnd("payday", 1, now)).toEqual(new Date(2026, 7, 31));
  });

  it("runs to the end of the calendar month", () => {
    expect(horizonEnd("month", 1, now)).toEqual(new Date(2026, 7, 31, 23, 59, 59, 999));
  });

  it("covers three and six whole months", () => {
    expect(horizonEnd("3m", 1, now).getMonth()).toBe(9); // through October
    expect(horizonEnd("6m", 1, now).getMonth()).toBe(0); // through January
    expect(horizonEnd("6m", 1, now).getFullYear()).toBe(2027);
  });
});

describe("billOccurrences", () => {
  it("repeats a monthly bill once per month across the window", () => {
    const dates = billOccurrences(bill({ dueDay: 20 }), new Date(2026, 7, 14), new Date(2026, 9, 31)).map((o) => o.date);

    expect(dates).toEqual([new Date(2026, 7, 20), new Date(2026, 8, 20), new Date(2026, 9, 20)]);
  });

  it("respects a custom interval", () => {
    const water = bill({ dueDay: 10, intervalCount: 2, anchorDate: new Date(2026, 0, 1) });
    const dates = billOccurrences(water, new Date(2026, 7, 14), new Date(2026, 11, 31)).map((o) => o.date.getMonth());

    // Anchored at January, so buckets are Jul+Aug, Sep+Oct, Nov+Dec.
    expect(dates).toEqual([6, 8, 10]);
  });

  it("skips a period that has already been paid", () => {
    const paid = bill({
      dueDay: 20,
      payments: [{ id: "p", userId: "u1", billId: "x", periodKey: "2026-08", amount: 50, paidDate: new Date(2026, 7, 3), createdAt: new Date(2026, 7, 3) }],
    } as Partial<BillWithStatus>);

    const months = billOccurrences(paid, new Date(2026, 7, 14), new Date(2026, 9, 31)).map((o) => o.date.getMonth());
    expect(months).toEqual([8, 9]); // August dropped, September and October kept
  });

  it("keeps an unpaid bill whose date has already gone", () => {
    // A late bill still has to be paid; dropping it would be the one omission
    // the plan cannot afford.
    const late = billOccurrences(bill({ dueDay: 9 }), new Date(2026, 7, 14), new Date(2026, 7, 31));
    expect(late[0].date).toEqual(new Date(2026, 7, 9));
  });

  it("returns nothing when the bill has no due day", () => {
    expect(billOccurrences(bill(), new Date(2026, 7, 14), new Date(2026, 9, 31))).toEqual([]);
  });
});

describe("buildPlan across months", () => {
  it("credits future paydays, without which a long window is a fiction", () => {
    const plan = buildPlan({ ...base, horizon: "3m", transactions: [income(2000, new Date(2026, 7, 1))] });
    const paydays = plan.events.filter((e) => e.kind === "income");

    expect(paydays.map((e) => e.date)).toEqual([new Date(2026, 8, 1), new Date(2026, 9, 1)]);
    expect(paydays.every((e) => e.amount === 2000)).toBe(true);
  });

  it("charges a monthly bill once per month, not once in total", () => {
    const plan = buildPlan({ ...base, horizon: "3m", bills: [bill({ name: "Ρεύμα", amount: 100, dueDay: 20 })] });

    expect(plan.events.filter((e) => e.kind === "bill")).toHaveLength(3);
    expect(plan.billsTotal).toBe(300);
  });

  it("never credits the coming salary inside the pay-cycle window", () => {
    const plan = buildPlan({ ...base, horizon: "payday", transactions: [income(2000, new Date(2026, 7, 1))] });
    expect(plan.events.filter((e) => e.kind === "income")).toHaveLength(0);
  });

  it("asks for the goal target again in each later month", () => {
    const goal = {
      id: "g1",
      userId: "u1",
      name: "Trip",
      goalType: "targeted",
      targetPeriod: "monthly",
      monthlyRequired: 200,
      currentPeriodSaved: 200, // this month is already funded
      isActive: true,
      isCompleted: false,
      createdAt: new Date(2026, 0, 1),
      updatedAt: new Date(2026, 0, 1),
      totalDeposited: 200,
      totalWithdrawn: 0,
      totalSaved: 200,
      contributionCount: 1,
      withdrawalCount: 0,
    } as InvestmentGoalWithStats;

    const plan = buildPlan({ ...base, horizon: "3m", goals: [goal] });
    const reserves = plan.events.filter((e) => e.kind === "goal");

    // Nothing more wanted this month, then the full target in September and October.
    expect(plan.goalsReserved).toBe(0);
    expect(reserves.map((e) => e.amount)).toEqual([-200, -200]);
  });

  it("carries a bill's real grace window and last day", () => {
    const plan = buildPlan({ ...base, bills: [bill({ name: "Ρεύμα", amount: 100, dueDay: 20, graceDays: 25 })] });
    const [electricity] = plan.events.filter((e) => e.kind === "bill");

    expect(electricity.graceDays).toBe(25);
    expect(electricity.deadline).toEqual(new Date(2026, 8, 14)); // 20 Aug + 25 days
  });

  it("gives no slack to a strict bill, wherever it falls in the window", () => {
    // The trap: a subscription due after payday is not thereby deferrable. Grace
    // has to come from the bill, not from where it sits in the calendar.
    const plan = buildPlan({ ...base, horizon: "3m", bills: [bill({ name: "Netflix", amount: 12, dueDay: 22 })] });
    const occurrences = plan.events.filter((e) => e.kind === "bill");

    expect(occurrences.length).toBeGreaterThan(1);
    expect(occurrences.every((e) => e.graceDays === 0)).toBe(true);
    // Every occurrence after the first lands past the next payday, and none of
    // them may claim any room to wait.
    expect(occurrences.filter((e) => e.date > plan.nextSalary).length).toBeGreaterThan(0);
    expect(occurrences.every((e) => e.deadline?.getTime() === e.date.getTime())).toBe(true);
  });
});
