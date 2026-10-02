import { describe, it, expect } from "vitest";
import {
  amountDueNext,
  arrears,
  averagePaidAmount,
  cashRunway,
  computeBillStatus,
  expectedAmount,
  monthForecast,
  outstandingTotal,
  overdueBills,
  paidThisPeriod,
  sinkingFund,
  yearAhead,
  yearlyBreakdown,
} from "./billsUtils";
import { attentionItems } from "../overview/overviewTabs";
import { billOccurrences, buildPlan } from "../plannerPage/plannerUtils";
import type { Bill, BillPayment, BillWithStatus } from "../../shared/types/IndexTypes";

// Bills paid in parts, and bills switched off, in every total they appear in.
//
// The case that started it: a gym year of €360 taken as three €120 payments,
// October to December. With the first €120 paid, the runway and the overview
// still asked for €360, November's forecast said nothing at all, two missed
// instalments made no arrears, and a variable bill in three parts (ENFIA)
// averaged to a third of its year. Beside it, the list's "still to pay" heading
// was counting a stopped and a paused bill that nothing else counted.
//
// Every figure is checked a second way: against the planner, which splits
// instalments on its own; against the sum of the rows it heads; or by hand.
// Dates are built locally, so this holds under any time zone.

const makeBill = (overrides: Partial<Bill> = {}): Bill =>
  ({
    id: "b1",
    userId: "u1",
    name: "Bill",
    amount: 15,
    categoryId: "c1",
    frequency: "monthly",
    isActive: true,
    anchorDate: new Date(2026, 0, 1),
    createdAt: new Date(2026, 0, 1),
    updatedAt: new Date(2026, 0, 1),
    ...overrides,
  }) as Bill;

/** €360 a year, due 5 October, in three monthly parts: 5 Oct, 5 Nov, 5 Dec. */
const GYM: Partial<Bill> = { id: "gym", name: "Γυμναστήριο", amount: 360, frequency: "yearly", dueMonth: 9, dueDay: 5, installmentCount: 3 };

const part = (billId: string, periodKey: string, index: number, amount: number, paidDate: Date): BillPayment =>
  ({ id: `${billId}-${periodKey}-${index}-${paidDate.getTime()}`, userId: "u1", billId, periodKey, installmentIndex: index, amount, paidDate, createdAt: paidDate }) as BillPayment;

const OCT_PART = part("gym", "2026", 0, 120, new Date(2026, 9, 5));
const NOV_PART = part("gym", "2026", 1, 120, new Date(2026, 10, 5));
const DEC_PART = part("gym", "2026", 2, 120, new Date(2026, 11, 5));

const gym = (payments: BillPayment[], now: Date, extra: Partial<Bill> = {}) => computeBillStatus(makeBill({ ...GYM, ...extra }), payments, now);

/**
 * What the planner charges for one bill, by calendar month — the second route.
 *
 * Over the months the year view shows: this one and the eleven after it. The
 * planner's twelve months run one month further from any day but the 1st —
 * the rest of this month, then twelve whole ones — so the month past the year
 * view is left out rather than compared with nothing.
 */
function plannerByMonth(bill: BillWithStatus, now: Date, horizon = 12): Map<string, number> {
  const plan = buildPlan({ bills: [bill], goals: [], horizon, now });
  const yearViewEnds = new Date(now.getFullYear(), now.getMonth() + 12, 1);
  const byMonth = new Map<string, number>();
  for (const event of plan.events.filter((e) => e.kind === "bill" && e.billId === bill.id && e.date < yearViewEnds)) {
    const key = `${event.date.getFullYear()}-${event.date.getMonth() + 1}`;
    byMonth.set(key, Math.round(((byMonth.get(key) ?? 0) - event.amount) * 100) / 100);
  }
  return byMonth;
}

/** Still to pay per calendar month, over the year view — the same keys as above. */
function forecastByMonth(bills: BillWithStatus[], now: Date): Map<string, number> {
  const byMonth = new Map<string, number>();
  for (const month of yearAhead(bills, now)) {
    const unpaid = Math.round((month.total - month.paid) * 100) / 100;
    if (unpaid > 0) byMonth.set(`${month.start.getFullYear()}-${month.start.getMonth() + 1}`, unpaid);
  }
  return byMonth;
}

