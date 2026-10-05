import { describe, it, expect } from "vitest";
import { attentionItems, goalsProgress, paydayOutlook, spendingByCategory } from "./overviewTabs";
import { buildPlan, type BudgetLine, type PlannerPlan } from "../plannerPage/plannerUtils";
import { monthlySalary } from "../../test/incomes";
import { calculateMetrics } from "./overviewUtils";
import { billsNeedingAttention, computeBillStatus, overdueBills } from "../bills/billsUtils";
import { computeDebtStatus } from "../debts/debtsUtils";
import type { Bill, BillPayment, Debt, InvestmentGoalWithStats, Transaction } from "../../shared/types/IndexTypes";

// The overview's "what wants doing" list and its "left at pay day" figure.
//
// Both are read against the pages they summarise: the list has to count the
// same bills as the badge on the menu, and the figure has to be the balance
// less exactly the bills that fall before pay day — worked out again by hand.

const NOW = new Date(2026, 8, 26); // 26 September
/**
 * January to August paid, on the 1st: a bill kept up to date until this month,
 * so September is the only one that can be late or due. Without it a bill
 * added in January with nothing paid is eight months behind — overdue counts
 * every period, not only the current one.
 */
const upToDate = (id: string, amount: number): BillPayment[] =>
  Array.from({ length: 8 }, (_, m) => ({ id: `${id}-${m}`, userId: "u", billId: id, periodKey: `2026-${String(m + 1).padStart(2, "0")}`, amount, paidDate: new Date(2026, m, 1), createdAt: new Date(2026, m, 1) }) as BillPayment);
const bill = (id: string, name: string, amount: number, dueDay: number, extra: Partial<Bill> = {}) =>
  computeBillStatus(
    { id, userId: "u", name, amount, categoryId: "c", frequency: "monthly", dueDay, isActive: true, anchorDate: new Date(2026, 0, 1), createdAt: new Date(2026, 0, 1), updatedAt: new Date(2026, 0, 1), ...extra } as Bill,
    upToDate(id, amount),
    NOW,
  );
const debt = (id: string, amount: number, dueDate?: Date, direction: Debt["direction"] = "owed_by_me") =>
  computeDebtStatus({ id, userId: "u", person: "Nikos", direction, amount, date: new Date(2026, 0, 1), dueDate, createdAt: new Date(2026, 0, 1), updatedAt: new Date(2026, 0, 1) } as Debt, [], NOW);

describe("attentionItems", () => {
  const bills = [bill("water", "Water", 68.4, 20), bill("phone", "Phone", 25, 30), bill("gym", "Gym", 30, 15, { dueDay: 15 }), bill("rent", "Rent", 420, 1, { isActive: false })];

  it("lists late bills first, then what is due soon", () => {
    const items = attentionItems(bills, [], NOW).map((i) => [i.name, i.late]);

    expect(items[0][1]).toBe(true);
    expect(items.map((i) => i[0])).toContain("Phone");
    expect(items.findIndex((i) => i[0] === "Phone")).toBeGreaterThan(items.findIndex((i) => i[1] === true));
  });

  it("counts the same bills as the badge on the menu", () => {
    const items = attentionItems(bills, [], NOW).filter((i) => i.kind === "bill");
    expect(items).toHaveLength(billsNeedingAttention(bills, NOW));
  });

  it("brings in a debt due back within the week, and only what you owe", () => {
    const items = attentionItems([], [debt("soon", 300, new Date(2026, 9, 1)), debt("far", 100, new Date(2026, 11, 1)), debt("lent", 50, new Date(2026, 9, 1), "owed_to_me")], NOW);

    expect(items.map((i) => [i.id, i.days, i.amount])).toEqual([["soon", 5, 300]]);
  });

  it("asks for the part that is due, not the year, on a bill paid in parts", () => {
    // €360 a year in three from 5 October, October's paid.
    const gym = (now: Date) =>
      computeBillStatus(
        { id: "gym", userId: "u", name: "Gym", amount: 360, categoryId: "c", frequency: "yearly", dueMonth: 9, dueDay: 5, installmentCount: 3, isActive: true, anchorDate: new Date(2026, 0, 1), createdAt: new Date(2026, 0, 1), updatedAt: new Date(2026, 0, 1) } as Bill,
        [{ id: "p", userId: "u", billId: "gym", periodKey: "2026", installmentIndex: 0, amount: 120, paidDate: new Date(2026, 9, 5), createdAt: new Date(2026, 9, 5) }],
        now,
      );

    // Coming up: November's €120 — was €360.
    const soon = new Date(2026, 9, 30);
    expect(attentionItems([gym(soon)], [], soon).map((i) => [i.amount, i.late])).toEqual([[120, false]]);

    // Both remaining parts late by mid-December: all €240 of them, the same
    // figure the Bills page's late total gives. Second route, by hand: 360 − 120.
    const behind = new Date(2026, 11, 15);
    expect(attentionItems([gym(behind)], [], behind).map((i) => [i.amount, i.late])).toEqual([[240, true]]);
    expect(overdueBills([gym(behind)], behind).total).toBe(360 - 120);
  });

  it("is empty when nothing wants doing", () => {
    const paid = computeBillStatus(
      { id: "p", userId: "u", name: "Paid", amount: 10, categoryId: "c", frequency: "monthly", dueDay: 20, isActive: true, anchorDate: new Date(2026, 0, 1), createdAt: new Date(2026, 0, 1), updatedAt: new Date(2026, 0, 1) } as Bill,
      [...upToDate("p", 10), { id: "x", userId: "u", billId: "p", periodKey: "2026-09", amount: 10, paidDate: new Date(2026, 8, 18), createdAt: new Date(2026, 8, 18) }],
      NOW,
    );
    expect(attentionItems([paid], [debt("far", 100, new Date(2026, 11, 1))], NOW)).toEqual([]);
  });
});

