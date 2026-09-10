import { describe, it, expect } from "vitest";
import { addDays, addMonths } from "date-fns";
import { deadlineBucket, groupGoals, kindBucket, progressBand, stackByDeadline, stackByKind } from "./goalGrouping";
import { relativeToNow } from "./goalDisplay";
import type { InvestmentGoalWithStats } from "../../../shared/types/IndexTypes";

// Which stack a goal lands in decides what gets read first, so the boundaries
// are checked from both sides: the last day that is still "this month" and the
// first that is not, and so on up the horizons.

const NOW = new Date(2026, 8, 9); // 9 September 2026

const goal = (over: Partial<InvestmentGoalWithStats> = {}): InvestmentGoalWithStats =>
  ({
    id: `g${Math.random()}`,
    userId: "u1",
    name: "Trip",
    goalType: "targeted",
    isActive: true,
    isCompleted: false,
    createdAt: new Date(2026, 1, 1),
    updatedAt: NOW,
    totalDeposited: 0,
    totalWithdrawn: 0,
    totalSaved: 0,
    contributionCount: 0,
    withdrawalCount: 0,
    ...over,
  }) as InvestmentGoalWithStats;

describe("deadlineBucket", () => {
  it("puts anything already reached out of the way, deadline or not", () => {
    expect(deadlineBucket(goal({ isCompleted: true, deadline: addDays(NOW, -400) }), NOW)).toBe("done");
    expect(deadlineBucket(goal({ isCompleted: true, deadline: addDays(NOW, 400) }), NOW)).toBe("done");
    expect(deadlineBucket(goal({ isCompleted: true }), NOW)).toBe("done");
  });

  it("keeps goals with no deadline in their own stack rather than guessing one", () => {
    expect(deadlineBucket(goal(), NOW)).toBe("noDeadline");
  });

  it("counts yesterday as past and today as still in hand", () => {
    expect(deadlineBucket(goal({ deadline: addDays(NOW, -1) }), NOW)).toBe("overdue");
    expect(deadlineBucket(goal({ deadline: NOW }), NOW)).toBe("thisMonth");
    // Later the same day, which is still today.
    expect(deadlineBucket(goal({ deadline: new Date(2026, 8, 9, 23, 30) }), NOW)).toBe("thisMonth");
  });

  it("draws the line at the month, not at thirty days", () => {
    // The 30th is three weeks away and the 1st is three days after that, but one
    // is this month and the other is next — which is how a person reads them.
    expect(deadlineBucket(goal({ deadline: new Date(2026, 8, 30) }), NOW)).toBe("thisMonth");
    expect(deadlineBucket(goal({ deadline: new Date(2026, 9, 1) }), NOW)).toBe("next3");
  });

  it("holds three months, then falls back to the rest of the year", () => {
    expect(deadlineBucket(goal({ deadline: addMonths(NOW, 3) }), NOW)).toBe("next3");
    expect(deadlineBucket(goal({ deadline: addMonths(NOW, 4) }), NOW)).toBe("later"); // January, a different year
    expect(deadlineBucket(goal({ deadline: new Date(2026, 11, 20) }), NOW)).toBe("next3"); // still December
    // From January the far end of the same year is "later this year".
    const january = new Date(2026, 0, 12);
    expect(deadlineBucket(goal({ deadline: new Date(2026, 10, 3) }), january)).toBe("thisYear");
    expect(deadlineBucket(goal({ deadline: new Date(2027, 0, 3) }), january)).toBe("later");
  });
});

