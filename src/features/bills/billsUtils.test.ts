import { describe, it, expect } from "vitest";
import { getPeriodKey, monthlyEquivalent, computeBillStatus, getNextDueDate, getFrequencyLabel } from "./billsUtils";
import type { Bill, BillPayment } from "../../shared/types/IndexTypes";

const makeBill = (overrides: Partial<Bill> = {}): Bill =>
  ({
    id: "b1",
    userId: "u1",
    name: "Netflix",
    amount: 15,
    categoryId: "c1",
    frequency: "monthly",
    isActive: true,
    createdAt: new Date("2026-01-15"),
    updatedAt: new Date("2026-01-15"),
    ...overrides,
  }) as Bill;

const payment = (periodKey: string, paidDate: Date): BillPayment =>
  ({ id: Math.random().toString(), userId: "u1", billId: "b1", periodKey, amount: 15, paidDate, createdAt: paidDate }) as BillPayment;

// ─── Period keys: simple (interval = 1) ──────────────────────────────────────

describe("getPeriodKey — every period", () => {
  it("keys monthly bills by year-month", () => {
    expect(getPeriodKey(makeBill(), new Date("2026-07-15"))).toBe("2026-07");
  });

  it("keys yearly bills by year", () => {
    expect(getPeriodKey(makeBill({ frequency: "yearly" }), new Date("2026-07-15"))).toBe("2026");
  });

  it("keys weekly bills by ISO week", () => {
    expect(getPeriodKey(makeBill({ frequency: "weekly" }), new Date("2026-07-15"))).toMatch(/^2026-W\d{2}$/);
  });
});

// ─── Period keys: custom intervals ───────────────────────────────────────────

describe("getPeriodKey — custom intervals", () => {
  it("groups two months into one bucket for an every-2-months bill", () => {
    // Anchored at Jan 2026: Jan+Feb share a bucket, Mar+Apr share the next.
    const water = makeBill({ intervalCount: 2, anchorDate: new Date("2026-01-01") });
    expect(getPeriodKey(water, new Date("2026-01-10"))).toBe("2026-01");
    expect(getPeriodKey(water, new Date("2026-02-20"))).toBe("2026-01");
    expect(getPeriodKey(water, new Date("2026-03-05"))).toBe("2026-03");
    expect(getPeriodKey(water, new Date("2026-04-28"))).toBe("2026-03");
  });

  it("groups three months per bucket for a quarterly bill", () => {
    const netflix = makeBill({ intervalCount: 3, anchorDate: new Date("2026-01-01") });
    expect(getPeriodKey(netflix, new Date("2026-02-01"))).toBe("2026-01");
    expect(getPeriodKey(netflix, new Date("2026-03-31"))).toBe("2026-01");
    expect(getPeriodKey(netflix, new Date("2026-04-01"))).toBe("2026-04");
  });

  it("groups four months per bucket for a gym membership", () => {
    const gym = makeBill({ intervalCount: 4, anchorDate: new Date("2026-01-01") });
    expect(getPeriodKey(gym, new Date("2026-04-30"))).toBe("2026-01");
    expect(getPeriodKey(gym, new Date("2026-05-01"))).toBe("2026-05");
  });

  it("keeps buckets aligned to the anchor rather than the calendar year", () => {
    // Anchored in February — buckets run Feb+Mar, Apr+May, …
    const bill = makeBill({ intervalCount: 2, anchorDate: new Date("2026-02-01") });
    expect(getPeriodKey(bill, new Date("2026-03-15"))).toBe("2026-02");
    expect(getPeriodKey(bill, new Date("2026-04-15"))).toBe("2026-04");
  });

  it("rolls buckets correctly across a year boundary", () => {
    const bill = makeBill({ intervalCount: 2, anchorDate: new Date("2026-11-01") });
    expect(getPeriodKey(bill, new Date("2026-12-10"))).toBe("2026-11");
    expect(getPeriodKey(bill, new Date("2027-01-10"))).toBe("2027-01");
  });

  it("supports multi-year intervals", () => {
    const bill = makeBill({ frequency: "yearly", intervalCount: 2, anchorDate: new Date("2026-01-01") });
    expect(getPeriodKey(bill, new Date("2026-06-01"))).toBe("2026");
    expect(getPeriodKey(bill, new Date("2027-06-01"))).toBe("2026");
    expect(getPeriodKey(bill, new Date("2028-06-01"))).toBe("2028");
  });

  it("falls back to createdAt when no anchor is set", () => {
    const bill = makeBill({ intervalCount: 2, createdAt: new Date("2026-01-15") });
    expect(getPeriodKey(bill, new Date("2026-02-01"))).toBe("2026-01");
    expect(getPeriodKey(bill, new Date("2026-03-01"))).toBe("2026-03");
  });
});

