import { describe, it, expect } from "vitest";
import { netWorthSeries, repaymentsOutsideCash } from "./netWorthUtils";
import type { DebtWithStatus, Transaction } from "../../shared/types/IndexTypes";

// What you are worth, month by month.
//
// This is the first thing in the app that adds four separate ledgers together —
// the current account, the goals, the money lent out and the money borrowed —
// so the thing worth pinning down is that the sum stays honest at the seams:
// that saving moves money without creating any, that a backfilled receipt is
// not deducted twice, and that a debt does not exist before it was taken out.

const tx = (overrides: Partial<Transaction> = {}): Transaction =>
  ({
    id: Math.random().toString(),
    userId: "u1",
    amount: 10,
    type: "expense",
    categoryId: "food",
    date: new Date("2026-03-10"),
    description: "Shop",
    createdAt: new Date("2026-03-10"),
    updatedAt: new Date("2026-03-10"),
    ...overrides,
  }) as Transaction;

const debt = (overrides: Partial<DebtWithStatus> = {}): DebtWithStatus =>
  ({
    id: Math.random().toString(),
    userId: "u1",
    person: "Bank",
    direction: "owed_by_me",
    amount: 10000,
    date: new Date("2026-01-10"),
    payments: [],
    paid: 0,
    remaining: 10000,
    isSettled: false,
    createdAt: new Date("2026-01-10"),
    updatedAt: new Date("2026-01-10"),
    ...overrides,
  }) as DebtWithStatus;

const pay = (amount: number, date: string) => ({ id: Math.random().toString(), userId: "u1", debtId: "d", amount, date: new Date(date), createdAt: new Date(date) });

const FROM = new Date("2026-01-01");
const TO = new Date("2026-04-15");

/** The sum again, from the parts the chart draws. Not the production formula. */
const reconcile = (p: { cash: number; saved: number; owedToMe: number; owedByMe: number }) => p.cash + p.saved + p.owedToMe - p.owedByMe;

