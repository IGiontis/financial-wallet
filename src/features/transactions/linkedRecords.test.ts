import { describe, it, expect } from "vitest";
import { coveredExpenseIndex, isFullyLocked, mayBeCovered, recordLock } from "./linkedRecords";
import type { Debt, Transaction } from "../../shared/types/IndexTypes";

// Which records on the Transactions page are half of a linked set.

const day = new Date(2026, 9, 14);
const tx = (id: string, extra: Partial<Transaction> = {}) =>
  ({ id, userId: "u", amount: 100, type: "expense", categoryId: "c", date: day, description: "Ski trip", createdAt: day, updatedAt: day, ...extra }) as Transaction;
const debt = (id: string, person: string, extra: Partial<Debt> = {}) =>
  ({ id, userId: "u", person, direction: "owed_by_me", amount: 100, date: day, label: "Ski trip", forGoalId: "g1", ...extra }) as Debt;
const goals = [{ id: "g1", name: "Ski trip" }];

describe("coveredExpenseIndex", () => {
  it("finds the expense a debt names, and marks it named", () => {
    const index = coveredExpenseIndex([debt("d1", "Nikos", { coveredExpenseId: "t1" })], [tx("t0"), tx("t1")], goals);
    expect([...index.entries()]).toEqual([["t1", { debtId: "d1", person: "Nikos", named: true }]]);
  });

  it("finds an older debt's expense by its figures, and marks it unnamed", () => {
    const index = coveredExpenseIndex([debt("d1", "Nikos")], [tx("t1", { amount: 100 }), tx("t2", { amount: 90 })], goals);
    expect(index.get("t1")).toEqual({ debtId: "d1", person: "Nikos", named: false });
    expect(index.has("t2")).toBe(false);
  });

  it("gives two friends who paid the same on one day an expense each", () => {
    const index = coveredExpenseIndex([debt("d1", "Nikos"), debt("d2", "Maria")], [tx("t1"), tx("t2")], goals);
    expect(new Set([...index.values()].map((c) => c.debtId))).toEqual(new Set(["d1", "d2"]));
    expect(index.size).toBe(2);
  });

  it("ignores debts that paid no goal, and a named expense that is gone", () => {
    const index = coveredExpenseIndex([debt("d1", "Nikos", { forGoalId: undefined }), debt("d2", "Maria", { coveredExpenseId: "gone", amount: 7 })], [tx("t1")], goals);
    expect(index.size).toBe(0);
  });
});

describe("recordLock", () => {
  const covered = coveredExpenseIndex([debt("d1", "Nikos", { coveredExpenseId: "t1" })], [tx("t1")], goals);
  const debts = [{ id: "d9", person: "Maria" }];

  it("names each kind of linked record", () => {
    expect(recordLock(tx("t1"), covered)).toEqual({ kind: "covered", debtId: "d1", person: "Nikos", payeeLocked: false });
    expect(recordLock(tx("x", { debtId: "d9", type: "income" }), covered, debts)).toEqual({ kind: "debt", debtId: "d9", person: "Maria" });
    expect(recordLock(tx("x", { transferId: "tr" }), covered)).toEqual({ kind: "transfer", transferId: "tr" });
    expect(recordLock(tx("x", { type: "investment", isGoalTransaction: true, isInvestmentTransaction: true }), covered)).toEqual({ kind: "goal" });
    expect(recordLock(tx("plain"), covered)).toBeUndefined();
  });

  it("locks everything only for a goal's mirror and a loan's cash", () => {
    expect(isFullyLocked({ kind: "goal" })).toBe(true);
    expect(isFullyLocked({ kind: "debt", debtId: "d" })).toBe(true);
    expect(isFullyLocked({ kind: "covered", debtId: "d", person: "N", payeeLocked: false })).toBe(false);
    expect(isFullyLocked({ kind: "transfer", transferId: "t" })).toBe(false);
    expect(isFullyLocked(undefined)).toBe(false);
  });

  it("needs the debts only for a plain expense", () => {
    expect(mayBeCovered(tx("a"))).toBe(true);
    expect(mayBeCovered(tx("b", { type: "income" }))).toBe(false);
    expect(mayBeCovered(tx("c", { transferId: "tr" }))).toBe(false);
    expect(mayBeCovered(tx("d", { debtId: "d" }))).toBe(false);
  });
});
