import { describe, it, expect } from "vitest";
import { daysSinceContribution, monthsRunning, perWeek, projectedFinish, savingPace, WEEKS_PER_MONTH } from "./goalDisplay";
import type { InvestmentGoalWithStats } from "../../../shared/types/IndexTypes";

// The figures the goal card uses to answer "am I going to make it". Each one is
// checked against a second route to the same number, because a pace that is
// quietly wrong turns into a finish date the reader will plan around.

const NOW = new Date(2026, 8, 9); // 9 September 2026

const goal = (over: Partial<InvestmentGoalWithStats> = {}): InvestmentGoalWithStats =>
  ({
    id: "g1",
    userId: "u1",
    name: "Trip",
    goalType: "targeted",
    isActive: true,
    isCompleted: false,
    createdAt: new Date(2026, 1, 1), // 1 February 2026: seven months back
    updatedAt: NOW,
    totalDeposited: 0,
    totalWithdrawn: 0,
    totalSaved: 0,
    contributionCount: 0,
    withdrawalCount: 0,
    ...over,
  }) as InvestmentGoalWithStats;

describe("monthsRunning", () => {
  it("counts the months since the goal was created", () => {
    expect(monthsRunning(goal(), NOW)).toBe(7); // February to September
    expect(monthsRunning(goal({ createdAt: new Date(2025, 8, 1) }), NOW)).toBe(12);
  });

  it("gives a goal created this month one month, not zero", () => {
    // Dividing by the real answer would make every new goal's pace infinite.
    expect(monthsRunning(goal({ createdAt: new Date(2026, 8, 1) }), NOW)).toBe(1);
    expect(monthsRunning(goal({ createdAt: new Date(2026, 8, 30) }), NOW)).toBe(1);
  });
});

describe("savingPace", () => {
  it("is what is in the pot divided by the months it took", () => {
    const pace = savingPace(goal({ totalSaved: 1850 }), NOW)!;

    expect(pace).toBeCloseTo(1850 / 7, 2);
    // The other way round: the pace times the months is what was saved.
    expect(pace * monthsRunning(goal(), NOW)).toBeCloseTo(1850, 0);
  });

  it("counts what is left after withdrawals, not what went in", () => {
    // 2,050 deposited less 200 taken back out is 1,850 actually saved.
    const withdrawn = goal({ totalDeposited: 2050, totalWithdrawn: 200, totalSaved: 1850 });
    const clean = goal({ totalDeposited: 1850, totalWithdrawn: 0, totalSaved: 1850 });

    expect(savingPace(withdrawn, NOW)).toBe(savingPace(clean, NOW));
  });

  it("has no rate to report when nothing has been saved", () => {
    expect(savingPace(goal({ totalSaved: 0 }), NOW)).toBeUndefined();
    expect(savingPace(goal({ totalSaved: -50 }), NOW)).toBeUndefined();
  });
});

describe("projectedFinish", () => {
  const targeted = (over: Partial<InvestmentGoalWithStats> = {}) => goal({ targetAmount: 4500, totalSaved: 1850, remaining: 2650, ...over });

  it("lands where the current pace takes it", () => {
    // 264 a month against 2,650 left is eleven more months: August 2027.
    const projection = projectedFinish(targeted(), NOW)!;

    expect(projection.date).toEqual(new Date(2027, 7, 1));
    expect(Math.ceil(2650 / savingPace(targeted(), NOW)!)).toBe(11);
  });

  it("says how far past the deadline that is", () => {
    const projection = projectedFinish(targeted({ deadline: new Date(2027, 4, 20) }), NOW)!;

    expect(projection.monthsLate).toBe(3); // May to August
    expect(projection.monthsEarly).toBeUndefined();
  });

  it("says how much room there is when the pace is good enough", () => {
    const projection = projectedFinish(targeted({ deadline: new Date(2028, 0, 15) }), NOW)!;

    expect(projection.monthsEarly).toBe(5);
    expect(projection.monthsLate).toBeUndefined();
  });

  it("reports neither when it lands in the deadline's own month", () => {
    const projection = projectedFinish(targeted({ deadline: new Date(2027, 7, 31) }), NOW)!;

    expect(projection.monthsLate).toBeUndefined();
    expect(projection.monthsEarly).toBeUndefined();
    expect(projection.date).toEqual(new Date(2027, 7, 1));
  });

  it("has nothing to project without a pace, a target, or anything left to save", () => {
    expect(projectedFinish(targeted({ totalSaved: 0, remaining: 4500 }), NOW)).toBeUndefined();
    expect(projectedFinish(targeted({ remaining: 0 }), NOW)).toBeUndefined();
    expect(projectedFinish(goal({ goalType: "open_ended", totalSaved: 900 }), NOW)).toBeUndefined();
  });

  it("stays out of the way of a recurring goal, which has no finish to reach", () => {
    // A monthly goal repeats for ever; "when does it finish" is not a question
    // it can be asked.
    expect(projectedFinish(targeted({ targetPeriod: "monthly" }), NOW)).toBeUndefined();
    expect(projectedFinish(targeted({ targetPeriod: "yearly" }), NOW)).toBeUndefined();
  });

  it("moves the date earlier as more is saved, never later", () => {
    const slow = projectedFinish(targeted({ totalSaved: 900, remaining: 3600 }), NOW)!;
    const fast = projectedFinish(targeted({ totalSaved: 2800, remaining: 1700 }), NOW)!;

    expect(fast.date.getTime()).toBeLessThan(slow.date.getTime());
  });
});

describe("perWeek", () => {
  it("splits a monthly figure across an average month's weeks", () => {
    expect(perWeek(331.25)).toBeCloseTo(331.25 / WEEKS_PER_MONTH, 2);
    expect(perWeek(434.86)).toBeCloseTo(100, 0);
    expect(perWeek(0)).toBe(0);
  });

  it("uses the same average month the rest of the app does", () => {
    // 30.44 days, so a weekly figure never lurches every February.
    expect(WEEKS_PER_MONTH * 7).toBeCloseTo(30.44, 10);
  });
});

describe("daysSinceContribution", () => {
  it("counts whole days since money last went in", () => {
    expect(daysSinceContribution(goal({ lastContributionDate: new Date(2026, 7, 2) }), NOW)).toBe(38);
    expect(daysSinceContribution(goal({ lastContributionDate: NOW }), NOW)).toBe(0);
  });

  it("never counts backwards from a date in the future", () => {
    expect(daysSinceContribution(goal({ lastContributionDate: new Date(2026, 9, 1) }), NOW)).toBe(0);
  });

  it("has nothing to count when nothing has ever gone in", () => {
    expect(daysSinceContribution(goal(), NOW)).toBeUndefined();
  });
});
