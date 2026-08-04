import { describe, it, expect } from "vitest";
import {
  getPeriodKey,
  monthlyEquivalent,
  computeBillStatus,
  getNextDueDate,
  getFrequencyLabel,
  averagePaidAmount,
  daysUntilDue,
  groupBills,
  computePeriodTotals,
  yearlyBreakdown,
} from "./billsUtils";
import type { Bill, BillPayment, BillWithStatus } from "../../shared/types/IndexTypes";

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

// ─── Variable-amount bills ───────────────────────────────────────────────────

describe("variable-amount bills", () => {
  it("has no average before anything is paid", () => {
    expect(averagePaidAmount([])).toBeUndefined();
  });

  it("averages the recorded payments", () => {
    // Electricity: 50, 120, 70 → average 80.
    const pays = [payment("2026-03", new Date("2026-03-01")), payment("2026-02", new Date("2026-02-01")), payment("2026-01", new Date("2026-01-01"))];
    pays[0].amount = 50;
    pays[1].amount = 120;
    pays[2].amount = 70;
    expect(averagePaidAmount(pays)).toBeCloseTo(80);
  });

  it("only averages the most recent six payments", () => {
    // Seven payments: six of 100 then an old outlier of 1000 that must be ignored.
    const pays = Array.from({ length: 7 }, (_, i) => {
      const p = payment(`2026-0${i + 1}`, new Date(2026, i, 1));
      p.amount = i < 6 ? 100 : 1000;
      return p;
    });
    expect(averagePaidAmount(pays)).toBe(100);
  });

  it("forecasts a variable bill from its average, not the stale estimate", () => {
    const electricity = makeBill({ amount: 60, isVariableAmount: true });
    const pays = [payment("2026-03", new Date("2026-03-01")), payment("2026-02", new Date("2026-02-01"))];
    pays[0].amount = 100;
    pays[1].amount = 140;

    const status = computeBillStatus(electricity, pays, new Date("2026-04-10"));
    expect(status.averagePaidAmount).toBeCloseTo(120);
    // Monthly forecast follows the average (120), not the 60 estimate.
    expect(status.monthlyEquivalent).toBeCloseTo(120);
  });

  it("leaves fixed bills on their stated amount", () => {
    const rent = makeBill({ amount: 500 });
    const pays = [payment("2026-03", new Date("2026-03-01"))];
    pays[0].amount = 480; // a one-off underpayment shouldn't move the forecast
    expect(computeBillStatus(rent, pays, new Date("2026-03-10")).monthlyEquivalent).toBe(500);
  });
});

// ─── Grouping by urgency ─────────────────────────────────────────────────────

/** Builds a status object without going through Firestore. */
const statusOf = (overrides: Partial<BillWithStatus>, bill: Partial<Bill> = {}): BillWithStatus =>
  ({
    ...makeBill(bill),
    currentPeriodKey: "2026-07",
    isPaidThisPeriod: false,
    payments: [],
    monthlyEquivalent: 15,
    ...overrides,
  }) as BillWithStatus;

describe("daysUntilDue", () => {
  const now = new Date("2026-07-15T10:00:00");

  it("counts whole days ahead", () => {
    expect(daysUntilDue(statusOf({ nextDueDate: new Date("2026-07-20") }), now)).toBe(5);
  });

  it("returns 0 on the due date itself", () => {
    expect(daysUntilDue(statusOf({ nextDueDate: new Date("2026-07-15T23:00:00") }), now)).toBe(0);
  });

  it("goes negative once the date has passed", () => {
    expect(daysUntilDue(statusOf({ nextDueDate: new Date("2026-07-12") }), now)).toBe(-3);
  });

  it("is undefined when no due date is set", () => {
    expect(daysUntilDue(statusOf({ nextDueDate: undefined }), now)).toBeUndefined();
  });
});

