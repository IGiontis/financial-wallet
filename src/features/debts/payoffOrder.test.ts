import { describe, it, expect } from "vitest";
import { payoffOrder } from "./debtsUtils";
import type { DebtWithStatus } from "../../shared/types/IndexTypes";

const debt = (remaining: number, over: Partial<DebtWithStatus> = {}): DebtWithStatus => ({ direction: "owed_by_me", isSettled: false, remaining, ...over }) as DebtWithStatus;

// ─── Which loan first ────────────────────────────────────────────────────────
//
// The one figure on the allocation page that tells the reader what to do with
// money rather than reporting what they did with it, so the ordering is checked
// against the case that makes it worth having: the dearest debt is not the
// biggest one, and a list sorted by size would send the money to the wrong loan.

describe("payoffOrder", () => {
  const owed = (over: Partial<DebtWithStatus> = {}): DebtWithStatus => debt(over.remaining ?? 1000, { person: "Τράπεζα", amount: 1000, ...over });

  it("puts the dearest first, not the biggest", () => {
    const rows = [
      owed({ id: "mortgage", label: "Στεγαστικό", interestRate: 3.5, termMonths: 300, remaining: 96400 }),
      owed({ id: "card", label: "Κάρτα", interestRate: 18.9, termMonths: 24, remaining: 1240 }),
      owed({ id: "consumer", label: "Καταναλωτικό", interestRate: 7.4, termMonths: 60, remaining: 4800 }),
    ];

    expect(payoffOrder(rows).map((d) => d.id)).toEqual(["card", "consumer", "mortgage"]);
  });

  it("leaves out anything that is not charged for", () => {
    // Money between people, and a settled loan. Neither has interest to save, so
    // neither belongs on a list about saving interest.
    const rows = [
      owed({ id: "card", interestRate: 18.9, termMonths: 24 }),
      owed({ id: "friend", label: "Δανεικά", remaining: 400 }),
      owed({ id: "free", label: "Άτοκες δόσεις", termMonths: 12 }),
      owed({ id: "done", interestRate: 9, termMonths: 12, isSettled: true, remaining: 0 }),
    ];

    expect(payoffOrder(rows).map((d) => d.id)).toEqual(["card"]);
  });

  it("counts money lent out as none of its business", () => {
    // A loan you gave someone earns you interest; it is not something to throw
    // spare money at, and the planner and the debts page take the same line.
    const rows = [owed({ id: "lent", direction: "owed_to_me", interestRate: 12, termMonths: 24 }), owed({ id: "card", interestRate: 5, termMonths: 24 })];

    expect(payoffOrder(rows).map((d) => d.id)).toEqual(["card"]);
  });

  it("reads a floating loan at the rate in force today", () => {
    const rows = [
      owed({ id: "fixed", interestRate: 4, termMonths: 60 }),
      owed({ id: "floating", rateType: "floating", baseRate: 3.1, margin: 1.4, interestRate: 4.5, termMonths: 60 }),
    ];

    // 3.1 + 1.4 = 4.5, which is dearer than the 4% fixed one.
    expect(payoffOrder(rows).map((d) => d.id)).toEqual(["floating", "fixed"]);
  });

  it("breaks a tie with the balance that can actually be cleared", () => {
    const rows = [
      owed({ id: "big", interestRate: 9, termMonths: 60, remaining: 8000 }),
      owed({ id: "small", interestRate: 9, termMonths: 60, remaining: 900 }),
    ];

    expect(payoffOrder(rows).map((d) => d.id)).toEqual(["small", "big"]);
  });

  it("has nothing to say when nothing is charged", () => {
    expect(payoffOrder([])).toEqual([]);
    expect(payoffOrder([owed({ label: "Δανεικά" })])).toEqual([]);
  });
});
