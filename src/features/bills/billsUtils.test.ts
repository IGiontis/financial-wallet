import { describe, it, expect } from "vitest";
import {
  arrears,
  averagePaidAmount,
  billMonthStrip,
  billCoverage,
  billCoverageYears,
  installmentAmount,
  installmentDueDates,
  installmentIntervalOptions,
  billUrgency,
  cashRunway,
  computeBillStatus,
  coveredPeriodCount,
  daysUntilDeadline,
  daysUntilDue,
  getDeadline,
  getFrequencyLabel,
  getFrequencyToken,
  getNextDueDate,
  getPeriodDueDate,
  getPeriodKey,
  getPeriodOptions,
  groupBills,
  isHardDeadline,
  isInGracePeriod,
  monthForecast,
  periodTotals,
  monthlyEquivalent,
  paidAmountRange,
  sinkingFund,
  supportsMonthStrip,
  yearlyBreakdown,
} from "./billsUtils";
import type { MonthCell } from "./billsUtils";
import type { Bill, BillPayment, BillWithStatus, CreateBillDTO, UpdateBillDTO } from "../../shared/types/IndexTypes";

// A field added to the create form but forgotten on the update DTO is dropped
// in silence: the bill saves, and the setting is simply gone next time it is
// opened. `installmentCount` did exactly that. This fails to compile rather
// than at runtime, so the next one cannot ship.
type MissingFromUpdate = Exclude<keyof CreateBillDTO, keyof UpdateBillDTO>;
const _everyCreatedFieldIsEditable: MissingFromUpdate extends never ? true : MissingFromUpdate = true;
void _everyCreatedFieldIsEditable;

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