describe("netWorthSeries", () => {
  it("adds the four ledgers to the figure it reports", () => {
    const points = netWorthSeries(
      [tx({ type: "income", amount: 2000, date: new Date("2026-01-05") }), tx({ amount: 300, date: new Date("2026-02-08") }), tx({ amount: 500, date: new Date("2026-03-03"), isGoalTransaction: true, contributionType: "deposit" })],
      [debt({ amount: 4000, payments: [pay(1000, "2026-02-20")] }), debt({ direction: "owed_to_me", amount: 250, date: new Date("2026-01-02") })],
      undefined,
      FROM,
      TO,
    );

    expect(points).toHaveLength(4);
    for (const point of points) expect(point.net).toBeCloseTo(reconcile(point), 2);
  });

  it("does not create money when money is put aside", () => {
    const before = netWorthSeries([tx({ type: "income", amount: 1000, date: new Date("2026-01-05") })], [], undefined, FROM, TO);
    const after = netWorthSeries(
      [tx({ type: "income", amount: 1000, date: new Date("2026-01-05") }), tx({ amount: 400, date: new Date("2026-02-05"), isInvestmentTransaction: true, contributionType: "deposit" })],
      [],
      undefined,
      FROM,
      TO,
    );

    const last = (p: typeof before) => p[p.length - 1];
    // The cash fell by exactly what the investment gained, and the total held.
    expect(last(after).cash).toBeCloseTo(last(before).cash - 400, 2);
    expect(last(after).saved).toBeCloseTo(400, 2);
    expect(last(after).net).toBeCloseTo(last(before).net, 2);
  });

  it("gives a withdrawal back to the cash it came from", () => {
    const points = netWorthSeries(
      [
        tx({ amount: 400, date: new Date("2026-01-05"), isGoalTransaction: true, contributionType: "deposit" }),
        tx({ amount: 150, date: new Date("2026-03-05"), isGoalTransaction: true, contributionType: "withdrawal" }),
      ],
      [],
      undefined,
      FROM,
      TO,
    );

    const last = points[points.length - 1];
    expect(last.saved).toBeCloseTo(250, 2);
    expect(last.cash).toBeCloseTo(-250, 2);
    expect(last.net).toBeCloseTo(0, 2);
  });

  it("counts a debt from the month it was taken out, not before", () => {
    const points = netWorthSeries([], [debt({ amount: 5000, date: new Date("2026-03-04") })], undefined, FROM, TO);

    expect(points.map((p) => p.owedByMe)).toEqual([0, 0, 5000, 5000]);
  });

  it("owes less as it is repaid, and never less than nothing", () => {
    const points = netWorthSeries([], [debt({ amount: 1000, payments: [pay(400, "2026-02-10"), pay(900, "2026-03-10")] })], undefined, FROM, TO);

    expect(points.map((p) => p.owedByMe)).toEqual([1000, 600, 0, 0]);
  });

  it("counts what you are owed as yours and what you owe as not", () => {
    const lent = netWorthSeries([], [debt({ direction: "owed_to_me", amount: 800 })], undefined, FROM, TO);
    const borrowed = netWorthSeries([], [debt({ direction: "owed_by_me", amount: 800 })], undefined, FROM, TO);

    expect(lent[0].net).toBe(800);
    expect(borrowed[0].net).toBe(-800);
  });

  it("carries in everything that happened before the window", () => {
    // A position is cumulative: the window says which months to draw, not which
    // records exist.
    const points = netWorthSeries([tx({ type: "income", amount: 5000, date: new Date("2025-06-01") })], [], undefined, FROM, TO);

    expect(points[0].cash).toBe(5000);
  });

  it("ignores records the opening balance already speaks for", () => {
    // The trap the balance card was built around: enter "I had €5,000", then
    // backfill last year's rent, and a naive sum deducts it twice.
    const opening = { amount: 5000, date: new Date("2026-01-01") };
    const points = netWorthSeries([tx({ amount: 700, date: new Date("2025-11-04") }), tx({ amount: 100, date: new Date("2026-02-04") })], [], opening, FROM, TO);

    expect(points[0].cash).toBe(5000);
    expect(points[1].cash).toBe(4900);
  });

  it("refuses to draw months the opening balance cannot speak for", () => {
    const opening = { amount: 5000, date: new Date("2026-03-01") };
    const points = netWorthSeries([], [], opening, FROM, TO);

    // January and February would be the opening figure repeated — a flat run
    // that never happened.
    expect(points.map((p) => p.key)).toEqual(["2026-03", "2026-04"]);
  });

  it("returns nothing rather than guessing when the window is empty", () => {
    expect(netWorthSeries([], [], { amount: 100, date: new Date("2027-01-01") }, FROM, TO)).toEqual([]);
  });
});

describe("repaymentsOutsideCash", () => {
  it("matches a repayment to the spending entered beside it", () => {
    const result = repaymentsOutsideCash([debt({ payments: [pay(250, "2026-02-10")] })], [tx({ amount: 250, date: new Date("2026-02-11") })]);

    expect(result).toEqual({ matched: 1, unmatched: 0 });
  });

  it("does not let one payment vouch for a year of instalments", () => {
    // Same amount every month, one expense recorded. Eleven are still missing.
    const payments = Array.from({ length: 12 }, (_, i) => pay(250, `2026-${String(i + 1).padStart(2, "0")}-10`));
    const result = repaymentsOutsideCash([debt({ payments })], [tx({ amount: 250, date: new Date("2026-05-10") })]);

    expect(result).toEqual({ matched: 1, unmatched: 11 });
  });

  it("does not count money lent out as a repayment of yours", () => {
    const result = repaymentsOutsideCash([debt({ direction: "owed_to_me", payments: [pay(100, "2026-02-10")] })], []);

    expect(result).toEqual({ matched: 0, unmatched: 0 });
  });

  it("will not accept a goal deposit as the instalment", () => {
    const result = repaymentsOutsideCash([debt({ payments: [pay(250, "2026-02-10")] })], [tx({ amount: 250, date: new Date("2026-02-10"), isGoalTransaction: true, contributionType: "deposit" })]);

    expect(result).toEqual({ matched: 0, unmatched: 1 });
  });
});
