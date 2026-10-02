import { describe, it, expect } from "vitest";
import { buildPlan, SALARY_ROW_ID, type BudgetLine, type PlanInput, type PlannerPlan } from "./plannerUtils";
import { payCycles, planMonths, sliceBar, sliceScale, sliceSteps, type PlanSlice } from "./payCycles";
import { paydayOutlook } from "../overview/overviewTabs";
import { computeBillStatus } from "../bills/billsUtils";
import type { Bill, InvestmentGoalWithStats, Transaction } from "../../shared/types/IndexTypes";

// The Planner's chart cuts the plan at pay days. Every figure on it is checked
// here a second way: against the plan's own day-by-day balance, against the
// plan's own totals, against the Overview's "until pay day", and against the
// figures the owner signed off in the mockup, worked out by hand there.
//
// The mockup's case: Wednesday 30 September 2026, 1,000 in hand, pay of 1,450
// on the 30th (September's came on the 25th), bills of 515 a month — rent 400
// on the 1st, power 65 on the 5th, phone 20 on the 8th, internet 30 on the
// 10th — a goal of 100 on the 1st, and 300 a month of one's own spending.

const NOW = new Date(2026, 8, 30, 12);
const JAN = new Date(2026, 0, 1);

const bill = (id: string, name: string, amount: number, extra: Partial<Bill>, paidKey: string) =>
  computeBillStatus(
    { id, userId: "u", name, amount, categoryId: "c", frequency: "monthly", isActive: true, anchorDate: JAN, createdAt: JAN, updatedAt: JAN, ...extra } as Bill,
    // This period's is already paid, as it was in the mockup: nothing of
    // September's is owed on the 30th.
    [{ id: `${id}-paid`, userId: "u", billId: id, periodKey: paidKey, amount, paidDate: JAN, createdAt: JAN }],
    NOW,
  );
const monthly = (id: string, name: string, amount: number, dueDay: number) => bill(id, name, amount, { dueDay }, "2026-09");
const BILLS = [monthly("rent", "Rent", 400, 1), monthly("power", "Power", 65, 5), monthly("phone", "Phone", 20, 8), monthly("net", "Internet", 30, 10)];
// The two extras the mockup adds to its twelve months: insurance in March, a holiday in August.
const EXTRAS = [bill("car", "Car insurance", 320, { frequency: "yearly", dueMonth: 2, dueDay: 15 }, "2026"), bill("trip", "Holiday", 800, { frequency: "yearly", dueMonth: 7, dueDay: 1 }, "2026")];

// September's 100 is already in, so the goal asks again from October.
const GOAL = {
  id: "goal",
  userId: "u",
  name: "Savings",
  goalType: "targeted",
  targetPeriod: "monthly",
  monthlyRequired: 100,
  currentPeriodSaved: 100,
  isActive: true,
  isCompleted: false,
  createdAt: JAN,
  updatedAt: JAN,
} as unknown as InvestmentGoalWithStats;
const OWN: BudgetLine = { id: "own", label: "Mine", amount: 300, kind: "expense" };
const SALARY = { amount: 1450, dayOfMonth: 30, occurrences: 3 };

const sample = (over: Partial<PlanInput> = {}) => buildPlan({ bills: BILLS, goals: [GOAL], lines: [OWN], salary: SALARY, openingBalance: 1000, horizon: 3, now: NOW, ...over });

const income = (id: string, amount: number, date: Date): Transaction =>
  ({ id, userId: "u", type: "income", amount, categoryId: "c", description: id, date, createdAt: date, updatedAt: date }) as Transaction;

const day = (month: number, date: number, year = 2026) => new Date(year, month, date);
const pointOn = (plan: PlannerPlan, date: Date) => plan.points.find((p) => p.date.getTime() === date.getTime())?.balance;
const walkOn = (plan: PlannerPlan, date: Date) => Math.round(plan.daily.balance[Math.round((date.getTime() - plan.start.getTime()) / 864e5)] * 100) / 100;
const cents = (n: number) => Math.round(n * 100) / 100;
const sum = (slices: PlanSlice[], pick: (s: PlanSlice) => number) => cents(slices.reduce((total, s) => total + pick(s), 0));

