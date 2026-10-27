import { describe, it, expect } from "vitest";
import { coveredRefunds } from "./coveredRefund";
import type { DebtWithStatus, Transaction } from "../../shared/types/IndexTypes";

// The ski trip called off: Keki paid the hotel, 180 €, and got it all back from the hotel.

const DAY = new Date(2026, 9, 20, 10);
const debt = (over: Partial<DebtWithStatus> = {}) =>
  ({ id: "d1", userId: "u", person: "Keki", direction: "owed_by_me", label: "Ski", amount: 180, date: DAY, payments: [], paid: 0, remaining: 180, isSettled: false, forGoalId: "ski", createdAt: DAY, updatedAt: DAY, ...over }) as DebtWithStatus;
const tx = (id: string, over: Partial<Transaction> = {}) => ({ id, userId: "u", type: "expense", amount: 180, categoryId: "c", description: "Ski", date: DAY, createdAt: DAY, updatedAt: DAY, ...over }) as Transaction;
const GOAL = { name: "Ski", covered: [{ person: "Keki", amount: 180, debtIds: ["d1"] }] };

describe("calling off what someone paid of a goal", () => {
  it("names the debt and the expense the debt points to", () => {
    const refunds = coveredRefunds(GOAL, [debt({ coveredExpenseId: "e1" })], [tx("e1"), tx("e2")]);
    expect(refunds).toEqual([{ person: "Keki", amount: 180, items: [{ debtId: "d1", expenseId: "e1", amount: 180 }] }]);
  });

  it("finds an older debt's expense by its amount, day and the goal's name", () => {
    const refunds = coveredRefunds(GOAL, [debt()], [tx("other", { amount: 50 }), tx("e9"), tx("loan", { type: "income", debtId: "d1" })]);
    expect(refunds[0].items[0].expenseId).toBe("e9");
  });

  it("names no expense that is no longer there — deleting a missing one fails the write", () => {
    expect(coveredRefunds(GOAL, [debt({ coveredExpenseId: "gone" })], [tx("e2", { amount: 99 })])[0].items[0].expenseId).toBeUndefined();
  });

  it("offers nothing once some of it has been paid back, or the debt is settled or gone", () => {
    expect(coveredRefunds(GOAL, [debt({ payments: [{ id: "p" }] as DebtWithStatus["payments"], paid: 50, remaining: 130 })], [])).toEqual([]);
    expect(coveredRefunds(GOAL, [debt({ isSettled: true, remaining: 0 })], [])).toEqual([]);
    expect(coveredRefunds(GOAL, [], [])).toEqual([]);
  });

  it("adds up each person's debts, and matches each expense once", () => {
    const two = { name: "Ski", covered: [{ person: "Keki", amount: 360, debtIds: ["d1", "d2"] }] };
    const refunds = coveredRefunds(two, [debt(), debt({ id: "d2" })], [tx("e1"), tx("e2")]);
    expect(refunds[0].amount).toBe(360);
    // A second way: two debts, two different expenses.
    expect(refunds[0].items.map((i) => i.expenseId).sort()).toEqual(["e1", "e2"]);
  });
});
