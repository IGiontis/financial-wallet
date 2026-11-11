import { describe, it, expect } from "vitest";
import { getPeriodDueDate } from "../../features/bills/billsUtils";
import { incomeOccurrences, type Income } from "../../features/incomes/incomesUtils";
import { oneOffDates } from "../../features/plannerPage/plannerUtils";
import type { Bill } from "../types/IndexTypes";

// «Ημέρα του μήνα» is picked from 1–31; a day a month does not have falls on
// its last day — in the bills, the incomes and the planner alike, so the
// calendar, the timelines and the pay-day chart built on them agree.
// Checked against the month lengths written out by hand: 30-day months,
// February in a common year (2026, 2027) and in a leap year (2028).

const ymd = (d: Date | undefined) => (d ? [d.getFullYear(), d.getMonth() + 1, d.getDate()] : undefined);

describe("a bill due on the 31st", () => {
  const bill = { id: "b", name: "Rent", amount: 10, frequency: "monthly", intervalCount: 1, dueDay: 31, isActive: true, anchorDate: new Date(2026, 0, 1), createdAt: new Date(2026, 0, 1) } as unknown as Bill;
  it.each([
    [new Date(2026, 1, 10), [2026, 2, 28]],
    [new Date(2028, 1, 10), [2028, 2, 29]],
    [new Date(2026, 3, 10), [2026, 4, 30]],
    [new Date(2026, 10, 10), [2026, 11, 30]],
    [new Date(2026, 0, 10), [2026, 1, 31]],
  ])("falls in %s on %j", (when, expected) => {
    expect(ymd(getPeriodDueDate(bill, when))).toEqual(expected);
  });

  it("on the 30th lands on 28 / 29 February, and back on the 30th after", () => {
    const thirtieth = { ...bill, dueDay: 30 } as Bill;
    expect(ymd(getPeriodDueDate(thirtieth, new Date(2027, 1, 5)))).toEqual([2027, 2, 28]);
    expect(ymd(getPeriodDueDate(thirtieth, new Date(2028, 1, 5)))).toEqual([2028, 2, 29]);
    expect(ymd(getPeriodDueDate(thirtieth, new Date(2028, 2, 5)))).toEqual([2028, 3, 30]);
  });
});

describe("an income on the 31st", () => {
  const income = { id: "i", name: "Pay", kind: "salary", amount: 100, frequency: "monthly", day: 31, start: "2026-01" } as Income;
  it("comes on each month's last day when it is shorter, and never twice or not at all", () => {
    const dates = incomeOccurrences(income, new Date(2027, 11, 1), new Date(2028, 4, 31)).map((o) => ymd(o.date));
    expect(dates).toEqual([
      [2027, 12, 31],
      [2028, 1, 31],
      [2028, 2, 29],
      [2028, 3, 31],
      [2028, 4, 30],
      [2028, 5, 31],
    ]);
  });
});

describe("a planner entry repeating from the 31st", () => {
  it("lands on each month's last day when shorter, and does not walk back to the 28th for good", () => {
    const dates = oneOffDates({ id: "o", label: "Coupon", amount: 5, date: "2027-01-31", every: 1 } as never, new Date(2027, 0, 1), new Date(2027, 4, 31)).map(ymd);
    expect(dates).toEqual([
      [2027, 1, 31],
      [2027, 2, 28],
      [2027, 3, 31],
      [2027, 4, 30],
      [2027, 5, 31],
    ]);
  });
});
