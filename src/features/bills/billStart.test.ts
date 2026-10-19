import { describe, it, expect } from "vitest";
import { amountOwedNow, arrears, billOverdue, chargedShare, computeBillStatus, getBillGroup, isPausedOn, monthForecast, overdueBills, startsLater } from "./billsUtils";
import type { Bill, BillPayment } from "../../shared/types/IndexTypes";

// The owner's case: a yearly tax of 300, due in June, added on 19 October 2026,
// and starting next year. This year's June is not his to pay — it was shown as
// "not paid for this year".

const NOW = new Date(2026, 9, 19, 10);

const tax = (over: Partial<Bill> = {}): Bill =>
  ({
    id: "tax",
    userId: "u",
    name: "Φόρος",
    amount: 300,
    categoryId: "c",
    frequency: "yearly",
    dueMonth: 5,
    dueDay: 30,
    isActive: true,
    anchorDate: new Date(2026, 9, 1),
    createdAt: new Date(2026, 9, 19),
    updatedAt: new Date(2026, 9, 19),
    ...over,
  }) as Bill;

const status = (bill: Bill, payments: BillPayment[] = [], now = NOW) => computeBillStatus(bill, payments, now);

describe("a bill that starts later", () => {
  it("owes nothing before its start: not overdue, nothing outstanding", () => {
    const bill = status(tax({ startsOn: "2027-01" }));
    expect(bill.outstandingAmount).toBe(0);
    expect(amountOwedNow(bill, NOW)).toBe(0);
    expect(billOverdue(bill, NOW).count).toBe(0);
    expect(overdueBills([bill], NOW).bills).toEqual([]);
    expect(arrears([bill], NOW)).toEqual([]);
    expect(getBillGroup(bill, NOW)).not.toBe("overdue");
  });

  it("is next due on the first due date from its start — June 2027", () => {
    expect(status(tax({ startsOn: "2027-01" })).nextDueDate).toEqual(new Date(2027, 5, 30));
  });

  it("says when it starts, and stops saying so once it has", () => {
    expect(startsLater(tax({ startsOn: "2027-01" }), NOW)).toEqual(new Date(2027, 0, 1));
    expect(startsLater(tax({ startsOn: "2027-01" }), new Date(2027, 0, 5))).toBeUndefined();
    expect(startsLater(tax(), NOW)).toBeUndefined();
  });

  it("charges nothing in the months before it, and everything from it", () => {
    const bill = tax({ startsOn: "2027-01" });
    expect(isPausedOn(bill, new Date(2026, 11, 31))).toBe(true);
    expect(isPausedOn(bill, new Date(2027, 0, 1))).toBe(false);
    expect(isPausedOn(bill, new Date(2027, 5, 30))).toBe(false);
  });

  it("lands in the forecast only in its own month: June 2027, not June 2026", () => {
    const bill = status(tax({ startsOn: "2027-01" }));
    // This June is behind us; next June, eight months on.
    expect(monthForecast([bill], NOW, 8).items.map((i) => [i.date.getFullYear(), i.date.getMonth(), i.amount])).toEqual([[2027, 5, 300]]);
    // A second way: the next twelve months hold its one payment, whole.
    let year = 0;
    for (let offset = 0; offset < 12; offset++) year += monthForecast([bill], NOW, offset).items.reduce((s, i) => s + i.amount, 0);
    expect(year).toBe(300);
  });

  it("averages over the year as a whole payment once its start is within it", () => {
    // Its one payment of the next twelve months is charged: 300 a year, 25 a month.
    expect(chargedShare(tax({ startsOn: "2027-01" }), NOW)).toBe(1);
    expect(status(tax({ startsOn: "2027-01" })).monthlyEquivalent).toBe(25);
  });

  it("left without a start, behaves exactly as before — this year's June is owed", () => {
    const before = status(tax({ anchorDate: new Date(2026, 0, 1), createdAt: new Date(2026, 0, 1) }));
    expect(before.outstandingAmount).toBe(300);
    expect(overdueBills([before], NOW).bills).toHaveLength(1);
  });

  it("still counts a payment made before its start — money paid is a fact", () => {
    const paid: BillPayment = { id: "p", userId: "u", billId: "tax", periodKey: status(tax()).currentPeriodKey, amount: 300, paidDate: new Date(2026, 9, 10), createdAt: new Date(2026, 9, 10) } as BillPayment;
    expect(status(tax({ startsOn: "2027-01" }), [paid]).isPaidThisPeriod).toBe(true);
  });
});
