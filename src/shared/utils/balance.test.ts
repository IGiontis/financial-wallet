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

// ─── Firestore Timestamps ────────────────────────────────────────────────────
// `Transaction.date` is typed as a Date, but the read casts the raw document
// straight through, so at runtime it is a Timestamp. Passing one to a bare
// `getFullYear()` threw and took the whole balance card down with it.

/** Mimics the Firestore Timestamp shape: a wrapper with `toDate()`. */
const timestamp = (iso: string) => ({ toDate: () => new Date(iso), seconds: Math.floor(new Date(iso).getTime() / 1000) });

describe("balance with Firestore Timestamps", () => {
  const opening = { amount: 5000, date: new Date("2026-09-01") };

  it("accepts a Timestamp as a transaction date", () => {
    const row = tx({ amount: 200, date: timestamp("2026-09-10") as unknown as Date });
    expect(() => currentBalance([row], opening)).not.toThrow();
    expect(currentBalance([row], opening)).toBe(4800);
  });

  it("still holds history out of the balance when dates are Timestamps", () => {
    const row = tx({ amount: 450, date: timestamp("2026-08-01") as unknown as Date });
    expect(currentBalance([row], opening)).toBe(5000);
  });

  it("accepts a Timestamp as the opening date", () => {
    const stamped = { amount: 5000, date: timestamp("2026-09-01") as unknown as Date };
    const rows = [tx({ amount: 450, date: new Date("2026-08-01") }), tx({ amount: 200, date: new Date("2026-09-10") })];
    expect(currentBalance(rows, stamped)).toBe(4800);
  });

  it("accepts the serialized { seconds } form", () => {
    const row = tx({ amount: 100, date: { seconds: Math.floor(new Date("2026-09-05").getTime() / 1000) } as unknown as Date });
    expect(currentBalance([row], opening)).toBe(4900);
  });

  it("counts Timestamps correctly in the excluded tally", () => {
    const rows = [tx({ date: timestamp("2026-07-01") as unknown as Date }), tx({ date: timestamp("2026-09-10") as unknown as Date })];
    expect(excludedByOpeningDate(rows, opening)).toBe(1);
  });
});

// ─── No red "-0,00 €" ────────────────────────────────────────────────────────
// Amounts that cancel to the cent do not cancel in floating point: 0.3 in and
// 0.1 + 0.2 out leaves -0.0000000000000000278, which the card printed in red
// as an overdraft of nothing.

describe("currentBalance to the cent", () => {
  const income = (amount: number) => tx({ type: "income", amount });
  const spend = (amount: number) => tx({ amount });
  const euro = new Intl.NumberFormat("el-GR", { style: "currency", currency: "EUR" });

  it("reads a balance that cancels exactly as a plain zero", () => {
    const balance = currentBalance([income(0.3), spend(0.1), spend(0.2)]);

    expect(Object.is(balance, 0)).toBe(true); // not -0, and not -2.8e-17
    expect(balance < 0).toBe(false);
    expect(euro.format(balance)).not.toContain("-");
  });

  it("is the opening figure plus what came in less what went out, counted in cents", () => {
    const rows = [income(1234.56), spend(99.99), spend(0.01), tx({ isGoalTransaction: true, contributionType: "deposit", amount: 333.33 }), tx({ isGoalTransaction: true, contributionType: "withdrawal", amount: 33.3 }), spend(0.1), spend(0.2)];
    // The same sum in whole cents, where addition is exact.
    const cents = 500000 + 123456 - 9999 - 1 - 33333 + 3330 - 10 - 20;

    expect(currentBalance(rows, opening)).toBe(cents / 100);
  });

  it("gives the same figure whatever order the records were entered in", () => {
    const rows = [income(0.3), spend(0.1), spend(0.2), income(10.07), spend(3.35), spend(6.72)];
    const orders = [rows, [...rows].reverse(), [rows[2], rows[4], rows[0], rows[5], rows[1], rows[3]]];

    for (const order of orders) expect(Object.is(currentBalance(order), 0)).toBe(true);
  });

  it("still reports a real overdraft, to the cent", () => {
    expect(currentBalance([income(10), spend(10.01)])).toBe(-0.01);
    expect(currentBalance([spend(0.1), spend(0.2)])).toBe(-0.3);
    expect(currentBalance([], { amount: -50, date: new Date("2026-09-01") })).toBe(-50);
  });
});
