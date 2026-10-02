import { describe, it, expect } from "vitest";
import {
  amountDueNext,
  amountOwedNow,
  arrears,
  billOverdue,
  billUrgency,
  billsNeedingAttention,
  cashRunway,
  computeBillStatus,
  daysUntilDeadline,
  earliestDeadline,
  getBillGroup,
  isInGracePeriod,
  outstandingTotal,
  overdueBills,
} from "./billsUtils";
import { attentionItems } from "../overview/overviewTabs";
import type { Bill, BillPayment, BillWithStatus } from "../../shared/types/IndexTypes";

// One meaning of "overdue" (Ληξιπρόθεσμα): every unpaid period or part whose
// deadline has gone — this period's and the earlier ones' alike.
//
// The case that started it, in the owner's words: the water unpaid four bills
// back. Its current period not yet due, the card read a grey "unpaid", the
// late tile and the overview did not count it, and the three periods before
// lived in a separate «Χρωστούμενα» pile only next month's breakdown showed.
//
// Every figure is checked a second way: by hand, from the bill's own price and
// dates; and against every other screen's figure for the same bill — the late
// tile, the overview's list, the arrears walk and the badge must say the same.
// Dates are built locally, so this holds under any time zone.

const WATER: Partial<Bill> = { id: "water", name: "Water", amount: 60, dueDay: 10 };

const makeBill = (overrides: Partial<Bill> = {}): Bill =>
  ({
    id: "b1",
    userId: "u1",
    name: "Bill",
    amount: 15,
    categoryId: "c1",
    frequency: "monthly",
    isActive: true,
    // A year before the 5 October 2026 most of these are read on.
    anchorDate: new Date(2025, 9, 5),
    createdAt: new Date(2025, 9, 5),
    updatedAt: new Date(2025, 9, 5),
    ...overrides,
  }) as Bill;

/** One payment per month key, each on the 8th of its month. */
const paidMonths = (billId: string, keys: string[], amount = 60): BillPayment[] =>
  keys.map((key) => {
    const [y, m] = key.split("-").map(Number);
    return { id: `${billId}-${key}`, userId: "u1", billId, periodKey: key, amount, paidDate: new Date(y, m - 1, 8), createdAt: new Date(y, m - 1, 8) } as BillPayment;
  });

/** Month keys from one month to another, both included (months 0-based). */
const monthKeys = (fromYear: number, fromMonth: number, toYear: number, toMonth: number): string[] => {
  const keys: string[] = [];
  for (let d = new Date(fromYear, fromMonth, 1); d <= new Date(toYear, toMonth, 1); d = new Date(d.getFullYear(), d.getMonth() + 1, 1)) {
    keys.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  }
  return keys;
};

/** October 2025 to June 2026 paid; July, August, September and October 2026 not. */
const KEPT = paidMonths("water", monthKeys(2025, 9, 2026, 5));

const water = (now: Date, payments: BillPayment[] = KEPT, extra: Partial<Bill> = {}) => computeBillStatus(makeBill({ ...WATER, ...extra }), payments, now);

const sum = (values: number[]) => Math.round(values.reduce((s, v) => s + v, 0) * 100) / 100;

/**
 * The same bill as every screen sees it — the late tile, the overview's list,
 * the arrears walk, the badge — so one test can hold them all to one figure.
 */
function screens(bills: BillWithStatus[], now: Date) {
  const tile = overdueBills(bills, now);
  const attention = attentionItems(bills, [], now).filter((i) => i.kind === "bill");
  return {
    tile,
    attentionLate: sum(attention.filter((i) => i.late).map((i) => i.amount)),
    arrears: sum(arrears(bills, now).map((i) => i.amount)),
    perBill: sum(bills.map((b) => billOverdue(b, now).total)),
    badge: billsNeedingAttention(bills, now),
    attention,
  };
}

// ─── The owner's water bill ──────────────────────────────────────────────────

