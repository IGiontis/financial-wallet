import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { computeGoalStats } from "../investmentsUtils";
import { countByStatus, filterGoals, goalsSummary, investmentRunning, investmentsSummary, isRecurringGoal, monthlyMoves, nearestToDone, type GoalStatusOption } from "./goalOverview";
import type { InvestmentContribution, InvestmentGoal, InvestmentGoalWithStats } from "../../../shared/types/IndexTypes";

// The «Επισκόπηση» figures, each built from real contributions through the
// same `computeGoalStats` the screen uses, and each checked against the raw
// contributions a second way — never against the function's own arithmetic.

const TODAY = new Date(2026, 10, 2, 12); // 2 November 2026

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(TODAY);
});
afterEach(() => vi.useRealTimers());

let n = 0;
const move = (goalId: string, amount: number, date: Date, type: "deposit" | "withdrawal" = "deposit"): InvestmentContribution =>
  ({ id: `c${++n}`, userId: "u", goalId, amount, contributionType: type, date, createdAt: date, updatedAt: date }) as InvestmentContribution;

const goal = (over: Partial<InvestmentGoal>): InvestmentGoal =>
  ({ userId: "u", goalType: "targeted", targetPeriod: "custom", isActive: true, isCompleted: false, createdAt: new Date(2026, 0, 1), updatedAt: new Date(2026, 0, 1), ...over }) as InvestmentGoal;

const withStats = (goals: InvestmentGoal[], moves: InvestmentContribution[]): InvestmentGoalWithStats[] =>
  goals.map((g) => computeGoalStats(g, moves.filter((c) => c.goalId === g.id))).map((g) => (g.status === "completed" ? { ...g, isCompleted: true } : g));

// ─── The savings goals ──────────────────────────────────────────────────────

describe("the goals' tiles", () => {
  const goals = [
    goal({ id: "trip", name: "Trip", targetAmount: 1200, deadline: new Date(2027, 6, 10) }),
    goal({ id: "car", name: "Car", targetAmount: 5000, deadline: new Date(2028, 0, 1) }),
    goal({ id: "tv", name: "TV", targetAmount: 600, deadline: new Date(2027, 0, 1) }), // reached: completed
    goal({ id: "bike", name: "Bike", targetAmount: 900, deadline: new Date(2027, 3, 1), isActive: false }), // paused
  ];
  const moves = [
    move("trip", 80, new Date(2026, 4, 9)),
    move("trip", 80, new Date(2026, 5, 9)),
    move("trip", 160, new Date(2026, 9, 15)),
    move("trip", 30, new Date(2026, 9, 20), "withdrawal"),
    move("car", 1000, new Date(2026, 1, 1)),
    move("car", 250.5, new Date(2026, 8, 1)),
    move("tv", 600, new Date(2026, 2, 1)),
    move("bike", 100, new Date(2026, 2, 1)),
  ];
  const stats = withStats(goals, moves);

  it("puts in and leaves what the running goals hold and still want", () => {
    const s = goalsSummary(stats);
    // Running: trip and car. A second way, from the moves themselves.
    const net = (id: string) => moves.filter((c) => c.goalId === id).reduce((sum, c) => sum + (c.contributionType === "deposit" ? c.amount : -c.amount), 0);
    expect(s.saved).toBeCloseTo(net("trip") + net("car"), 2); // 290 + 1250.5
    expect(s.saved).toBe(1540.5);
    expect(s.remaining).toBeCloseTo(1200 - net("trip") + (5000 - net("car")), 2);
    // A running goal is under its target, so the two add up to the targets.
    expect(s.saved + s.remaining).toBeCloseTo(1200 + 5000, 2);
    expect([s.active, s.paused, s.completed]).toEqual([2, 1, 1]);
  });

  it("asks a month what each running goal asks, added up", () => {
    const s = goalsSummary(stats);
    const each = stats.filter((g) => g.isActive && !g.isCompleted).map((g) => g.monthlyRequired ?? 0);
    expect(each.every((m) => m > 0)).toBe(true);
    expect(s.monthly).toBeCloseTo(each[0] + each[1], 2);
  });

  it("lists the nearest to done first, running ones only", () => {
    const near = nearestToDone(stats, (g) => g.isActive && !g.isCompleted);
    expect(near.map((i) => i.goal.id)).toEqual(["car", "trip"]); // 25.01% before 24.17%
    expect(near[1].pct).toBeCloseTo((290 / 1200) * 100, 5);
    expect(near[0].saved).toBe(1250.5);
    expect(near[0].target).toBe(5000);
  });
});

