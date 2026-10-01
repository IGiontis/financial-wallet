import { describe, it, expect } from "vitest";
import { buildPlan, detectSalary, goalMonthlyNeed, goalMonthlyTarget, goalMonthsAhead, nextSalaryDate, repeatLabel, REPEAT_CHOICES, salaryDates, SALARY_ROW_ID } from "./plannerUtils";
import en from "../../i18n/locales/en.json";
import el from "../../i18n/locales/el.json";
import type { BillWithStatus, InvestmentGoalWithStats, Transaction } from "../../shared/types/IndexTypes";

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
    updatedAt: new Date(2026, 0, 1),
    currentPeriodKey: "2026-08",
    isPaidThisPeriod: false,
    payments: [],
    monthlyEquivalent: 50,
    ...overrides,
  }) as BillWithStatus;

const goal = (overrides: Partial<InvestmentGoalWithStats> = {}): InvestmentGoalWithStats =>
  ({
    id: `g${Math.random()}`,
    userId: "u1",
    name: "Goal",
    goalType: "targeted",
    isActive: true,
    isCompleted: false,
    createdAt: new Date(2026, 0, 1),
    updatedAt: new Date(2026, 0, 1),
    totalDeposited: 0,
    totalWithdrawn: 0,
    totalSaved: 0,
    contributionCount: 0,
    withdrawalCount: 0,
    ...overrides,
  }) as InvestmentGoalWithStats;

// ─── Salary detection ────────────────────────────────────────────────────────

describe("detectSalary", () => {
  const now = new Date(2026, 7, 14); // 14 Aug 2026

  it("finds a salary repeating on the same day", () => {
    const rows = [income(2000, new Date(2026, 4, 1)), income(2000, new Date(2026, 5, 1)), income(2050, new Date(2026, 6, 1)), income(2000, new Date(2026, 7, 1))];

    expect(detectSalary(rows, now)).toEqual({ amount: 2000, dayOfMonth: 1, occurrences: 4 });
  });

  it("takes the largest income each month, ignoring small extras", () => {
    const rows = [income(2000, new Date(2026, 6, 5)), income(120, new Date(2026, 6, 20)), income(2000, new Date(2026, 7, 5)), income(80, new Date(2026, 7, 9))];

    expect(detectSalary(rows, now)).toMatchObject({ amount: 2000, dayOfMonth: 5 });
  });

  it("is undefined from a single month — one payment is not a pattern", () => {
    expect(detectSalary([income(2000, new Date(2026, 7, 1))], now)).toBeUndefined();
  });

  it("is undefined with no income at all", () => {
    expect(detectSalary([tx({ amount: 40 })], now)).toBeUndefined();
  });

  it("ignores income outside the lookback window", () => {
    expect(detectSalary([income(2000, new Date(2025, 0, 1)), income(2000, new Date(2025, 1, 1))], now)).toBeUndefined();
  });

  it("counts money pulled back out of savings as income", () => {
    const rows = [
      tx({ amount: 900, type: "investment", isInvestmentTransaction: true, contributionType: "withdrawal", date: new Date(2026, 6, 3) }),
      tx({ amount: 900, type: "investment", isInvestmentTransaction: true, contributionType: "withdrawal", date: new Date(2026, 7, 3) }),
    ];
    expect(detectSalary(rows, now)).toMatchObject({ amount: 900, occurrences: 2 });
  });
});

describe("nextSalaryDate / salaryDates", () => {
  it("moves to next month once the day has passed", () => {
    expect(nextSalaryDate(5, new Date(2026, 7, 14))).toEqual(new Date(2026, 8, 5));
  });

  it("keeps this month's day when it is still ahead", () => {
    expect(nextSalaryDate(25, new Date(2026, 7, 14))).toEqual(new Date(2026, 7, 25));
  });

  it("clamps to the last day of a short month", () => {
    expect(nextSalaryDate(31, new Date(2026, 1, 10))).toEqual(new Date(2026, 1, 28));
  });

  it("falls back to the 1st when the day is unknown", () => {
    expect(nextSalaryDate(undefined, new Date(2026, 7, 14))).toEqual(new Date(2026, 8, 1));
  });

  it("does not let a short month drag every later payday backwards", () => {
    // Stepping by month index rather than by adding a month to the last date:
    // 31 Jan → 28 Feb → 31 Mar, not 28 Mar and then 28 for ever after.
    const dates = salaryDates(31, new Date(2026, 3, 30), new Date(2026, 0, 5));
    expect(dates).toEqual([new Date(2026, 0, 31), new Date(2026, 1, 28), new Date(2026, 2, 31), new Date(2026, 3, 30)]);
  });
});