const sum = (values: number[]) => Math.round(values.reduce((s, v) => s + v, 0) * 100) / 100;

// ─── The next payment ────────────────────────────────────────────────────────

describe("amountDueNext — what has to be there by the next deadline", () => {
  it("asks for one part, not the year, before anything is paid", () => {
    const status = gym([], new Date(2026, 8, 30));
    expect(status.nextDueDate).toEqual(new Date(2026, 9, 5));
    expect(amountDueNext(status, new Date(2026, 8, 30))).toBe(120);
    // Second route, by hand: a third of the year.
    expect(360 / 3).toBe(120);
  });

  it("asks for November's part once October's is paid", () => {
    const now = new Date(2026, 9, 30);
    const status = gym([OCT_PART], now);
    expect(status.nextDueDate).toEqual(new Date(2026, 10, 5));
    expect(status.outstandingAmount).toBe(240);
    expect(amountDueNext(status, now)).toBe(120);
  });

  it("asks only for the late part while the next is still weeks off", () => {
    // 15 November: November's part is ten days late, December's not due yet.
    const now = new Date(2026, 10, 15);
    expect(amountDueNext(gym([OCT_PART], now), now)).toBe(120);
  });

  it("asks for both parts once two are late, which is all that is left", () => {
    const now = new Date(2026, 11, 15);
    const status = gym([OCT_PART], now);
    expect(amountDueNext(status, now)).toBe(240);
    expect(amountDueNext(status, now)).toBe(status.outstandingAmount);
  });

  it("asks for next year's first part once the year is paid", () => {
    const now = new Date(2026, 11, 15);
    const status = gym([DEC_PART, NOV_PART, OCT_PART], now);
    expect(status.isPaidThisPeriod).toBe(true);
    expect(status.nextDueDate).toEqual(new Date(2027, 9, 5));
    expect(amountDueNext(status, now)).toBe(120);
  });

  it("does not depend on the order the parts were paid in", () => {
    // December's paid early, November's still owed: the next one is November's.
    const now = new Date(2026, 10, 15);
    const early = part("gym", "2026", 2, 120, new Date(2026, 9, 20));
    const a = gym([OCT_PART, early], now);
    const b = gym([early, OCT_PART], now);
    expect(a.nextDueDate).toEqual(new Date(2026, 10, 5));
    expect(amountDueNext(a, now)).toBe(120);
    expect(amountDueNext(b, now)).toBe(amountDueNext(a, now));
    expect(a.outstandingAmount).toBe(120);
  });

  it("never asks for more than the period still owes", () => {
    // €300 handed over for a €120 part: €60 is all that is left.
    const now = new Date(2026, 9, 30);
    const status = gym([part("gym", "2026", 0, 300, new Date(2026, 9, 5))], now);
    expect(status.outstandingAmount).toBe(60);
    expect(amountDueNext(status, now)).toBe(60);
  });

  it("keeps a bill paid in one go at its whole amount", () => {
    const now = new Date(2026, 8, 16);
    const netflix = computeBillStatus(makeBill({ dueDay: 10 }), [], now);
    expect(amountDueNext(netflix, now)).toBe(15);
    expect(amountDueNext(netflix, now)).toBe(expectedAmount(netflix));
    expect(amountDueNext(netflix, now)).toBe(netflix.outstandingAmount);
  });

  it("points a paused year at the first part of the year it comes back", () => {
    const now = new Date(2026, 9, 30);
    const status = gym([], now, { pause: { from: "2026-10", to: "2027-03" } });
    expect(status.outstandingAmount).toBe(0);
    expect(status.nextDueDate).toEqual(new Date(2027, 9, 5));
    expect(amountDueNext(status, now)).toBe(120);
  });

  it("carries the rounding on the last part, across short months", () => {
    // €100 due 31 January in three: 31 Jan, 28 Feb, 31 Mar — €33.33, €33.33, €33.34.
    const bill = { id: "m", amount: 100, frequency: "yearly" as const, dueMonth: 0, dueDay: 31, installmentCount: 3 };
    const paid = [part("m", "2026", 0, 33.33, new Date(2026, 0, 31))];

    const march = computeBillStatus(makeBill(bill), paid, new Date(2026, 2, 1));
    expect(march.nextDueDate).toEqual(new Date(2026, 1, 28));
    expect(amountDueNext(march, new Date(2026, 2, 1))).toBe(33.33);

    // April: February's and March's both late, and together they are exactly
    // what is left — the cent lands on the last part, not lost.
    const april = computeBillStatus(makeBill(bill), paid, new Date(2026, 3, 1));
    expect(amountDueNext(april, new Date(2026, 3, 1))).toBe(66.67);
    expect(april.outstandingAmount).toBe(66.67);
  });
});

