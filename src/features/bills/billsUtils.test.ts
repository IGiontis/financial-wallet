import { describe, it, expect } from "vitest";
import {
  averagePaidAmount,
  billMonthStrip,
  billUrgency,
  cashRunway,
  computeBillStatus,
  computePeriodTotals,
  daysUntilDeadline,
  daysUntilDue,
  getDeadline,
  getFrequencyLabel,
  getFrequencyToken,
  getNextDueDate,
  getPeriodDueDate,
  getPeriodKey,
  groupBills,
  isHardDeadline,
  isInGracePeriod,
  monthlyEquivalent,
  paidAmountRange,
  sinkingFund,
  supportsMonthStrip,
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
const statusOf = (overrides: Partial<BillWithStatus>, bill: Partial<Bill> = {}): BillWithStatus => {
  const base = {
    ...makeBill(bill),
    currentPeriodKey: "2026-07",
    isPaidThisPeriod: false,
    payments: [],
    monthlyEquivalent: 15,
    ...overrides,
  } as BillWithStatus;

  // computeBillStatus always fills the deadline in alongside the due date, so
  // a fixture that only sets one would be a shape the app never produces.
  return { ...base, deadline: base.deadline ?? getDeadline(base, base.nextDueDate) };
};

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

describe("getFrequencyToken", () => {
  // The scale runs hot (frequent) → cool (rare) so cadence is recognisable
  // without reading the label.
  it("marks weekly bills as the most frequent", () => {
    expect(getFrequencyToken(makeBill({ frequency: "weekly" }))).toBe("--color-expense");
  });

  it("gives plain monthly bills the primary colour", () => {
    expect(getFrequencyToken(makeBill({ frequency: "monthly" }))).toBe("--bs-primary");
  });

  it("groups every-2 and every-3 months together", () => {
    expect(getFrequencyToken(makeBill({ intervalCount: 2 }))).toBe("--color-goal");
    expect(getFrequencyToken(makeBill({ intervalCount: 3 }))).toBe("--color-goal");
  });

  it("shifts to indigo for 4–11 month cycles", () => {
    expect(getFrequencyToken(makeBill({ intervalCount: 4 }))).toBe("--color-invest");
    expect(getFrequencyToken(makeBill({ intervalCount: 6 }))).toBe("--color-invest");
  });

  it("marks yearly and rarer bills as the calmest", () => {
    expect(getFrequencyToken(makeBill({ frequency: "yearly" }))).toBe("--color-income");
    expect(getFrequencyToken(makeBill({ intervalCount: 12 }))).toBe("--color-income");
  });

  it("treats a fortnightly bill as frequent, like weekly", () => {
    // Every 2 weeks ≈ 0.46 months → still under a month.
    expect(getFrequencyToken(makeBill({ frequency: "weekly", intervalCount: 2 }))).toBe("--color-expense");
  });

  it("gives every-6-weeks its own step up the scale", () => {
    // ≈1.4 months — no longer "weekly hot", not yet quarterly.
    expect(getFrequencyToken(makeBill({ frequency: "weekly", intervalCount: 6 }))).toBe("--bs-primary");
  });
});

describe("getFrequencyLabel", () => {
  it("uses the simple label when the interval is 1", () => {
    expect(getFrequencyLabel(makeBill())).toEqual({ key: "bills.monthly", count: 1 });
  });

  it("uses the every-N label for custom intervals", () => {
    expect(getFrequencyLabel(makeBill({ intervalCount: 3 }))).toEqual({ key: "bills.everyNMonths", count: 3 });
  });
});

// ─── Sinking fund ────────────────────────────────────────────────────────────

describe("sinkingFund", () => {
  // Quarterly bill of €90, due 1 Apr, so the cycle runs 1 Jan → 1 Apr.
  const quarterly = (now: Date): BillWithStatus =>
    computeBillStatus(makeBill({ amount: 90, intervalCount: 3, dueDay: 1, anchorDate: new Date("2026-01-01"), createdAt: new Date("2026-01-01") }), [], now);

  it("is undefined for bills that recur more often than every 2 months", () => {
    const monthly = computeBillStatus(makeBill({ dueDay: 1 }), [], new Date("2026-02-15"));
    expect(sinkingFund(monthly)).toBeUndefined();
  });

  it("is undefined when the bill has no due date to work back from", () => {
    const noDueDay = computeBillStatus(makeBill({ intervalCount: 3 }), [], new Date("2026-02-15"));
    expect(sinkingFund(noDueDay)).toBeUndefined();
  });

  it("expects the full amount to be ready on the due date itself", () => {
    const fund = sinkingFund(quarterly(new Date("2026-01-01")), new Date("2026-01-01"));
    expect(fund!.progress).toBeCloseTo(1);
    expect(fund!.saved).toBeCloseTo(90);
    expect(fund!.remaining).toBeCloseTo(0);
  });

  it("resets to almost nothing the day after a payment cycle rolls over", () => {
    // 2 Jan sits 1 day into the 1 Jan → 1 Apr cycle.
    const fund = sinkingFund(quarterly(new Date("2026-01-02")), new Date("2026-01-02"));
    expect(fund!.progress).toBeLessThan(0.02);
    expect(fund!.remaining).toBeGreaterThan(88);
  });

  it("pro-rates what should be set aside partway through the cycle", () => {
    // 1 Feb is 31 of the 90 days between 1 Jan and 1 Apr.
    const fund = sinkingFund(quarterly(new Date("2026-02-01")), new Date("2026-02-01"));
    expect(fund!.progress).toBeGreaterThan(0.3);
    expect(fund!.progress).toBeLessThan(0.4);
    expect(fund!.saved).toBeCloseTo(90 * fund!.progress);
    expect(fund!.saved + fund!.remaining).toBeCloseTo(90);
  });

  it("carries the monthly rate that reaches the target", () => {
    const fund = sinkingFund(quarterly(new Date("2026-02-01")), new Date("2026-02-01"));
    expect(fund!.perMonth).toBeCloseTo(30); // €90 every 3 months
  });

  it("never reports more saved than the target", () => {
    const fund = sinkingFund(quarterly(new Date("2026-04-01")), new Date("2026-04-01"));
    expect(fund!.saved).toBeLessThanOrEqual(90);
    expect(fund!.remaining).toBeGreaterThanOrEqual(0);
  });

  it("uses the recent average for a variable bill, not the stale estimate", () => {
    const bill = computeBillStatus(
      makeBill({ amount: 80, isVariableAmount: true, intervalCount: 3, dueDay: 1, anchorDate: new Date("2026-01-01"), createdAt: new Date("2026-01-01") }),
      [payment("2025-10", new Date("2025-10-01"))].map((p) => ({ ...p, amount: 120 })),
      new Date("2026-02-01"),
    );
    expect(sinkingFund(bill, new Date("2026-02-01"))!.target).toBe(120);
  });
});

// ─── Typical amount range ────────────────────────────────────────────────────

describe("paidAmountRange", () => {
  const at = (amount: number, date: string): BillPayment => ({ ...payment("k", new Date(date)), amount });

  it("is undefined with no history", () => {
    expect(paidAmountRange([])).toBeUndefined();
  });

  it("collapses to a single figure when every payment matched", () => {
    expect(paidAmountRange([at(50, "2026-01-01"), at(50, "2026-02-01")])).toEqual({ min: 50, max: 50 });
  });

  it("spans the cheapest and dearest recent payment", () => {
    const range = paidAmountRange([at(122, "2026-02-01"), at(80, "2026-01-01"), at(95, "2025-12-01")]);
    expect(range).toEqual({ min: 80, max: 122 });
  });

  it("only looks at the same 6-payment window as the average", () => {
    // 7 payments, newest first; the €999 outlier sits outside the window.
    const payments = [at(50, "2026-06-01"), at(51, "2026-05-01"), at(52, "2026-04-01"), at(53, "2026-03-01"), at(54, "2026-02-01"), at(55, "2026-01-01"), at(999, "2025-12-01")];
    expect(paidAmountRange(payments)).toEqual({ min: 50, max: 55 });
  });

  it("is exposed on the computed bill status", () => {
    const bill = computeBillStatus(makeBill({ isVariableAmount: true }), [at(122, "2026-02-01"), at(80, "2026-01-01")], new Date("2026-02-15"));
    expect(bill.paidAmountRange).toEqual({ min: 80, max: 122 });
  });
});

// ─── Grace periods and deadlines ─────────────────────────────────────────────

describe("getDeadline", () => {
  it("is the due date itself when nothing can be late", () => {
    expect(getDeadline({ graceDays: 0 }, new Date("2026-07-15"))).toEqual(new Date("2026-07-15"));
    expect(getDeadline({}, new Date("2026-07-15"))).toEqual(new Date("2026-07-15"));
  });

  it("pushes out by the grace days", () => {
    expect(getDeadline({ graceDays: 25 }, new Date("2026-07-15"))).toEqual(new Date("2026-08-09"));
  });

  it("is undefined without a due date to work from", () => {
    expect(getDeadline({ graceDays: 25 }, undefined)).toBeUndefined();
  });
});

describe("isHardDeadline", () => {
  it("treats a missing or zero grace as strict", () => {
    expect(isHardDeadline({})).toBe(true);
    expect(isHardDeadline({ graceDays: 0 })).toBe(true);
    expect(isHardDeadline({ graceDays: 25 })).toBe(false);
  });
});

describe("computeBillStatus — grace window", () => {
  // Bill due on the 5th with 25 days to pay; today is the 12th.
  const electricity = makeBill({ dueDay: 5, graceDays: 25, isVariableAmount: true });
  const now = new Date("2026-07-12T10:00:00");

  it("keeps pointing at the payment you can still make", () => {
    const status = computeBillStatus(electricity, [], now);
    expect(status.nextDueDate?.getDate()).toBe(5);
    expect(status.nextDueDate?.getMonth()).toBe(6); // July, not August
    expect(status.deadline).toEqual(new Date(2026, 6, 30));
  });

  it("is not late while the window is still open", () => {
    expect(billUrgency(computeBillStatus(electricity, [], now), now)).toBe("later");
    expect(isInGracePeriod(computeBillStatus(electricity, [], now), now)).toBe(true);
  });

  it("rolls forward once the window has closed too", () => {
    const after = new Date("2026-08-01T10:00:00");
    const status = computeBillStatus(electricity, [], after);
    expect(status.nextDueDate?.getMonth()).toBe(7); // August
  });

  it("keeps a missed strict bill on the payment you actually owe", () => {
    // Without this a subscription missed on the 5th would advertise itself as
    // due in three weeks, and nothing on screen would say it was unpaid.
    const netflix = makeBill({ dueDay: 5 });
    const status = computeBillStatus(netflix, [], now);

    expect(status.nextDueDate?.getMonth()).toBe(6); // still July
    expect(status.nextDueDate?.getDate()).toBe(5);
    expect(billUrgency(status, now)).toBe("late");
  });

  it("never holds a paid bill open", () => {
    const status = computeBillStatus(electricity, [payment("2026-07", new Date("2026-07-06"))], now);
    expect(status.isPaidThisPeriod).toBe(true);
    expect(status.nextDueDate?.getMonth()).toBe(7);
  });
});

describe("billUrgency", () => {
  const now = new Date("2026-07-15T10:00:00");

  it("puts paid above everything else", () => {
    expect(billUrgency(statusOf({ isPaidThisPeriod: true, nextDueDate: new Date("2026-07-01") }), now)).toBe("paid");
  });

  it("is late only once the deadline has gone, not the due date", () => {
    const strict = statusOf({ nextDueDate: new Date("2026-07-10") });
    const lenient = statusOf({ nextDueDate: new Date("2026-07-10") }, { graceDays: 20 });

    expect(billUrgency(strict, now)).toBe("late");
    expect(billUrgency(lenient, now)).toBe("later"); // 30 July is still weeks away
  });

  it("flags the last week before the deadline", () => {
    expect(billUrgency(statusOf({ nextDueDate: new Date("2026-07-20") }), now)).toBe("soon");
    expect(billUrgency(statusOf({ nextDueDate: new Date("2026-07-30") }), now)).toBe("later");
  });

  it("falls back to later without a date", () => {
    expect(billUrgency(statusOf({ nextDueDate: undefined }), now)).toBe("later");
  });
});

describe("isInGracePeriod", () => {
  const now = new Date("2026-07-15T10:00:00");

  it("is true between the due date and the deadline", () => {
    expect(isInGracePeriod(statusOf({ nextDueDate: new Date("2026-07-10") }, { graceDays: 20 }), now)).toBe(true);
  });

  it("is false before the due date", () => {
    expect(isInGracePeriod(statusOf({ nextDueDate: new Date("2026-07-20") }, { graceDays: 20 }), now)).toBe(false);
  });

  it("is false for a bill that has no window at all", () => {
    expect(isInGracePeriod(statusOf({ nextDueDate: new Date("2026-07-10") }), now)).toBe(false);
  });

  it("is false once it has been paid", () => {
    expect(isInGracePeriod(statusOf({ isPaidThisPeriod: true, nextDueDate: new Date("2026-07-10") }, { graceDays: 20 }), now)).toBe(false);
  });
});

// ─── Cash runway ─────────────────────────────────────────────────────────────

describe("cashRunway", () => {
  const now = new Date("2026-07-15T10:00:00");

  it("accumulates by deadline, soonest first", () => {
    const bills = [
      statusOf({ id: "netflix", amount: 11, nextDueDate: new Date("2026-07-18") }),
      statusOf({ id: "gym", amount: 30, nextDueDate: new Date("2026-07-25") }),
      statusOf({ id: "power", amount: 104, nextDueDate: new Date("2026-07-20") }, { graceDays: 10 }), // deadline 30 July
    ];

    const runway = cashRunway(bills, now);

    expect(runway.map((c) => c.date.getDate())).toEqual([18, 25, 30]);
    expect(runway.map((c) => c.cumulative)).toEqual([11, 41, 145]);
    expect(runway.map((c) => c.cumulativeCount)).toEqual([1, 2, 3]);
  });

  it("counts only the bills that cannot be paid late as strict", () => {
    const bills = [
      statusOf({ id: "netflix", amount: 11, nextDueDate: new Date("2026-07-18") }),
      statusOf({ id: "power", amount: 104, nextDueDate: new Date("2026-07-20") }, { graceDays: 10 }),
    ];

    expect(cashRunway(bills, now).map((c) => c.strictCount)).toEqual([1, 1]);
  });

  it("collapses anything already past its deadline onto today", () => {
    const bills = [
      statusOf({ id: "old", amount: 40, nextDueDate: new Date("2026-06-30") }),
      statusOf({ id: "older", amount: 20, nextDueDate: new Date("2026-06-01") }),
      statusOf({ id: "next", amount: 11, nextDueDate: new Date("2026-07-20") }),
    ];

    const runway = cashRunway(bills, now);

    expect(runway[0].date).toEqual(new Date(2026, 6, 15));
    expect(runway[0].overdue).toBe(true);
    expect(runway[0].amount).toBe(60);
    expect(runway[1].overdue).toBe(false);
  });

  it("leaves out paid, paused and undated bills", () => {
    const bills = [
      statusOf({ id: "paid", amount: 50, isPaidThisPeriod: true, nextDueDate: new Date("2026-07-18") }),
      statusOf({ id: "paused", amount: 50, nextDueDate: new Date("2026-07-18") }, { isActive: false }),
      statusOf({ id: "undated", amount: 50, nextDueDate: undefined }),
      statusOf({ id: "real", amount: 11, nextDueDate: new Date("2026-07-18") }),
    ];

    const runway = cashRunway(bills, now);

    expect(runway).toHaveLength(1);
    expect(runway[0].cumulative).toBe(11);
  });

  it("uses the recent average for a variable bill rather than the estimate", () => {
    const power = statusOf({ id: "power", amount: 60, averagePaidAmount: 104, nextDueDate: new Date("2026-07-18") }, { isVariableAmount: true });
    expect(cashRunway([power], now)[0].cumulative).toBe(104);
  });

  it("caps how many checkpoints it returns", () => {
    const bills = [18, 20, 22, 24].map((day) => statusOf({ id: `b${day}`, amount: 10, nextDueDate: new Date(2026, 6, day) }));
    expect(cashRunway(bills, now)).toHaveLength(3);
  });

  it("is empty when nothing is pending", () => {
    expect(cashRunway([], now)).toEqual([]);
  });
});

describe("getPeriodDueDate", () => {
  it("returns this period's day even after it has gone past", () => {
    // getNextDueDate would already have rolled to August here.
    const due = getPeriodDueDate(makeBill({ dueDay: 5 }), new Date("2026-07-25"));
    expect(due?.getMonth()).toBe(6);
    expect(due?.getDate()).toBe(5);
  });

  it("clamps to the last day of a short month", () => {
    const due = getPeriodDueDate(makeBill({ dueDay: 31 }), new Date("2026-02-10"));
    expect(due?.getDate()).toBe(28);
  });

  it("is undefined without a due day", () => {
    expect(getPeriodDueDate(makeBill())).toBeUndefined();
  });
});

describe("daysUntilDeadline", () => {
  const now = new Date("2026-07-15T10:00:00");

  it("counts to the deadline, not the due date", () => {
    expect(daysUntilDeadline(statusOf({ nextDueDate: new Date("2026-07-10") }, { graceDays: 20 }), now)).toBe(15);
  });

  it("goes negative once the window has closed", () => {
    expect(daysUntilDeadline(statusOf({ nextDueDate: new Date("2026-07-01") }, { graceDays: 5 }), now)).toBe(-9);
  });

  it("is undefined when there is no deadline", () => {
    expect(daysUntilDeadline(statusOf({ nextDueDate: undefined }), now)).toBeUndefined();
  });
});

// ─── Month strip ──────────────────────────────────────────────────────────────

describe("supportsMonthStrip", () => {
  it("is false only for weekly bills", () => {
    expect(supportsMonthStrip(makeBill({ frequency: "weekly" }))).toBe(false);
    expect(supportsMonthStrip(makeBill({ frequency: "monthly" }))).toBe(true);
    expect(supportsMonthStrip(makeBill({ frequency: "yearly" }))).toBe(true);
  });
});

describe("billMonthStrip", () => {
  const now = new Date("2026-08-15");

  it("draws 6 consecutive months centred just before today", () => {
    const netflix = makeBill({ dueDay: 5 });
    const status = computeBillStatus(netflix, [], now);
    const strip = billMonthStrip(status, now);

    expect(strip.map((c) => c.start.getMonth())).toEqual([4, 5, 6, 7, 8, 9]); // May–Oct
    expect(strip.every((c) => c.start.getFullYear() === 2026)).toBe(true);
  });

  it("marks the current unpaid month as due and nothing else", () => {
    const netflix = makeBill({ dueDay: 20 }); // still ahead this period
    const status = computeBillStatus(netflix, [], now);
    const strip = billMonthStrip(status, now);

    const august = strip.find((c) => c.start.getMonth() === 7)!;
    expect(august.status).toBe("due");
    expect(strip.filter((c) => c.status === "paid")).toHaveLength(0);
  });

  it("paints both months of a paid every-2-months period, then the next bucket as due", () => {
    // Anchored so Jul+Aug share a bucket, Sep+Oct the next one.
    const water = makeBill({ dueDay: 10, intervalCount: 2, anchorDate: new Date("2026-01-01") });
    const paid = [payment("2026-07", new Date("2026-07-08"))];
    const status = computeBillStatus(water, paid, now);
    const strip = billMonthStrip(status, now);

    expect(strip.find((c) => c.start.getMonth() === 6)!.status).toBe("paid"); // Jul
    expect(strip.find((c) => c.start.getMonth() === 7)!.status).toBe("paid"); // Aug — same bucket
    // Settled bills roll forward: it's the NEXT bucket that's now waiting to be
    // paid, and both of its months should read that way, not just one.
    expect(strip.find((c) => c.start.getMonth() === 8)!.status).toBe("due"); // Sep
    expect(strip.find((c) => c.start.getMonth() === 9)!.status).toBe("due"); // Oct
  });

  it("marks a paid current month as paid, and the following one as due", () => {
    const netflix = makeBill({ dueDay: 5 });
    const status = computeBillStatus(netflix, [payment("2026-08", new Date("2026-08-05"))], now);
    const strip = billMonthStrip(status, now);

    expect(strip.find((c) => c.start.getMonth() === 7)!.status).toBe("paid"); // Aug
    expect(strip.find((c) => c.start.getMonth() === 8)!.status).toBe("due"); // Sep — what's coming next
  });

  it("leaves months before the bill existed as plain empty, not flagged", () => {
    const netflix = makeBill({ dueDay: 5, createdAt: new Date("2026-08-01"), anchorDate: new Date("2026-08-01") });
    const status = computeBillStatus(netflix, [], now);
    const strip = billMonthStrip(status, now);

    expect(strip.find((c) => c.start.getMonth() === 4)!.status).toBe("empty"); // May, before it existed
  });

  it("respects a custom window size", () => {
    const netflix = makeBill({ dueDay: 5 });
    const status = computeBillStatus(netflix, [], now);
    expect(billMonthStrip(status, now, 1, 1)).toHaveLength(3);
  });
});
