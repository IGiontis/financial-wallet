import { describe, it, expect } from "vitest";
import { buildPlan, planPeriods, SALARY_ROW_ID, type BudgetLine, type OneOff, type PlannerHorizon } from "./plannerUtils";
import type { BillWithStatus, DebtWithStatus, InvestmentGoalWithStats } from "../../shared/types/IndexTypes";

// The planner lists every figure on the left and draws one line on the right.
// These two are computed by different code — the rows from each source's own
// arithmetic, the line from a day-by-day walk — and the page shows them side by
// side as if they were one answer. If they ever stop agreeing, one of them is
// lying and nothing on the screen says which.
//
// Every test here recomputes something the plan already reports, by a route the
// plan does not take.

const now = new Date(2026, 8, 8); // 8 Sep 2026
const round = (n: number) => Math.round(n * 100) / 100;

const bill = (over: Partial<BillWithStatus> = {}): BillWithStatus =>
  ({
    id: `b-${over.name ?? Math.random()}`,
    userId: "u1",
    name: "Bill",
    amount: 50,
    categoryId: "c1",
    frequency: "monthly",
    isActive: true,
    createdAt: new Date(2026, 0, 1),
    anchorDate: new Date(2026, 0, 1),
    updatedAt: new Date(2026, 0, 1),
    currentPeriodKey: "2026-09",
    isPaidThisPeriod: false,
    payments: [],
    monthlyEquivalent: 50,
    ...over,
  }) as BillWithStatus;

const goal = (over: Partial<InvestmentGoalWithStats> = {}): InvestmentGoalWithStats =>
  ({
    id: `g-${over.name ?? Math.random()}`,
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
    ...over,
  }) as InvestmentGoalWithStats;

const debt = (over: Partial<DebtWithStatus> = {}): DebtWithStatus =>
  ({
    id: `d-${over.person ?? Math.random()}`,
    userId: "u1",
    person: "Someone",
    label: "Loan",
    direction: "owe",
    amount: 600,
    remaining: 600,
    isSettled: false,
    createdAt: new Date(2026, 6, 1),
    updatedAt: new Date(2026, 6, 1),
    ...over,
  }) as DebtWithStatus;

/** Everything a plan can hold, at once — the only shape worth reconciling. */
const everything = {
  bills: [
    bill({ name: "Rent", amount: 700, dueDay: 5 }),
    bill({ name: "Power", amount: 180, dueDay: 12, frequency: "monthly", intervalCount: 2 }),
    bill({ name: "Insurance", amount: 1200, dueDay: 20, frequency: "yearly", installmentCount: 4, installmentIntervalMonths: 3 }),
  ],
  goals: [goal({ name: "Deadline", targetAmount: 1200, remaining: 900, deadline: new Date(2027, 2, 15) }), goal({ name: "Monthly", targetPeriod: "monthly", monthlyRequired: 120 })],
  debts: [debt({ person: "Maria", remaining: 655, dueDate: new Date(2027, 5, 10) }), debt({ person: "Kostas", remaining: 200 })],
  lines: [
    { id: "food", label: "Food", amount: 450, kind: "expense" },
    { id: "rent-in", label: "Room rent", amount: 300, kind: "income" },
    { id: "ski", label: "Ski", amount: 200, kind: "expense", from: "2026-12", to: "2027-04", yearly: true },
    { id: "trip", label: "Trip", amount: 900, kind: "expense", from: "2027-08", yearly: true },
  ] as BudgetLine[],
  oneOffs: [
    { id: "bonus", label: "14th", amount: 1400, date: "2026-12-20" },
    { id: "coupon", label: "Coupon", amount: 250, date: "2026-09-15", every: 3 },
  ] as OneOff[],
  salary: { amount: 1800, dayOfMonth: 25, occurrences: 4 },
  openingBalance: 1500,
  now,
};

const horizons: PlannerHorizon[] = [1, 3, 6, 12, 24, 36];