// ─── Month by month ──────────────────────────────────────────────────────────

describe("monthForecast — each instalment on its own date", () => {
  it("spreads the year over October, November and December", () => {
    const now = new Date(2026, 8, 15);
    const months = yearAhead([gym([], now)], now);
    const totals = months.map((m) => m.total);

    // Was €360 in October and nothing after it.
    expect(totals.slice(0, 4)).toEqual([0, 120, 120, 120]);
    // Second route: the whole year view adds up to the bill's own amount.
    expect(sum(totals)).toBe(360);
  });

  it("shows November's part after October's is paid", () => {
    const now = new Date(2026, 9, 30);
    const status = gym([OCT_PART], now);

    const october = monthForecast([status], now, 0);
    expect(october.prepaid).toBe(120);
    expect(october.total).toBe(0);
    // Was €0 — October's single payment stood for the whole year.
    expect(monthForecast([status], now, 1).total).toBe(120);
    expect(monthForecast([status], now, 2).total).toBe(120);
  });

  it("agrees with the planner month by month, and with what is left", () => {
    const now = new Date(2026, 9, 30);
    const status = gym([OCT_PART], now);

    const bills = forecastByMonth([status], now);
    const planner = plannerByMonth(status, now);
    expect(bills).toEqual(new Map([["2026-11", 120], ["2026-12", 120]]));
    expect(planner).toEqual(bills);
    // Third route: what the bill says it still owes.
    expect(sum([...bills.values()])).toBe(status.outstandingAmount);
  });

  it("gives the same month whichever month it is looked at from", () => {
    const december = [new Date(2026, 9, 6), new Date(2026, 9, 30), new Date(2026, 10, 1)].map((now) => {
      const offset = 11 - now.getMonth();
      return monthForecast([gym([OCT_PART], now)], now, offset).total;
    });
    expect(december).toEqual([120, 120, 120]);
  });

  it("files each paid part in its own month once the year is paid", () => {
    const now = new Date(2026, 11, 15);
    const status = gym([DEC_PART, NOV_PART, OCT_PART], now);
    const months = [9, 10, 11].map((month) => monthForecast([status], new Date(2026, month, 10), 0));

    expect(months.map((m) => m.prepaid)).toEqual([120, 120, 120]);
    expect(months.map((m) => m.items[0].paidDate)).toEqual([OCT_PART.paidDate, NOV_PART.paidDate, DEC_PART.paidDate]);
    // Second route: the three months hold exactly what was paid for the year.
    expect(sum(months.map((m) => m.prepaid))).toBe(paidThisPeriod(status));
  });

  it("follows a plan past the end of the year into January", () => {
    // Due 20 November, in three: the last part is January's, in next year's bucket.
    const now = new Date(2026, 9, 15);
    const status = computeBillStatus(makeBill({ ...GYM, id: "late-gym", dueMonth: 10, dueDay: 20 }), [], now);

    const bills = forecastByMonth([status], now);
    expect(bills).toEqual(new Map([["2026-11", 120], ["2026-12", 120], ["2027-1", 120]]));
    expect(plannerByMonth(status, now)).toEqual(bills);
    // January's part is the 2026 year's, not 2027's.
    expect(monthForecast([status], now, 3).items.map((i) => i.periodKey)).toEqual(["2026"]);
  });

  it("does not reach back to a year before the bill existed", () => {
    // Added this January: last year's plan, which would have ended in January,
    // never ran, so January owes nothing.
    const now = new Date(2026, 0, 10);
    const added = { ...GYM, id: "late-gym", dueMonth: 10, dueDay: 20, anchorDate: new Date(2026, 0, 5), createdAt: new Date(2026, 0, 5) };
    expect(monthForecast([computeBillStatus(makeBill(added), [], now)], now, 0).items).toEqual([]);

    // Unless it was paid, which is a fact whatever the dates say.
    const paid = [part("late-gym", "2025", 2, 120, new Date(2026, 0, 8))];
    expect(monthForecast([computeBillStatus(makeBill(added), paid, now)], now, 0).prepaid).toBe(120);
  });

  it("lands on the last day of a short month, leap years included", () => {
    const bill = makeBill({ id: "m", amount: 100, frequency: "yearly", dueMonth: 0, dueDay: 31, installmentCount: 3 });
    const now = new Date(2026, 0, 10);
    const status = computeBillStatus(bill, [], now);

    const february = monthForecast([status], now, 1);
    expect(february.items.map((i) => [i.date, i.amount])).toEqual([[new Date(2026, 1, 28), 33.33]]);
    expect(monthForecast([status], now, 2).items.map((i) => i.amount)).toEqual([33.34]);
    expect(billOccurrences(status, now, new Date(2026, 2, 31)).map((o) => [o.date, o.amount])).toEqual([
      [new Date(2026, 0, 31), 33.33],
      [new Date(2026, 1, 28), 33.33],
      [new Date(2026, 2, 31), 33.34],
    ]);

    const leap = new Date(2028, 0, 10);
    expect(monthForecast([computeBillStatus(bill, [], leap)], leap, 1).items.map((i) => i.date)).toEqual([new Date(2028, 1, 29)]);
  });

  it("charges nothing in a paused year, as the planner does", () => {
    const now = new Date(2026, 8, 15);
    const status = gym([], now, { pause: { from: "2026-10", to: "2027-03" } });

    expect(yearAhead([status], now).every((m) => m.total === 0)).toBe(true);
    expect(plannerByMonth(status, now).size).toBe(0);
  });

  it("still shows a part that was paid in a paused year", () => {
    const now = new Date(2026, 9, 30);
    const status = gym([OCT_PART], now, { pause: { from: "2026-10", to: "2027-03" } });

    expect(monthForecast([status], now, 0).prepaid).toBe(120);
    expect(monthForecast([status], now, 1).items).toEqual([]);
  });

  it("charges nothing once a bill has stopped", () => {
    const now = new Date(2026, 8, 15);
    expect(yearAhead([gym([], now, { pause: { from: "2026-09" } })], now).every((m) => m.total === 0)).toBe(true);
  });
});

