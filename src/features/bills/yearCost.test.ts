import { describe, it, expect } from "vitest";
import { computeBillStatus, isStoppedNow, yearlyBreakdown } from "./billsUtils";
import { yearCostRanking } from "./yearCost";
import type { Bill, BillWithStatus } from "../../shared/types/IndexTypes";

// «Ο χρόνος» on 2 November 2026: a 13 € subscription starting in December, a
// 480 € insurance once a year, 60 € of water every two months, and an old
// phone switched off.
const NOW = new Date(2026, 10, 2, 10);
const make = (bill: Partial<Bill>): BillWithStatus =>
  computeBillStatus(
    { userId: "u", categoryId: "c", frequency: "monthly", isActive: true, anchorDate: new Date(2026, 0, 1), createdAt: new Date(2026, 10, 1), updatedAt: new Date(2026, 10, 1), dueDay: 20, ...bill } as Bill,
    [],
    NOW,
  );
const sub = make({ id: "sub", name: "Subscription", amount: 13, startsOn: "2026-12" });
const insurance = make({ id: "ins", name: "Insurance", amount: 480, frequency: "yearly", dueMonth: 2, dueDay: 10 });
const water = make({ id: "water", name: "Water", amount: 60, intervalCount: 2 });
const phone = make({ id: "phone", name: "Old phone", amount: 25, isActive: false });
const bills = [sub, insurance, water, phone];

describe("yearCostRanking — what each bill costs a year", () => {
  const { total, rows } = yearCostRanking(bills);

  it("ranks the running bills dearest first, leaving the switched-off one out", () => {
    expect(rows.map((r) => r.bill.id)).toEqual(["ins", "water", "sub"]);
  });

  it("counts only the months a bill is charged in: the subscription starting in December, 11 of 12", () => {
    // By hand: December 2026 to October 2027 is eleven months of 13 €.
    expect(rows.find((r) => r.bill.id === "sub")!.yearly).toBe(143);
    expect(11 * 13).toBe(143);
    expect(rows.find((r) => r.bill.id === "water")!.yearly).toBe(360);
    expect(rows.find((r) => r.bill.id === "ins")!.yearly).toBe(480);
  });

  it("adds up to the yearly projection's total, and the shares to 100%", () => {
    expect(total).toBe(480 + 360 + 143);
    // Second route: the «Ετήσια προβολή» panel's own sum.
    expect(total).toBeCloseTo(yearlyBreakdown(bills, () => "").total, 2);
    expect(rows.reduce((s, r) => s + r.share, 0)).toBeCloseTo(100, 6);
    expect(rows[rows.length - 1].cumulative).toBeCloseTo(100, 6);
    expect(rows[0].cumulative).toBeCloseTo((480 / 983) * 100, 6);
  });
});

describe("isStoppedNow", () => {
  it("is true for a bill not begun, paused, or stopped — and false for a running one", () => {
    expect(isStoppedNow(sub, NOW)).toBe(true);
    expect(isStoppedNow(make({ id: "h", name: "House", amount: 60, pause: { from: "2026-11", to: "2027-02" } }), NOW)).toBe(true);
    expect(isStoppedNow(make({ id: "f", name: "Flat", amount: 40, pause: { from: "2026-08" } }), NOW)).toBe(true);
    expect(isStoppedNow(water, NOW)).toBe(false);
    // A pause still to come does not stop it now.
    expect(isStoppedNow(make({ id: "w", name: "Winter", amount: 40, pause: { from: "2027-01", to: "2027-02" } }), NOW)).toBe(false);
  });
});

describe("the two monthly figures, kept apart", () => {
  it("one charge ÷ its months on the card, the year ÷ 12 here — different, and labelled differently", () => {
    // 60 € every two months, off June to August: the card's share is 30 € a month,
    // the year's spread is lower because three months of it are paused.
    const paused = make({ id: "p", name: "Pool", amount: 60, intervalCount: 2, pause: { from: "2027-06", to: "2027-08", yearly: true } });
    const row = yearCostRanking([paused]).rows[0];
    expect(row.yearly / 12).toBeLessThan(30);
    // Second way: the charged periods in the twelve months, by count, × 60.
    expect(row.yearly % 60).toBe(0);
  });
});