describe("groupBills", () => {
  const now = new Date("2026-07-15T10:00:00");

  it("sorts a past-due unpaid bill into overdue", () => {
    const groups = groupBills([statusOf({ id: "a", nextDueDate: new Date("2026-07-10") })], now);
    expect(groups.overdue).toHaveLength(1);
    expect(groups.upcoming).toHaveLength(0);
  });

  it("sorts a future unpaid bill into upcoming", () => {
    const groups = groupBills([statusOf({ id: "a", nextDueDate: new Date("2026-07-25") })], now);
    expect(groups.upcoming).toHaveLength(1);
  });

  it("puts paid bills in their own group regardless of date", () => {
    // Paid wins even though the date has passed.
    const groups = groupBills([statusOf({ id: "a", isPaidThisPeriod: true, nextDueDate: new Date("2026-07-01") })], now);
    expect(groups.paid).toHaveLength(1);
    expect(groups.overdue).toHaveLength(0);
  });

  it("treats a bill with no due date as upcoming, never overdue", () => {
    const groups = groupBills([statusOf({ id: "a", nextDueDate: undefined })], now);
    expect(groups.upcoming).toHaveLength(1);
    expect(groups.overdue).toHaveLength(0);
  });

  it("lists the most overdue bill first", () => {
    const groups = groupBills(
      [statusOf({ id: "recent", nextDueDate: new Date("2026-07-14") }), statusOf({ id: "ancient", nextDueDate: new Date("2026-07-01") })],
      now,
    );
    expect(groups.overdue.map((b) => b.id)).toEqual(["ancient", "recent"]);
  });

  it("lists the soonest upcoming bill first", () => {
    const groups = groupBills(
      [statusOf({ id: "later", nextDueDate: new Date("2026-07-28") }), statusOf({ id: "sooner", nextDueDate: new Date("2026-07-18") })],
      now,
    );
    expect(groups.upcoming.map((b) => b.id)).toEqual(["sooner", "later"]);
  });
});

// ─── Period totals ───────────────────────────────────────────────────────────

describe("computePeriodTotals", () => {
  it("splits the period into paid and still-due", () => {
    const totals = computePeriodTotals([
      statusOf({ id: "a", isPaidThisPeriod: true, payment: { amount: 100 } as never }, { amount: 100 }),
      statusOf({ id: "b" }, { amount: 300 }),
    ]);
    expect(totals.paid).toBe(100);
    expect(totals.due).toBe(300);
    expect(totals.total).toBe(400);
    expect(totals.paidPct).toBeCloseTo(25);
    expect(totals.unpaidCount).toBe(1);
    expect(totals.totalCount).toBe(2);
  });

  it("counts the real amount paid, not the estimate", () => {
    // Electricity estimated at 60 but actually cost 95.
    const totals = computePeriodTotals([statusOf({ id: "a", isPaidThisPeriod: true, payment: { amount: 95 } as never }, { amount: 60, isVariableAmount: true })]);
    expect(totals.paid).toBe(95);
  });

  it("forecasts unpaid variable bills from their average", () => {
    const totals = computePeriodTotals([statusOf({ id: "a", averagePaidAmount: 110 }, { amount: 60, isVariableAmount: true })]);
    expect(totals.due).toBe(110);
  });

  it("ignores paused bills", () => {
    expect(computePeriodTotals([statusOf({ id: "a" }, { amount: 50, isActive: false })]).total).toBe(0);
  });

  it("reports 0% rather than dividing by zero when there is nothing to pay", () => {
    expect(computePeriodTotals([]).paidPct).toBe(0);
  });
});

// ─── Yearly projection ───────────────────────────────────────────────────────

describe("yearlyBreakdown", () => {
  const labels: Record<string, string> = { rent: "Housing", net: "Internet" };
  const labelFor = (id: string) => labels[id] ?? id;

  it("annualizes each bill's monthly equivalent", () => {
    const { total } = yearlyBreakdown([statusOf({ id: "a", monthlyEquivalent: 100 }), statusOf({ id: "b", monthlyEquivalent: 50 })], labelFor);
    expect(total).toBe(1800); // (100 + 50) * 12
  });

  it("merges bills that share a category", () => {
    const { categories } = yearlyBreakdown(
      [statusOf({ id: "a", monthlyEquivalent: 100 }, { categoryId: "rent" }), statusOf({ id: "b", monthlyEquivalent: 20 }, { categoryId: "rent" })],
      labelFor,
    );
    expect(categories).toHaveLength(1);
    expect(categories[0].yearlyAmount).toBe(1440);
    expect(categories[0].label).toBe("Housing");
  });

  it("ranks categories by cost and computes their share", () => {
    const { categories } = yearlyBreakdown(
      [statusOf({ id: "a", monthlyEquivalent: 25 }, { categoryId: "net" }), statusOf({ id: "b", monthlyEquivalent: 75 }, { categoryId: "rent" })],
      labelFor,
    );
    expect(categories.map((c) => c.categoryId)).toEqual(["rent", "net"]);
    expect(categories[0].percentage).toBeCloseTo(75);
    expect(categories[1].percentage).toBeCloseTo(25);
  });

  it("returns nothing when every bill is paused", () => {
    const { total, categories } = yearlyBreakdown([statusOf({ id: "a", monthlyEquivalent: 100 }, { isActive: false })], labelFor);
    expect(total).toBe(0);
    expect(categories).toHaveLength(0);
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