// ─── Goals ───────────────────────────────────────────────────────────────────

describe("goalMonthlyNeed", () => {
  const now = new Date(2026, 7, 14);

  it("reports nothing for an open-ended goal", () => {
    expect(goalMonthlyNeed(goal({ goalType: "open_ended" }), now)).toBe(0);
  });

  it("uses what a recurring monthly goal still owes", () => {
    expect(goalMonthlyNeed(goal({ targetPeriod: "monthly", monthlyRequired: 120, currentPeriodSaved: 0 }), now)).toBe(120);
  });

  it("reports zero — not nothing — for a recurring goal already funded", () => {
    expect(goalMonthlyNeed(goal({ targetPeriod: "monthly", monthlyRequired: 120, currentPeriodSaved: 120 }), now)).toBe(0);
    expect(goalMonthlyTarget(goal({ targetPeriod: "monthly", monthlyRequired: 120, currentPeriodSaved: 120 }), now)).toBe(120);
  });

  it("spreads a targeted goal across the contributions left, this month included", () => {
    // This expected 300 — the remainder over the *gap* of three months. But the
    // plan charges this month too, so it made four payments of 300 for a goal
    // of 900. Divided by the payments actually scheduled, the slices add up to
    // the goal instead of to a third more than it.
    expect(goalMonthlyNeed(goal({ remaining: 900, deadline: new Date(2026, 10, 14) }), now)).toBe(225);
  });

  it("asks for the whole remainder when the deadline is this month", () => {
    expect(goalMonthlyNeed(goal({ remaining: 900, deadline: new Date(2026, 7, 28) }), now)).toBe(900);
  });
});

// ─── The plan ────────────────────────────────────────────────────────────────