// ─── Monthly equivalent ──────────────────────────────────────────────────────

describe("monthlyEquivalent", () => {
  it("returns the amount for a plain monthly bill", () => {
    expect(monthlyEquivalent(makeBill({ amount: 15 }))).toBe(15);
  });

  it("spreads an every-2-months bill across both months", () => {
    // €60 water bill every 2 months costs €30/month.
    expect(monthlyEquivalent(makeBill({ amount: 60, intervalCount: 2 }))).toBe(30);
  });

  it("spreads a quarterly bill across three months", () => {
    expect(monthlyEquivalent(makeBill({ amount: 45, intervalCount: 3 }))).toBe(15);
  });

  it("annualizes weekly bills into a monthly figure", () => {
    expect(monthlyEquivalent(makeBill({ frequency: "weekly", amount: 12 }))).toBeCloseTo((12 * 52) / 12);
  });

  it("halves a fortnightly bill's monthly cost", () => {
    expect(monthlyEquivalent(makeBill({ frequency: "weekly", amount: 12, intervalCount: 2 }))).toBeCloseTo((12 * 52) / 12 / 2);
  });

  it("divides yearly bills across 12 months", () => {
    expect(monthlyEquivalent(makeBill({ frequency: "yearly", amount: 120 }))).toBeCloseTo(10);
  });

  it("divides a two-yearly bill across 24 months", () => {
    expect(monthlyEquivalent(makeBill({ frequency: "yearly", amount: 240, intervalCount: 2 }))).toBeCloseTo(10);
  });
});

// ─── Status ──────────────────────────────────────────────────────────────────

describe("computeBillStatus", () => {
  it("marks a bill paid when a payment exists for the current period", () => {
    const now = new Date("2026-07-15");
    const status = computeBillStatus(makeBill(), [payment("2026-07", new Date("2026-07-03"))], now);
    expect(status.isPaidThisPeriod).toBe(true);
  });

  it("is unpaid when the only payment is for a previous period", () => {
    const now = new Date("2026-07-15");
    const status = computeBillStatus(makeBill(), [payment("2026-06", new Date("2026-06-03"))], now);
    expect(status.isPaidThisPeriod).toBe(false);
    expect(status.lastPaidDate).toBeDefined();
  });

  it("stays paid through the whole interval for an every-2-months bill", () => {
    const water = makeBill({ intervalCount: 2, anchorDate: new Date("2026-01-01") });
    const paid = [payment("2026-03", new Date("2026-03-04"))];
    // Paid in March — still covered in April (same bucket)…
    expect(computeBillStatus(water, paid, new Date("2026-04-20")).isPaidThisPeriod).toBe(true);
    // …but due again in May (next bucket).
    expect(computeBillStatus(water, paid, new Date("2026-05-02")).isPaidThisPeriod).toBe(false);
  });
});

// ─── Due dates ───────────────────────────────────────────────────────────────

describe("getNextDueDate", () => {
  it("returns the due day later this month when it hasn't passed", () => {
    const due = getNextDueDate(makeBill({ dueDay: 20 }), new Date("2026-07-10"));
    expect(due?.getMonth()).toBe(6);
    expect(due?.getDate()).toBe(20);
  });

  it("rolls to next month when the due day has passed", () => {
    const due = getNextDueDate(makeBill({ dueDay: 10 }), new Date("2026-07-25"));
    expect(due?.getMonth()).toBe(7);
  });

  it("rolls a full interval ahead for an every-2-months bill", () => {
    // Bucket starts March; due on the 5th, already passed → next bucket is May.
    const water = makeBill({ intervalCount: 2, anchorDate: new Date("2026-01-01"), dueDay: 5 });
    const due = getNextDueDate(water, new Date("2026-03-20"));
    expect(due?.getMonth()).toBe(4); // May
    expect(due?.getDate()).toBe(5);
  });

  it("clamps to the last day for short months", () => {
    const due = getNextDueDate(makeBill({ dueDay: 31 }), new Date("2026-02-01"));
    expect(due?.getMonth()).toBe(1);
    expect(due?.getDate()).toBe(28);
  });
});

// ─── Labels ──────────────────────────────────────────────────────────────────

describe("getFrequencyLabel", () => {
  it("uses the simple label when the interval is 1", () => {
    expect(getFrequencyLabel(makeBill())).toEqual({ key: "bills.monthly", count: 1 });
  });

  it("uses the every-N label for custom intervals", () => {
    expect(getFrequencyLabel(makeBill({ intervalCount: 3 }))).toEqual({ key: "bills.everyNMonths", count: 3 });
  });
});
