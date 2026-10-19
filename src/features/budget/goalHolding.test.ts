import { describe, it, expect } from "vitest";
import { closingRecords, goalHolding, undoByAccount } from "./goalHolding";
import { computeGoalStats } from "./investmentsUtils";
import { realDelta, goalHeldTotal } from "../accounts/accountsUtils";
import { balanceDelta } from "../../shared/utils/balance";
import { isEarning, isSpending } from "../../shared/utils/moneyModel";
import type { CreateTransactionDTO, InvestmentGoalWithStats, Transaction } from "../../shared/types/IndexTypes";

// The owner's case: 500 from Eurobank handed to Athanasia for the trip, and
// 200 more kept set aside in Revolut. Every figure checked against the cards a
// second way — the sum of what each record does to each card.

const day = new Date(2026, 9, 15);
let n = 0;
const mirror = (amount: number, kind: "deposit" | "withdrawal", accountId?: string, heldBy?: string): Transaction =>
  ({ id: `m${++n}`, userId: "u", type: "investment", amount, categoryId: "", description: "Trip", date: day, createdAt: day, updatedAt: day, isInvestmentTransaction: true, isGoalTransaction: true, goalId: "trip", goalName: "Trip", contributionType: kind, accountId, heldBy }) as Transaction;

const RECORDS = [mirror(500, "deposit", "eurobank", "Athanasia"), mirror(200, "deposit", "revolut")];
const TRIP = { id: "trip", name: "Trip", totalSaved: 700 } as InvestmentGoalWithStats;

/** What a list of records does to each card. */
const byCard = (rows: (Transaction | CreateTransactionDTO)[]) => {
  const out: Record<string, number> = {};
  for (const r of rows) {
    const d = realDelta(r as Transaction);
    if (Math.abs(d) < 0.005) continue;
    const k = r.accountId ?? "";
    out[k] = Math.round(((out[k] ?? 0) + d) * 100) / 100;
  }
  // A card whose records cancel has not moved.
  return Object.fromEntries(Object.entries(out).filter(([, v]) => Math.abs(v) >= 0.005));
};

describe("money handed to someone for a goal", () => {
  it("leaves the card it was given from, and is not counted as set aside in the banks", () => {
    expect(byCard(RECORDS)).toEqual({ eurobank: -500 });
    // Set aside in the banks: only Revolut's 200.
    expect(goalHeldTotal(RECORDS)).toBe(200);
    // Not spending — still the goal's.
    expect(RECORDS.some((r) => isSpending(r))).toBe(false);
  });

  it("says who holds what, and what is in your own bank", () => {
    expect(goalHolding(TRIP, RECORDS)).toEqual({ holders: [{ name: "Athanasia", amount: 500, accountId: "eurobank" }], inBanks: 200, inBanksRecorded: 200 });
  });

  it("returned, comes back into a card", () => {
    const returned = mirror(500, "withdrawal", "eurobank", "Athanasia");
    expect(byCard([...RECORDS, returned])).toEqual({});
    expect(goalHolding({ ...TRIP, totalSaved: 200 }, [...RECORDS, returned]).holders).toEqual([]);
  });
});

describe("deleting the goal — given up on", () => {
  it("takes every record back: the 500 returns to Eurobank, the 200 is freed", () => {
    expect(undoByAccount("trip", RECORDS)).toEqual({ eurobank: 500 });
    // A second way: undoing is the opposite of what the records did.
    expect(undoByAccount("trip", RECORDS)).toEqual(Object.fromEntries(Object.entries(byCard(RECORDS)).map(([k, v]) => [k, -v])));
  });
});

