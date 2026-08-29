import { describe, it, expect } from "vitest";
import { affectsBalance, balanceDelta, currentBalance, excludedByOpeningDate } from "./balance";
import type { Transaction } from "../types/IndexTypes";

const tx = (overrides: Partial<Transaction> = {}): Transaction =>
  ({ id: "t1", userId: "u1", amount: 100, type: "expense", categoryId: "c1", date: new Date("2026-09-10"), description: "", createdAt: new Date(), updatedAt: new Date(), ...overrides }) as Transaction;

const opening = { amount: 5000, date: new Date("2026-09-01") };

describe("balanceDelta", () => {
  it("adds income", () => {
    expect(balanceDelta(tx({ type: "income", amount: 250 }))).toBe(250);
  });

  it("subtracts expenses", () => {
    expect(balanceDelta(tx({ type: "expense", amount: 250 }))).toBe(-250);
  });

  it("treats a goal deposit as money leaving the account", () => {
    expect(balanceDelta(tx({ isGoalTransaction: true, contributionType: "deposit", amount: 200 }))).toBe(-200);
  });

  it("returns a goal withdrawal to the account", () => {
    expect(balanceDelta(tx({ isGoalTransaction: true, contributionType: "withdrawal", amount: 200 }))).toBe(200);
  });

  it("treats an investment contribution the same way", () => {
    expect(balanceDelta(tx({ isInvestmentTransaction: true, contributionType: "deposit", amount: 300 }))).toBe(-300);
  });
});

describe("affectsBalance", () => {
  it("counts everything when no opening balance is set", () => {
    expect(affectsBalance(tx({ date: new Date("2020-01-01") }), undefined)).toBe(true);
  });

  it("counts a transaction on the opening day itself", () => {
    expect(affectsBalance(tx({ date: new Date("2026-09-01") }), opening)).toBe(true);
  });

  it("ignores the time of day on the boundary", () => {
    expect(affectsBalance(tx({ date: new Date("2026-09-01T02:00:00") }), opening)).toBe(true);
  });

  it("excludes anything dated before the opening day", () => {
    expect(affectsBalance(tx({ date: new Date("2026-08-31") }), opening)).toBe(false);
  });
});

describe("currentBalance", () => {
  it("is the plain net when nothing was declared", () => {
    expect(currentBalance([tx({ type: "income", amount: 900 }), tx({ amount: 200 })])).toBe(700);
  });

  it("starts from the declared figure", () => {
    expect(currentBalance([], opening)).toBe(5000);
  });

  it("subtracts spending that happened after the opening day", () => {
    expect(currentBalance([tx({ amount: 200, date: new Date("2026-09-10") })], opening)).toBe(4800);
  });

  it("does NOT subtract history the opening figure already accounts for", () => {
    // The €5000 is what was left AFTER last month's rent came out. Entering
    // that rent for the record must not take it off a second time.
    const backfilled = [tx({ amount: 450, date: new Date("2026-08-01"), description: "August rent" })];
    expect(currentBalance(backfilled, opening)).toBe(5000);
  });

  it("handles a mix of history and new movement", () => {
    const rows = [
      tx({ amount: 450, date: new Date("2026-07-01") }), // history — ignored
      tx({ amount: 450, date: new Date("2026-08-15") }), // history — ignored
      tx({ type: "income", amount: 1800, date: new Date("2026-09-05") }),
      tx({ amount: 300, date: new Date("2026-09-12") }),
      tx({ isGoalTransaction: true, contributionType: "deposit", amount: 500, date: new Date("2026-09-20") }),
    ];
    expect(currentBalance(rows, opening)).toBe(5000 + 1800 - 300 - 500);
  });
});

describe("excludedByOpeningDate", () => {
  it("is zero without an opening balance", () => {
    expect(excludedByOpeningDate([tx({ date: new Date("2020-01-01") })], undefined)).toBe(0);
  });

  it("counts the records held out of the balance", () => {
    const rows = [tx({ date: new Date("2026-07-01") }), tx({ date: new Date("2026-08-01") }), tx({ date: new Date("2026-09-10") })];
    expect(excludedByOpeningDate(rows, opening)).toBe(2);
  });
});