describe("the list on the left and the line on the right", () => {
  it("ends where the opening balance plus the net says it ends", () => {
    // The rows are summed by source; the balance is walked day by day, with
    // budget lines accrued in daily slices and everything else landing on a
    // date. Nothing forces the two to agree — this does.
    for (const horizon of horizons) {
      const plan = buildPlan({ ...everything, horizon });

      expect(round(plan.endingBalance), `horizon ${horizon}`).toBeCloseTo(round(everything.openingBalance + plan.net), 1);
    }
  });

  it("keeps every row accounted for in one total or the other", () => {
    for (const horizon of horizons) {
      const plan = buildPlan({ ...everything, horizon });
      const signed = round(plan.rows.reduce((sum, row) => sum + row.total, 0));

      expect(signed, `horizon ${horizon}`).toBeCloseTo(plan.net, 1);
      expect(plan.incomeTotal - plan.outgoingTotal).toBeCloseTo(plan.net, 1);
    }
  });

  it("reports the surplus and the shortfall as the two sides of one figure", () => {
    for (const horizon of horizons) {
      const plan = buildPlan({ ...everything, horizon });

      expect(Math.min(plan.surplus, plan.shortfall)).toBe(0);
      expect(plan.surplus - plan.shortfall).toBeCloseTo(plan.net, 2);
      expect(plan.verdict === "short").toBe(plan.shortfall > 0);
      if (plan.verdict === "ok") expect(plan.dip).toBe(0);
    }
  });

  it("charges nothing at all when every row is switched off", () => {
    for (const horizon of horizons) {
      const all = buildPlan({ ...everything, horizon });
      const off = buildPlan({ ...everything, horizon, skipIds: new Set(all.rows.map((r) => r.id)) });

      expect(off.incomeTotal).toBe(0);
      expect(off.outgoingTotal).toBe(0);
      expect(off.net).toBe(0);
      expect(off.endingBalance).toBe(round(everything.openingBalance));
      // And the line stays exactly flat, not merely level at each end.
      expect(off.points.every((p) => p.balance === round(everything.openingBalance))).toBe(true);
    }
  });

  it("moves the total by exactly what the row it dropped was worth", () => {
    const plan = buildPlan({ ...everything, horizon: 12 });

    for (const row of plan.rows) {
      const without = buildPlan({ ...everything, horizon: 12, skipIds: new Set([row.id]) });

      // Switching one row off must move the net by that row's own total and
      // nothing else — no knock-on to any other row's arithmetic.
      expect(round(plan.net - without.net), row.label).toBeCloseTo(round(row.total), 1);
    }
  });

  it("does not care what order the sources arrive in", () => {
    const forwards = buildPlan({ ...everything, horizon: 24 });
    const backwards = buildPlan({
      ...everything,
      horizon: 24,
      bills: [...everything.bills].reverse(),
      goals: [...everything.goals].reverse(),
      debts: [...everything.debts].reverse(),
      lines: [...everything.lines].reverse(),
      oneOffs: [...everything.oneOffs].reverse(),
    });

    expect(backwards.incomeTotal).toBe(forwards.incomeTotal);
    expect(backwards.outgoingTotal).toBe(forwards.outgoingTotal);
    expect(backwards.endingBalance).toBe(forwards.endingBalance);
    expect(backwards.lowestBalance).toBeCloseTo(forwards.lowestBalance, 2);
    expect(backwards.points.map((p) => p.balance)).toEqual(forwards.points.map((p) => p.balance));
  });

  it("does not let the opening balance change anything but the level", () => {
    // Money already in the account cannot change what the months cost.
    const poor = buildPlan({ ...everything, horizon: 12, openingBalance: 0 });
    const rich = buildPlan({ ...everything, horizon: 12, openingBalance: 10000 });

    expect(rich.net).toBe(poor.net);
    expect(rich.incomeTotal).toBe(poor.incomeTotal);
    expect(rich.outgoingTotal).toBe(poor.outgoingTotal);
    expect(round(rich.endingBalance - poor.endingBalance)).toBe(10000);
    expect(round(rich.lowestBalance - poor.lowestBalance)).toBe(10000);
  });
});