describe("stackByDeadline", () => {
  const rows = [
    goal({ id: "later", name: "Σπίτι", deadline: addMonths(NOW, 20), remaining: 40000, monthlyRequired: 2000 }),
    goal({ id: "late", name: "Φόροι", deadline: addDays(NOW, -5), remaining: 900, monthlyRequired: 900 }),
    goal({ id: "soon", name: "Ταξίδι", deadline: addMonths(NOW, 2), remaining: 1200, monthlyRequired: 600 }),
    goal({ id: "none", name: "Έκτακτα", remaining: 3000 }),
    goal({ id: "now", name: "Λάστιχα", deadline: new Date(2026, 8, 25), remaining: 300, monthlyRequired: 300 }),
  ];

  it("orders the stacks by how soon they matter, whatever order they arrive in", () => {
    expect(stackByDeadline(rows, NOW).map((s) => s.id)).toEqual(["overdue", "thisMonth", "next3", "later", "noDeadline"]);
    // The same list shuffled gives the same stacks.
    expect(stackByDeadline([...rows].reverse(), NOW).map((s) => s.id)).toEqual(["overdue", "thisMonth", "next3", "later", "noDeadline"]);
  });

  it("draws no heading for a horizon with nothing in it", () => {
    expect(stackByDeadline([rows[3]], NOW).map((s) => s.id)).toEqual(["noDeadline"]);
    expect(stackByDeadline([], NOW)).toEqual([]);
  });

  it("adds up what each stack still needs", () => {
    const stacks = stackByDeadline(rows, NOW);
    const overdue = stacks.find((s) => s.id === "overdue")!;
    const none = stacks.find((s) => s.id === "noDeadline")!;

    expect(overdue.remaining).toBe(900);
    expect(overdue.monthlyNeeded).toBe(900);
    // A goal with no deadline has nothing to be monthly about.
    expect(none.remaining).toBe(3000);
    expect(none.monthlyNeeded).toBe(0);
    // And the stacks between them account for every euro, once each.
    expect(stacks.reduce((sum, s) => sum + s.remaining, 0)).toBe(45400);
    expect(stacks.reduce((sum, s) => sum + s.goals.length, 0)).toBe(rows.length);
  });

  it("puts the soonest first inside a stack, and the biggest of a tie above", () => {
    const sameDay = new Date(2026, 9, 20);
    const stack = stackByDeadline(
      [
        goal({ id: "small", name: "Β", deadline: sameDay, remaining: 100 }),
        goal({ id: "big", name: "Α", deadline: sameDay, remaining: 5000 }),
        goal({ id: "sooner", name: "Γ", deadline: new Date(2026, 9, 2), remaining: 10 }),
      ],
      NOW,
    )[0];

    expect(stack.goals.map((g) => g.id)).toEqual(["sooner", "big", "small"]);
  });

  it("sorts equal deadlines and equal amounts by name, so the order never wobbles", () => {
    const day = new Date(2026, 9, 20);
    const stack = stackByDeadline(
      [goal({ id: "b", name: "Βάρκα", deadline: day, remaining: 50 }), goal({ id: "a", name: "Αμάξι", deadline: day, remaining: 50 })],
      NOW,
    )[0];

    expect(stack.goals.map((g) => g.name)).toEqual(["Αμάξι", "Βάρκα"]);
  });
});

describe("stackByKind", () => {
  it("tells the three kinds apart", () => {
    expect(kindBucket(goal({ targetPeriod: "monthly" }))).toBe("monthly");
    expect(kindBucket(goal({ targetPeriod: "yearly" }))).toBe("yearly");
    expect(kindBucket(goal({ goalType: "open_ended" }))).toBe("tracking");
  });

  it("does not retire a recurring goal that happens to be marked complete", () => {
    // A monthly goal is never finished — this month's is, and next month's is
    // not. Filing it under "reached" would hide a standing commitment.
    expect(kindBucket(goal({ targetPeriod: "monthly", isCompleted: true }))).toBe("monthly");
    expect(kindBucket(goal({ goalType: "open_ended", isCompleted: true }))).toBe("tracking");
    expect(kindBucket(goal({ goalType: "targeted", isCompleted: true }))).toBe("done");
  });

  it("stacks them monthly, yearly, tracking", () => {
    const rows = [
      goal({ id: "t", goalType: "open_ended" }),
      goal({ id: "y", targetPeriod: "yearly", remaining: 400, monthlyRequired: 33.33 }),
      goal({ id: "m", targetPeriod: "monthly", remaining: 120, monthlyRequired: 120 }),
    ];

    const stacks = stackByKind(rows);
    expect(stacks.map((s) => s.id)).toEqual(["monthly", "yearly", "tracking"]);
    expect(stacks[1].monthlyNeeded).toBe(33.33);
  });
});

describe("relativeToNow", () => {
  const en = (value: number, unit: Intl.RelativeTimeFormatUnit) => new Intl.RelativeTimeFormat("en", { numeric: "auto" }).format(value, unit);

  it("says days up to a month, then months, then years", () => {
    expect(relativeToNow(addDays(NOW, 3), NOW)).toBe(en(3, "day"));
    expect(relativeToNow(addDays(NOW, 30), NOW)).toBe(en(30, "day"));
    // Past thirty it stops counting days at somebody.
    expect(relativeToNow(addMonths(NOW, 2), NOW)).toBe(en(2, "month"));
    expect(relativeToNow(addMonths(NOW, 24), NOW)).toBe(en(2, "year"));
  });

  it("reads backwards as well as forwards", () => {
    expect(relativeToNow(addDays(NOW, -3), NOW)).toBe(en(-3, "day"));
    expect(relativeToNow(addMonths(NOW, -5), NOW)).toBe(en(-5, "month"));
    expect(relativeToNow(NOW, NOW)).toBe(en(0, "day"));
  });
});

// ─── The dimensions the reader can switch to ─────────────────────────────────
//
// The stack a goal lands in decides what gets read first, so each dimension is
// checked for the two things that make it useful: everything lands somewhere,
// once, and the order down the page is the order worth working through.

