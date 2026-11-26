import { describe, it, expect } from "vitest";
import { averagePaidAmount, billOverdue, clearablePeriods, computeBillStatus, paidAmountRange, perPeriodShare } from "./billsUtils";
import type { Bill, BillPayment } from "../../shared/types/IndexTypes";

// A clearing bill («εκκαθαριστικός», owner 2026-11-26): water left to pile up,
// then ONE final figure for all of it. Kept as one payment with the whole
// figure on the latest month (it carries the expense) and a 0-row per other
// month, `coveredBy` it. What must hold:
//   · every month it closes reads as paid — nothing stays overdue;
//   · nothing is counted twice: the rows add up to the one expense;
//   · the average and the range read it as its share of each month, so 96 €
//     for three months is «about 32 €», not one 96 € month beside two of 0.
// Each figure is also worked out by hand in the comments.

const NOW = new Date(2026, 9, 20); // 20 October 2026

const water = (extra: Partial<Bill> = {}): Bill =>
  ({ id: "water", userId: "u1", name: "Νερό", amount: 30, isVariableAmount: true, categoryId: "c1", frequency: "monthly", dueDay: 10, isActive: true, anchorDate: new Date(2025, 9, 5), createdAt: new Date(2025, 9, 5), updatedAt: new Date(2025, 9, 5), ...extra }) as Bill;

const paid = (key: string, amount: number, extra: Partial<BillPayment> = {}): BillPayment => {
  const [y, m] = key.split("-").map(Number);
  return { id: `p-${key}`, userId: "u1", billId: "water", periodKey: key, amount, paidDate: new Date(y, m - 1, 8), createdAt: new Date(y, m - 1, 8), ...extra } as BillPayment;
};

/** October 2025 – June 2026 paid at 30 each; July, August, September left to pile up. */
const HISTORY = ["2025-10", "2025-11", "2025-12", "2026-01", "2026-02", "2026-03", "2026-04", "2026-05", "2026-06"].map((k) => paid(k, 30));

/** The clearing: 96 € on 15 October for July – September and the current October. */
const CLEARING: BillPayment[] = [
  { ...paid("2026-10", 96), id: "clear", paidDate: new Date(2026, 9, 15), transactionId: "tx", covers: ["c7", "c8", "c9"] },
  { ...paid("2026-07", 0), id: "c7", paidDate: new Date(2026, 9, 15), coveredBy: "clear" },
  { ...paid("2026-08", 0), id: "c8", paidDate: new Date(2026, 9, 15), coveredBy: "clear" },
  { ...paid("2026-09", 0), id: "c9", paidDate: new Date(2026, 9, 15), coveredBy: "clear" },
];

const newestFirst = (rows: BillPayment[]) => [...rows].sort((a, b) => +b.paidDate - +a.paidDate);

describe("which months a clearing can close", () => {
  it("offers every overdue month and the unpaid current one, oldest first", () => {
    const status = computeBillStatus(water(), HISTORY, NOW);
    const periods = clearablePeriods(status, NOW);
    expect(periods.map((p) => p.periodKey)).toEqual(["2026-07", "2026-08", "2026-09", "2026-10"]);
    expect(periods.map((p) => p.current)).toEqual([false, false, false, true]);
    // A second way: on 20 October October (due the 10th) is late too, so the
    // four are exactly what the bill itself says is overdue.
    expect(billOverdue(status, NOW).items.map((i) => i.periodKey)).toEqual(["2026-07", "2026-08", "2026-09", "2026-10"]);
  });

  it("adds the current month when it is unpaid but not yet due — a final bill runs up to the day it is issued", () => {
    const early = new Date(2026, 9, 5); // 5 October: October falls due on the 10th
    const status = computeBillStatus(water(), HISTORY, early);
    expect(billOverdue(status, early).items.map((i) => i.periodKey)).toEqual(["2026-07", "2026-08", "2026-09"]);
    const periods = clearablePeriods(status, early);
    expect(periods.map((p) => p.periodKey)).toEqual(["2026-07", "2026-08", "2026-09", "2026-10"]);
    expect(periods[3].current).toBe(true);
  });

  it("offers nothing for a bill split into instalments", () => {
    expect(clearablePeriods(computeBillStatus(water({ installmentCount: 3 }), HISTORY, NOW), NOW)).toEqual([]);
  });

  it("offers nothing once everything is paid", () => {
    const status = computeBillStatus(water(), newestFirst([...HISTORY, ...CLEARING]), NOW);
    expect(clearablePeriods(status, NOW)).toEqual([]);
  });
});

describe("after the clearing", () => {
  const status = computeBillStatus(water(), newestFirst([...HISTORY, ...CLEARING]), NOW);

  it("leaves no month overdue and the current one paid", () => {
    expect(billOverdue(status, NOW).count).toBe(0);
    expect(status.isPaidThisPeriod).toBe(true);
  });

  it("counts the money once: the rows add up to the one expense", () => {
    const rows = status.payments.filter((p) => p.id === "clear" || p.coveredBy === "clear");
    expect(rows).toHaveLength(4);
    expect(rows.reduce((s, p) => s + p.amount, 0)).toBe(96);
  });

  it("reads the clearing as its share of each month in the average", () => {
    // By hand: 96 € over 4 months = 24 € each. The six most recent months are
    // then 24, 24, 24, 24 (Jul–Oct) and 30, 30 (Jun, May) → 156 / 6 = 26.
    expect(perPeriodShare(CLEARING[0])).toBe(24);
    expect(averagePaidAmount(status.payments)).toBeCloseTo(26, 2);
    // Without the share rule it would read 96, 0, 0, 0, 30, 30 → 26 as well by
    // luck of the sum — so the RANGE is the honest second check: never «0–96».
    expect(paidAmountRange(status.payments)).toEqual({ min: 24, max: 30 });
  });

  it("leaves the 0-rows out of the range and the average entirely", () => {
    const onlyCovered = CLEARING.slice(1);
    expect(paidAmountRange(onlyCovered)).toBeUndefined();
    expect(averagePaidAmount(onlyCovered)).toBeUndefined();
  });
});
