import { describe, it, expect } from "vitest";
import { computeGoalStats } from "./investmentsUtils";
import type { InvestmentGoal, InvestmentContribution } from "../../shared/types/IndexTypes";

// ─── Test helpers ─────────────────────────────────────────────────────────────

const makeGoal = (overrides: Partial<InvestmentGoal> = {}): InvestmentGoal =>
  ({
    id: "g1",
    userId: "u1",
    name: "Test goal",
    goalType: "targeted",
    isActive: true,
    isCompleted: false,
    createdAt: new Date("2024-01-01"),
    updatedAt: new Date("2024-01-01"),
    ...overrides,
  }) as InvestmentGoal;

const deposit = (amount: number, date = new Date()): InvestmentContribution =>
  ({ id: Math.random().toString(), userId: "u1", goalId: "g1", amount, contributionType: "deposit", date, createdAt: date, updatedAt: date }) as InvestmentContribution;

const withdrawal = (amount: number, date = new Date()): InvestmentContribution =>
  ({ id: Math.random().toString(), userId: "u1", goalId: "g1", amount, contributionType: "withdrawal", date, createdAt: date, updatedAt: date }) as InvestmentContribution;

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("computeGoalStats — totals", () => {
  it("sums deposits and subtracts withdrawals into totalSaved", () => {
    const stats = computeGoalStats(makeGoal({ goalType: "open_ended" }), [deposit(100), deposit(50), withdrawal(30)]);
    expect(stats.totalDeposited).toBe(150);
    expect(stats.totalWithdrawn).toBe(30);
    expect(stats.totalSaved).toBe(120);
    expect(stats.contributionCount).toBe(2);
    expect(stats.withdrawalCount).toBe(1);
  });

  it("handles an empty contribution list", () => {
    const stats = computeGoalStats(makeGoal({ goalType: "open_ended" }), []);
    expect(stats.totalSaved).toBe(0);
    expect(stats.contributionCount).toBe(0);
  });
});

describe("computeGoalStats — one-time targeted goal", () => {
  it("computes percentage reached and remaining", () => {
    const stats = computeGoalStats(makeGoal({ targetAmount: 1000 }), [deposit(250)]);
    expect(stats.percentageReached).toBeCloseTo(25);
    expect(stats.remaining).toBe(750);
    expect(stats.status).not.toBe("completed");
  });

  it("marks the goal completed once the target is reached", () => {
    const stats = computeGoalStats(makeGoal({ targetAmount: 1000 }), [deposit(600), deposit(400)]);
    expect(stats.totalSaved).toBe(1000);
    expect(stats.remaining).toBe(0);
    expect(stats.status).toBe("completed");
  });

  it("never reports negative remaining when overfunded", () => {
    const stats = computeGoalStats(makeGoal({ targetAmount: 500 }), [deposit(800)]);
    expect(stats.remaining).toBe(0);
    expect(stats.status).toBe("completed");
  });
});

describe("computeGoalStats — recurring monthly goal", () => {
  it("treats a full current-month deposit as on track", () => {
    const goal = makeGoal({ goalType: "targeted", targetPeriod: "monthly", targetAmount: 200, createdAt: new Date() });
    const stats = computeGoalStats(goal, [deposit(200, new Date())]);
    expect(stats.currentPeriodSaved).toBe(200);
    expect(stats.status).toBe("on_track");
  });

  it("flags the goal as behind when nothing is contributed this month", () => {
    const goal = makeGoal({ goalType: "targeted", targetPeriod: "monthly", targetAmount: 200, createdAt: new Date() });
    const stats = computeGoalStats(goal, []);
    expect(stats.status).toBe("behind");
    expect(stats.remaining).toBe(200);
  });
});