describe("buildPlan", () => {
  const now = new Date(2026, 7, 14); // 14 Aug 2026
  const salary = { amount: 2000, dayOfMonth: 20, occurrences: 4 };
  const base = { bills: [] as BillWithStatus[], goals: [] as InvestmentGoalWithStats[], salary, now };

  it("runs to the end of the month holding the day before today plus the horizon", () => {
    // 14 Aug + 1 month − 1 day = 13 Sep → 30 Sep; + 3 → 13 Nov → 30 Nov; + 12 → 13 Aug 2027 → 31 Aug 2027.
    expect(buildPlan({ ...base, horizon: 1 }).end).toEqual(new Date(2026, 8, 30, 23, 59, 59, 999));
    expect(buildPlan({ ...base, horizon: 3 }).end).toEqual(new Date(2026, 10, 30, 23, 59, 59, 999));
    expect(buildPlan({ ...base, horizon: 12 }).end).toEqual(new Date(2027, 7, 31, 23, 59, 59, 999));
  });

  it("counts one payday per month in the window", () => {
    const plan = buildPlan({ ...base, horizon: 3 });
    const row = plan.rows.find((r) => r.id === SALARY_ROW_ID);

    expect(row?.occurrences).toBe(4); // 20 Aug, 20 Sep, 20 Oct, 20 Nov — the window closes 30 Nov
    expect(plan.incomeTotal).toBe(4 * 2000);
  });

  it("charges a monthly bill once per month, not once in total", () => {
    const plan = buildPlan({ ...base, horizon: 3, bills: [bill({ name: "Ρεύμα", amount: 100, dueDay: 20 })] });

    // The 20th of August, September, October and November.
    expect(plan.rows.find((r) => r.source === "bill")).toMatchObject({ occurrences: 4, total: -400 });
    expect(plan.billsTotal).toBe(4 * 100);
  });

  it("never looks at what has already been spent", () => {
    // The whole point of the rebuild: the plan is built from commitments and the
    // user's own figures, so no history can drag the answer around.
    const plan = buildPlan({ ...base, horizon: 1 });
    expect(plan.outgoingTotal).toBe(0);
    expect(plan.openingBalance).toBe(0);
  });

  it("pro-rates a monthly budget line over the part of the month that is left", () => {
    // 18 days left of August out of 31 — charging a whole month of food for
    // them would answer a question nobody asked. One month from 14 Aug also
    // holds all of September.
    const plan = buildPlan({ ...base, horizon: 1, lines: [{ id: "l1", label: "Food", amount: 310, kind: "expense" }] });

    expect(plan.monthsCovered).toBeCloseTo(18 / 31 + 1, 2);
    // 310 × 18/31 = 180 for August, and 310 for September.
    expect(plan.rows.find((r) => r.id === "l1")?.total).toBeCloseTo(-(180 + 310), 2);
  });

  it("charges a monthly line in full for each whole month ahead", () => {
    const plan = buildPlan({ ...base, horizon: 3, lines: [{ id: "l1", label: "Food", amount: 200, kind: "expense" }] });

    // 18/31 of August, then all of September, October and November.
    expect(plan.monthsCovered).toBeCloseTo(18 / 31 + 3, 2);
    expect(plan.budgetTotal).toBeCloseTo(200 * (18 / 31 + 3), 1);
  });

  it("adds a monthly income line to the income side", () => {
    const plan = buildPlan({ ...base, horizon: 3, lines: [{ id: "l1", label: "Side work", amount: 300, kind: "income" }] });

    // Four paydays of 2,000, and the line over the same 18/31 + 3 months.
    expect(plan.incomeTotal).toBeCloseTo(4 * 2000 + 300 * (18 / 31 + 3), 1);
  });

  it("lets any row be switched off, and frees exactly its money", () => {
    const electricity = bill({ id: "b1", name: "Ρεύμα", amount: 100, dueDay: 20 });
    const input = { ...base, horizon: 3 as const, bills: [electricity] };

    const on = buildPlan(input);
    const off = buildPlan({ ...input, skipIds: new Set(["b1"]) });

    expect(off.billsTotal).toBe(0);
    expect(off.rows.find((r) => r.id === "b1")).toMatchObject({ enabled: false, total: 0 });
    // Four of them, 20 Aug to 20 Nov — exactly what the row said it cost.
    expect(off.endingBalance).toBeCloseTo(on.endingBalance + 400, 2);
    expect(off.endingBalance - on.endingBalance).toBeCloseTo(-on.rows.find((r) => r.id === "b1")!.total, 2);
  });

  it("switching the salary off is what shows whether it is carrying the month", () => {
    const on = buildPlan({ ...base, horizon: 1 });
    const off = buildPlan({ ...base, horizon: 1, skipIds: new Set([SALARY_ROW_ID]) });

    expect(on.incomeTotal).toBe(2 * 2000); // 20 Aug and 20 Sep
    expect(off.incomeTotal).toBe(0);
    expect(off.events.filter((e) => e.kind === "income")).toHaveLength(0);
  });

  it("still lists a bill that has nothing due in the window", () => {
    // Dropping it made the plan look as though it had forgotten the bill. It
    // costs nothing here, and says which of the two reasons that is.
    // Seen on the 1st, one month is August alone — the month it is paid for.
    const first = new Date(2026, 7, 1);
    const paid = bill({
      id: "b1",
      name: "Netflix",
      dueDay: 22,
      payments: [{ id: "p", userId: "u1", billId: "b1", periodKey: "2026-08", amount: 50, paidDate: first, createdAt: first }],
    } as Partial<BillWithStatus>);

    const plan = buildPlan({ ...base, now: first, horizon: 1, bills: [paid, bill({ id: "b2", name: "No date" })] });

    expect(plan.end).toEqual(new Date(2026, 7, 31, 23, 59, 59, 999));
    expect(plan.rows.filter((r) => r.source === "bill")).toHaveLength(2);
    expect(plan.rows.find((r) => r.id === "b1")).toMatchObject({ occurrences: 0, total: 0, note: "paid" });
    expect(plan.rows.find((r) => r.id === "b2")).toMatchObject({ occurrences: 0, total: 0, note: "undated" });
    expect(plan.billsTotal).toBe(0);
  });

  it("still lists a goal that is already funded for the month", () => {
    // Seen on the 1st, one month is August alone, and August is funded. From
    // any later day the window holds September too, which wants its 200.
    const funded = goal({ id: "g1", targetPeriod: "monthly", targetAmount: 200, currentPeriodSaved: 200 });
    const plan = buildPlan({ ...base, now: new Date(2026, 7, 1), horizon: 1, goals: [funded] });

    expect(plan.rows.find((r) => r.id === "g1")).toMatchObject({ total: 0, note: "funded" });
    expect(buildPlan({ ...base, horizon: 1, goals: [funded] }).rows.find((r) => r.id === "g1")).toMatchObject({ total: -200, occurrences: 1 });
  });

  it("asks a goal for what is left this month, then the full target after", () => {
    const trip = goal({ id: "g1", name: "Trip", targetPeriod: "monthly", monthlyRequired: 200, currentPeriodSaved: 200 });
    const plan = buildPlan({ ...base, horizon: 3, goals: [trip] });

    // Nothing more wanted in August; September, October and November want €200 each.
    expect(plan.goalsTotal).toBe(3 * 200);
    expect(plan.rows.find((r) => r.id === "g1")?.occurrences).toBe(3);
  });

  it("starts the line wherever the user says their money is", () => {
    const plan = buildPlan({ ...base, horizon: 1, openingBalance: 500 });
    expect(plan.points[0].balance).toBe(500);
    expect(plan.endingBalance).toBe(500 + 2 * 2000); // plus the 20 Aug and 20 Sep salaries
  });

  it("calls it short when the line ends under zero", () => {
    const plan = buildPlan({ ...base, horizon: 1, salary: undefined, openingBalance: 200, bills: [bill({ name: "Ρεύμα", amount: 300, dueDay: 24 })] });

    // 200 in hand, 300 on 24 Aug and 300 on 24 Sep, nothing coming in.
    expect(plan.endingBalance).toBe(200 - 2 * 300);
    expect(plan.verdict).toBe("short");
    expect(plan.shortfall).toBe(2 * 300); // before the money in hand: no income against €600 of bills
    expect(plan.dip).toBe(400); // with it: €200 only covers so much
    expect(plan.lowestOn).toEqual(new Date(2026, 8, 24));
  });

  it("separates a timing problem from a shortfall, and names the day", () => {
    // The bill lands before the salary does. Over the month it is covered; on
    // 18 Aug it is not — and telling the user they "will run short" when the
    // line comes back above zero would be the wrong answer.
    const plan = buildPlan({ ...base, horizon: 1, openingBalance: 0, bills: [bill({ name: "Ρεύμα", amount: 300, dueDay: 18 })] });

    expect(plan.verdict).toBe("tight");
    expect(plan.shortfall).toBe(0);
    // 2 × 2,000 in against 2 × 300 out, 18 Aug to 30 Sep.
    expect(plan.surplus).toBe(2 * 2000 - 2 * 300);
    expect(plan.breaksOn).toEqual(new Date(2026, 7, 18));
    expect(plan.breakingEvent?.label).toBe("Ρεύμα");
    expect(plan.dip).toBe(300);
    expect(plan.lowestOn).toEqual(new Date(2026, 7, 18));
  });

  it("pulls an overdue bill onto today rather than a date that has passed", () => {
    const plan = buildPlan({ ...base, horizon: 1, bills: [bill({ name: "Late", amount: 50, dueDay: 9 })] });

    const [first] = plan.events.filter((e) => e.kind === "bill");
    expect(first.overdue).toBe(true);
    expect(first.date).toEqual(new Date(2026, 7, 14));
  });

  it("adds up: opening plus income less outgoings is where the line ends", () => {
    const plan = buildPlan({
      ...base,
      horizon: 3,
      openingBalance: 250,
      bills: [bill({ name: "Ρεύμα", amount: 100, dueDay: 20 })],
      goals: [goal({ targetPeriod: "monthly", monthlyRequired: 150, currentPeriodSaved: 0 })],
      lines: [{ id: "l1", label: "Food", amount: 200, kind: "expense" }],
    });

    // To the cent: the page prints the row totals and the end of the line as one
    // sum, so a rounding drift between them would read as a mistake.
    expect(plan.openingBalance + plan.incomeTotal - plan.outgoingTotal).toBeCloseTo(plan.endingBalance, 2);
  });

  it("returns a usable plan with nothing set up at all", () => {
    const plan = buildPlan({ bills: [], goals: [], now, horizon: 1 });

    expect(plan.points).toHaveLength(18 + 30); // 14–31 Aug, then all of September
    expect(plan.verdict).toBe("ok");
    expect(plan.rows).toHaveLength(0);
  });
});