describe("the bars and the line are drawn from the same plan", () => {
  it("totals the bars back to what the plan says arrives and leaves", () => {
    // Not to the events: the budget lines accrue by the day and land on no
    // date at all, so a chart built from events alone drew no outgoing bar for
    // them. A plan whose costs are all budget lines — three trips a year and a
    // ski season — showed pay coming in, nothing going out, and a balance
    // falling for no visible reason.
    for (const horizon of horizons) {
      const plan = buildPlan({ ...everything, horizon });
      const periods = planPeriods(plan);

      const barsIn = round(periods.reduce((sum, p) => sum + p.income, 0));
      const barsOut = round(periods.reduce((sum, p) => sum + p.outgoing, 0));

      expect(barsIn, `horizon ${horizon}`).toBeCloseTo(plan.incomeTotal, 1);
      expect(barsOut, `horizon ${horizon}`).toBeCloseTo(plan.outgoingTotal, 1);
    }
  });

  it("moves the line by exactly what the bars beside it say", () => {
    // Period by period: in, less out, is how far the balance moved. This is
    // what makes the two halves of the chart one picture rather than two.
    for (const horizon of horizons) {
      const plan = buildPlan({ ...everything, horizon });
      const periods = planPeriods(plan);

      let previous = plan.openingBalance;
      for (const period of periods) {
        expect(round(period.balance - previous), `${period.key} at horizon ${horizon}`).toBeCloseTo(round(period.income - period.outgoing), 1);
        previous = period.balance;
      }
    }
  });

  it("closes the last period on the same figure the plan ends on", () => {
    for (const horizon of horizons) {
      const periods = planPeriods(buildPlan({ ...everything, horizon }));
      const plan = buildPlan({ ...everything, horizon });

      expect(periods[periods.length - 1].balance, `horizon ${horizon}`).toBe(plan.endingBalance);
    }
  });

  it("never draws a point above the highest or below the lowest the walk saw", () => {
    for (const horizon of horizons) {
      const plan = buildPlan({ ...everything, horizon });

      for (const point of plan.points) expect(point.balance).toBeGreaterThanOrEqual(round(plan.lowestBalance) - 0.01);
    }
  });

  it("keeps the drawn points in date order, dips included", () => {
    for (const horizon of horizons) {
      const dates = buildPlan({ ...everything, horizon }).points.map((p) => p.date.getTime());
      const sorted = [...dates].sort((a, b) => a - b);

      expect(dates, `horizon ${horizon}`).toEqual(sorted);
    }
  });

  it("hands every event to exactly one point", () => {
    // The points carry the events for the stretch they close, and the page
    // lists them when one is tapped. An event counted twice would be read as
    // two payments; one dropped would be a payment nobody sees.
    for (const horizon of horizons) {
      const plan = buildPlan({ ...everything, horizon });
      const carried = plan.points.flatMap((p) => p.events);

      expect(carried).toHaveLength(plan.events.length);
      expect(round(carried.reduce((sum, e) => sum + e.amount, 0))).toBeCloseTo(
        round(plan.events.reduce((sum, e) => sum + e.amount, 0)),
        2,
      );
    }
  });
});

describe("the salary row is the salary, and only the salary", () => {
  it("counts one payday per month and totals them", () => {
    for (const horizon of [1, 3, 12, 24] as PlannerHorizon[]) {
      const plan = buildPlan({ ...everything, horizon });
      const row = plan.rows.find((r) => r.id === SALARY_ROW_ID)!;
      const paydays = plan.events.filter((e) => e.label === SALARY_ROW_ID);

      expect(paydays).toHaveLength(row.occurrences!);
      expect(round(paydays.reduce((sum, e) => sum + e.amount, 0))).toBe(round(row.total));
    }
  });

  it("leaves other income under its own name", () => {
    const plan = buildPlan({ ...everything, horizon: 12 });
    const labels = plan.events.filter((e) => e.kind === "income").map((e) => e.label);

    expect(labels).toContain("14th");
    expect(labels).toContain("Coupon");
  });
});
