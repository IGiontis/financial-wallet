import { describe, it, expect } from "vitest";
import { closingRecords, goalHolding, undoByAccount } from "./goalHolding";
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