describe("deleting the goal — done, the money spent", () => {
  const closing = closingRecords(TRIP, RECORDS, { bankAccountId: "revolut", categoryId: "travel", date: day, note: "From the goal" });

  it("writes 700 of expenses — the goal's whole balance", () => {
    const expenses = closing.filter((r) => r.type === "expense");
    expect(expenses.map((e) => [e.amount, e.accountId])).toEqual([
      [500, "eurobank"],
      [200, "revolut"],
    ]);
    expect(expenses.reduce((s, e) => s + e.amount, 0)).toBe(700);
  });

  it("moves Eurobank nothing more — it went down when the money was handed over — and Revolut down by its 200", () => {
    expect(byCard(closing)).toEqual({ revolut: -200 });
    // With the history kept: Eurobank −500 once, Revolut −200 once.
    expect(byCard([...RECORDS, ...(closing as Transaction[])])).toEqual({ eurobank: -500, revolut: -200 });
  });

  it("leaves nothing counted as set aside, and nothing counted twice", () => {
    expect(goalHeldTotal([...RECORDS, ...(closing as Transaction[])])).toBe(0);
    const all = [...RECORDS, ...(closing as Transaction[])];
    const spent = all.filter((r) => isSpending(r)).reduce((s, r) => s + r.amount, 0);
    const earned = all.filter((r) => isEarning(r)).reduce((s, r) => s + r.amount, 0);
    // 700 spent; the 700 taken out of the goal count as money in, so the month's net is the goal's, not the pay's.
    expect([spent, earned]).toEqual([700, 700]);
    // The spendable balance: the deposits had set 700 aside; the withdrawals give it back; the expenses spend it.
    expect(all.reduce((s, r) => s + balanceDelta(r), 0)).toBe(-700);
  });
});

// The owner's second case: a trip of 700, 150 of it his own, and the other 550
// paid by Nikos for the hotel and the flights — no card of his moved.
describe("a part of a goal that someone else paid", () => {
  const own = mirror(150, "deposit", "revolut");
  const covered = { id: "cov", userId: "u", goalId: "trip", amount: 550, contributionType: "deposit" as const, date: day, coveredBy: "Nikos", debtId: "d1", createdAt: day, updatedAt: day };
  const goal = computeGoalStats({ id: "trip", userId: "u", name: "Trip", goalType: "targeted", targetAmount: 700, targetPeriod: "custom", deadline: new Date(2027, 5, 1), isActive: true, isCompleted: false, createdAt: day, updatedAt: day }, [
    { id: "own", userId: "u", goalId: "trip", amount: 150, contributionType: "deposit", date: day, createdAt: day, updatedAt: day },
    covered,
  ]);

  it("counts toward the goal, which reads as funded, and is listed apart", () => {
    expect(goal.totalSaved).toBe(700);
    expect(goal.remaining).toBe(0);
    expect(goal.percentageReached).toBe(100);
    expect(goal.totalCovered).toBe(550);
    expect(goal.covered).toEqual([{ person: "Nikos", amount: 550, debtIds: ["d1"] }]);
  });

  it("keeps every debt of one person who paid twice, under one name however it was typed", () => {
    const twice = computeGoalStats({ id: "trip", userId: "u", name: "Trip", goalType: "targeted", targetAmount: 700, targetPeriod: "custom", deadline: new Date(2027, 5, 1), isActive: true, isCompleted: false, createdAt: day, updatedAt: day }, [
      covered,
      { ...covered, id: "cov2", amount: 100, coveredBy: " nikos ", debtId: "d2" },
    ]);
    expect(twice.covered).toEqual([{ person: "Nikos", amount: 650, debtIds: ["d1", "d2"] }]);
    expect(twice.totalCovered).toBe(650);
  });

  it("is neither in his bank nor held by anyone — only the 150 he put aside is", () => {
    const { holders, inBanks } = goalHolding(goal, [own]);
    expect(holders).toEqual([]);
    expect(inBanks).toBe(150);
    // Reconciled the other way: what the goal holds, less what Nikos paid.
    expect(goal.totalSaved - (goal.totalCovered ?? 0)).toBe(inBanks);
  });

  it("closing the goal spends only his own 150 — the 550 was written as an expense the day Nikos paid", () => {
    const records = closingRecords(goal, [own], { bankAccountId: "revolut", categoryId: "travel", date: day, note: "" });
    const expenses = records.filter((r) => r.type === "expense");
    expect(expenses.map((r) => r.amount)).toEqual([150]);
    // The withdrawal takes back what was set aside, and no more.
    expect(records.filter((r) => r.contributionType === "withdrawal").map((r) => r.amount)).toEqual([150]);
  });

  it("the whole of it, a second way: his 150 and Nikos's 550 are the trip's 700 of spending", () => {
    // The expense written when Nikos paid, and the one that closing writes.
    const paid = 550;
    const closing = closingRecords(goal, [own], { bankAccountId: "revolut", categoryId: "travel", date: day, note: "" }).filter((r) => r.type === "expense");
    expect(paid + closing.reduce((s, r) => s + r.amount, 0)).toBe(goal.totalSaved);
  });
});