describe("pay cycles, on the mockup's three months", () => {
  const plan = sample();
  const cycles = payCycles(plan);

  it("cuts today → 29 Oct, then each pay to the eve of the next, the last to 31 Dec", () => {
    expect(cycles.map((c) => [c.kind, c.start, c.end, c.days])).toEqual([
      ["pay", day(8, 30), day(9, 29), 30],
      ["pay", day(9, 30), day(10, 29), 31],
      ["pay", day(10, 30), day(11, 29), 30],
      ["pay", day(11, 30), day(11, 31), 2],
    ]);
    expect(cycles.map((c) => c.last)).toEqual([false, false, false, true]);
  });

  it("leaves the mockup's eves — 94,35 · 620,00 · 1.164,35 — and ends on 2.595,00", () => {
    expect(cycles.map((c) => c.close)).toEqual([94.35, 620, 1164.35, 2595]);
    // By hand, as the mockup worked them: 1,000 − 515 − 100 − (10 for today +
    // 29 days of October at 300 / 31) …
    expect(cents(1000 - 515 - 100 - 10 - (29 * 300) / 31)).toBe(94.35);
    // … each pay adds 1,450, and the next eve is 1,450 − 915 − one day's
    // difference in the budget line further on.
    expect(cents(94.35 + 1450 - (2 * 300) / 31 - 515 - 100 - 29 * 10)).toBe(620);
    expect(cents(620 + 1450 - 10 - 515 - 100 - (29 * 300) / 31)).toBe(1164.35);
    expect(cents(1164.35 + 1450 - (2 * 300) / 31)).toBe(2595);
  });

  it("closes each cycle on the plan's own balance for that day", () => {
    // Summed from the events and the lines' accrual, never read off the walk —
    // so the walk is a second route to every one of them.
    for (const cycle of cycles) expect(pointOn(plan, cycle.end), cycle.end.toDateString()).toBe(cycle.close);
    expect(cycles.at(-1)!.close).toBe(plan.endingBalance);
  });

  it("takes each cycle apart the way the Overview's bar does", () => {
    expect(cycles[0]).toMatchObject({ carried: 1000, pay: 0, bills: 515, commitments: 100, lines: 290.65, incoming: 0 });
    expect(cycles[1]).toMatchObject({ carried: 94.35, pay: 1450, bills: 515, commitments: 100, lines: 309.35 });
    expect(cycles[3]).toMatchObject({ carried: 1164.35, pay: 1450, bills: 0, commitments: 0, lines: 19.35 });
    // Each one reconciles: what it starts with, plus the pay, less what goes.
    for (const c of cycles) expect(cents(c.carried + c.pay + c.incoming - c.bills - c.commitments - c.lines)).toBe(c.close);
    // The first one's dated items, in order: the four bills and the goal.
    expect(cycles[0].items.map((e) => [e.label, e.date.getDate(), e.amount])).toEqual([
      ["Rent", 1, -400],
      ["Savings", 1, -100],
      ["Power", 5, -65],
      ["Phone", 8, -20],
      ["Internet", 10, -30],
    ]);
  });

  it("adds up to the plan's totals: in 4.350, out 2.755", () => {
    expect(sum(cycles, (c) => c.pay + c.incoming)).toBe(plan.incomeTotal);
    expect(plan.incomeTotal).toBe(4350);
    expect(sum(cycles, (c) => c.bills)).toBe(plan.billsTotal);
    expect(sum(cycles, (c) => c.commitments)).toBe(cents(plan.goalsTotal + plan.debtsTotal));
    expect(sum(cycles, (c) => c.lines)).toBe(plan.budgetTotal);
    expect(sum(cycles, (c) => c.bills + c.commitments + c.lines)).toBe(plan.outgoingTotal);
    expect(plan.outgoingTotal).toBe(2755);
    expect([plan.billsTotal, plan.goalsTotal, plan.budgetTotal]).toEqual([1545, 300, 910]);
    // 1,000 + 4,350 − 2,755 = 2,595: the last close, by a third route.
    expect(cents(1000 + 4350 - 2755)).toBe(cycles.at(-1)!.close);
  });

  it("closes the first cycle on the Overview's 'until pay day' figure", () => {
    // The Overview builds its own two-month plan from the same inputs.
    const overview = paydayOutlook(sample({ horizon: 2 }), NOW);
    expect(overview.left).toBe(94.35);
    expect(cycles[0].close).toBe(overview.left);
    expect(cycles[0].end.getTime()).toBe(overview.date.getTime() - 864e5);
    expect([cycles[0].bills, cycles[0].commitments, cycles[0].lines]).toEqual([overview.bills, overview.commitments, overview.lines]);
  });

  it("marks the lowest point of each cycle — its eve, here", () => {
    expect(cycles.slice(0, 3).map((c) => [c.lowest, c.lowestOn])).toEqual([
      [94.35, day(9, 29)],
      [620, day(10, 29)],
      [1164.35, day(11, 29)],
    ]);
    expect(Math.min(...cycles.map((c) => c.lowest))).toBe(plan.lowestBalance);
    expect(cycles.every((c) => c.breaksOn === undefined && !c.backwards)).toBe(true);
  });

  it("draws every bar on one scale of 0, 1.000, 2.000", () => {
    // The first bar is all of the 1,000: 94,35 left and 905,65 gone.
    expect(sliceBar(cycles[0])).toEqual({ low: 0, high: 1000, left: 94.35, payFrom: 1000, payTo: 1000 });
    // The pay rule runs from what was carried to what there is on pay day.
    expect(sliceBar(cycles[1])).toMatchObject({ high: 1544.35, payFrom: 94.35, payTo: 1544.35 });
    expect(sliceScale(cycles).ticks).toEqual([0, 1000, 2000]);
  });
});