// ─── Arrears ─────────────────────────────────────────────────────────────────

describe("arrears — instalment by instalment", () => {
  it("lists both late parts, where it used to list none", () => {
    const now = new Date(2026, 11, 15);
    const status = gym([OCT_PART], now);
    const owed = arrears([status], now);

    expect(owed.map((i) => [i.date, i.amount, i.periodKey])).toEqual([
      [new Date(2026, 10, 5), 120, "2026"],
      [new Date(2026, 11, 5), 120, "2026"],
    ]);
    // Second route: what the bill says it still owes.
    expect(sum(owed.map((i) => i.amount))).toBe(status.outstandingAmount);
  });

  it("lists only the part that is actually late", () => {
    const now = new Date(2026, 10, 15);
    expect(arrears([gym([OCT_PART], now)], now).map((i) => i.date)).toEqual([new Date(2026, 10, 5)]);
  });

  it("waits out the grace period part by part", () => {
    const grace = { graceDays: 10 };
    expect(arrears([gym([OCT_PART], new Date(2026, 10, 12), grace)], new Date(2026, 10, 12))).toEqual([]);
    expect(arrears([gym([OCT_PART], new Date(2026, 10, 16), grace)], new Date(2026, 10, 16)).map((i) => i.date)).toEqual([new Date(2026, 10, 5)]);
  });

  it("keeps last year's missed parts after the year turns", () => {
    const now = new Date(2027, 0, 10);
    expect(arrears([gym([OCT_PART], now)], now).map((i) => [i.date, i.periodKey])).toEqual([
      [new Date(2026, 10, 5), "2026"],
      [new Date(2026, 11, 5), "2026"],
    ]);
  });

  it("does not depend on the order the parts were paid in", () => {
    const now = new Date(2026, 11, 15);
    const early = part("gym", "2026", 2, 120, new Date(2026, 9, 20));
    const dates = (payments: BillPayment[]) => arrears([gym(payments, now)], now).map((i) => i.date);
    expect(dates([OCT_PART, early])).toEqual([new Date(2026, 10, 5)]);
    expect(dates([early, OCT_PART])).toEqual(dates([OCT_PART, early]));
  });

  it("has nothing for a paused year", () => {
    const now = new Date(2026, 11, 15);
    expect(arrears([gym([], now, { pause: { from: "2026-10", to: "2027-03" } })], now)).toEqual([]);
  });

  it("counts a payment filed under a part the bill no longer has", () => {
    // Paid as part 2 of 3 back when the bill was split; it is one payment now.
    // Money paid must not turn into money owed.
    const now = new Date(2026, 8, 16);
    const legacy = part("b1", "2026-09", 2, 15, new Date(2026, 8, 12));
    const status = computeBillStatus(makeBill({ dueDay: 10, anchorDate: new Date(2026, 8, 1), createdAt: new Date(2026, 8, 1) }), [legacy], now);

    expect(status.isPaidThisPeriod).toBe(true);
    expect(arrears([status], now)).toEqual([]);
    expect(monthForecast([status], now, 0)).toMatchObject({ total: 0, prepaid: 15 });
  });

  it("keeps an ordinary late bill exactly as it was", () => {
    const now = new Date(2026, 8, 16);
    const netflix = computeBillStatus(makeBill({ dueDay: 10, anchorDate: new Date(2026, 8, 1), createdAt: new Date(2026, 8, 1) }), [], now);
    expect(arrears([netflix], now).map((i) => [i.date, i.amount, i.periodKey])).toEqual([[new Date(2026, 8, 10), 15, "2026-09"]]);
  });
});