describe("water unpaid four periods back", () => {
  it("is three periods overdue on the 5th — October is not due until the 10th", () => {
    const now = new Date(2026, 9, 5);
    const bill = water(now);
    const overdue = billOverdue(bill, now);

    expect(overdue.items.map((i) => i.periodKey)).toEqual(["2026-07", "2026-08", "2026-09"]);
    expect(overdue.count).toBe(3);
    expect(overdue.total).toBe(180);
    // By hand: three periods at €60.
    expect(3 * 60).toBe(overdue.total);
    expect(overdue.oldestDue).toEqual(new Date(2026, 6, 10));
    // No grace, so the deadline is the due date.
    expect(overdue.oldestDeadline).toEqual(new Date(2026, 6, 10));

    // Was "later": October's deadline is five days off, and nothing else counted.
    expect(billUrgency(bill, now)).toBe("late");
    expect(getBillGroup(bill, now)).toBe("overdue");
  });

  it("says the same €180 on every screen, and the badge counts it", () => {
    const now = new Date(2026, 9, 5);
    const s = screens([water(now)], now);

    expect(s.tile.bills.map((b) => b.id)).toEqual(["water"]);
    expect(s.tile.total).toBe(180);
    expect(s.attentionLate).toBe(180);
    expect(s.arrears).toBe(180);
    expect(s.perBill).toBe(180);
    expect(s.badge).toBe(1);
    // Late since 10 July, by hand: 21 days left of July, 31 of August, 30 of
    // September and 5 of October.
    expect(s.attention[0]).toMatchObject({ id: "water", late: true, days: -(21 + 31 + 30 + 5) });
    expect(daysUntilDeadline(water(now), now)).toBe(-87);
  });

  it("is four periods overdue once the 10th has gone", () => {
    const now = new Date(2026, 9, 11);
    const bill = water(now);
    const s = screens([bill], now);

    expect(billOverdue(bill, now).items.map((i) => i.periodKey)).toEqual(["2026-07", "2026-08", "2026-09", "2026-10"]);
    expect(billOverdue(bill, now).count).toBe(4);
    // By hand: four at €60.
    expect(4 * 60).toBe(240);
    expect(s.tile.total).toBe(240);
    expect(s.attentionLate).toBe(240);
    expect(s.arrears).toBe(240);
    expect(s.badge).toBe(1);
    // Still from July, not from October.
    expect(s.attention[0].days).toBe(-(21 + 31 + 30 + 11));
  });

  it("keeps the still-to-pay heading on the current period, and never counts October twice", () => {
    // On the 5th: October is owed but not late, the three before are late.
    const early = new Date(2026, 9, 5);
    expect(outstandingTotal([water(early)])).toBe(60);
    expect(amountOwedNow(water(early), early)).toBe(180);
    // The runway: €180 needed today, October's €60 by the 10th — €240 in all,
    // which is every unpaid period once. Second route: 4 × 60.
    expect(cashRunway([water(early)], early).map((c) => [c.date, c.amount, c.cumulative, c.overdue])).toEqual([
      [new Date(2026, 9, 5), 180, 180, true],
      [new Date(2026, 9, 10), 60, 240, false],
    ]);
    // One bill, though it sits on two dates.
    expect(cashRunway([water(early)], early).map((c) => c.cumulativeCount)).toEqual([1, 1]);

    // After the 10th October is both current and late. The heading still says
    // €60 — what is left on the current period — and the late figure holds it
    // once: €240, not €300.
    const late = new Date(2026, 9, 11);
    expect(outstandingTotal([water(late)])).toBe(60);
    expect(billOverdue(water(late), late).total).toBe(240);
    expect(amountOwedNow(water(late), late)).toBe(240);
    expect(cashRunway([water(late)], late).map((c) => [c.amount, c.cumulative])).toEqual([[240, 240]]);
  });
});

// ─── Edges ───────────────────────────────────────────────────────────────────

