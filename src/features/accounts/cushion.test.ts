import { describe, it, expect } from "vitest";
import { committedMonthly, cushionLasts, cushionMonthly, debtMonthlyShare, emergencyTarget } from "./cushion";
import type { BillWithStatus, DebtWithStatus, InvestmentGoalWithStats } from "../../shared/types/IndexTypes";

const now = new Date(2026, 8, 5);

const bill = (monthlyEquivalent: number, isActive = true): BillWithStatus => ({ isActive, monthlyEquivalent }) as BillWithStatus;

// Running, unless a test says otherwise: a paused goal claims nothing (see below).
const goal = (monthlyRequired: number, over: Partial<InvestmentGoalWithStats> = {}): InvestmentGoalWithStats =>
  ({ goalType: "targeted", targetPeriod: "monthly", monthlyRequired, isActive: true, isCompleted: false, ...over }) as unknown as InvestmentGoalWithStats;

const debt = (remaining: number, over: Partial<DebtWithStatus> = {}): DebtWithStatus => ({ direction: "owed_by_me", isSettled: false, remaining, ...over }) as DebtWithStatus;

describe("committedMonthly", () => {
  it("adds up bills, goals and what you owe", () => {
    const c = committedMonthly([bill(300), bill(220)], [goal(150)], [debt(80)], now);
    expect(c).toEqual({ bills: 520, goals: 150, debts: 80, total: 750 });
  });

  it("claims nothing for a paused goal, or a finished one — as the Planner does", () => {
    const c = committedMonthly([], [goal(150), goal(200, { isActive: false }), goal(90, { isCompleted: true })], [], now);
    expect(c.goals).toBe(150);
    expect(c.total).toBe(150);
  });

  it("ignores a paused bill", () => {
    expect(committedMonthly([bill(300), bill(999, false)], [], [], now).bills).toBe(300);
  });

  it("leaves out money owed to you, and a settled debt", () => {
    expect(committedMonthly([], [], [debt(500, { direction: "owed_to_me" }), debt(80)], now).debts).toBe(80);
    expect(committedMonthly([], [], [debt(200, { isSettled: true })], now).debts).toBe(0);
  });
});

describe("debtMonthlyShare", () => {
  it("spreads a dated debt over the months until it is due", () => {
    expect(debtMonthlyShare(debt(600, { dueDate: new Date(2026, 10, 1) }), now)).toBe(200);
  });

  it("asks for all of it in the month it is due, once the date has gone, or with no date", () => {
    expect(debtMonthlyShare(debt(600, { dueDate: new Date(2026, 8, 30) }), now)).toBe(600);
    expect(debtMonthlyShare(debt(600, { dueDate: new Date(2026, 5, 1) }), now)).toBe(600);
    expect(debtMonthlyShare(debt(600), now)).toBe(600);
  });

  it("is what committedMonthly counts, rather than the whole balance", () => {
    const far = debt(655, { dueDate: new Date(2027, 5, 1) });
    expect(committedMonthly([], [], [far], now).debts).toBe(debtMonthlyShare(far, now));
    expect(committedMonthly([], [], [far], now).debts).toBeLessThan(655);
  });
});

describe("emergencyTarget", () => {
  it("is the bills and instalments times the months — the goals left out — and never less than one month", () => {
    const committed = { bills: 900, goals: 250, debts: 120, total: 1270 };
    // 900 + 120 = 1.020 a month: the 250 into goals stops with the income.
    expect(cushionMonthly(committed)).toBe(1020);
    expect(emergencyTarget(committed, 3)).toBe(3060);
    expect(emergencyTarget(committed, 6)).toBe(6120);
    expect(emergencyTarget(committed, 0)).toBe(1020);
    expect(emergencyTarget(committed, -2)).toBe(1020);
    // A second way: the whole commitment, less the goals.
    expect(emergencyTarget(committed, 3)).toBe((committed.total - committed.goals) * 3);
  });
});

describe("how long the cushion lasts", () => {
  it("says days below a month: 660 against 2.530,64 a month is 7 days, not 0,26 months", () => {
    expect(cushionLasts(660, 2530.64)).toEqual({ days: 7 });
  });

  it("says months, to one decimal, from one month up — never rounding up what is not there", () => {
    expect(cushionLasts(3000, 1000)).toEqual({ months: 3 });
    expect(cushionLasts(3790, 1000)).toEqual({ months: 3.7 });
    // A second way: the months said, times the month, never exceed what is saved.
    for (const saved of [1000, 1999, 2500, 7591.92]) {
      const r = cushionLasts(saved, 1000) as { months: number };
      expect(r.months * 1000).toBeLessThanOrEqual(saved);
    }
  });

  it("has nothing to say with nothing fixed to cover, and counts nothing below zero", () => {
    expect(cushionLasts(500, 0)).toBeUndefined();
    expect(cushionLasts(-50, 1000)).toEqual({ days: 0 });
  });
});