// ─── Late total, runway, the overview's list ─────────────────────────────────

describe("the late total, the runway and the overview agree on a part-paid bill", () => {
  it("says €120 late when one part is late", () => {
    const now = new Date(2026, 10, 15);
    const status = gym([OCT_PART], now);

    const late = overdueBills([status], now);
    const runway = cashRunway([status], now);
    const attention = attentionItems([status], [], now);

    // Was €360 in all three.
    expect(late.total).toBe(120);
    expect(runway[0]).toMatchObject({ overdue: true, amount: 120, cumulative: 120 });
    expect(attention.map((i) => [i.id, i.amount, i.late])).toEqual([["gym", 120, true]]);
    // Second route: the arrears walk, part by part.
    expect(sum(arrears([status], now).map((i) => i.amount))).toBe(late.total);
  });

  it("says €240 once both remaining parts are late — all that is left", () => {
    const now = new Date(2026, 11, 15);
    const status = gym([OCT_PART], now);

    expect(overdueBills([status], now).total).toBe(240);
    expect(cashRunway([status], now)[0].amount).toBe(240);
    expect(attentionItems([status], [], now)[0].amount).toBe(240);
    expect(sum(arrears([status], now).map((i) => i.amount))).toBe(status.outstandingAmount);
  });

  it("asks the runway and the overview for the next part while it is coming up", () => {
    // Six days before November's part.
    const now = new Date(2026, 9, 30);
    const status = gym([OCT_PART], now);

    expect(cashRunway([status], now).map((c) => [c.date, c.amount])).toEqual([[new Date(2026, 10, 5), 120]]);
    expect(attentionItems([status], [], now).map((i) => [i.amount, i.late])).toEqual([[120, false]]);
    expect(overdueBills([status], now).total).toBe(0);
  });

  it("adds the late parts to the other late bills, row by row", () => {
    const now = new Date(2026, 10, 15);
    // Netflix added this month, so November is all it can owe — the late list
    // counts earlier unpaid periods too, and this is about the gym's parts.
    const thisMonth = { anchorDate: new Date(2026, 10, 1), createdAt: new Date(2026, 10, 1) };
    const bills = [gym([OCT_PART], now), computeBillStatus(makeBill({ id: "netflix", name: "Netflix", dueDay: 10, ...thisMonth }), [], now)];
    const late = overdueBills(bills, now);

    // The rows the late list shows, added up — and by hand, 120 + 15.
    expect(sum(late.bills.map((b) => amountDueNext(b, now)))).toBe(late.total);
    expect(late.total).toBe(135);
    // The overview's list says the same about the same bills.
    expect(sum(attentionItems(bills, [], now).filter((i) => i.late).map((i) => i.amount))).toBe(late.total);
  });

  it("saves towards one part, not the year", () => {
    const now = new Date(2026, 8, 15);
    const fund = sinkingFund(gym([], now), now)!;
    expect(fund.dueDate).toEqual(new Date(2026, 9, 5));
    expect(fund.target).toBe(120);
    expect(fund.perMonth).toBe(120);
  });

  it("saves towards the same part a year on once it has gone past", () => {
    const now = new Date(2026, 10, 15);
    const fund = sinkingFund(gym([OCT_PART], now), now)!;
    expect(fund.dueDate).toEqual(new Date(2027, 10, 5));
    expect(fund.target).toBe(120);
  });
});