describe("a goal stops at its deadline", () => {
  const now = new Date(2026, 7, 14); // 14 Aug 2026
  const salary = { amount: 2000, dayOfMonth: 20, occurrences: 4 };
  const base = { bills: [] as BillWithStatus[], goals: [] as InvestmentGoalWithStats[], salary, now };

  // €900 left, due 4 October: August is this month, then September and October.
  const october = () => goal({ name: "Ταξίδι", remaining: 900, deadline: new Date(2026, 9, 4) });

  it("charges the months up to the deadline and not one more", () => {
    // The bug: `laterMonths` was every month of the horizon, so on a twelve
    // month view this went on taking its slice through the following August.
    const plan = buildPlan({ ...base, horizon: 12, goals: [october()] });
    const row = plan.rows.find((r) => r.source === "goal");

    expect(row?.occurrences).toBe(3); // Aug, Sep, Oct
    expect(row?.total).toBe(-900);
  });

  it("does not put a goal event in any month past the deadline", () => {
    const plan = buildPlan({ ...base, horizon: 12, goals: [october()] });
    const dates = plan.events.filter((e) => e.kind === "goal").map((e) => e.date);

    expect(dates.every((d) => d <= new Date(2026, 9, 31))).toBe(true);
  });

  it("still runs to the end of the window when there is no deadline", () => {
    const endless = goal({ targetPeriod: "monthly", monthlyRequired: 100, currentPeriodSaved: 0, deadline: undefined });
    const row = buildPlan({ ...base, horizon: 6, goals: [endless] }).rows.find((r) => r.source === "goal");

    // Six months from 14 Aug close on 28 Feb: August's slice, then September to February.
    expect(row?.occurrences).toBe(1 + 6);
  });

  it("keeps the deadline month whole, whatever day of it the deadline falls on", () => {
    const months = [new Date(2026, 8, 1), new Date(2026, 9, 1), new Date(2026, 10, 1)];

    // A goal due on the 4th still wants that month's contribution.
    expect(goalMonthsAhead(goal({ deadline: new Date(2026, 9, 4) }), months)).toEqual(months.slice(0, 2));
    expect(goalMonthsAhead(goal({ deadline: new Date(2026, 9, 31) }), months)).toEqual(months.slice(0, 2));
  });

  it("asks for nothing in the months after a deadline that has already gone", () => {
    const past = goal({ remaining: 500, deadline: new Date(2026, 6, 1) });
    const months = [new Date(2026, 8, 1), new Date(2026, 9, 1)];

    expect(goalMonthsAhead(past, months)).toEqual([]);
  });
});

