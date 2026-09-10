import { describe, it, expect } from "vitest";
import { addMonths, differenceInCalendarMonths } from "date-fns";
import { ILLUSTRATION, rateExample } from "./rateExample";
import { computeDebtStatus } from "./debtsUtils";
import type { Debt, DebtPayment, DebtWithStatus } from "../../shared/types/IndexTypes";

// The example behind "how it works" is the one set of figures a reader will
// take at face value, so it is checked as hard as the loan itself — and, more
// to the point, checked to be the same arithmetic. An explanation that has
// drifted from the screen beside it is worse than no explanation.

const NOW = new Date(2026, 8, 9); // 9 September 2026

const debt = (over: Partial<Debt> = {}): Debt =>
  ({
    id: "d1",
    userId: "u1",
    person: "Τράπεζα",
    direction: "owed_by_me",
    amount: 10000,
    date: NOW,
    createdAt: NOW,
    updatedAt: NOW,
    ...over,
  }) as Debt;

const repay = (debtId: string, amount: number, date: Date): DebtPayment => ({ id: "p1", userId: "u1", debtId, amount, date, createdAt: date }) as DebtPayment;

const loan = (over: Partial<Debt> = {}, payments: DebtPayment[] = []): DebtWithStatus => computeDebtStatus(debt(over), payments, NOW);

describe("rateExample — the figures behind the explanation", () => {
  it("prices the illustration as an ordinary Greek mortgage", () => {
    const facts = rateExample(undefined, NOW)!;

    expect(facts.yours).toBe(false);
    expect(facts.amount).toBe(ILLUSTRATION.amount);
    expect(facts.base).toBe(2.3);
    expect(facts.margin).toBe(1.2);
    expect(facts.months).toBe(300);

    expect(facts.now.rate).toBe(3.5);
    expect(facts.now.instalment).toBe(1001.25);
    expect(facts.up.rate).toBe(4.5);
    expect(facts.up.instalment).toBe(1111.66);
  });

  it("charges the interest the explanation claims, and ties to the payment", () => {
    const facts = rateExample(undefined, NOW)!;

    expect(facts.now.interest).toBe(100374.14);
    expect(facts.up.interest).toBe(133499.49);
    // The second route: what is handed over across the whole term, less the
    // loan. Half a cent on the payment is a euro and a half over three hundred
    // months, so they tie to the euro rather than to the cent.
    expect(Math.abs(facts.now.instalment * facts.months - facts.amount - facts.now.interest)).toBeLessThan(2);
    expect(Math.abs(facts.up.instalment * facts.months - facts.amount - facts.up.interest)).toBeLessThan(2);
    // And the point the table is there to make.
    expect(facts.up.instalment - facts.now.instalment).toBeCloseTo(110.41, 2);
    expect(facts.up.interest - facts.now.interest).toBeCloseTo(33125.35, 1);
  });

  it("ends on one date, not two — which is the row that repeats itself", () => {
    const facts = rateExample(undefined, NOW)!;
    expect(differenceInCalendarMonths(facts.finish, NOW)).toBe(300);
    expect(facts.finish.getTime()).toBe(addMonths(NOW, 300).getTime());
  });

  it("puts a point on the index at about a tenth on the payment", () => {
    const facts = rateExample(undefined, NOW)!;
    const heavier = (facts.up.instalment - facts.now.instalment) / facts.now.instalment;

    expect(heavier).toBeGreaterThan(0.08);
    expect(heavier).toBeLessThan(0.13);
  });

  it("explains the reader's own loan when there is one", () => {
    const mine = loan({ amount: 50000, rateType: "floating", baseRate: 3.1, margin: 0.9, interestRate: 4, termMonths: 120 });
    const facts = rateExample(mine, NOW)!;

    expect(facts.yours).toBe(true);
    expect(facts.amount).toBe(50000);
    expect(facts.base).toBe(3.1);
    expect(facts.margin).toBe(0.9);
    expect(facts.now.rate).toBe(4);
    expect(facts.up.rate).toBe(5);
    expect(facts.months).toBe(120);
  });

  it("falls back to the illustration for a loan whose rate cannot move", () => {
    // A fixed loan has nothing to demonstrate about an index, and its own
    // figures in this table would say the opposite of what the page is for.
    const fixed = rateExample(loan({ interestRate: 7, termMonths: 60 }), NOW)!;
    expect(fixed.yours).toBe(false);
    expect(fixed.amount).toBe(ILLUSTRATION.amount);

    // Neither has a debt that is not a loan at all.
    const iou = rateExample(loan({ amount: 400 }), NOW)!;
    expect(iou.yours).toBe(false);
  });

  it("falls back to the illustration for a floating loan already cleared", () => {
    const settled = loan({ amount: 5000, rateType: "floating", baseRate: 2, margin: 1, interestRate: 3, termMonths: 24 }, [repay("d1", 6000, new Date(2026, 8, 10))]);
    const facts = rateExample(settled, new Date(2026, 8, 11))!;

    expect(settled.isSettled).toBe(true);
    expect(facts.yours).toBe(false);
    expect(facts.amount).toBe(ILLUSTRATION.amount);
  });
});