// ─── A variable bill in parts ────────────────────────────────────────────────

describe("averagePaidAmount — a period at a time", () => {
  /** ENFIA-style: variable, due 30 April, in three monthly parts. */
  const ENFIA: Partial<Bill> = {
    id: "enfia",
    name: "ΕΝΦΙΑ",
    amount: 500,
    isVariableAmount: true,
    frequency: "yearly",
    dueMonth: 3,
    dueDay: 30,
    installmentCount: 3,
    anchorDate: new Date(2025, 0, 1),
    createdAt: new Date(2025, 0, 1),
  };
  const year2025 = [
    part("enfia", "2025", 2, 200, new Date(2025, 5, 30)),
    part("enfia", "2025", 1, 200, new Date(2025, 4, 30)),
    part("enfia", "2025", 0, 200, new Date(2025, 3, 30)),
  ];
  const enfia = (payments: BillPayment[], now: Date, extra: Partial<Bill> = {}) => computeBillStatus(makeBill({ ...ENFIA, ...extra }), payments, now);

  it("averages what a year cost, not what one part cost", () => {
    const now = new Date(2026, 0, 15);
    const status = enfia(year2025, now);

    // Was €200 a year and €16.67 a month.
    expect(status.averagePaidAmount).toBe(600);
    expect(expectedAmount(status)).toBe(600);
    expect(status.monthlyEquivalent).toBeCloseTo(50, 10);
    expect(yearlyBreakdown([status], () => "").total).toBeCloseTo(600, 10);
  });

  it("agrees with the planner, part by part", () => {
    const now = new Date(2026, 0, 15);
    const status = enfia(year2025, now);

    const bills = forecastByMonth([status], now);
    expect(bills).toEqual(new Map([["2026-4", 200], ["2026-5", 200], ["2026-6", 200]]));
    expect(plannerByMonth(status, now)).toEqual(bills);
    // Second route: the year view adds up to the average it was built from.
    expect(sum([...bills.values()])).toBe(status.averagePaidAmount);
  });

  it("leaves the year still being paid out of the average", () => {
    // May 2026: April's part of this year paid, May's and June's to come.
    const now = new Date(2026, 4, 10);
    const status = enfia([part("enfia", "2026", 0, 200, new Date(2026, 3, 30)), ...year2025], now);

    // Was €200 as the average and €0 left to pay.
    expect(status.averagePaidAmount).toBe(600);
    expect(status.outstandingAmount).toBe(400);
    expect(amountDueNext(status, now)).toBe(200);
    // This year's months hold exactly what is left of this year; next April's
    // part is next year's and sits in the view too, as it does in the planner.
    const thisYear = [...forecastByMonth([status], now)].filter(([key]) => key.startsWith("2026-"));
    expect(thisYear).toEqual([["2026-5", 200], ["2026-6", 200]]);
    expect(sum(thisYear.map(([, amount]) => amount))).toBe(status.outstandingAmount);
    expect(plannerByMonth(status, now)).toEqual(forecastByMonth([status], now));
  });

  it("keeps to the estimate until a whole year has been paid", () => {
    const now = new Date(2026, 4, 10);
    const status = enfia([part("enfia", "2026", 0, 210, new Date(2026, 3, 30))], now, { anchorDate: new Date(2026, 0, 1), createdAt: new Date(2026, 0, 1) });

    // Was €210 as the average, leaving nothing owed on a year barely begun.
    expect(status.averagePaidAmount).toBeUndefined();
    expect(expectedAmount(status)).toBe(500);
    expect(status.outstandingAmount).toBe(290);
    expect(amountDueNext(status, now)).toBe(166.67);
  });

  it("does not depend on the order the payments come in", () => {
    const shuffled = [year2025[1], year2025[2], year2025[0]];
    expect(averagePaidAmount(shuffled, { installmentCount: 3 })).toBe(600);
    expect(averagePaidAmount(year2025, { installmentCount: 3 })).toBe(600);
  });

  it("looks at the six most recent years", () => {
    // Seven whole years, newest first; the oldest at €3,000 falls outside.
    const payments = Array.from({ length: 7 }, (_, i) => 2025 - i).flatMap((year) =>
      [0, 1, 2].map((index) => part("enfia", String(year), index, year === 2019 ? 1000 : 200, new Date(year, 3 + index, 28))),
    );
    expect(averagePaidAmount(payments, { installmentCount: 3 })).toBe(600);
  });

  it("sums a period's payments for a bill paid in one go", () => {
    // Two payments against one month: that month cost both.
    const split = [part("b1", "2026-03", 0, 30, new Date(2026, 2, 20)), part("b1", "2026-03", 0, 20, new Date(2026, 2, 5)), part("b1", "2026-02", 0, 40, new Date(2026, 1, 5))];
    expect(averagePaidAmount(split)).toBe(45);
  });
});