describe("overdue — the edges", () => {
  it("waits out the grace period, period by period", () => {
    // Twenty days of grace: September's 10th has a deadline of the 30th.
    const now = new Date(2026, 8, 25);
    const graced = water(now, KEPT, { graceDays: 20 });
    const strict = water(now);

    // July and August are late; September is still payable.
    expect(billOverdue(graced, now).items.map((i) => i.periodKey)).toEqual(["2026-07", "2026-08"]);
    expect(billOverdue(graced, now).total).toBe(120);
    expect(isInGracePeriod(graced, now)).toBe(true);
    // Late counted from July's deadline, the 30th, not its due date.
    expect(daysUntilDeadline(graced, now)).toBe(-(1 + 31 + 25));
    // What it asks for today takes in September too, since its day has come.
    expect(amountOwedNow(graced, now)).toBe(180);

    // The same bill with no grace: September is late as well.
    expect(billOverdue(strict, now).total).toBe(180);
  });

  it("does not count a month the bill was paused", () => {
    // Off for August: July and September are owed, August was never charged.
    const now = new Date(2026, 9, 5);
    const bill = water(now, KEPT, { pause: { from: "2026-08", to: "2026-08" } });

    expect(billOverdue(bill, now).items.map((i) => i.periodKey)).toEqual(["2026-07", "2026-09"]);
    expect(billOverdue(bill, now).total).toBe(2 * 60);
    expect(overdueBills([bill], now).total).toBe(120);
  });

  it("is still behind while paused, for what was owed before the pause", () => {
    // The holiday house off from October, July to September never paid.
    const now = new Date(2026, 10, 15);
    const bill = water(now, KEPT, { pause: { from: "2026-10", to: "2027-03" } });

    expect(bill.outstandingAmount).toBe(0); // nothing on the current period
    expect(billOverdue(bill, now).total).toBe(180);
    expect(billUrgency(bill, now)).toBe("late");
    expect(billsNeedingAttention([bill], now)).toBe(1);
  });

  it("invents nothing from before the bill was added", () => {
    // Added on 1 August, never paid. The lookback reaches a year back; the
    // bill does not.
    const now = new Date(2026, 9, 5);
    const added = { anchorDate: new Date(2026, 7, 1), createdAt: new Date(2026, 7, 1) };
    const bill = water(now, [], added);

    expect(billOverdue(bill, now).items.map((i) => i.periodKey)).toEqual(["2026-08", "2026-09"]);
    expect(billOverdue(bill, now).total).toBe(120);
  });

  it("crosses the year boundary", () => {
    // Paid to September 2026; October, November and December not.
    const kept = paidMonths("water", monthKeys(2025, 9, 2026, 8));

    const before = new Date(2027, 0, 5);
    expect(billOverdue(water(before, kept), before).items.map((i) => i.periodKey)).toEqual(["2026-10", "2026-11", "2026-12"]);
    expect(billOverdue(water(before, kept), before).total).toBe(180);

    const after = new Date(2027, 0, 11);
    expect(billOverdue(water(after, kept), after).items.map((i) => i.periodKey)).toEqual(["2026-10", "2026-11", "2026-12", "2027-01"]);
    expect(overdueBills([water(after, kept)], after).total).toBe(240);
  });

  it("is overdue even with this period paid", () => {
    // October settled on the 3rd; July to September never were.
    const now = new Date(2026, 9, 5);
    const bill = water(now, [...KEPT, ...paidMonths("water", ["2026-10"])]);
    const s = screens([bill], now);

    expect(bill.isPaidThisPeriod).toBe(true);
    // Was "paid", and in no late figure anywhere.
    expect(billUrgency(bill, now)).toBe("late");
    expect(getBillGroup(bill, now)).toBe("overdue");
    expect(s.tile.total).toBe(180);
    expect(s.attentionLate).toBe(180);
    expect(s.arrears).toBe(180);
    expect(s.badge).toBe(1);
    // Nothing is left on the current period, so the heading counts nothing;
    // what is owed today is the three late ones and no more.
    expect(outstandingTotal([bill])).toBe(0);
    expect(amountOwedNow(bill, now)).toBe(180);
    expect(cashRunway([bill], now).map((c) => [c.amount, c.overdue])).toEqual([[180, true]]);
    expect(earliestDeadline(bill, now)).toEqual(new Date(2026, 6, 10));
  });

  it("leaves a bill with no due day out — nothing without a date can be late", () => {
    // Never paid since it was added a year ago, but with no day to be late by.
    const now = new Date(2026, 9, 5);
    const undated = computeBillStatus(makeBill({ id: "u", amount: 30 }), [], now);

    expect(arrears([undated], now)).toEqual([]);
    expect(billOverdue(undated, now).count).toBe(0);
    expect(billUrgency(undated, now)).toBe("later");
    expect(billsNeedingAttention([undated], now)).toBe(0);
  });
});

// ─── Instalments ─────────────────────────────────────────────────────────────

