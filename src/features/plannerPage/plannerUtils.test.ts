import { describe, it, expect } from "vitest";
import { buildPlan, detectSalary, goalMonthlyNeed, goalMonthlyTarget, nextSalaryDate, salaryDates, SALARY_ROW_ID } from "./plannerUtils";
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

  it("spreads a targeted goal across the months left", () => {
    expect(goalMonthlyNeed(goal({ remaining: 900, deadline: new Date(2026, 10, 14) }), now)).toBe(300);
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

  it("runs to the end of the last month the horizon asks for", () => {
    expect(buildPlan({ ...base, horizon: "1m" }).end).toEqual(new Date(2026, 7, 31, 23, 59, 59, 999));
    expect(buildPlan({ ...base, horizon: "3m" }).end.getMonth()).toBe(9);
    expect(buildPlan({ ...base, horizon: "12m" }).end.getFullYear()).toBe(2027);
  });

  it("counts one payday per month in the window", () => {
    const plan = buildPlan({ ...base, horizon: "3m" });
    const row = plan.rows.find((r) => r.id === SALARY_ROW_ID);

    expect(row?.occurrences).toBe(3); // 20 Aug, 20 Sep, 20 Oct
    expect(plan.incomeTotal).toBe(6000);
  });

  it("charges a monthly bill once per month, not once in total", () => {
    const plan = buildPlan({ ...base, horizon: "3m", bills: [bill({ name: "Ρεύμα", amount: 100, dueDay: 20 })] });

    expect(plan.rows.find((r) => r.source === "bill")).toMatchObject({ occurrences: 3, total: -300 });
    expect(plan.billsTotal).toBe(300);
  });

  it("never looks at what has already been spent", () => {
    // The whole point of the rebuild: the plan is built from commitments and the
    // user's own figures, so no history can drag the answer around.
    const plan = buildPlan({ ...base, horizon: "1m" });
    expect(plan.outgoingTotal).toBe(0);
    expect(plan.openingBalance).toBe(0);
  });

  it("pro-rates a monthly budget line over the part of the month that is left", () => {
    // 18 days left of August out of 31 — charging a whole month of food for
    // them would answer a question nobody asked.
    const plan = buildPlan({ ...base, horizon: "1m", lines: [{ id: "l1", label: "Food", amount: 310, kind: "expense" }] });

    expect(plan.monthsCovered).toBeCloseTo(18 / 31, 2);
    expect(plan.rows.find((r) => r.id === "l1")?.total).toBeCloseTo(-180, 0);
  });

  it("charges a monthly line in full for each whole month ahead", () => {
    const plan = buildPlan({ ...base, horizon: "3m", lines: [{ id: "l1", label: "Food", amount: 200, kind: "expense" }] });

    // 18/31 of August, then all of September and October.
    expect(plan.monthsCovered).toBeCloseTo(18 / 31 + 2, 2);
    expect(plan.budgetTotal).toBeCloseTo(200 * (18 / 31 + 2), 1);
  });

  it("adds a monthly income line to the income side", () => {
    const plan = buildPlan({ ...base, horizon: "3m", lines: [{ id: "l1", label: "Side work", amount: 300, kind: "income" }] });

    expect(plan.incomeTotal).toBeCloseTo(6000 + 300 * (18 / 31 + 2), 1);
  });

  it("lets any row be switched off, and frees exactly its money", () => {
    const electricity = bill({ id: "b1", name: "Ρεύμα", amount: 100, dueDay: 20 });
    const input = { ...base, horizon: "3m" as const, bills: [electricity] };

    const on = buildPlan(input);
    const off = buildPlan({ ...input, skipIds: new Set(["b1"]) });

    expect(off.billsTotal).toBe(0);
    expect(off.rows.find((r) => r.id === "b1")).toMatchObject({ enabled: false, total: 0 });
    expect(off.endingBalance).toBeCloseTo(on.endingBalance + 300, 2);
  });

  it("switching the salary off is what shows whether it is carrying the month", () => {
    const on = buildPlan({ ...base, horizon: "1m" });
    const off = buildPlan({ ...base, horizon: "1m", skipIds: new Set([SALARY_ROW_ID]) });

    expect(on.incomeTotal).toBe(2000);
    expect(off.incomeTotal).toBe(0);
    expect(off.events.filter((e) => e.kind === "income")).toHaveLength(0);
  });

  it("still lists a bill that has nothing due in the window", () => {
    // Dropping it made the plan look as though it had forgotten the bill. It
    // costs nothing here, and says which of the two reasons that is.
    const paid = bill({
      id: "b1",
      name: "Netflix",
      dueDay: 22,
      payments: [{ id: "p", userId: "u1", billId: "b1", periodKey: "2026-08", amount: 50, paidDate: new Date(2026, 7, 3), createdAt: new Date(2026, 7, 3) }],
    } as Partial<BillWithStatus>);

    const plan = buildPlan({ ...base, horizon: "1m", bills: [paid, bill({ id: "b2", name: "No date" })] });

    expect(plan.rows.filter((r) => r.source === "bill")).toHaveLength(2);
    expect(plan.rows.find((r) => r.id === "b1")).toMatchObject({ occurrences: 0, total: 0, note: "paid" });
    expect(plan.rows.find((r) => r.id === "b2")).toMatchObject({ occurrences: 0, total: 0, note: "undated" });
    expect(plan.billsTotal).toBe(0);
  });

  it("still lists a goal that is already funded for the month", () => {
    const funded = goal({ id: "g1", targetPeriod: "monthly", targetAmount: 200, currentPeriodSaved: 200 });
    const plan = buildPlan({ ...base, horizon: "1m", goals: [funded] });

    expect(plan.rows.find((r) => r.id === "g1")).toMatchObject({ total: 0, note: "funded" });
  });

  it("asks a goal for what is left this month, then the full target after", () => {
    const trip = goal({ id: "g1", name: "Trip", targetPeriod: "monthly", monthlyRequired: 200, currentPeriodSaved: 200 });
    const plan = buildPlan({ ...base, horizon: "3m", goals: [trip] });

    // Nothing more wanted in August; September and October want €200 each.
    expect(plan.goalsTotal).toBe(400);
    expect(plan.rows.find((r) => r.id === "g1")?.occurrences).toBe(2);
  });

  it("starts the line wherever the user says their money is", () => {
    const plan = buildPlan({ ...base, horizon: "1m", openingBalance: 500 });
    expect(plan.points[0].balance).toBe(500);
    expect(plan.endingBalance).toBe(2500); // plus the 20 Aug salary
  });

  it("calls it short when the months themselves do not cover the outgoings", () => {
    const plan = buildPlan({ ...base, horizon: "1m", salary: undefined, openingBalance: 200, bills: [bill({ name: "Ρεύμα", amount: 300, dueDay: 24 })] });

    expect(plan.verdict).toBe("short");
    expect(plan.shortfall).toBe(300); // no income at all against €300 of bills
    expect(plan.dip).toBe(100); // and €200 in hand only covers so much of it
  });

  it("separates a timing problem from a shortfall, and names the day", () => {
    // The bill lands before the salary does. Over the month it is covered; on
    // 20 Aug it is not — and telling the user they "will run short" when the
    // month adds up would be the wrong answer to the question they asked.
    const plan = buildPlan({ ...base, horizon: "1m", openingBalance: 0, bills: [bill({ name: "Ρεύμα", amount: 300, dueDay: 18 })] });

    expect(plan.verdict).toBe("tight");
    expect(plan.shortfall).toBe(0);
    expect(plan.surplus).toBe(1700);
    expect(plan.breaksOn).toEqual(new Date(2026, 7, 18));
    expect(plan.breakingEvent?.label).toBe("Ρεύμα");
    expect(plan.dip).toBe(300);
  });

  it("pulls an overdue bill onto today rather than a date that has passed", () => {
    const plan = buildPlan({ ...base, horizon: "1m", bills: [bill({ name: "Late", amount: 50, dueDay: 9 })] });

    const [first] = plan.events.filter((e) => e.kind === "bill");
    expect(first.overdue).toBe(true);
    expect(first.date).toEqual(new Date(2026, 7, 14));
  });

  it("adds up: opening plus income less outgoings is where the line ends", () => {
    const plan = buildPlan({
      ...base,
      horizon: "3m",
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
    const plan = buildPlan({ bills: [], goals: [], now, horizon: "1m" });

    expect(plan.points).toHaveLength(18); // 14 Aug through 31 Aug
    expect(plan.verdict).toBe("ok");
    expect(plan.rows).toHaveLength(0);
  });
});