// ─── The "still to pay" heading ──────────────────────────────────────────────

describe("outstandingTotal — the list's still-to-pay heading", () => {
  const now = new Date(2026, 8, 16);
  // All added this month, so the current period is all any of them can owe.
  // Added in January with nothing paid they would be eight months behind, and
  // those months belong to the late total, not to this heading.
  const thisMonth = { anchorDate: new Date(2026, 8, 1), createdAt: new Date(2026, 8, 1) };
  const netflix = computeBillStatus(makeBill({ id: "netflix", name: "Netflix", dueDay: 10, ...thisMonth }), [], now);
  const stopped = computeBillStatus(makeBill({ id: "flat", amount: 40, dueDay: 10, pause: { from: "2026-08" }, ...thisMonth }), [], now);
  const paused = computeBillStatus(makeBill({ id: "house", amount: 60, dueDay: 10, pause: { from: "2026-09", to: "2026-12" }, ...thisMonth }), [], now);
  const off = computeBillStatus(makeBill({ id: "off", amount: 25, dueDay: 10, isActive: false, ...thisMonth }), [], now);

  it("counts neither a stopped nor a paused bill", () => {
    // Was €115: 15 + 40 + 60.
    expect(outstandingTotal([netflix, stopped, paused])).toBe(15);
  });

  it("agrees with the month and with the late total", () => {
    const bills = [netflix, stopped, paused, off];
    expect(outstandingTotal(bills)).toBe(monthForecast(bills, now, 0).total);
    expect(outstandingTotal(bills)).toBe(overdueBills(bills, now).total);
    // Third route: the rows under the heading, each at what it still owes.
    expect(sum([netflix, stopped, paused].map((b) => b.outstandingAmount))).toBe(15);
  });

  it("leaves out a bill switched off altogether", () => {
    expect(outstandingTotal([netflix, off])).toBe(15);
  });

  it("counts what is left of a part-paid year, and a paid part on the other side", () => {
    const at = new Date(2026, 9, 30);
    const part1 = gym([OCT_PART], at);
    expect(outstandingTotal([part1])).toBe(240);
    expect(paidThisPeriod(part1)).toBe(120);
    // Second route: the year's price, less what was paid against it.
    expect(360 - paidThisPeriod(part1)).toBe(outstandingTotal([part1]));

    const whole = gym([DEC_PART, NOV_PART, OCT_PART], new Date(2026, 11, 15));
    expect(outstandingTotal([whole])).toBe(0);
    expect(paidThisPeriod(whole)).toBe(360);
  });
});