describe("goalMonthlyNeed — a goal with no deadline and no period", () => {
  it("asks for whatever the goal itself says it needs each month", () => {
    expect(goalMonthlyNeed(goal({ monthlyRequired: 175.5 }), new Date(2026, 8, 8))).toBe(175.5);
  });

  it("asks for nothing when the goal has never said", () => {
    // Better than inventing a figure: an open target with no rate attached is
    // a wish, and the plan does not spend money on wishes.
    expect(goalMonthlyNeed(goal({}), new Date(2026, 8, 8))).toBe(0);
  });
});

describe("repeatLabel", () => {
  it("names a cadence the way a person would say it", () => {
    expect(repeatLabel(1)).toEqual({ key: "planner.repeatEveryMonth", count: 1 });
    expect(repeatLabel(2)).toEqual({ key: "planner.repeatEveryNMonths", count: 2 });
    expect(repeatLabel(3)).toEqual({ key: "planner.repeatEveryNMonths", count: 3 });
    expect(repeatLabel(6)).toEqual({ key: "planner.repeatEveryNMonths", count: 6 });
  });

  it("counts a year as a year rather than as twelve months", () => {
    expect(repeatLabel(12)).toEqual({ key: "planner.repeatEveryYear", count: 1 });
    expect(repeatLabel(24)).toEqual({ key: "planner.repeatEveryNYears", count: 2 });
  });

  it("has a real translation behind every cadence the editor offers", () => {
    // The one failure mode of this helper is a key nobody wrote, which reaches
    // the screen as "planner.repeatEveryNMonths".
    for (const months of REPEAT_CHOICES) {
      const { key } = repeatLabel(months);
      const [section, name] = key.split(".");

      expect(section).toBe("planner");
      expect((en.planner as Record<string, string>)[name], key).toBeTruthy();
      expect((el.planner as Record<string, string>)[name], key).toBeTruthy();
    }
  });
});