describe("months, on the same plan", () => {
  const plan = sample();
  const months = planMonths(plan);

  it("ends each month on the mockup's balances: 990 → 1.525 → 2.060 → 2.595", () => {
    expect(months.map((m) => [m.start.getMonth(), m.close])).toEqual([
      [8, 990],
      [9, 1525],
      [10, 2060],
      [11, 2595],
    ]);
    for (const month of months) expect(pointOn(plan, month.end)).toBe(month.close);
    // October: +1,450 −915 (515 + 100 + 300), from 990.
    expect(months[1]).toMatchObject({ pay: 1450, bills: 515, commitments: 100, lines: 300 });
    expect(cents(990 + 1450 - 915)).toBe(1525);
  });

  it("says what is left before each month's pay — the cycles' eves", () => {
    const cycles = payCycles(plan);
    expect(months[0].beforePay).toBeUndefined();
    expect(months.slice(1).map((m) => m.beforePay)).toEqual(cycles.slice(0, 3).map((c) => ({ on: c.end, balance: c.close })));
  });
});

describe("a cycle under zero", () => {
  // The mockup's other case, one month: 750 in hand; October's bills are
  // 698,50 with 183,50 of building fees on the 1st, and the goal is 250.
  const plan = buildPlan({
    bills: [...BILLS, monthly("fees", "Building fees", 183.5, 1)],
    goals: [{ ...GOAL, monthlyRequired: 250, currentPeriodSaved: 250 }],
    lines: [OWN],
    salary: SALARY,
    openingBalance: 750,
    horizon: 1,
    now: NOW,
  });
  const cycles = payCycles(plan);

  it("goes under on 1 Oct, at the rent, and is deepest on the eve: −489,15", () => {
    expect(cycles[0].breaksOn).toEqual(day(9, 1));
    expect(cycles[0].breaksAt?.label).toBe("Rent");
    expect(pointOn(plan, day(9, 1))).toBe(-103.18);
    expect(cents(740 - 400 - 250 - 183.5 - 300 / 31)).toBe(-103.18);
    expect(cycles[0].close).toBe(-489.15);
    expect([cycles[0].lowest, cycles[0].lowestOn]).toEqual([-489.15, day(9, 29)]);
    // 750 − 698,50 − 250 − 290,65 = −489,15, as the mockup has it.
    expect(cents(750 - 698.5 - 250 - 290.65)).toBe(-489.15);
  });

  it("crosses left of zero, and the pay covers the hole", () => {
    expect(sliceBar(cycles[0])).toMatchObject({ low: -489.15, high: 750, left: 0 });
    // 750 + 1,450 − 1,258,50 = 941,50 at the end of October.
    expect(cycles[1].close).toBe(941.5);
    expect(cents(750 + 1450 - 1258.5)).toBe(941.5);
    expect(sliceBar(cycles[1])).toMatchObject({ low: 0, payFrom: -489.15, payTo: 960.85 });
    expect(cycles[1].breaksOn).toBeUndefined();
  });
});