describe("overdue — a bill paid in parts", () => {
  /** €360 a year due 5 November, in three: 5 Nov, 5 Dec, and 5 Jan of the next year. */
  const GYM: Partial<Bill> = { id: "gym", name: "Gym", amount: 360, frequency: "yearly", dueMonth: 10, dueDay: 5, installmentCount: 3 };
  const part = (periodKey: string, index: number, amount: number, paidDate: Date): BillPayment =>
    ({ id: `gym-${periodKey}-${index}`, userId: "u1", billId: "gym", periodKey, installmentIndex: index, amount, paidDate, createdAt: paidDate }) as BillPayment;
  const gym = (payments: BillPayment[], now: Date) => computeBillStatus(makeBill({ ...GYM, anchorDate: new Date(2026, 0, 1), createdAt: new Date(2026, 0, 1) }), payments, now);

  it("counts a part late from last year's period alongside one late from this year's", () => {
    // 2026's first two parts paid; its last, 5 January 2027, never was. 2027's
    // first part, 5 November 2027, is late too; its second is not due.
    const now = new Date(2027, 10, 20);
    const bill = gym([part("2026", 0, 120, new Date(2026, 10, 5)), part("2026", 1, 120, new Date(2026, 11, 5))], now);
    const overdue = billOverdue(bill, now);

    expect(overdue.items.map((i) => [i.periodKey, i.date])).toEqual([
      ["2026", new Date(2027, 0, 5)],
      ["2027", new Date(2027, 10, 5)],
    ]);
    // By hand: two parts of €120.
    expect(overdue.total).toBe(2 * 120);
    // Was €120: the period it is in, nothing of last year's.
    expect(amountDueNext(bill, now)).toBe(120);

    const s = screens([bill], now);
    expect(s.tile.total).toBe(240);
    expect(s.attentionLate).toBe(240);
    expect(s.arrears).toBe(240);
    expect(s.badge).toBe(1);
    // Late since 5 January — the oldest part, not November's.
    expect(earliestDeadline(bill, now)).toEqual(new Date(2027, 0, 5));
  });

  it("never asks for more than the period still owes", () => {
    // Parts on 5 October, November and December, so all three sit in one
    // year. The first paid at €200, not €120: €160 is left on the year, and two
    // parts late cannot make it €240. Second route: 360 − 200.
    const now = new Date(2026, 11, 20);
    const bill = computeBillStatus(
      makeBill({ ...GYM, dueMonth: 9, anchorDate: new Date(2026, 0, 1), createdAt: new Date(2026, 0, 1) }),
      [part("2026", 0, 200, new Date(2026, 9, 5))],
      now,
    );

    expect(billOverdue(bill, now).items.map((i) => i.amount)).toEqual([120, 40]);
    expect(billOverdue(bill, now).total).toBe(360 - 200);
    expect(billOverdue(bill, now).total).toBe(bill.outstandingAmount);
    // And the same line the period's own figure stops at.
    expect(amountDueNext(bill, now)).toBe(160);
  });
});

// ─── Many bills ──────────────────────────────────────────────────────────────

describe("overdue — a list of bills, every screen adding up", () => {
  it("sums to one figure on the tile, the overview, the walk and the bills themselves", () => {
    const now = new Date(2026, 9, 11);
    const fresh = { anchorDate: new Date(2026, 9, 1), createdAt: new Date(2026, 9, 1) };
    const bills = [
      // Four periods behind: €240.
      water(now),
      // Paid this month, three behind: €180.
      computeBillStatus(makeBill({ ...WATER, id: "power", name: "Power" }), [...paidMonths("power", monthKeys(2025, 9, 2026, 5)), ...paidMonths("power", ["2026-10"])], now),
      // Added this month, late since the 5th: €15.
      computeBillStatus(makeBill({ id: "netflix", name: "Netflix", dueDay: 5, ...fresh }), [], now),
      // Added this month, due on the 15th: not late, but on the badge.
      computeBillStatus(makeBill({ id: "phone", name: "Phone", amount: 25, dueDay: 15, ...fresh }), [], now),
      // Switched off with months unpaid: owes nothing anywhere.
      computeBillStatus(makeBill({ id: "off", name: "Off", dueDay: 10, isActive: false }), [], now),
    ];
    const s = screens(bills, now);

    // By hand: 240 + 180 + 15.
    expect(240 + 180 + 15).toBe(435);
    expect(s.tile.total).toBe(435);
    expect(s.attentionLate).toBe(435);
    expect(s.arrears).toBe(435);
    expect(sum(s.tile.bills.map((b) => billOverdue(b, now).total))).toBe(435);
    // Most late first, counted from each bill's oldest payment owed.
    expect(s.tile.bills.map((b) => b.id)).toEqual(["water", "power", "netflix"]);
    // Three late and the phone due within the week.
    expect(s.badge).toBe(4);
    expect(s.attention.map((i) => [i.id, i.late])).toEqual([
      ["water", true],
      ["power", true],
      ["netflix", true],
      ["phone", false],
    ]);
  });
});
