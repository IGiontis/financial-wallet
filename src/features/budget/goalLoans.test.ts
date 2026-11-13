import { describe, it, expect } from "vitest";
import { goalLoans, linkedDebtIds } from "./goalLoans";
import type { DebtWithStatus, Transaction } from "../../shared/types/IndexTypes";

// A goal's loans, as its delete asks about them. The ski trip: Keki paid the
// hotel, 180 €; his debt names the expense written beside it.

const DAY = new Date(2026, 9, 20, 10);
const debt = (over: Partial<DebtWithStatus> = {}) =>
  ({ id: "d1", userId: "u", person: "Keki", direction: "owed_by_me", label: "Ski", amount: 180, date: DAY, payments: [], paid: 0, remaining: 180, isSettled: false, forGoalId: "ski", createdAt: DAY, updatedAt: DAY, ...over }) as DebtWithStatus;
const tx = (id: string, over: Partial<Transaction> = {}) => ({ id, userId: "u", type: "expense", amount: 180, categoryId: "c", description: "Ski", date: DAY, createdAt: DAY, updatedAt: DAY, ...over }) as Transaction;
const GOAL = { id: "ski", name: "Ski", covered: [{ person: "Keki", amount: 180, debtIds: ["d1"] }] };

describe("a goal's loans, found by their links", () => {
  it("names the debt and the expense the debt points to", () => {
    expect(goalLoans(GOAL, [debt({ coveredExpenseId: "e1" })], [tx("e1"), tx("e2")])).toEqual([
      { debtId: "d1", person: "Keki", amount: 180, repaid: 0, remaining: 180, date: DAY, expenseId: "e1", state: "open" },
    ]);
  });

  // The owner's report (2026-11-12): the goal deleted the moment after Keki's
  // payment was recorded. Its deposit (with `debtId: d1`) was on screen at once;
  // the debts list did not hold d1 yet. Read from that list alone, nothing is
  // asked — and the debt stayed. Why the dialog reads the missing ids from the
  // server (`useGoalLoans`) rather than trusting the list.
  it("reproduces the report: the debts list without the new debt asks nothing", () => {
    expect(linkedDebtIds(GOAL)).toEqual(["d1"]);
    expect(goalLoans(GOAL, [], [tx("e1")])).toEqual([]);
    // A second way: with the debt read by its id, the same goal asks about it.
    expect(goalLoans(GOAL, [debt({ coveredExpenseId: "e1" })], [tx("e1")]).map((l) => l.state)).toEqual(["open"]);
  });

  it("finds a debt that names the goal though no deposit names it (the deposit deleted alone)", () => {
    expect(goalLoans({ ...GOAL, covered: [] }, [debt({ id: "d9" })], []).map((l) => l.debtId)).toEqual(["d9"]);
    // …but never a debt of another goal, or money lent rather than borrowed.
    expect(goalLoans({ ...GOAL, covered: [] }, [debt({ id: "d9", forGoalId: "other" }), debt({ id: "d8", direction: "owed_to_me" })], [])).toEqual([]);
  });

  it("finds an older debt's expense by its amount, day and the goal's name — the fallback for debts before the link", () => {
    const loans = goalLoans(GOAL, [debt()], [tx("other", { amount: 50 }), tx("e9"), tx("loan", { type: "income", debtId: "d1" })]);
    expect(loans[0].expenseId).toBe("e9");
  });

  it("finds it though the goal's name was typed with a trailing space — his «Σκι διακοπές »", () => {
    const ski = { ...GOAL, name: "Σκι διακοπές " };
    expect(goalLoans(ski, [debt({ label: "Σκι διακοπές" })], [tx("e7", { description: "Σκι διακοπές " })])[0].expenseId).toBe("e7");
    // A second way: no label, the expense's own name only.
    expect(goalLoans(ski, [debt({ label: undefined })], [tx("e7", { description: "  σκι  ΔΙΑΚΟΠΕΣ" })])[0].expenseId).toBe("e7");
  });

  it("names no expense that is no longer there — deleting a missing one fails the write", () => {
    expect(goalLoans(GOAL, [debt({ coveredExpenseId: "gone" })], [tx("e2", { amount: 99 })])[0].expenseId).toBeUndefined();
  });

  it("says which can be asked: open, partly repaid (stays), settled or let go of (history)", () => {
    const repaid = debt({ payments: [{ id: "p" }] as DebtWithStatus["payments"], paid: 50, remaining: 130 });
    expect(goalLoans(GOAL, [repaid], [])[0]).toMatchObject({ state: "repaid", repaid: 50, remaining: 130 });
    // 180 = 50 repaid + 130 left.
    expect(50 + 130).toBe(180);
    expect(goalLoans(GOAL, [debt({ isSettled: true, remaining: 0 })], [])[0].state).toBe("closed");
    expect(goalLoans(GOAL, [debt({ forgiven: { date: DAY, amount: 180, refund: true }, isSettled: true, remaining: 0 })], [])[0].state).toBe("closed");
  });

  it("the same person twice: two loans, each with its own expense, oldest first", () => {
    const two = { ...GOAL, covered: [{ person: "Keki", amount: 360, debtIds: ["d2", "d1"] }] };
    const loans = goalLoans(two, [debt({ id: "d2", date: new Date(2026, 9, 22) }), debt()], [tx("e1"), tx("e2", { date: new Date(2026, 9, 22) })]);
    expect(loans.map((l) => l.debtId)).toEqual(["d1", "d2"]);
    // A second way: two debts, two different expenses — never one claimed twice.
    expect(loans.map((l) => l.expenseId)).toEqual(["e1", "e2"]);
    expect(loans.reduce((s, l) => s + l.amount, 0)).toBe(two.covered[0].amount);
  });
});
