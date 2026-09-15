import { describe, it, expect } from "vitest";
import {
  arrears,
  billUrgency,
  billsNeedingAttention,
  chargedShare,
  computeBillStatus,
  coverageForMonths,
  currentPause,
  firstUnpausedDue,
  isPausedOn,
  monthForecast,
} from "./billsUtils";
import { billOccurrences, buildPlan } from "../plannerPage/plannerUtils";
import type { Bill, BillPause, BillPayment } from "../../shared/types/IndexTypes";

// A bill that is not charged for a while.
//
// The case that started it: electricity at the holiday house in Edessa, cut off
// every winter, and a flat that was left for good. The worth of the feature is
// that every screen agrees about which months are owed — the list, the badge,
// next month's forecast, the arrears, the calendar, the monthly figure the
// allocation page adds up and the planner. So these walk the same pause through
// each of them, and check the money a second way wherever there is money.

const makeBill = (overrides: Partial<Bill> = {}): Bill =>
  ({
    id: "b1",
    userId: "u1",
    name: "Ρεύμα Εδέσσης",
    amount: 60,
    categoryId: "c1",
    frequency: "monthly",
    dueDay: 5,
    isActive: true,
    anchorDate: new Date(2025, 0, 1),
    createdAt: new Date(2025, 0, 1),
    updatedAt: new Date(2025, 0, 1),
    ...overrides,
  }) as Bill;

const paid = (periodKey: string, paidDate: Date, amount = 60): BillPayment =>
  ({ id: Math.random().toString(), userId: "u1", billId: "b1", periodKey, amount, paidDate, createdAt: paidDate }) as BillPayment;

const WINTER: BillPause = { from: "2026-11", to: "2027-03" };
const EVERY_WINTER: BillPause = { from: "2026-11", to: "2027-03", yearly: true };
const MOVED: BillPause = { from: "2026-09" };

describe("isPausedOn", () => {
  it("covers a one-off stretch, both ends included", () => {
    const bill = makeBill({ pause: WINTER });

    expect(isPausedOn(bill, new Date(2026, 9, 31))).toBe(false);
    expect(isPausedOn(bill, new Date(2026, 10, 1))).toBe(true);
    expect(isPausedOn(bill, new Date(2027, 2, 31))).toBe(true);
    expect(isPausedOn(bill, new Date(2027, 3, 1))).toBe(false);
  });

  it("runs on forever when it does not come back", () => {
    const bill = makeBill({ pause: MOVED });

    expect(isPausedOn(bill, new Date(2026, 7, 20))).toBe(false);
    expect(isPausedOn(bill, new Date(2026, 8, 1))).toBe(true);
    expect(isPausedOn(bill, new Date(2031, 5, 1))).toBe(true);
  });

  it("comes back over the same months every year", () => {
    const bill = makeBill({ pause: EVERY_WINTER });

    expect(isPausedOn(bill, new Date(2027, 0, 5))).toBe(true);
    expect(isPausedOn(bill, new Date(2027, 3, 5))).toBe(false);
    expect(isPausedOn(bill, new Date(2028, 11, 5))).toBe(true);
    expect(isPausedOn(bill, new Date(2029, 2, 5))).toBe(true);
    expect(isPausedOn(bill, new Date(2029, 9, 5))).toBe(false);
  });

  it("never reaches back before it was set, even when yearly", () => {
    // Setting "every winter" in September must not wipe out last winter, which
    // was genuinely owed.
    const bill = makeBill({ pause: EVERY_WINTER });

    expect(isPausedOn(bill, new Date(2026, 0, 5))).toBe(false);
    expect(isPausedOn(bill, new Date(2025, 11, 5))).toBe(false);
  });

  it("reads only the months of a yearly pause, whatever years were typed", () => {
    const typedSameYear = makeBill({ pause: { from: "2026-11", to: "2026-03", yearly: true } });

    expect(isPausedOn(typedSameYear, new Date(2027, 1, 5))).toBe(true);
    expect(isPausedOn(typedSameYear, new Date(2027, 3, 5))).toBe(false);
  });

  it("switches off rather than on when the data cannot be read", () => {
    // A bill wrongly shown as owed can be seen and fixed; one wrongly hidden is
    // a payment missed.
    for (const pause of [{ from: "" }, { from: "garbage" }, { from: "2026-11", to: "2026-13" }, { from: "2027-03", to: "2026-11" }]) {
      expect(isPausedOn(makeBill({ pause }), new Date(2026, 11, 5))).toBe(false);
    }
  });
});