describe("paydayOutlook", () => {
  // Thursday 10 September 2026, pay on the 20th: the window is the 10th to the
  // 19th, ten days. Food is €300 a month — €10 a day in a 30-day September.
  const TODAY = new Date(2026, 8, 10, 9, 30);
  const billOn = (id: string, name: string, amount: number, dueDay: number) =>
    computeBillStatus(
      { id, userId: "u", name, amount, categoryId: "c", frequency: "monthly", dueDay, isActive: true, anchorDate: new Date(2026, 0, 1), createdAt: new Date(2026, 0, 1), updatedAt: new Date(2026, 0, 1) } as Bill,
      [],
      TODAY,
    );
  const bills = [billOn("water", "Water", 68.4, 12), billOn("phone", "Phone", 25, 15), billOn("net", "Internet", 30, 25)];
  const food: BudgetLine = { id: "food", label: "Food", amount: 300, kind: "expense" };
  const plan = (openingBalance: number, withSalary = true) =>
    buildPlan({ bills, goals: [], lines: [food], debts: [], incomes: withSalary ? [monthlySalary(1450, 20)] : [], openingBalance, horizon: 2, now: TODAY });

  /** The second route: the same ten days walked by hand. */
  const byHand = (opening: number, lastDay: number) => {
    let balance = opening;
    for (let day = 10; day <= lastDay; day++) {
      balance -= 10;
      if (day === 12) balance -= 68.4;
      if (day === 15) balance -= 25;
      if (day === 25) balance -= 30;
    }
    return Math.round(balance * 100) / 100;
  };

  it("reads the plan up to the day before pay day, and takes it apart", () => {
    const p = plan(1000);
    const outlook = paydayOutlook(p, TODAY);

    expect(outlook.known).toBe(true);
    expect(outlook.date).toEqual(new Date(2026, 8, 20));
    expect(outlook.days).toBe(10);
    // 1000 − 68,40 − 25 − 10 × 10, by hand.
    expect(outlook.left).toBe(byHand(1000, 19));
    expect(outlook.left).toBe(806.6);
    expect(outlook.bills).toBe(93.4);
    expect(outlook.lines).toBe(100);
    // Reconciliation: the parts give back the figure.
    expect(Math.round((outlook.start - outlook.bills - outlook.commitments - outlook.lines + outlook.incoming) * 100) / 100).toBe(outlook.left);
    // And it is the Planner's own balance for the 19th — the one the Planner page draws.
    expect(p.points.find((pt) => pt.date.getDate() === 19 && pt.date.getMonth() === 8)?.balance).toBe(outlook.left);
    expect(outlook.perDay).toBe(80.66);
    expect(outlook.breaksOn).toBeUndefined();
  });

  it("runs to the next pay day past one a bank reading may already hold, and does not count it", () => {
    // The banks were read on the 10th, on or after the 10th (the 20th less ten
    // days), with no record of the pay: it may be in the 1,000 already, so the
    // plan leaves it out and the outlook runs on to 20 October.
    const read = buildPlan({ bills, goals: [], lines: [food], debts: [], incomes: [monthlySalary(1450, 20)], openingBalance: 1000, horizon: 2, now: TODAY, actuals: { transactions: [], debts: [], overrides: {}, lastReadingAt: new Date(2026, 8, 10, 8) } });
    const outlook = paydayOutlook(read, TODAY);

    // Asked about, both: September's, and August's too — the reading may hold
    // that one as well, and with no record of it «Έσοδα» asks the same. Neither
    // is counted until answered; August's was not counted before either.
    expect(read.occurrences.filter((o) => o.status === "unconfirmed").map((o) => o.date)).toEqual([new Date(2026, 7, 20), new Date(2026, 8, 20)]);
    expect(outlook.date).toEqual(new Date(2026, 9, 20));
    expect(outlook.incoming).toBe(0);
    // By hand, to 19 October: 1,000 less September's three bills, October's
    // water and phone (the 12th, the 15th), and food — 21 days of September at
    // 10 and 19 of October at 300 / 31.
    const expected = Math.round((1000 - 68.4 - 25 - 30 - 68.4 - 25 - 21 * 10 - (19 * 300) / 31) * 100) / 100;
    expect(outlook.left).toBe(expected);
    // The same day of the plan with the pay counted is exactly 1,450 higher.
    expect(paydayOutlook(plan(1000), TODAY).left).toBe(byHand(1000, 19));
    expect(plan(1000).points.find((p) => p.date.getTime() === new Date(2026, 9, 19).getTime())?.balance).toBe(Math.round((expected + 1450) * 100) / 100);
  });

  it("names the day it goes under, and the bill that did it", () => {
    const outlook = paydayOutlook(plan(50), TODAY);
    // 50 − 3 × 10 = 20 on the 12th before the water, then − 68,40.
    expect(outlook.breaksOn).toEqual(new Date(2026, 8, 12));
    expect(outlook.breaksAt).toBe("Water");
    expect(outlook.left).toBe(byHand(50, 19));
    expect(outlook.lowest).toBe(outlook.left);
    expect(outlook.perDay).toBe(0);
  });

  it("runs to the month's end, the last day included, when no pay is planned", () => {
    const outlook = paydayOutlook(plan(1000, false), TODAY);
    expect(outlook.known).toBe(false);
    expect(outlook.date).toEqual(new Date(2026, 8, 30));
    expect(outlook.days).toBe(21);
    // The internet on the 25th is inside this window.
    expect(outlook.left).toBe(byHand(1000, 30));
    expect(outlook.bills).toBe(123.4);
  });

  it("starts nothing when the pay is due today, and runs to the next one when it came early", () => {
    const empty = (events: PlannerPlan["events"]): Pick<PlannerPlan, "openingBalance" | "points" | "events"> => ({ openingBalance: 420, points: [], events });
    const salary = (date: Date) => ({ kind: "income" as const, label: "Salary", amount: 1450, date, pay: true });

    // Late, and so placed on today by the plan: nothing stands between now and it.
    const today = paydayOutlook(empty([salary(new Date(2026, 8, 10))]), TODAY);
    expect(today.date).toEqual(new Date(2026, 8, 10));
    expect(today.left).toBe(420);

    // This month's already arrived — the plan's next one is October's.
    const early = paydayOutlook(empty([salary(new Date(2026, 9, 20)), { kind: "income", label: "Bonus", amount: 100, date: new Date(2026, 8, 30) }]), TODAY);
    expect(early.date).toEqual(new Date(2026, 9, 20));
    expect(early.days).toBe(40);
  });
});