describe("periodTotals", () => {
  const now = new Date("2026-09-01");
  const monthOf = (bills: BillWithStatus[]) => monthForecast(bills, now, 0);
  const totalsFor = (bills: BillWithStatus[]) => periodTotals(monthOf(bills));

  const bill = (overrides: Partial<Bill>, payments: BillPayment[] = []) => computeBillStatus(makeBill({ dueDay: 10, ...overrides }), payments, now);
  const paidIn = (billId: string, periodKey: string, amount: number, paidDate: Date): BillPayment =>
    ({ id: Math.random().toString(), userId: "u1", billId, periodKey, amount, paidDate, createdAt: paidDate }) as BillPayment;

  it("splits the month into paid and still-due", () => {
    const totals = totalsFor([
      bill({ id: "a", amount: 100 }, [paidIn("a", "2026-09", 100, new Date("2026-09-10"))]),
      bill({ id: "b", amount: 300 }),
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
    const power = bill({ id: "a", amount: 60, isVariableAmount: true }, [paidIn("a", "2026-09", 95, new Date("2026-09-09"))]);
    expect(totalsFor([power]).paid).toBe(95);
  });

  it("forecasts unpaid variable bills from their average", () => {
    const power = computeBillStatus(makeBill({ id: "a", dueDay: 10, amount: 60, isVariableAmount: true }), [], now);
    expect(totalsFor([{ ...power, averagePaidAmount: 110 }]).due).toBe(110);
  });

  it("ignores paused bills", () => {
    expect(totalsFor([bill({ id: "a", amount: 50, isActive: false })]).total).toBe(0);
  });

  it("reports 0% rather than dividing by zero when there is nothing to pay", () => {
    expect(totalsFor([]).paidPct).toBe(0);
  });

  it("leaves out a yearly bill with no payment falling due this month", () => {
    // A yearly subscription settled last October used to keep turning up in
    // every month its period happened to span.
    const duolingo = bill({ id: "d", amount: 80, frequency: "yearly", dueMonth: 9, dueDay: 5 }, [paidIn("d", "2025", 80, new Date("2025-10-05"))]);
    const totals = totalsFor([duolingo]);

    expect(totals.totalCount).toBe(0);
    expect(totals.paid).toBe(0);
    expect(totals.due).toBe(0);
  });

  it("counts this month's rent as paid even though the money went last month", () => {
    // Rent for September, settled on 29 August. September owes it and September
    // has it covered; filing it under August because that is when the money
    // moved leaves September looking unpaid.
    const rent = bill({ id: "r", amount: 500, dueDay: 1 }, [paidIn("r", "2026-09", 500, new Date("2026-08-29"))]);
    const [item] = monthOf([rent]).items;

    expect(item.isPaid).toBe(true);
    expect(item.date).toEqual(new Date(2026, 8, 1)); // filed under September's due date
    expect(item.paidDate).toEqual(new Date("2026-08-29")); // but paid in August
    expect(totalsFor([rent]).paid).toBe(500);
    expect(totalsFor([rent]).due).toBe(0);
  });

  it("does not let last month's own rent leak into this month", () => {
    // Both payments exist: August's on the 4th, September's on the 29th. Each
    // month gets exactly one rent line.
    const rent = bill({ id: "r", amount: 500, dueDay: 1 }, [
      paidIn("r", "2026-08", 500, new Date("2026-08-04")),
      paidIn("r", "2026-09", 500, new Date("2026-08-29")),
    ]);

    expect(monthForecast([rent], now, 0).items).toHaveLength(1);
    expect(monthForecast([rent], new Date("2026-08-15"), 0).items).toHaveLength(1);
    expect(periodTotals(monthForecast([rent], new Date("2026-08-15"), 0)).paid).toBe(500);
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

  it("never claims money has been set aside, because nothing records that", () => {
    // The panel used to read time-elapsed as savings-accrued and announce
    // "€72.73 / €80.00" to someone who had saved nothing at all.
    const fund = sinkingFund(quarterly(new Date("2026-02-01")), new Date("2026-02-01"))!;
    expect(fund).not.toHaveProperty("saved");
    expect(fund).not.toHaveProperty("remaining");
  });

  it("asks for the whole amount spread over the months that are left", () => {
    // 1 Feb, due 1 Apr: two months to go, so €45 a month.
    const fund = sinkingFund(quarterly(new Date("2026-02-01")), new Date("2026-02-01"))!;
    expect(fund.monthsLeft).toBe(2);
    expect(fund.perMonth).toBeCloseTo(45);
    expect(fund.target).toBe(90);
  });

  it("wants all of it this month once the due date is inside it", () => {
    const fund = sinkingFund(quarterly(new Date("2026-04-01")), new Date("2026-04-01"))!;
    expect(fund.monthsLeft).toBe(0);
    expect(fund.perMonth).toBeCloseTo(90);
  });

  it("asks for less per month the further off the payment is", () => {
    const early = sinkingFund(quarterly(new Date("2026-01-02")), new Date("2026-01-02"))!;
    const late = sinkingFund(quarterly(new Date("2026-03-01")), new Date("2026-03-01"))!;
    expect(early.perMonth).toBeLessThan(late.perMonth);
  });

  it("tracks how far through the cycle we are, as time", () => {
    const fresh = sinkingFund(quarterly(new Date("2026-01-02")), new Date("2026-01-02"))!;
    const nearly = sinkingFund(quarterly(new Date("2026-04-01")), new Date("2026-04-01"))!;
    expect(fresh.elapsed).toBeLessThan(0.02);
    expect(nearly.elapsed).toBeCloseTo(1);
  });

  it("names the payment it is saving for", () => {
    const fund = sinkingFund(quarterly(new Date("2026-02-01")), new Date("2026-02-01"))!;
    expect(fund.dueDate).toEqual(new Date(2026, 3, 1));
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

  it("greens every month a single yearly payment covers", () => {
    // The card used to show these blank: it asked whether a payment was filed
    // under each month's own period key, which for a yearly bill is one month
    // in twelve. Paid last October means covered now.
    const duolingo = computeBillStatus(
      makeBill({ frequency: "yearly", dueMonth: 9, dueDay: 5, anchorDate: new Date("2024-01-01"), createdAt: new Date("2024-01-01") }),
      [payment("2025", new Date("2025-10-05"))],
      now,
    );

    const strip = billMonthStrip(duolingo, now); // May – Oct 2026
    expect(strip.slice(0, 5).map((c) => c.status)).toEqual(["paid", "paid", "paid", "paid", "paid"]);
    // October opens the next year, which is not paid — the stretch ends there.
    expect(strip[5].status).toBe("due");
  });

  it("respects a custom window size", () => {
    const netflix = makeBill({ dueDay: 5 });
    const status = computeBillStatus(netflix, [], now);
    expect(billMonthStrip(status, now, 1, 1)).toHaveLength(3);
  });
});

// ─── Paying ahead ────────────────────────────────────────────────────────────

describe("getPeriodOptions", () => {
  const now = new Date("2026-08-15");

  it("offers the current period first, then the ones after it", () => {
    const options = getPeriodOptions(makeBill({ dueDay: 5 }), [], now, 3);
    expect(options.map((o) => o.key)).toEqual(["2026-08", "2026-09", "2026-10"]);
    expect(options.map((o) => o.offset)).toEqual([0, 1, 2]);
  });

  it("steps a whole interval at a time, not a single month", () => {
    const water = makeBill({ intervalCount: 2, anchorDate: new Date("2026-07-01") });
    expect(getPeriodOptions(water, [], now, 3).map((o) => o.key)).toEqual(["2026-07", "2026-09", "2026-11"]);
  });

  it("flags periods that already have a payment", () => {
    const options = getPeriodOptions(makeBill(), [payment("2026-09", new Date("2026-08-20"))], now, 3);
    expect(options.map((o) => o.isPaid)).toEqual([false, true, false]);
  });

  it("carries each period's own due date", () => {
    const options = getPeriodOptions(makeBill({ dueDay: 5 }), [], now, 2);
    expect(options[1].dueDate).toEqual(new Date(2026, 8, 5));
  });

  it("spans the whole bucket for multi-month intervals", () => {
    const water = makeBill({ intervalCount: 2, anchorDate: new Date("2026-07-01") });
    const [first] = getPeriodOptions(water, [], now, 1);
    expect(first.start).toEqual(new Date(2026, 6, 1));
    expect(first.end.getMonth()).toBe(7); // August — the second half of the bucket
  });

  it("offers periods before this one when asked, for recording a past payment", () => {
    const options = getPeriodOptions(makeBill({ dueDay: 5 }), [], now, 2, 2);
    expect(options.map((o) => o.key)).toEqual(["2026-06", "2026-07", "2026-08", "2026-09"]);
    expect(options.map((o) => o.offset)).toEqual([-2, -1, 0, 1]);
  });

  it("reaches last year for a yearly bill, so October 2025 can be filed as 2025", () => {
    // The bug this fixes: with no way back, a payment made in October 2025 was
    // recorded against 2026 and the bill then advertised its next payment for
    // 2027 — a year later than the truth.
    const duolingo = makeBill({ frequency: "yearly", dueMonth: 9, dueDay: 5 });
    const options = getPeriodOptions(duolingo, [], now, 2, 1);

    expect(options.map((o) => o.key)).toEqual(["2025", "2026", "2027"]);

    const [lastYear] = options;
    const paidDate = new Date("2025-10-05");
    expect(paidDate >= lastYear.start && paidDate <= lastYear.end).toBe(true);

    // Filed correctly, next year is the one that comes round.
    const status = computeBillStatus(duolingo, [payment("2025", paidDate)], now);
    expect(status.nextDueDate?.getFullYear()).toBe(2026);
  });

  it("keeps `back` at zero by default, so existing callers are unaffected", () => {
    expect(getPeriodOptions(makeBill({ dueDay: 5 }), [], now, 3).map((o) => o.offset)).toEqual([0, 1, 2]);
  });
});


describe("coveredPeriodCount", () => {
  const now = new Date("2026-08-15");

  it("is zero while this period is unpaid, even with a later one settled", () => {
    expect(coveredPeriodCount(makeBill(), [payment("2026-09", new Date("2026-08-20"))], now)).toBe(0);
  });

  it("counts the unbroken run of settled periods", () => {
    const payments = [payment("2026-08", new Date("2026-08-01")), payment("2026-09", new Date("2026-08-02"))];
    expect(coveredPeriodCount(makeBill(), payments, now)).toBe(2);
  });

  it("stops at a gap", () => {
    const payments = [payment("2026-08", new Date("2026-08-01")), payment("2026-10", new Date("2026-08-02"))];
    expect(coveredPeriodCount(makeBill(), payments, now)).toBe(1);
  });

  it("ignores payments belonging to another bill", () => {
    const other = { ...payment("2026-08", new Date("2026-08-01")), billId: "b2" };
    expect(coveredPeriodCount(makeBill(), [other], now)).toBe(0);
  });
});

describe("computeBillStatus — paid ahead", () => {
  const now = new Date("2026-08-15");

  it("points next due past every period already covered", () => {
    const payments = [payment("2026-08", new Date("2026-08-01")), payment("2026-09", new Date("2026-08-02"))];
    const status = computeBillStatus(makeBill({ dueDay: 5 }), payments, now);

    expect(status.paidAheadCount).toBe(1);
    expect(status.nextDueDate).toEqual(new Date(2026, 9, 5)); // October, not September
  });

  it("leaves an ordinary paid bill pointing at the very next period", () => {
    const status = computeBillStatus(makeBill({ dueDay: 5 }), [payment("2026-08", new Date("2026-08-01"))], now);
    expect(status.paidAheadCount).toBe(0);
    expect(status.nextDueDate).toEqual(new Date(2026, 8, 5));
  });

  it("paints every prepaid month on the strip", () => {
    const payments = [payment("2026-08", new Date("2026-08-01")), payment("2026-09", new Date("2026-08-02"))];
    const strip = billMonthStrip(computeBillStatus(makeBill({ dueDay: 5 }), payments, now), now);

    expect(strip.find((c) => c.start.getMonth() === 8)!.status).toBe("paid"); // Sep, settled early
    expect(strip.find((c) => c.start.getMonth() === 9)!.status).toBe("due"); // Oct is what's left
  });
});

// ─── Next month's forecast ───────────────────────────────────────────────────

describe("monthForecast", () => {
  const now = new Date("2026-08-15");
  const status = (bill: Bill, payments: BillPayment[] = []) => computeBillStatus(bill, payments, now);

  it("splits fixed from variable and totals the two", () => {
    const rent = status(makeBill({ id: "b1", name: "Rent", amount: 500, dueDay: 1 }));
    const power = status(makeBill({ id: "b2", name: "Power", amount: 100, dueDay: 20, isVariableAmount: true }));

    const forecast = monthForecast([rent, power], now);
    expect(forecast.fixed).toBe(500);
    expect(forecast.variable).toBe(100);
    expect(forecast.total).toBe(600);
    expect(forecast.fixedCount).toBe(1);
    expect(forecast.variableCount).toBe(1);
  });

  it("looks at next month, not this one", () => {
    const forecast = monthForecast([status(makeBill({ dueDay: 1 }))], now);
    expect(forecast.monthStart).toEqual(new Date(2026, 8, 1));
  });

  it("estimates variable bills from real payments rather than the stored figure", () => {
    const payments = [{ ...payment("2026-06", new Date("2026-06-20")), billId: "b1", amount: 130 }, { ...payment("2026-07", new Date("2026-07-20")), billId: "b1", amount: 110 }];
    const power = status(makeBill({ amount: 40, dueDay: 20, isVariableAmount: true }), payments);

    expect(monthForecast([power], now).variable).toBe(120); // the average, not the €40 estimate
  });

  it("moves a prepaid bill out of the total, counting what was actually paid", () => {
    const paid = { ...payment("2026-09", new Date("2026-08-14")), amount: 480 };
    const rent = status(makeBill({ amount: 500, dueDay: 1 }), [paid]);
    const forecast = monthForecast([rent], now);

    expect(forecast.total).toBe(0);
    expect(forecast.prepaid).toBe(480); // the receipt, not the €500 estimate
    expect(forecast.prepaidCount).toBe(1);
  });

  it("skips a bill whose cycle doesn't land next month", () => {
    // Every 2 months anchored to July → July, September, November…
    const water = status(makeBill({ amount: 80, dueDay: 10, intervalCount: 2, anchorDate: new Date("2026-06-01") }));
    expect(monthForecast([water], now).total).toBe(0); // June/August cycle — nothing in September
  });

  it("counts a quarterly bill in full in the month it lands", () => {
    const gym = status(makeBill({ amount: 180, dueDay: 10, intervalCount: 3, anchorDate: new Date("2026-06-01") }));
    expect(monthForecast([gym], now).fixed).toBe(180); // Jun/Sep/Dec — the whole thing, not a third
  });

  it("counts every occurrence of a weekly bill", () => {
    const cleaner = status(makeBill({ amount: 25, frequency: "weekly", dueDay: 3, anchorDate: new Date("2026-08-03") }));
    const forecast = monthForecast([cleaner], now);

    expect(forecast.fixedCount).toBeGreaterThanOrEqual(4); // September holds 4–5 Wednesdays
    expect(forecast.fixed).toBe(forecast.fixedCount * 25);
  });

  it("ignores paused bills", () => {
    const paused = status(makeBill({ amount: 500, dueDay: 1, isActive: false }));
    expect(monthForecast([paused], now).total).toBe(0);
  });

  it("still counts a bill with no due day set", () => {
    const vague = status(makeBill({ amount: 60, dueDay: undefined }));
    expect(monthForecast([vague], now).fixed).toBe(60);
  });
});

describe("monthForecast — breakdown items", () => {
  const now = new Date("2026-08-15");
  const status = (bill: Bill, payments: BillPayment[] = []) => computeBillStatus(bill, payments, now);

  it("lists one item per occurrence, earliest first", () => {
    const rent = status(makeBill({ id: "b1", name: "Rent", amount: 500, dueDay: 1 }));
    const power = status(makeBill({ id: "b2", name: "Power", amount: 100, dueDay: 20, isVariableAmount: true }));

    const items = monthForecast([power, rent], now).items;
    expect(items.map((i) => i.bill.name)).toEqual(["Rent", "Power"]);
    expect(items[0].date).toEqual(new Date(2026, 8, 1));
  });

  it("reports what was actually paid for a settled occurrence, not the estimate", () => {
    const paid = { ...payment("2026-09", new Date("2026-08-14")), amount: 480 };
    const [item] = monthForecast([status(makeBill({ amount: 500, dueDay: 1 }), [paid])], now).items;

    expect(item.isPaid).toBe(true);
    expect(item.amount).toBe(480);
  });

  it("keeps the items consistent with the totals", () => {
    const rent = status(makeBill({ id: "b1", amount: 500, dueDay: 1 }));
    const power = status(makeBill({ id: "b2", amount: 100, dueDay: 20, isVariableAmount: true }));
    const forecast = monthForecast([rent, power], now);

    const summed = forecast.items.filter((i) => !i.isPaid).reduce((s, i) => s + i.amount, 0);
    expect(summed).toBe(forecast.total);
    expect(forecast.items).toHaveLength(forecast.fixedCount + forecast.variableCount + forecast.prepaidCount);
  });
});

// ─── Arrears ─────────────────────────────────────────────────────────────────

describe("arrears", () => {
  const now = new Date("2026-08-15");
  const status = (bill: Bill, payments: BillPayment[] = []) => computeBillStatus(bill, payments, now);

  it("is empty when every past period was paid", () => {
    const netflix = makeBill({ dueDay: 5, anchorDate: new Date("2026-06-01") });
    const payments = [payment("2026-06", new Date("2026-06-05")), payment("2026-07", new Date("2026-07-05")), payment("2026-08", new Date("2026-08-05"))];
    expect(arrears([status(netflix, payments)], now)).toEqual([]);
  });

  it("lists skipped months oldest first", () => {
    const netflix = makeBill({ amount: 15, dueDay: 5, anchorDate: new Date("2026-05-01") });
    const owed = arrears([status(netflix, [payment("2026-07", new Date("2026-07-05"))])], now);

    expect(owed.map((i) => i.periodKey)).toEqual(["2026-05", "2026-06", "2026-08"]);
    expect(owed.every((i) => !i.isPaid)).toBe(true);
  });

  it("never reaches back past the bill's own start", () => {
    const fresh = makeBill({ dueDay: 5, anchorDate: new Date("2026-07-01"), createdAt: new Date("2026-07-01") });
    expect(arrears([status(fresh)], now).map((i) => i.periodKey)).toEqual(["2026-07", "2026-08"]);
  });

  it("leaves a bill still inside its grace window alone", () => {
    // Due on the 5th with 30 days of grace — late in no meaningful sense yet.
    const power = makeBill({ dueDay: 5, graceDays: 30, anchorDate: new Date("2026-08-01") });
    expect(arrears([status(power)], now)).toEqual([]);
  });

  it("counts a hard-deadline bill the moment its day passes", () => {
    const netflix = makeBill({ dueDay: 5, anchorDate: new Date("2026-08-01") });
    expect(arrears([status(netflix)], now).map((i) => i.periodKey)).toEqual(["2026-08"]);
  });

  it("ignores paused bills", () => {
    const paused = makeBill({ dueDay: 5, isActive: false, anchorDate: new Date("2026-05-01") });
    expect(arrears([status(paused)], now)).toEqual([]);
  });

  it("leaves a period alone until its date has actually passed", () => {
    const payments = [{ ...payment("2026-06", new Date("2026-06-20")), amount: 130 }, { ...payment("2026-07", new Date("2026-07-20")), amount: 110 }];
    const power = makeBill({ amount: 40, dueDay: 20, isVariableAmount: true, anchorDate: new Date("2026-06-01") });

    // August's 20th is still ahead of the 15th — nothing is late yet.
    expect(arrears([status(power, payments)], now)).toHaveLength(0);
  });

  it("owes the recent average for a variable bill, not its stale estimate", () => {
    const payments = [{ ...payment("2026-06", new Date("2026-06-20")), amount: 130 }, { ...payment("2026-07", new Date("2026-07-20")), amount: 110 }];
    const power = makeBill({ amount: 40, dueDay: 1, isVariableAmount: true, anchorDate: new Date("2026-06-01") });
    const owed = arrears([status(power, payments)], now);

    expect(owed.map((i) => i.periodKey)).toEqual(["2026-08"]); // the 1st has passed
    expect(owed[0].amount).toBe(120); // the average, not €40
  });

  it("respects the lookback bound", () => {
    const old = makeBill({ dueDay: 5, anchorDate: new Date("2020-01-01"), createdAt: new Date("2020-01-01") });
    expect(arrears([status(old)], now, 3)).toHaveLength(4); // the current period plus 3 back
  });
});

// ─── Coverage ────────────────────────────────────────────────────────────────

describe("billCoverage", () => {
  const now = new Date("2026-09-01");

  const withPayments = (overrides: Partial<Bill>, payments: BillPayment[] = []) => computeBillStatus(makeBill(overrides), payments, now);
  const paidIn = (billId: string, periodKey: string, amount: number, paidDate: Date): BillPayment =>
    ({ id: `p-${periodKey}`, userId: "u1", billId, periodKey, amount, paidDate, createdAt: paidDate }) as BillPayment;

  const at = (cells: MonthCell[], year: number, month: number) => cells.find((c) => c.year === year && c.month === month)!;

  it("paints a yearly payment across the whole year it bought", () => {
    // The point of the whole thing: paid 5 October 2025, so October 2025 through
    // September 2026 are covered, and October 2026 opens the next stretch.
    const duolingo = withPayments({ id: "d", frequency: "yearly", dueMonth: 9, dueDay: 5, anchorDate: new Date("2024-01-01"), createdAt: new Date("2024-01-01") }, [
      paidIn("d", "2025", 80, new Date("2025-10-05")),
    ]);
    const cells = billCoverage(duolingo, [2025, 2026], now);

    expect(at(cells, 2025, 9).status).toBe("paid"); // October 2025
    expect(at(cells, 2025, 11).status).toBe("paid"); // December 2025
    expect(at(cells, 2026, 0).status).toBe("paid"); // January 2026
    expect(at(cells, 2026, 8).status).toBe("paid"); // September 2026 — still covered
    expect(at(cells, 2026, 9).status).not.toBe("paid"); // October 2026 — next one
  });

  it("marks only the month a stretch begins in", () => {
    const duolingo = withPayments({ id: "d", frequency: "yearly", dueMonth: 9, dueDay: 5, anchorDate: new Date("2024-01-01"), createdAt: new Date("2024-01-01") }, [
      paidIn("d", "2025", 80, new Date("2025-10-05")),
    ]);
    const cells = billCoverage(duolingo, [2025, 2026], now);

    expect(at(cells, 2025, 9).isPeriodStart).toBe(true);
    expect(at(cells, 2026, 8).isPeriodStart).toBe(false);
    expect(at(cells, 2026, 9).isPeriodStart).toBe(true);
  });

  it("puts a boundary month with the period that opens in it", () => {
    // October 2026 holds the tail of the 2025 stretch (to the 4th) and the head
    // of 2026. It belongs to 2026 — it is the month you pay.
    const duolingo = withPayments({ id: "d", frequency: "yearly", dueMonth: 9, dueDay: 5, anchorDate: new Date("2024-01-01"), createdAt: new Date("2024-01-01") });
    expect(at(billCoverage(duolingo, [2026], now), 2026, 9).periodKey).toBe("2026");
  });

  it("gives a monthly bill one period per month", () => {
    const netflix = withPayments({ id: "n", dueDay: 22, anchorDate: new Date("2026-01-01"), createdAt: new Date("2026-01-01") }, [paidIn("n", "2026-03", 13, new Date("2026-03-22"))]);
    const cells = billCoverage(netflix, [2026], now);

    expect(at(cells, 2026, 3).periodKey).toBe("2026-04");
    expect(at(cells, 2026, 2).status).toBe("paid"); // March, the one settled
    expect(at(cells, 2026, 3).status).toBe("overdue"); // April, never paid
    expect(cells.filter((c) => c.year === 2026).every((c) => c.isPeriodStart)).toBe(true);
  });

  it("spreads a quarterly payment over its three months", () => {
    const water = withPayments({ id: "w", dueDay: 10, intervalCount: 3, anchorDate: new Date("2026-01-01"), createdAt: new Date("2026-01-01") }, [
      paidIn("w", "2026-01", 45, new Date("2026-01-10")),
    ]);
    const cells = billCoverage(water, [2026], now);

    expect([at(cells, 2026, 0).status, at(cells, 2026, 1).status, at(cells, 2026, 2).status]).toEqual(["paid", "paid", "paid"]);
    expect(at(cells, 2026, 0).isPeriodStart).toBe(true);
    expect(at(cells, 2026, 1).isPeriodStart).toBe(false);
    expect(at(cells, 2026, 3).status).toBe("overdue"); // April opens an unpaid quarter
  });

  it("holds a bill inside its grace period back from looking late", () => {
    const power = withPayments({ id: "p", dueDay: 20, graceDays: 25, anchorDate: new Date("2026-01-01"), createdAt: new Date("2026-01-01") });
    // 20 August plus 25 days runs to 14 September, so on 1 September it is
    // still payable rather than overdue.
    expect(at(billCoverage(power, [2026], now), 2026, 7).status).toBe("due");
  });

  it("carries the payment behind a covered month, so any square opens it", () => {
    const duolingo = withPayments({ id: "d", frequency: "yearly", dueMonth: 9, dueDay: 5, anchorDate: new Date("2024-01-01"), createdAt: new Date("2024-01-01") }, [
      paidIn("d", "2025", 80, new Date("2025-10-05")),
    ]);
    const march = at(billCoverage(duolingo, [2026], now), 2026, 2);

    expect(march.payment?.paidDate).toEqual(new Date("2025-10-05"));
    expect(march.amount).toBe(80);
  });

  it("greens a payment recorded for a period older than the bill itself", () => {
    // Adding the subscription this year and then filing the October 2025
    // payment you actually made is the ordinary case, not an edge one: a
    // "nothing before the bill existed" rule that ignored it left every month
    // that payment covers looking blank.
    const duolingo = withPayments(
      { id: "d", frequency: "yearly", dueMonth: 9, dueDay: 5, anchorDate: new Date("2026-02-01"), createdAt: new Date("2026-02-01") },
      [paidIn("d", "2025", 80, new Date("2025-10-05"))],
    );
    const cells = billCoverage(duolingo, [2025, 2026], now);

    expect(at(cells, 2025, 9).status).toBe("paid"); // October 2025
    expect(at(cells, 2026, 5).status).toBe("paid"); // June 2026, still covered
    expect(at(cells, 2026, 8).status).toBe("paid"); // September 2026
    expect(at(cells, 2026, 9).status).not.toBe("paid"); // October 2026 opens the next
  });

  it("still invents no debt for unpaid months before the bill existed", () => {
    const fresh = withPayments({ id: "f", dueDay: 5, anchorDate: new Date("2026-06-01"), createdAt: new Date("2026-06-01") });
    expect(at(billCoverage(fresh, [2026], now), 2026, 1).status).toBe("none"); // February
  });

  it("offers nothing for a weekly bill, which cannot fit one square a month", () => {
    const weekly = withPayments({ id: "wk", frequency: "weekly", anchorDate: new Date("2026-01-01"), createdAt: new Date("2026-01-01") });
    expect(billCoverage(weekly, [2026], now).every((c) => c.status === "none")).toBe(true);
  });

  it("lays out the bill's own years, bounded to something scrollable", () => {
    // A bill added this year still reaches back: it may well have been paid
    // last October, and filing that is the point of the calendar.
    const young = withPayments({ id: "y", dueDay: 1, anchorDate: new Date("2026-03-01"), createdAt: new Date("2026-03-01") });
    expect(billCoverageYears(young, now)).toEqual([2024, 2025, 2026, 2027]);

    const old = withPayments({ id: "o", dueDay: 1, anchorDate: new Date("2010-01-01"), createdAt: new Date("2010-01-01") });
    expect(billCoverageYears(old, now)).toEqual([2023, 2024, 2025, 2026, 2027]);
  });
});

// ─── Instalments ─────────────────────────────────────────────────────────────

describe("instalments", () => {
  const now = new Date("2026-11-15");

  const gym = (payments: BillPayment[] = []) =>
    computeBillStatus(
      makeBill({
        id: "gym",
        name: "Γυμναστήριο",
        amount: 360,
        frequency: "yearly",
        dueMonth: 9,
        dueDay: 5,
        installmentCount: 3,
        anchorDate: new Date("2026-01-01"),
        createdAt: new Date("2026-01-01"),
      }),
      payments,
      now,
    );

  const paid = (index: number, amount: number, paidDate: Date): BillPayment =>
    ({ id: `p${index}`, userId: "u1", billId: "gym", periodKey: "2026", installmentIndex: index, amount, paidDate, createdAt: paidDate }) as BillPayment;

  it("splits the total evenly, with the last part carrying the rounding", () => {
    const odd = { installmentCount: 3 };
    expect([0, 1, 2].map((i) => installmentAmount(odd, 100, i))).toEqual([33.33, 33.33, 33.34]);
    expect([0, 1, 2].map((i) => installmentAmount(odd, 360, i))).toEqual([120, 120, 120]);
  });

  it("charges one a month from the due date", () => {
    expect(installmentDueDates({ installmentCount: 3 }, new Date(2026, 9, 5))).toEqual([new Date(2026, 9, 5), new Date(2026, 10, 5), new Date(2026, 11, 5)]);
  });

  it("keeps a single-payment bill exactly as it was", () => {
    expect(installmentDueDates({}, new Date(2026, 9, 5))).toEqual([new Date(2026, 9, 5)]);
    expect(installmentAmount({}, 360, 0)).toBe(360);
  });

  it("is not settled until every part is in", () => {
    expect(gym().isPaidThisPeriod).toBe(false);
    expect(gym([paid(0, 120, new Date(2026, 9, 5))]).isPaidThisPeriod).toBe(false);
    expect(gym([paid(0, 120, new Date(2026, 9, 5)), paid(1, 120, new Date(2026, 10, 5))]).isPaidThisPeriod).toBe(false);

    const all = gym([paid(0, 120, new Date(2026, 9, 5)), paid(1, 120, new Date(2026, 10, 5)), paid(2, 120, new Date(2026, 11, 5))]);
    expect(all.isPaidThisPeriod).toBe(true);
    expect(all.nextInstallmentIndex).toBeUndefined();
  });

  it("points at the next instalment's own date, not next year's", () => {
    // The trap: after paying the first part the bill still owes money *this*
    // month. Rolling to the next period would hide a debt due in three weeks.
    const partly = gym([paid(0, 120, new Date(2026, 9, 5))]);

    expect(partly.nextInstallmentIndex).toBe(1);
    expect(partly.nextDueDate).toEqual(new Date(2026, 10, 5));
    expect(partly.installmentsPaid).toBe(1);
    expect(partly.outstandingAmount).toBe(240);
  });

  it("counts what is left over after an unusual part payment", () => {
    expect(gym([paid(0, 150, new Date(2026, 9, 5))]).outstandingAmount).toBe(210);
  });

  it("does not treat a part-paid year as covered when looking ahead", () => {
    expect(gym([paid(0, 120, new Date(2026, 9, 5))]).paidAheadCount).toBe(0);
  });

  it("keeps the year green from the first instalment, and marks the payment months", () => {
    const cells = billCoverage(gym([paid(0, 120, new Date(2026, 9, 5))]), [2026, 2027], now);
    const at = (year: number, month: number) => cells.find((c) => c.year === year && c.month === month)!;

    // Covered — you are a member — but still owing, so not plain "paid".
    expect(at(2026, 9).status).toBe("partial");
    expect(at(2027, 5).status).toBe("partial");

    expect(at(2026, 9).installment).toMatchObject({ index: 0, count: 3, amount: 120, paid: true });
    expect(at(2026, 10).installment).toMatchObject({ index: 1, paid: false });
    expect(at(2026, 11).installment).toMatchObject({ index: 2, paid: false });
    // The other nine months are covered but nothing changes hands in them.
    expect(at(2027, 5).installment).toBeUndefined();
  });

  it("marks no instalments at all on an ordinary bill", () => {
    const netflix = computeBillStatus(makeBill({ id: "n", dueDay: 22, anchorDate: new Date("2026-01-01"), createdAt: new Date("2026-01-01") }), [], now);
    expect(billCoverage(netflix, [2026], now).every((c) => c.installment === undefined)).toBe(true);
  });
});

describe("instalment spacing", () => {
  it("spaces them by the months given, not always monthly", () => {
    const quarterly = { installmentCount: 4, installmentIntervalMonths: 3 };
    expect(installmentDueDates(quarterly, new Date(2026, 0, 15))).toEqual([
      new Date(2026, 0, 15),
      new Date(2026, 3, 15),
      new Date(2026, 6, 15),
      new Date(2026, 9, 15),
    ]);
  });

  it("still defaults to one a month", () => {
    expect(installmentDueDates({ installmentCount: 2 }, new Date(2026, 0, 15))).toEqual([new Date(2026, 0, 15), new Date(2026, 1, 15)]);
  });

  it("offers only spacings the period can hold", () => {
    // Otherwise the last instalment lands inside the following period, and the
    // two start fighting over the same month on the calendar.
    const yearly = { frequency: "yearly" as const, intervalCount: 1 };
    expect(installmentIntervalOptions({ ...yearly, installmentCount: 4 })).toEqual([1, 2, 3]);
    // Three every six months would put the last one in the next year, so 6 goes.
    expect(installmentIntervalOptions({ ...yearly, installmentCount: 3 })).toEqual([1, 2, 3, 4]);
    expect(installmentIntervalOptions({ ...yearly, installmentCount: 2 })).toEqual([1, 2, 3, 4, 6]);
    expect(installmentIntervalOptions({ ...yearly, installmentCount: 1 })).toEqual([1]);
    expect(installmentIntervalOptions({ frequency: "monthly", intervalCount: 6, installmentCount: 3 })).toEqual([1, 2]);
  });

  it("keeps a quarterly plan inside its own year on the calendar", () => {
    const insurance = computeBillStatus(
      makeBill({
        id: "ins",
        amount: 400,
        frequency: "yearly",
        dueMonth: 0,
        dueDay: 15,
        installmentCount: 4,
        installmentIntervalMonths: 3,
        anchorDate: new Date("2026-01-01"),
        createdAt: new Date("2026-01-01"),
      }),
      [],
      new Date("2026-02-01"),
    );

    const cells = billCoverage(insurance, [2026], new Date("2026-02-01"));
    expect(cells.filter((c) => c.installment).map((c) => c.month)).toEqual([0, 3, 6, 9]);
    expect(cells.find((c) => c.month === 0)!.installment).toMatchObject({ index: 0, count: 4, amount: 100 });
  });
});