describe("firstUnpausedDue", () => {
  it("lands on the first charged payment after the stretch", () => {
    const bill = makeBill({ pause: WINTER });

    expect(firstUnpausedDue(bill, new Date(2026, 10, 5))).toEqual(new Date(2027, 3, 5));
  });

  it("resumes on the bill's own cycle, not on the next calendar month", () => {
    // Every two months from January: Jan, Mar, May, Jul. Paused March to June, so
    // March and May go, and it comes back in July — not in April.
    const bill = makeBill({ intervalCount: 2, dueDay: 10, pause: { from: "2026-03", to: "2026-06" } });

    expect(firstUnpausedDue(bill, new Date(2026, 2, 10))).toEqual(new Date(2026, 6, 10));
  });

  it("has nothing to return for a bill that never comes back", () => {
    expect(firstUnpausedDue(makeBill({ pause: MOVED }), new Date(2026, 9, 5))).toBeUndefined();
  });

  it("leaves a charged date where it is", () => {
    const due = new Date(2026, 9, 5);
    expect(firstUnpausedDue(makeBill({ pause: WINTER }), due)).toBe(due);
  });
});

describe("chargedShare — the monthly figure", () => {
  it("spreads a yearly winter across the year: €60 becomes €35", () => {
    const bill = makeBill({ pause: EVERY_WINTER });
    const now = new Date(2026, 8, 15);

    expect(chargedShare(bill, now)).toBeCloseTo(7 / 12, 10);

    // Second route, by hand: April to October are charged, seven of them at €60.
    const byHand = [3, 4, 5, 6, 7, 8, 9].length * 60;
    expect(byHand).toBe(420);
    expect(computeBillStatus(bill, [], now).monthlyEquivalent).toBeCloseTo(byHand / 12, 10);
    expect(computeBillStatus(bill, [], now).monthlyEquivalent).toBeCloseTo(35, 10);
  });

  it("gives the same share from any month of the year", () => {
    // Every twelve consecutive months hold each month of the year exactly once.
    const bill = makeBill({ pause: EVERY_WINTER });
    for (let month = 0; month < 12; month++) expect(chargedShare(bill, new Date(2027, month, 10))).toBeCloseTo(7 / 12, 10);
  });

  it("costs nothing once it has stopped for good", () => {
    expect(chargedShare(makeBill({ pause: MOVED }), new Date(2026, 9, 1))).toBe(0);
    expect(computeBillStatus(makeBill({ pause: MOVED }), [], new Date(2026, 9, 1)).monthlyEquivalent).toBe(0);
  });

  it("charges only the months left before a move", () => {
    // Moving in September, asked in July: July and August are still charged.
    expect(chargedShare(makeBill({ pause: MOVED }), new Date(2026, 6, 1))).toBeCloseTo(2 / 12, 10);
  });

  it("counts payments, not months, for a bill every two months", () => {
    // Six payments a year; the one in March falls in the pause.
    const bill = makeBill({ intervalCount: 2, dueDay: 10, pause: { from: "2027-03", to: "2027-03" } });
    expect(chargedShare(bill, new Date(2027, 0, 1))).toBeCloseTo(5 / 6, 10);
  });

  it("is exactly one with no pause, so nothing else moves by a cent", () => {
    const bill = makeBill();
    expect(chargedShare(bill, new Date(2026, 8, 15))).toBe(1);
    expect(computeBillStatus(bill, [], new Date(2026, 8, 15)).monthlyEquivalent).toBe(60);
  });
});

describe("the bill's status", () => {
  it("reads as due on the day it comes back, and owes nothing meanwhile", () => {
    const status = computeBillStatus(makeBill({ pause: WINTER }), [], new Date(2026, 11, 20));

    expect(status.isPaidThisPeriod).toBe(false);
    expect(status.outstandingAmount).toBe(0);
    expect(status.nextDueDate).toEqual(new Date(2027, 3, 5));
  });

  it("stays off the badge while it is off", () => {
    const now = new Date(2026, 11, 20);
    const status = computeBillStatus(makeBill({ pause: WINTER }), [], now);

    expect(billUrgency(status, now)).toBe("later");
    expect(billsNeedingAttention([status], now)).toBe(0);
  });

  it("comes back onto the badge the week it is due again", () => {
    const now = new Date(2027, 2, 31);
    const status = computeBillStatus(makeBill({ pause: WINTER }), [], now);

    expect(status.nextDueDate).toEqual(new Date(2027, 3, 5));
    expect(billUrgency(status, now)).toBe("soon");
  });

  it("has no next payment once it has stopped for good", () => {
    const status = computeBillStatus(makeBill({ pause: MOVED }), [], new Date(2026, 9, 20));

    expect(status.nextDueDate).toBeUndefined();
    expect(status.deadline).toBeUndefined();
    expect(billsNeedingAttention([status], new Date(2026, 9, 20))).toBe(0);
  });

  it("skips ahead when this month is paid and the next is off", () => {
    const now = new Date(2026, 9, 20);
    const status = computeBillStatus(makeBill({ pause: WINTER }), [paid("2026-10", new Date(2026, 9, 4))], now);

    expect(status.isPaidThisPeriod).toBe(true);
    expect(status.nextDueDate).toEqual(new Date(2027, 3, 5));
  });

  it("still owes the month before the pause starts", () => {
    const now = new Date(2026, 9, 20);
    const status = computeBillStatus(makeBill({ pause: WINTER }), [], now);

    expect(status.outstandingAmount).toBe(60);
    expect(status.nextDueDate).toEqual(new Date(2026, 9, 5));
    expect(billUrgency(status, now)).toBe("late");
  });
});

