import { describe, it, expect } from "vitest";
import { computeBillStatus, heaviestMonth, yearAhead } from "./billsUtils";
import type { Bill, BillPayment } from "../../shared/types/IndexTypes";

// The twelve months ahead, as the bills fall into them.
//
// The point of the view is that the year is not flat: the insurance and the road
// tax land in the same December, and a holiday house switches itself off for the
// winter. So what these check is that each month holds its own payments and
// nobody's average is smeared across the others.

const makeBill = (overrides: Partial<Bill> = {}): Bill =>
  ({
    id: Math.random().toString(),
    userId: "u1",
    name: "Bill",
    amount: 60,
    categoryId: "c1",
    frequency: "monthly",
    dueDay: 5,
    isActive: true,
    anchorDate: new Date(2026, 0, 1),
    createdAt: new Date(2026, 0, 1),
    updatedAt: new Date(2026, 0, 1),
    ...overrides,
  }) as Bill;

const status = (bill: Bill, payments: BillPayment[] = [], now = new Date(2026, 9, 15)) => computeBillStatus(bill, payments, now);

const NOW = new Date(2026, 9, 15); // 15 October 2026

describe("yearAhead", () => {
  it("covers twelve months starting with this one", () => {
    const months = yearAhead([status(makeBill())], NOW);

    expect(months).toHaveLength(12);
    expect(months[0].start).toEqual(new Date(2026, 9, 1));
    expect(months[11].start).toEqual(new Date(2027, 8, 1));
  });

  it("charges a monthly bill once a month", () => {
    const months = yearAhead([status(makeBill({ amount: 420 }))], NOW);

    expect(months.every((month) => month.total === 420 && month.count === 1)).toBe(true);
  });

  it("puts a twice-a-year bill in the two months it lands in, whole", () => {
    // Every 6 months from January, due on the 3rd: January and July.
    const bill = makeBill({ amount: 210, intervalCount: 6, dueDay: 3, anchorDate: new Date(2026, 0, 1) });
    const months = yearAhead([status(bill)], NOW);

    const charged = months.filter((month) => month.total > 0);
    expect(charged.map((month) => month.start.getMonth())).toEqual([0, 6]);
    expect(charged.every((month) => month.total === 210)).toBe(true);
    // Not a twelfth of it smeared across every month.
    expect(months.filter((month) => month.total === 17.5)).toHaveLength(0);
  });

  it("stacks everything that lands in the same month", () => {
    const rent = status(makeBill({ id: "rent", amount: 420 }));
    const insurance = status(makeBill({ id: "ins", amount: 210, frequency: "yearly", dueMonth: 11, dueDay: 3 }));
    const roadTax = status(makeBill({ id: "tax", amount: 130, frequency: "yearly", dueMonth: 11, dueDay: 20 }));

    const months = yearAhead([rent, insurance, roadTax], NOW);
    const december = months.find((month) => month.start.getMonth() === 11 && month.start.getFullYear() === 2026)!;

    // Second route, by hand: 420 + 210 + 130.
    expect(december.total).toBe(760);
    expect(december.count).toBe(3);
    expect(heaviestMonth(months)).toBe(december);
  });

  it("leaves the paused months lighter", () => {
    // The holiday house: €60 a month, off from November to March every year.
    const house = status(makeBill({ amount: 60, pause: { from: "2026-11", to: "2027-03", yearly: true } }));
    const months = yearAhead([house], NOW);

    const off = months.filter((month) => month.total === 0).map((month) => month.start.getMonth());
    expect(off).toEqual([10, 11, 0, 1, 2]);
    // Seven charged months in the twelve — the same seven the monthly figure averages.
    expect(months.filter((month) => month.total === 60)).toHaveLength(7);
  });

  it("still counts a month whose bill is already paid", () => {
    // The money left the account; a month that cost nothing is a different claim.
    const bill = makeBill({ amount: 420 });
    const paid = { id: "p", userId: "u1", billId: bill.id, periodKey: "2026-10", amount: 420, paidDate: new Date(2026, 9, 3), createdAt: new Date(2026, 9, 3) } as BillPayment;

    const [october] = yearAhead([status(bill, [paid])], NOW);

    expect(october.total).toBe(420);
    expect(october.paid).toBe(420);
  });

  it("has no heaviest month when nothing is owed", () => {
    expect(heaviestMonth(yearAhead([], NOW))).toBeUndefined();
  });
});
