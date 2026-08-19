import { describe, it, expect } from "vitest";
import { asHorizon, billOccurrences, buildPlan, horizonEnd, horizonMonths } from "./plannerUtils";
import type { BillWithStatus, InvestmentGoalWithStats } from "../../shared/types/IndexTypes";

const now = new Date(2026, 7, 14); // 14 Aug 2026
const salary = { amount: 2000, dayOfMonth: 20, occurrences: 4 };

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

const base = { bills: [] as BillWithStatus[], goals: [] as InvestmentGoalWithStats[], salary, now };

describe("horizonEnd", () => {
  it("covers whole calendar months, the current one included", () => {
    expect(horizonEnd("1m", now)).toEqual(new Date(2026, 7, 31, 23, 59, 59, 999));
    expect(horizonEnd("3m", now).getMonth()).toBe(9); // through October
    expect(horizonEnd("6m", now).getMonth()).toBe(0); // through January
    expect(horizonEnd("6m", now).getFullYear()).toBe(2027);
  });

  it("reports the months it stands for", () => {
    expect([horizonMonths("1m"), horizonMonths("3m"), horizonMonths("6m"), horizonMonths("12m")]).toEqual([1, 3, 6, 12]);
  });

  it("survives a horizon name left behind by an older version", () => {
    // The horizon is persisted, so browsers still hand back "payday" and
    // "month" from the previous set. Unguarded that reached addMonths as NaN
    // and every date on the page became invalid.
    for (const stale of ["payday", "month", "", null, undefined, 3]) {
      expect(asHorizon(stale)).toBe("1m");
      expect(Number.isNaN(horizonEnd(stale as never, now).getTime())).toBe(false);
      expect(Number.isNaN(buildPlan({ ...base, horizon: stale as never }).end.getTime())).toBe(false);
    }
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
  it("credits a payday in every month, without which a long window is a fiction", () => {
    const paydays = buildPlan({ ...base, horizon: "3m" }).events.filter((e) => e.kind === "income");

    expect(paydays.map((e) => e.date)).toEqual([new Date(2026, 7, 20), new Date(2026, 8, 20), new Date(2026, 9, 20)]);
    expect(paydays.every((e) => e.amount === 2000)).toBe(true);
  });

  it("carries a bill's real grace window and last day", () => {
    const plan = buildPlan({ ...base, horizon: "1m", bills: [bill({ name: "Ρεύμα", amount: 100, dueDay: 20, graceDays: 25 })] });
    const [electricity] = plan.events.filter((e) => e.kind === "bill");

    expect(electricity.graceDays).toBe(25);
    expect(electricity.deadline).toEqual(new Date(2026, 8, 14)); // 20 Aug + 25 days
  });

  it("gives no slack to a strict bill, wherever it falls in the window", () => {
    // The trap: a subscription due after payday is not thereby deferrable. Grace
    // has to come from the bill, not from where it sits in the calendar.
    const occurrences = buildPlan({ ...base, horizon: "3m", bills: [bill({ name: "Netflix", amount: 12, dueDay: 22 })] }).events.filter((e) => e.kind === "bill");

    expect(occurrences.length).toBeGreaterThan(1);
    expect(occurrences.every((e) => e.graceDays === 0)).toBe(true);
    expect(occurrences.every((e) => e.deadline?.getTime() === e.date.getTime())).toBe(true);
  });
});