describe("next month's forecast", () => {
  it("leaves out a month the bill is off", () => {
    const now = new Date(2026, 9, 20);
    const status = computeBillStatus(makeBill({ pause: WINTER }), [], now);

    const november = monthForecast([status], now, 1);
    expect(november.items).toHaveLength(0);
    expect(november.total).toBe(0);
  });

  it("keeps one paid anyway, as money that really left", () => {
    const now = new Date(2026, 9, 20);
    const status = computeBillStatus(makeBill({ pause: WINTER }), [paid("2026-11", new Date(2026, 9, 18), 22)], now);

    const november = monthForecast([status], now, 1);
    expect(november.items).toHaveLength(1);
    expect(november.prepaid).toBe(22);
    expect(november.total).toBe(0);
  });
});

describe("arrears", () => {
  it("does not count a winter off as a winter unpaid", () => {
    const now = new Date(2027, 1, 20);
    const status = computeBillStatus(makeBill({ pause: WINTER, createdAt: new Date(2026, 9, 1), anchorDate: new Date(2026, 9, 1) }), [], now);

    // October was owed and is still owed. November to February were not.
    expect(arrears([status], now).map((item) => item.periodKey)).toEqual(["2026-10"]);
  });
});

describe("the calendar", () => {
  it("marks the months off as paused, with nothing to pay", () => {
    const now = new Date(2026, 11, 20);
    const status = computeBillStatus(makeBill({ pause: WINTER }), [paid("2026-10", new Date(2026, 9, 4))], now);

    const cells = coverageForMonths(status, [
      { year: 2026, month: 9 },
      { year: 2026, month: 10 },
      { year: 2027, month: 2 },
      { year: 2027, month: 3 },
    ], now);

    expect(cells.map((cell) => cell.status)).toEqual(["paid", "paused", "paused", "future"]);
    expect(cells[1].amount).toBeUndefined();
    expect(cells[3].amount).toBe(60);
  });

  it("shows a month paid during the pause as paid", () => {
    const now = new Date(2026, 11, 20);
    const status = computeBillStatus(makeBill({ pause: WINTER }), [paid("2026-12", new Date(2026, 11, 3), 14)], now);

    const [december] = coverageForMonths(status, [{ year: 2026, month: 11 }], now);
    expect(december.status).toBe("paid");
    expect(december.amount).toBe(14);
  });
});

describe("the planner", () => {
  it("plans no payments in the months off", () => {
    const now = new Date(2026, 9, 20);
    const status = computeBillStatus(makeBill({ pause: WINTER }), [paid("2026-10", new Date(2026, 9, 4))], now);

    const dates = billOccurrences(status, now, new Date(2027, 5, 30)).map((o) => `${o.date.getFullYear()}-${o.date.getMonth() + 1}`);
    expect(dates).toEqual(["2027-4", "2027-5", "2027-6"]);
  });

  it("says why a bill has nothing in the window, instead of calling it paid", () => {
    const now = new Date(2026, 9, 20);
    const status = computeBillStatus(makeBill({ pause: MOVED }), [], now);

    const plan = buildPlan({ bills: [status], goals: [], salary: undefined, horizon: 3, now });
    expect(plan.rows.find((row) => row.id === "b1")?.note).toBe("paused");
    expect(plan.rows.find((row) => row.id === "b1")?.total).toBe(0);
  });
});

describe("currentPause — what the list says", () => {
  it("names the stretch in progress", () => {
    expect(currentPause(makeBill({ pause: WINTER }), new Date(2027, 0, 10))).toEqual({ state: "paused", from: new Date(2026, 10, 1), to: new Date(2027, 2, 1) });
  });

  it("says a bill has ended, with no return date", () => {
    expect(currentPause(makeBill({ pause: MOVED }), new Date(2026, 9, 10))).toEqual({ state: "ended", from: new Date(2026, 8, 1) });
  });

  it("points a yearly pause at next winter once this one is over", () => {
    expect(currentPause(makeBill({ pause: EVERY_WINTER }), new Date(2027, 5, 10))).toEqual({ state: "upcoming", from: new Date(2027, 10, 1), to: new Date(2028, 2, 1) });
  });

  it("finds this winter from inside it, across the new year", () => {
    expect(currentPause(makeBill({ pause: EVERY_WINTER }), new Date(2028, 1, 10))).toEqual({ state: "paused", from: new Date(2027, 10, 1), to: new Date(2028, 2, 1) });
  });

  it("has nothing to say once a one-off pause is over", () => {
    expect(currentPause(makeBill({ pause: WINTER }), new Date(2027, 6, 1))).toBeUndefined();
  });
});