// ─── The status menu ────────────────────────────────────────────────────────

describe("the «Όλοι ▾» menu", () => {
  const stats = withStats(
    [
      goal({ id: "a", name: "Trip to Sifnos", targetAmount: 1000, deadline: new Date(2027, 6, 1) }),
      goal({ id: "b", name: "Laptop", notes: "for the studio", targetAmount: 1500, deadline: new Date(2027, 6, 1), isActive: false }),
      goal({ id: "c", name: "Phone", targetAmount: 300, deadline: new Date(2027, 6, 1) }),
    ],
    [move("c", 300, new Date(2026, 5, 1))],
  );
  const options: GoalStatusOption[] = [
    { id: "all", label: "All", test: () => true },
    { id: "active", label: "Active", test: (g) => g.isActive && !g.isCompleted },
    { id: "paused", label: "Paused", test: (g) => !g.isActive && !g.isCompleted },
    { id: "completed", label: "Completed", test: (g) => g.isCompleted },
  ];

  it("counts each choice, and the statuses add up to «all»", () => {
    const counts = countByStatus(stats, options);
    expect(counts).toEqual({ all: 3, active: 1, paused: 1, completed: 1 });
    expect(counts.active + counts.paused + counts.completed).toBe(counts.all);
  });

  it("keeps what the status keeps and the search finds, by name or note", () => {
    expect(filterGoals(stats, options[1], "").map((g) => g.id)).toEqual(["a"]);
    expect(filterGoals(stats, options[0], "  STUDIO ").map((g) => g.id)).toEqual(["b"]);
    expect(filterGoals(stats, options[1], "laptop")).toEqual([]);
    expect(filterGoals(stats, options[0], "").length).toBe(3);
  });

  it("puts the newest made first and gathers the paused ones at the end", () => {
    const made = (id: string, month: number, isActive = true) => goal({ id, name: id, targetAmount: 100, isActive, createdAt: new Date(2026, month, 1) });
    const just = { ...goal({ id: "just", name: "just", targetAmount: 100 }), createdAt: undefined } as unknown as InvestmentGoal;
    const list = withStats([made("old", 0), made("pausedNew", 9, false), made("mid", 4), just, made("pausedOld", 1, false), made("new", 8)], []);
    const order = filterGoals(list, options[0], "").map((g) => g.id);
    expect(order).toEqual(["just", "new", "mid", "old", "pausedNew", "pausedOld"]);
    // The same goals, none lost or doubled, and every paused one after every running one.
    expect([...order].sort()).toEqual(list.map((g) => g.id).sort());
    const firstPaused = order.findIndex((id) => id.startsWith("paused"));
    expect(order.slice(firstPaused).every((id) => id.startsWith("paused"))).toBe(true);
  });
});

// ─── The investments ────────────────────────────────────────────────────────