describe("groupGoals — by progress", () => {
  const rows = [
    goal({ id: "none", name: "Σέρβις", percentageReached: 0, remaining: 350, monthlyRequired: 70 }),
    goal({ id: "barely", name: "Laptop", percentageReached: 6.8, remaining: 2050 }),
    goal({ id: "third", name: "Σπίτι", percentageReached: 33.3, remaining: 40000 }),
    goal({ id: "half", name: "Έκτακτα", percentageReached: 50, remaining: 3000 }),
    goal({ id: "nearly", name: "Κάμερα", percentageReached: 99.6, remaining: 4 }),
    goal({ id: "done", name: "Ταξίδι", percentageReached: 100, remaining: 0 }),
  ];

  it("reads as a worklist: least done at the top", () => {
    expect(groupGoals(rows, "progress", NOW).map((s) => s.label)).toEqual(["0%", "1–24%", "25–49%", "50–74%", "75–99%", "100%"]);
  });

  it("puts each goal in exactly one band", () => {
    const stacks = groupGoals(rows, "progress", NOW);
    expect(stacks.flatMap((s) => s.goals.map((g) => g.id))).toHaveLength(rows.length);
    expect(stacks.find((s) => s.label === "0%")!.goals.map((g) => g.id)).toEqual(["none"]);
    expect(stacks.find((s) => s.label === "100%")!.goals.map((g) => g.id)).toEqual(["done"]);
  });

  it("floors rather than rounds, so 99.6% is not filed as finished", () => {
    // The difference between "nearly there" and "there" is the whole point of
    // the last band, and €4 short is not there.
    expect(progressBand(goal({ percentageReached: 99.6 })).label).toBe("75–99%");
    expect(progressBand(goal({ percentageReached: 100 })).label).toBe("100%");
    expect(progressBand(goal({ percentageReached: 24.99 })).label).toBe("1–24%");
    expect(progressBand(goal({ percentageReached: 25 })).label).toBe("25–49%");
  });

  it("measures a recurring goal against its period, not against its life", () => {
    // €4,800 saved over a year against a €400 month is not 1,200% of anything.
    const monthly = goal({ targetPeriod: "monthly", targetAmount: 400, totalSaved: 4800, currentPeriodSaved: 250, percentageReached: 62.5 });
    expect(progressBand(monthly).label).toBe("50–74%");
  });

  it("takes a goal with no percentage at all as untouched", () => {
    expect(progressBand(goal()).label).toBe("0%");
  });
});

describe("groupGoals — by status", () => {
  const rows = [
    goal({ id: "ok1", status: "on_track", remaining: 100 }),
    goal({ id: "ok2", status: "on_track", remaining: 100 }),
    goal({ id: "ok3", status: "on_track", remaining: 100 }),
    goal({ id: "late", status: "behind", remaining: 900, monthlyRequired: 900 }),
    goal({ id: "plain" }),
  ];

  it("puts what is behind first, however few of them there are", () => {
    // Sorted by size, a good week would file the one problem underneath three
    // goals that need nothing doing.
    const stacks = groupGoals(rows, "status", NOW);
    expect(stacks[0].goals.map((g) => g.id)).toEqual(["late"]);
    expect(stacks[0].urgent).toBe(true);
    expect(stacks[0].remaining).toBe(900);
  });

  it("keeps a goal with no status of its own rather than dropping it", () => {
    const stacks = groupGoals(rows, "status", NOW);
    expect(stacks.flatMap((s) => s.goals.map((g) => g.id))).toHaveLength(rows.length);
    expect(stacks[stacks.length - 1].goals.map((g) => g.id)).toEqual(["plain"]);
  });
});

describe("groupGoals — by category", () => {
  const rows = [
    goal({ id: "tyres", icon: "🚗", remaining: 180, monthlyRequired: 180 }),
    goal({ id: "service", icon: "🚗", remaining: 350, monthlyRequired: 70 }),
    goal({ id: "trip", icon: "✈️", remaining: 1520 }),
    goal({ id: "plain", remaining: 40 }),
  ];

  it("collects the goals that share an icon, biggest stack first", () => {
    const stacks = groupGoals(rows, "category", NOW);
    expect(stacks[0].icon).toBe("🚗");
    expect(stacks[0].goals.map((g) => g.id)).toEqual(["service", "tyres"]);
    expect(stacks[0].remaining).toBe(530);
    expect(stacks[0].monthlyNeeded).toBe(250);
  });

  it("names the stack with the icon itself, since nobody typed a category", () => {
    const stacks = groupGoals(rows, "category", NOW);
    expect(stacks[0].label).toBe("🚗");
    // And the one goal without an icon gets a stack that says so in words.
    const none = stacks.find((s) => s.id === "none")!;
    expect(none.icon).toBeUndefined();
    expect(none.label.length).toBeGreaterThan(1);
  });
});
