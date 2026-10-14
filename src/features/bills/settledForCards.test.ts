import { describe, it, expect } from "vitest";
import { settledForCards, willBePaidAgain } from "./billsUtils";
import type { BillWithStatus } from "../../shared/types/IndexTypes";

// The paid cards: what comes back first, soonest due at the top; what will not
// be paid again last.

const NOW = new Date(2026, 9, 14);
const bill = (id: string, over: Partial<BillWithStatus> = {}): BillWithStatus =>
  ({ id, name: id, isActive: true, isPaidThisPeriod: true, payments: [], nextDueDate: new Date(2026, 10, 1), lastPaidDate: new Date(2026, 9, 1), ...over }) as BillWithStatus;

describe("whether a paid bill comes back", () => {
  it("does, when active with a next due date", () => {
    expect(willBePaidAgain(bill("rent"), NOW)).toBe(true);
  });

  it("does not when switched off, or with nothing due", () => {
    expect(willBePaidAgain(bill("old", { isActive: false }), NOW)).toBe(false);
    expect(willBePaidAgain(bill("none", { nextDueDate: undefined }), NOW)).toBe(false);
  });

  it("does not when cancelled for good — now, or from its next month", () => {
    expect(willBePaidAgain(bill("gone", { pause: { from: "2026-09" } }), NOW)).toBe(false);
    // Paid for October, cancelled from November: the November due is never coming.
    expect(willBePaidAgain(bill("ending", { pause: { from: "2026-11" } }), NOW)).toBe(false);
  });

  it("does when only paused for a while", () => {
    expect(willBePaidAgain(bill("winter", { pause: { from: "2026-12", to: "2027-02" } }), NOW)).toBe(true);
  });
});

describe("the paid cards' order", () => {
  it("puts what comes back first, soonest due first, and what is done last", () => {
    const list = [
      bill("netflix", { nextDueDate: new Date(2026, 10, 20) }),
      bill("cancelled", { isActive: false, lastPaidDate: new Date(2026, 9, 5) }),
      bill("rent", { nextDueDate: new Date(2026, 10, 1) }),
      bill("gym", { pause: { from: "2026-11" }, lastPaidDate: new Date(2026, 9, 10) }),
      bill("water", { nextDueDate: new Date(2026, 11, 2) }),
    ];
    expect(settledForCards(list, NOW).map((b) => b.id)).toEqual(["rent", "netflix", "water", "gym", "cancelled"]);
  });
});