describe("the investments' tiles", () => {
  const goals = [
    goal({ id: "etf", name: "ETF", targetPeriod: "monthly", targetAmount: 100, createdAt: new Date(2026, 8, 1) }),
    goal({ id: "ins", name: "Insurance", targetPeriod: "yearly", targetAmount: 600, createdAt: new Date(2026, 0, 5) }),
    goal({ id: "open", name: "Gold", goalType: "open_ended", targetPeriod: undefined }),
    goal({ id: "old", name: "Old fund", targetPeriod: "monthly", targetAmount: 50, isActive: false, createdAt: new Date(2026, 8, 1) }),
  ];
  const moves = [
    // ETF: Sept and Oct paid in full, 40 of November's 100 in.
    move("etf", 100, new Date(2026, 8, 3)),
    move("etf", 100, new Date(2026, 9, 3)),
    move("etf", 40, new Date(2026, 10, 1)),
    // Insurance: 450 of the year's 600.
    move("ins", 450, new Date(2026, 2, 1)),
    move("open", 300, new Date(2026, 3, 1)),
    move("open", 20, new Date(2026, 4, 1), "withdrawal"),
    move("old", 50, new Date(2026, 8, 2)),
  ];
  const stats = withStats(goals, moves);

  it("saved is every deposit less every withdrawal, running or not", () => {
    const s = investmentsSummary(stats);
    const raw = moves.reduce((sum, c) => sum + (c.contributionType === "deposit" ? c.amount : -c.amount), 0);
    expect(s.totalSaved).toBe(raw); // 1020
  });

  it("this month and this year: what is in of what the period asks", () => {
    const s = investmentsSummary(stats);
    // No carry-over on either: the period asks its target, and what is in is
    // what was put in during it.
    expect(s.monthly).toEqual({ count: 1, due: 100, paid: 40 });
    expect(s.yearly).toEqual({ count: 1, due: 600, paid: 450 });
    // Both behind by what is left, so the net is minus the two together.
    expect(s.recurring).toBe(2);
    expect(s.behindCount).toBe(2);
    expect(s.net).toBe(-(100 - 40) - (600 - 450));
  });

  it("only the running recurring ones count as running for «this period»", () => {
    expect(stats.filter((g) => isRecurringGoal(g) && investmentRunning(g)).map((g) => g.id)).toEqual(["etf", "ins"]);
    const near = nearestToDone(stats, (g) => isRecurringGoal(g) && investmentRunning(g));
    expect(near.map((i) => [i.goal.id, Math.round(i.pct)])).toEqual([
      ["ins", 75],
      ["etf", 40],
    ]);
  });
});

// ─── Over time ──────────────────────────────────────────────────────────────

describe("money in, month by month", () => {
  const moves = [
    move("a", 80, new Date(2025, 10, 30)), // November last year: outside the 12 months
    move("a", 80, new Date(2025, 11, 1)), // December: the first month in
    move("a", 80, new Date(2026, 4, 9)),
    move("a", 160, new Date(2026, 4, 20)),
    move("a", 25, new Date(2026, 4, 21), "withdrawal"),
    move("b", 999, new Date(2026, 4, 9)), // another screen's goal
    move("a", 40, new Date(2026, 10, 1, 23, 59)), // this month
  ];

  it("is twelve months, this one last", () => {
    const series = monthlyMoves(moves, new Set(["a"]));
    expect(series).toHaveLength(12);
    expect(series[0].start).toEqual(new Date(2025, 11, 1));
    expect(series[11].start).toEqual(new Date(2026, 10, 1));
  });

  it("adds up to the moves inside the window, and to nothing outside it", () => {
    const series = monthlyMoves(moves, new Set(["a"]));
    expect(series.find((m) => m.start.getMonth() === 4 && m.start.getFullYear() === 2026)).toMatchObject({ deposits: 240, withdrawals: 25 });
    // A second way: filter the moves by date and goal, and add them up.
    const from = new Date(2025, 11, 1).getTime();
    const inWindow = moves.filter((c) => c.goalId === "a" && c.date.getTime() >= from);
    const deposits = inWindow.filter((c) => c.contributionType === "deposit").reduce((s, c) => s + c.amount, 0);
    expect(series.reduce((s, m) => s + m.deposits, 0)).toBe(deposits); // 80 + 240 + 40
    expect(series.reduce((s, m) => s + m.withdrawals, 0)).toBe(25);
  });
});