describe("spendingByCategory", () => {
  const tx = (categoryId: string, amount: number, extra: Partial<Transaction> = {}) => ({ id: categoryId + amount, type: "expense", amount, categoryId, date: NOW, ...extra }) as Transaction;
  const month = [
    tx("rent", 420),
    tx("food", 212.3),
    tx("food", 200),
    tx("out", 138.1),
    tx("fuel", 96),
    tx("misc", 70),
    tx("gifts", 50),
    tx("goal", 300, { isInvestmentTransaction: true, isGoalTransaction: true, contributionType: "deposit" }),
    tx("pay", 1700, { type: "income" }),
  ];

  it("adds up to exactly the month's 'went out'", () => {
    const { total, parts } = spendingByCategory(month);

    expect(total).toBeCloseTo(calculateMetrics(month).totalExpenses, 2);
    expect(parts.reduce((sum, p) => sum + p.amount, 0)).toBeCloseTo(total, 2);
    // Second route, by hand: 420 + 412,30 + 138,10 + 96 + 70 + 50.
    expect(total).toBeCloseTo(1186.4, 2);
  });

  it("puts the biggest first and folds the tail into one", () => {
    const { parts } = spendingByCategory(month);

    expect(parts.map((p) => [p.categoryId, p.amount])).toEqual([
      ["rent", 420],
      ["food", 412.3],
      ["out", 138.1],
      ["fuel", 96],
      [null, 120],
    ]);
  });
});

describe("goalsProgress", () => {
  const goal = (targetAmount: number | undefined, totalSaved: number, extra: Partial<InvestmentGoalWithStats> = {}) =>
    ({ id: String(Math.random()), isActive: true, isCompleted: false, targetAmount, totalSaved, ...extra }) as InvestmentGoalWithStats;

  it("adds up saved against target across the goals that have one", () => {
    // 1200/2000 and 3100/5000: 4300 of 7000 is 61%.
    expect(goalsProgress([goal(2000, 1200), goal(5000, 3100), goal(undefined, 900)])).toEqual({ saved: 4300, target: 7000, percent: 61 });
  });

  it("does not let one overshoot hide another falling short", () => {
    expect(goalsProgress([goal(100, 250), goal(100, 0)])).toEqual({ saved: 100, target: 200, percent: 50 });
  });

  it("leaves out finished and switched-off goals", () => {
    expect(goalsProgress([goal(100, 100, { isCompleted: true }), goal(100, 0, { isActive: false })]).target).toBe(0);
  });
});
