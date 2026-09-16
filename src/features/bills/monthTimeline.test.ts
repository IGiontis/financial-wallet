import { describe, it, expect } from "vitest";
import { monthTimeline } from "./monthTimeline";
import { computeBillStatus } from "./billsUtils";
import type { Bill, BillPayment } from "../../shared/types/IndexTypes";

// The month in the order it happens.
//
// The figure the whole view is for is `beforeIncome`: what has to leave before
// the pay lands, which is what last month's money has to cover. So these pin
// down the ordering that produces it — including the awkward cases, a bill and
// the pay on the same day, and a pay day that does not exist in February.

const bill = (id: string, name: string, amount: number, dueDay: number, payments: BillPayment[] = []) =>
  computeBillStatus(
    {
      id,
      userId: "u1",
      name,
      amount,
      categoryId: "c1",
      frequency: "monthly",
      dueDay,
      isActive: true,
      anchorDate: new Date(2026, 0, 1),
      createdAt: new Date(2026, 0, 1),
      updatedAt: new Date(2026, 0, 1),
    } as Bill,
    payments,
    new Date(2026, 9, 15),
  );

const paid = (billId: string, periodKey: string, amount: number, day: number) =>
  ({ id: `${billId}-${periodKey}`, userId: "u1", billId, periodKey, amount, paidDate: new Date(2026, 9, day), createdAt: new Date(2026, 9, day) }) as BillPayment;

const NOW = new Date(2026, 9, 15); // 15 October 2026
const SALARY = { amount: 1700, dayOfMonth: 28, label: "Salary" };

describe("monthTimeline", () => {
  it("lays the month out in order, money in among the money out", () => {
    const bills = [bill("rent", "Rent", 420, 1), bill("water", "Water", 68, 12), bill("phone", "Phone", 25, 20)];

    const timeline = monthTimeline(bills, NOW, SALARY);

    expect(timeline.events.map((event) => `${event.date.getDate()} ${event.label}`)).toEqual(["1 Rent", "12 Water", "20 Phone", "28 Salary"]);
  });

  it("adds up what has to be covered before the pay lands", () => {
    const bills = [bill("rent", "Rent", 420, 1), bill("water", "Water", 68, 12), bill("phone", "Phone", 25, 20), bill("late", "Gym", 30, 30)];

    const timeline = monthTimeline(bills, NOW, SALARY);

    // Second route, by hand: everything dated before the 28th.
    expect(420 + 68 + 25).toBe(513);
    expect(timeline.beforeIncome).toBe(513);
    // The 30th is after pay day, so it is not part of the gap.
    expect(timeline.out).toBe(543);
    expect(timeline.incoming).toBe(1700);
  });

  it("counts a bill due on pay day as landing first", () => {
    // Nobody knows the order within a day, and reading it the other way would
    // quietly shrink the gap the view is about.
    const timeline = monthTimeline([bill("rent", "Rent", 420, 28)], NOW, SALARY);

    expect(timeline.events.map((event) => event.label)).toEqual(["Rent", "Salary"]);
    expect(timeline.beforeIncome).toBe(420);
  });

  it("still counts a bill that has already been paid", () => {
    // The money left the account; the gap it made is real whether or not it is
    // settled.
    const timeline = monthTimeline([bill("rent", "Rent", 420, 1, [paid("rent", "2026-10", 420, 1)])], NOW, SALARY);

    expect(timeline.events[0].done).toBe(true);
    expect(timeline.beforeIncome).toBe(420);
    expect(timeline.out).toBe(420);
  });

  it("marks what has already happened, by today rather than by the amount", () => {
    const timeline = monthTimeline([bill("phone", "Phone", 25, 20)], NOW, { ...SALARY, dayOfMonth: 5 });

    // Pay was on the 5th and today is the 15th: it has arrived. The phone is
    // dated the 20th and has not.
    expect(timeline.events.find((event) => event.kind === "income")?.done).toBe(true);
    expect(timeline.events.find((event) => event.kind === "bill")?.done).toBe(false);
  });

  it("puts a pay day of the 31st on the last day of a short month", () => {
    const february = monthTimeline([], new Date(2026, 1, 10), { ...SALARY, dayOfMonth: 31 });

    expect(february.firstIncome).toEqual(new Date(2026, 1, 28));
  });

  it("says nothing about a gap when no pay is known", () => {
    const timeline = monthTimeline([bill("rent", "Rent", 420, 1)], NOW);

    expect(timeline.firstIncome).toBeUndefined();
    expect(timeline.beforeIncome).toBe(0);
    expect(timeline.out).toBe(420);
  });

  it("leaves out a month the bill is paused for", () => {
    // The holiday house over the winter: no charge, so nothing on the timeline.
    const house = computeBillStatus(
      {
        id: "house",
        userId: "u1",
        name: "Holiday electricity",
        amount: 60,
        categoryId: "c1",
        frequency: "monthly",
        dueDay: 5,
        isActive: true,
        anchorDate: new Date(2026, 0, 1),
        createdAt: new Date(2026, 0, 1),
        updatedAt: new Date(2026, 0, 1),
        pause: { from: "2026-11", to: "2027-03", yearly: true },
      } as Bill,
      [],
      new Date(2026, 10, 15),
    );

    const november = monthTimeline([house], new Date(2026, 10, 15), SALARY);

    expect(november.events.filter((event) => event.kind === "bill")).toHaveLength(0);
    expect(november.out).toBe(0);
  });
});
