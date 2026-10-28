import { describe, it, expect } from "vitest";
import { asReach, billAlerts, DEFAULT_REACH, hasUnseenAlert, reachDays, reachFor } from "./billAlerts";
import { billOverdue, computeBillStatus } from "./billsUtils";
import type { Bill, BillPayment } from "../../shared/types/IndexTypes";

// The popup on arrival: what is late, and what falls due in the next five days.
// 28 October: electricity (the 10th) unpaid, so late; water due the 30th; the
// internet paid for October, next on the 20th of November, too far off to
// mention; Netflix paid.

const NOW = new Date(2026, 9, 28, 10);

const bill = (id: string, name: string, dueDay: number, extra: Partial<Bill> = {}): Bill =>
  ({ id, userId: "u", name, amount: 60, categoryId: "c", frequency: "monthly", dueDay, isActive: true, createdAt: new Date(2026, 9, 1), updatedAt: new Date(2026, 9, 1), ...extra }) as Bill;

const paid = (billId: string, periodKey: string): BillPayment =>
  ({ id: `p-${billId}`, userId: "u", billId, periodKey, amount: 60, paidDate: new Date(2026, 9, 5), createdAt: new Date(2026, 9, 5) }) as BillPayment;

const BILLS = [bill("power", "ΔΕΗ", 10, { amount: 85, isVariableAmount: true }), bill("water", "Νερό", 30), bill("net", "Internet", 20, { amount: 30 }), bill("tv", "Netflix", 29, { amount: 15 })];
// October's internet (the 20th) and Netflix paid; November's internet is the one weeks away.
const PAYMENTS = [paid("tv", "2026-10"), paid("net", "2026-10")];
const status = (now: Date) => BILLS.map((b) => computeBillStatus(b, PAYMENTS, now));

describe("the bills the popup names", () => {
  const alerts = billAlerts(status(NOW), NOW);

  it("names the late one and the one due in two days — not the paid one, not the one weeks away", () => {
    expect(alerts.map((a) => a.bill.name)).toEqual(["ΔΕΗ", "Νερό"]);
  });

  it("puts the late one first, as one to pay now, and the coming one as a warning", () => {
    const [power, water] = alerts;
    expect([power.late, power.now]).toEqual([true, true]);
    expect([water.late, water.now, water.days]).toEqual([false, false, 2]);
    expect(water.deadline).toEqual(new Date(2026, 9, 30));
  });

  it("asks of the late one all it owes, and of the coming one its next payment", () => {
    const [power, water] = alerts;
    // A second way: the late figure is what `billOverdue` totals for it.
    expect(power.amount).toBe(billOverdue(power.bill, NOW).total);
    expect(power.amount).toBe(85);
    expect(power.approximate).toBe(true);
    expect([water.amount, water.approximate]).toEqual([60, false]);
  });

  it("reaches exactly five days ahead", () => {
    const inFive = new Date(2026, 9, 15, 10); // the 20th is five days off
    const inSix = new Date(2026, 9, 14, 10);
    const net = (now: Date) => billAlerts([computeBillStatus(BILLS[2], [], now)], now);
    expect(DEFAULT_REACH).toBe("5d");
    expect(net(inFive).map((a) => a.days)).toEqual([5]);
    expect(net(inSix)).toEqual([]);
  });

  it("reaches as far as the reader picks: a month brings in November's internet", () => {
    const month = reachDays("1m", NOW);
    // 28 October to 28 November, by the calendar: 31 days.
    expect(month).toBe(31);
    expect(billAlerts(status(NOW), NOW, month).map((a) => a.bill.name)).toEqual(["ΔΕΗ", "Νερό", "Internet"]);
    // And a day only: the water on the 30th is two days off, so it goes.
    expect(billAlerts(status(NOW), NOW, reachDays("1d", NOW)).map((a) => a.bill.name)).toEqual(["ΔΕΗ"]);
  });

  it("gives each bill its own reach, and the general one to the rest", () => {
    const byBill = { net: "1m" as const };
    expect([reachFor(BILLS[2], "5d", byBill), reachFor(BILLS[1], "5d", byBill)]).toEqual(["1m", "5d"]);
    // A stored value no longer among the choices falls back to the default, not to nothing.
    expect(reachFor(BILLS[2], "5d", { net: "9y" as never })).toBe("5d");

    // The internet a month ahead, the water and electricity on five days: all three named.
    const statuses = status(NOW);
    expect(billAlerts(statuses, NOW, (bill) => reachDays(reachFor(bill, "5d", byBill), NOW)).map((a) => a.bill.name)).toEqual(["ΔΕΗ", "Νερό", "Internet"]);
    // And the water on one day: gone, the others as they were.
    expect(billAlerts(statuses, NOW, (bill) => reachDays(reachFor(bill, "5d", { water: "1d" }), NOW)).map((a) => a.bill.name)).toEqual(["ΔΕΗ"]);
  });

  it("counts months by the calendar, and falls back to five days for anything it does not know", () => {
    // 31 January + 1 month is 28 February: 28 days, not 31.
    expect(reachDays("1m", new Date(2027, 0, 31))).toBe(28);
    expect(reachDays("6m", new Date(2026, 9, 28))).toBe(182); // 31+30+31+31+28+31
    expect([asReach("3m"), asReach("9y"), asReach(undefined)]).toEqual(["3m", "5d", "5d"]);
  });

  it("counts a payment due today as one to pay now, though not late yet", () => {
    const onTheDay = new Date(2026, 9, 30, 10);
    const water = billAlerts([computeBillStatus(BILLS[1], [], onTheDay)], onTheDay)[0];
    expect([water.late, water.now, water.days]).toEqual([false, true, 0]);
  });
});

describe("what «don't show again» puts away", () => {
  const before = billAlerts(status(NOW), NOW);
  const seen = before.map((a) => a.key);

  it("keeps the popup closed while nothing new comes", () => {
    expect(hasUnseenAlert(before, seen)).toBe(false);
    // The next day: the same two, still unpaid — still put away.
    const next = new Date(2026, 9, 29, 10);
    expect(hasUnseenAlert(billAlerts(status(next), next), seen)).toBe(false);
  });

  it("opens it again for a new payment coming into the five days — listing the old ones with it", () => {
    const later = new Date(2026, 10, 16, 10); // the internet's 20 November is four days off
    const alerts = billAlerts(status(later), later);
    expect(hasUnseenAlert(alerts, seen)).toBe(true);
    expect(alerts.map((a) => a.bill.name)).toContain("Internet");
    expect(alerts.map((a) => a.bill.name)).toContain("ΔΕΗ");
  });

  it("opens it again when a payment it named as coming goes late", () => {
    const after = new Date(2026, 9, 31, 10); // water's 30th has gone, unpaid
    const water = billAlerts(status(after), after).find((a) => a.bill.id === "water")!;
    expect(water.late).toBe(true);
    expect(seen).not.toContain(water.key);
  });

  it("has nothing to say with nothing due", () => {
    expect(hasUnseenAlert([], [])).toBe(false);
  });
});