// ─── The verdict, read off the running balance ─────────────────────────────
// It used to be read off `net` — the window's income less its outgoings, with
// the money already in hand left out. On 30 September the owner had about
// €1,200 in the banks and was shown "393 €" with a verdict that ignored them.

describe("the verdict reads the running balance, money in hand included", () => {
  // Wednesday 1 October 2026: one month is October alone. Rent 1,000 on the
  // 5th and power 407 on the 8th; pay of 1,800 on the 25th — 393 to the good.
  const october = new Date(2026, 9, 1, 9);
  const bills = [bill({ name: "Rent", amount: 1000, dueDay: 5 }), bill({ name: "Power", amount: 407, dueDay: 8 })];
  const run = (openingBalance: number, pay = 1800) => buildPlan({ bills, goals: [], salary: { amount: pay, dayOfMonth: 25, occurrences: 4 }, openingBalance, horizon: 1, now: october });

  /** The verdict worked out from the drawn line itself — a daily line at one month. */
  const fromPoints = (plan: ReturnType<typeof buildPlan>) => {
    const balances = plan.points.map((p) => p.balance);
    return balances[balances.length - 1] < 0 ? "short" : Math.min(...balances) < 0 ? "tight" : "ok";
  };

  it("calls the owner's 393 tight, and says the deepest day apart from the first", () => {
    const plan = run(0);

    expect(plan.net).toBe(393);
    expect(plan.surplus).toBe(393); // kept, for a labelled line — no longer the verdict's figure
    expect(plan.verdict).toBe("tight");
    expect(plan.breaksOn).toEqual(new Date(2026, 9, 5)); // −1,000 after the rent
    expect(plan.breakingEvent?.label).toBe("Rent");
    expect(plan.lowestBalance).toBe(-1407); // after the power, three days later
    expect(plan.lowestOn).toEqual(new Date(2026, 9, 8));
    expect(plan.dip).toBe(1407);
    expect(plan.endingBalance).toBe(393);
  });

  it("calls it ok with the money in hand that covers the dip, though nothing else changed", () => {
    const plan = run(1407);
    // Exactly zero on the 8th is not under it.
    expect(plan).toMatchObject({ verdict: "ok", lowestBalance: 0, dip: 0, net: 393, endingBalance: 1800 });
    expect(plan.lowestOn).toEqual(new Date(2026, 9, 8));
    expect(plan.breaksOn).toBeUndefined();
    // A cent less and it is under for seventeen days.
    expect(run(1406.99)).toMatchObject({ verdict: "tight", dip: 0.01, breaksOn: new Date(2026, 9, 8) });
  });

  it("calls a month that costs more than it brings ok when the money in hand carries it", () => {
    // The old verdict said "short" here, from net alone: −107.
    const plan = run(1407, 1300);
    expect(plan.net).toBe(-107);
    expect(plan.shortfall).toBe(107);
    expect(plan.verdict).toBe("ok");
    expect(plan.endingBalance).toBe(1407 - 107);
  });

  it("calls it short only when the line ends under zero, and tight when it ends on zero", () => {
    expect(run(0, 1300)).toMatchObject({ verdict: "short", endingBalance: -107, shortfall: 107 });
    expect(run(107, 1300)).toMatchObject({ verdict: "tight", endingBalance: 0 });
    expect(run(106.99, 1300)).toMatchObject({ verdict: "short", endingBalance: -0.01 });
  });

  it("agrees with the line it draws, and never gets worse with more money in hand", () => {
    const order = { ok: 0, tight: 1, short: 2 } as const;
    let previous = 2;
    for (let opening = -500; opening <= 2000; opening += 37.5) {
      for (const pay of [0, 1300, 1800]) {
        const plan = run(opening, pay);
        expect(plan.verdict, `${opening} / ${pay}`).toBe(fromPoints(plan));
        // Reconciled a second way: the end of the line is opening + net.
        expect(plan.endingBalance).toBeCloseTo(opening + plan.net, 2);
        // The lowest day is a day of the line, at the line's lowest.
        const low = plan.points.find((p) => p.date.getTime() === plan.lowestOn.getTime());
        expect(low?.balance).toBe(plan.lowestBalance);
        expect(Math.min(...plan.points.map((p) => p.balance))).toBe(plan.lowestBalance);
        expect(plan.points.findIndex((p) => p.balance === plan.lowestBalance)).toBe(plan.points.indexOf(low!));
      }
      const verdict = order[run(opening).verdict];
      expect(verdict).toBeLessThanOrEqual(previous);
      previous = verdict;
    }
  });

  it("does not call a balance under zero that only a rounding error put there", () => {
    // 70 a month spread over September's thirty days, from 70 in hand: the walk
    // adds 70/30 thirty times and lands at −0.0000000000000187 on the 30th —
    // 0,00 € on screen. Compared unrounded, that "went under".
    const plan = buildPlan({ bills: [], goals: [], lines: [{ id: "l", label: "Food", amount: 70, kind: "expense", from: "2026-09", to: "2026-09" }], openingBalance: 70, horizon: 1, now: new Date(2026, 8, 1) });
    expect(plan.verdict).toBe("ok");
    expect(plan.breaksOn).toBeUndefined();
    expect(plan.dip).toBe(0);
    expect(plan.lowestBalance === 0).toBe(true);
    expect(plan.lowestOn).toEqual(new Date(2026, 8, 30));
  });

  it("finds the lowest day on a month's own last day — leap February, plain February, the year end", () => {
    const pay = { amount: 1000, dayOfMonth: 1, occurrences: 4 };
    const card = [bill({ name: "Card", amount: 900, dueDay: 31 })];
    const at = (now: Date, openingBalance: number) => buildPlan({ bills: card, goals: [], salary: pay, openingBalance, horizon: 1, now });

    // 15 Feb 2028, one month → 31 Mar. 100 − 900 (29 Feb) = −800; +1,000 (1 Mar)
    // = 200; − 900 (31 Mar) = −700. Ends under: short, deepest on the 29th.
    const leap = at(new Date(2028, 1, 15), 100);
    expect(leap).toMatchObject({ verdict: "short", lowestBalance: -800, endingBalance: -700 });
    expect(leap.lowestOn).toEqual(new Date(2028, 1, 29));
    expect(leap.breaksOn).toEqual(new Date(2028, 1, 29));

    // The same a year earlier lands on the 28th.
    expect(at(new Date(2027, 1, 15), 100).lowestOn).toEqual(new Date(2027, 1, 28));

    // 20 Dec 2026, one month → 31 Jan 2027. 850 − 900 (31 Dec) = −50; +1,000
    // (1 Jan) = 950; − 900 (31 Jan) = 50. Under for a day, ends above: tight.
    const yearEnd = at(new Date(2026, 11, 20), 850);
    expect(yearEnd).toMatchObject({ verdict: "tight", lowestBalance: -50, endingBalance: 50, dip: 50 });
    expect(yearEnd.lowestOn).toEqual(new Date(2026, 11, 31));
    // With 50 more in hand the 31st sits on zero, which is not under it.
    expect(at(new Date(2026, 11, 20), 900)).toMatchObject({ verdict: "ok", lowestBalance: 0 });
  });
});