describe("twelve months, with the mockup's two extras", () => {
  const plan = sample({ bills: [...BILLS, ...EXTRAS], horizon: 12 });
  const cycles = payCycles(plan);

  it("keeps one cycle per pay — thirteen rows — although the line is sampled weekly", () => {
    expect(plan.pointStep).toBe("week");
    expect(cycles).toHaveLength(13);
    // February's pay is clamped to the 28th, so its eve is the 27th.
    expect(cycles.map((c) => c.end.getDate())).toEqual([29, 29, 29, 29, 27, 29, 29, 29, 29, 29, 29, 29, 30]);
  });

  it("leaves the mockup's eves, the August holiday the only step back", () => {
    expect(cycles.map((c) => c.close)).toEqual([94.35, 620, 1164.35, 1699.35, 2225.71, 2449.35, 2975, 3519.35, 4045, 4589.35, 4324.35, 4850, 6290]);
    expect(cycles.map((c) => c.backwards)).toEqual([false, false, false, false, false, false, false, false, false, false, true, false, false]);
    // By hand for February: 1.699,35 + 1.450 − 2 days of January − 615 − 27 days at 300 / 28.
    expect(cents(1699.3548 + 1450 - (2 * 300) / 31 - 615 - (27 * 300) / 28)).toBe(2225.71);
  });

  it("matches the day-by-day walk on every eve, where the weekly points cannot say", () => {
    for (const cycle of cycles) expect(walkOn(plan, cycle.end), cycle.end.toDateString()).toBe(cycle.close);
    // Most eves are not points at all at this sampling.
    expect(cycles.filter((c) => pointOn(plan, c.end) === undefined).length).toBeGreaterThan(6);
  });

  it("adds up to in 17.400, out 12.110 — 7.300 bills and extras, 1.200 goals, 3.610 own", () => {
    expect([plan.incomeTotal, plan.billsTotal, plan.goalsTotal, plan.budgetTotal, plan.outgoingTotal]).toEqual([17400, 7300, 1200, 3610, 12110]);
    expect(sum(cycles, (c) => c.pay + c.incoming)).toBe(plan.incomeTotal);
    expect(sum(cycles, (c) => c.bills)).toBe(plan.billsTotal);
    expect(sum(cycles, (c) => c.commitments)).toBe(plan.goalsTotal);
    expect(sum(cycles, (c) => c.lines)).toBe(plan.budgetTotal);
    expect(cycles.at(-1)!.close).toBe(plan.endingBalance);
    expect(cents(1000 + 17400 - 12110)).toBe(6290);
  });

  it("still closes the first cycle on the Overview's figure", () => {
    expect(cycles[0].close).toBe(paydayOutlook(sample({ bills: [...BILLS, ...EXTRAS], horizon: 2 }), NOW).left);
    expect(sliceScale(cycles).ticks).toEqual([0, 2500, 5000]);
  });
});

