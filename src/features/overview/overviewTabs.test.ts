import { describe, it, expect } from "vitest";
import { attentionItems, goalsProgress, spendingByCategory, untilPayday } from "./overviewTabs";
import { calculateMetrics } from "./overviewUtils";
import { billsNeedingAttention, computeBillStatus } from "../bills/billsUtils";
import { computeDebtStatus } from "../debts/debtsUtils";
import type { Bill, Debt, InvestmentGoalWithStats, Transaction } from "../../shared/types/IndexTypes";

// The overview's "what wants doing" list and its "left at pay day" figure.
//
// Both are read against the pages they summarise: the list has to count the
// same bills as the badge on the menu, and the figure has to be the balance
// less exactly the bills that fall before pay day — worked out again by hand.

const NOW = new Date(2026, 8, 26); // 26 September
const bill = (id: string, name: string, amount: number, dueDay: number, extra: Partial<Bill> = {}) =>
  computeBillStatus(
    { id, userId: "u", name, amount, categoryId: "c", frequency: "monthly", dueDay, isActive: true, anchorDate: new Date(2026, 0, 1), createdAt: new Date(2026, 0, 1), updatedAt: new Date(2026, 0, 1), ...extra } as Bill,
    [],
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

  it("is empty when nothing wants doing", () => {
    const paid = computeBillStatus(
      { id: "p", userId: "u", name: "Paid", amount: 10, categoryId: "c", frequency: "monthly", dueDay: 20, isActive: true, anchorDate: new Date(2026, 0, 1), createdAt: new Date(2026, 0, 1), updatedAt: new Date(2026, 0, 1) } as Bill,
      [{ id: "x", userId: "u", billId: "p", periodKey: "2026-09", amount: 10, paidDate: new Date(2026, 8, 18), createdAt: new Date(2026, 8, 18) }],
      NOW,
    );
    expect(attentionItems([paid], [debt("far", 100, new Date(2026, 11, 1))], NOW)).toEqual([]);
  });
});

describe("untilPayday", () => {
  it("takes off exactly the unpaid bills due by pay day", () => {
    // Pay on the 28th: the phone on the 30th is after it.
    const bills = [bill("water", "Water", 68.4, 20), bill("phone", "Phone", 25, 30)];
    const result = untilPayday(2340.55, bills, new Date(2026, 8, 28));

    // Second route, by hand: 2340,55 − 68,40.
    expect(2340.55 - 68.4).toBeCloseTo(2272.15, 2);
    expect(result).toEqual({ owed: 68.4, left: 2272.15, count: 1 });
  });

  it("includes a bill due on pay day itself", () => {
    expect(untilPayday(100, [bill("x", "X", 40, 28)], new Date(2026, 8, 28)).owed).toBe(40);
  });

  it("leaves out a bill switched off for the season", () => {
    const paused = bill("house", "House", 60, 20, { pause: { from: "2026-09", to: "2026-12" } });
    expect(untilPayday(100, [paused], new Date(2026, 8, 28))).toEqual({ owed: 0, left: 100, count: 0 });
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
