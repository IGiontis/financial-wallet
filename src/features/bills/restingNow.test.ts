import { describe, it, expect } from "vitest";
import { computeBillStatus, isStoppedNow, outstandingTotal, restingNow } from "./billsUtils";
import type { Bill, BillWithStatus } from "../../shared/types/IndexTypes";

// 15 November 2026. Water every three months, the October–December period due
// on 10 December, paused for November alone — the reviewer's case.
const NOW = new Date(2026, 10, 15, 10);
const make = (bill: Partial<Bill>): BillWithStatus =>
  computeBillStatus(
    { userId: "u", categoryId: "c", frequency: "monthly", isActive: true, anchorDate: new Date(2026, 0, 1), createdAt: new Date(2026, 9, 1), updatedAt: new Date(2026, 9, 1), ...bill } as Bill,
    [],
    NOW,
  );
const water = make({ id: "water", name: "Water", amount: 90, intervalCount: 3, anchorDate: new Date(2026, 9, 1), dueDay: 10, pause: { from: "2026-11", to: "2026-11" } });
const flat = make({ id: "flat", name: "Flat", amount: 40, dueDay: 10, createdAt: new Date(2026, 10, 1), anchorDate: new Date(2026, 10, 1), pause: { from: "2026-11" } });

describe("restingNow — off this period AND owing nothing", () => {
  it("keeps a bill that is off this month but whose period still falls due among the bills to pay", () => {
    expect(isStoppedNow(water, NOW)).toBe(true);
    expect(water.isPaidThisPeriod).toBe(false);
    expect(water.outstandingAmount).toBe(90);
    expect(restingNow(water, NOW)).toBe(false);
  });

  it("rests a bill stopped for good that owes nothing", () => {
    expect(flat.outstandingAmount).toBe(0);
    expect(restingNow(flat, NOW)).toBe(true);
  });

  it("so the still-to-pay total keeps the water's 90 — read two ways", () => {
    const bills = [water, flat];
    const toPay = bills.filter((b) => !restingNow(b, NOW));
    expect(outstandingTotal(toPay)).toBe(90);
    // Second way: every running bill's own outstanding figure, resting or not.
    expect(outstandingTotal(bills)).toBe(90);
  });
});