describe("pay that is not where the calendar says", () => {
  it("came early: September's arrived on the 25th, so the cycles are the mockup's", () => {
    const plan = sample({ actuals: { transactions: [income("pay-sep", 1450, day(8, 25))], debts: [], overrides: {} } });
    expect(plan.occurrences.find((o) => o.date.getTime() === day(8, 30).getTime())?.status).toBe("received");
    expect(payCycles(plan).map((c) => c.close)).toEqual([94.35, 620, 1164.35, 2595]);
    expect(paydayOutlook(plan, NOW).left).toBe(94.35);
  });

  it("is late: held on today, so the first cycle opens with it", () => {
    // Paid on the 25th, seen in August, not yet in September.
    const plan = sample({
      salary: { ...SALARY, dayOfMonth: 25 },
      actuals: { transactions: [income("pay-aug", 1450, day(7, 25))], debts: [], overrides: {} },
    });
    const cycles = payCycles(plan);
    const late = cycles[0].payEvents[0];

    expect(late).toMatchObject({ late: true, amount: 1450, expected: day(8, 25) });
    expect(cycles[0]).toMatchObject({ start: day(8, 30), end: day(9, 24), carried: 1000, pay: 1450 });
    expect(cycles[0].beforePay).toBeUndefined();
    // 1,000 + 1,450 − today's 10 − 615 − 24 days of October at 300 / 31.
    expect(cycles[0].close).toBe(cents(1000 + 1450 - 10 - 615 - (24 * 300) / 31));
    expect(cycles[0].close).toBe(walkOn(plan, day(9, 24)));
    // The Overview's answer is the money now: the pay is today, nothing comes between.
    const overview = paydayOutlook(plan, NOW);
    expect([overview.date, overview.left]).toEqual([day(8, 30), 1000]);
    expect(overview.left).toBe(cycles[0].carried);
  });

  it("may already be in the bank reading: left out, not counted twice", () => {
    const plan = sample({ actuals: { transactions: [], debts: [], overrides: {}, lastReadingAt: new Date(2026, 8, 29, 20) } });
    expect(plan.occurrences.find((o) => o.label === SALARY_ROW_ID && o.date.getDate() === 30 && o.date.getMonth() === 8)?.status).toBe("unconfirmed");
    expect(payCycles(plan).map((c) => c.close)).toEqual([94.35, 620, 1164.35, 2595]);
  });
});

describe("no pay at all", () => {
  const plan = sample({ salary: undefined });
  const cycles = payCycles(plan);

  it("falls back to calendar months", () => {
    expect(cycles.map((c) => [c.kind, c.start.getMonth(), c.close])).toEqual([
      ["month", 8, 990],
      ["month", 9, 75],
      ["month", 10, -840],
      ["month", 11, -1755],
    ]);
    expect(cycles).toEqual(planMonths(plan));
    for (const c of cycles) expect(pointOn(plan, c.end)).toBe(c.close);
    // 990 − 915 a month, by hand.
    expect([990 - 915, 990 - 2 * 915, 990 - 3 * 915]).toEqual([75, -840, -1755]);
  });

  it("ends the first month where the Overview's 'until the month's end' does", () => {
    const overview = paydayOutlook(sample({ salary: undefined, horizon: 2 }), NOW);
    expect(overview.known).toBe(false);
    expect(cycles[0].close).toBe(overview.left);
  });

  it("goes under in November, on the rent, and says so", () => {
    expect(cycles[2].breaksOn).toEqual(day(10, 1));
    expect(cycles[2].breaksAt?.label).toBe("Rent");
    expect(cycles[2].backwards).toBe(true);
    expect(sliceBar(cycles[3])).toMatchObject({ low: -1755, left: 0 });
  });
});

describe("the list behind each figure", () => {
  const plans = {
    "three months": sample(),
    "twelve months": sample({ bills: [...BILLS, ...EXTRAS], horizon: 12 }),
    "no pay": sample({ salary: undefined, horizon: 6 }),
    "an odd opening and a line of income": sample({ openingBalance: 1234.56, lines: [OWN, { id: "room", label: "Room", amount: 250, kind: "income" }], horizon: 6 }),
  };

  it("is the mockup's subtraction for the first cycle: 1.000 − 400 − 100 − 65 − 20 − 30 − 290,65", () => {
    const steps = sliceSteps(payCycles(plans["three months"])[0]);
    expect(steps.map((s) => [s.kind, s.event?.label, s.amount])).toEqual([
      ["carried", undefined, 1000],
      ["item", "Rent", -400],
      ["item", "Savings", -100],
      ["item", "Power", -65],
      ["item", "Phone", -20],
      ["item", "Internet", -30],
      ["lines", undefined, -290.65],
    ]);
  });

  it("opens a pay cycle with what was carried and the pay", () => {
    const steps = sliceSteps(payCycles(plans["three months"])[1]);
    expect(steps.slice(0, 2).map((s) => [s.kind, s.amount])).toEqual([
      ["carried", 94.35],
      ["pay", 1450],
    ]);
  });

  for (const [name, plan] of Object.entries(plans)) {
    it(`adds up to the cent to every closing figure — ${name}`, () => {
      for (const slice of [...payCycles(plan), ...planMonths(plan)]) {
        const total = cents(sliceSteps(slice).reduce((s, step) => s + step.amount, 0));
        expect(total, slice.start.toDateString()).toBe(slice.close);
      }
    });
  }
});
