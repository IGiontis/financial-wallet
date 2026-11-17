import { describe, it, expect } from "vitest";
import {
  amountOwedNow,
  billOverdue,
  computeBillStatus,
  getPeriodKey,
  outstandingTotal,
  paidThisPeriod,
} from "./billsUtils";
import { lineStatus, stripCard, stripCards } from "./billStrip";
import type { Bill, BillPayment } from "../../shared/types/IndexTypes";

// The bills list as one card per bill: which dated lines sit in each card,
// which figure heads it, and the order. Nothing new is counted — each figure is checked
// against the one the rest of the page already shows, and by hand.

const NOW = new Date(2026, 9, 5, 10, 0); // 5 October 2026

const make = (bill: Partial<Bill>, payments: BillPayment[] = []) =>
  computeBillStatus(
    {
      userId: "u1",
      categoryId: "c1",
      frequency: "monthly",
      isActive: true,
      anchorDate: new Date(2025, 9, 5),
      createdAt: new Date(2025, 9, 5),
      updatedAt: new Date(2025, 9, 5),
      ...bill,
    } as Bill,
    payments,
    NOW,
  );

const paid = (
  billId: string,
  key: string,
  amount: number,
  day: number,
): BillPayment => {
  const [y, m] = key.split("-").map(Number);
  return {
    id: `${billId}-${key}`,
    userId: "u1",
    billId,
    periodKey: key,
    amount,
    paidDate: new Date(y, m - 1, day),
    createdAt: new Date(y, m - 1, day),
  } as BillPayment;
};

// Water: paid to June, July to September late, October not due yet (the 10th).
const water = make(
  { id: "water", name: "Water", amount: 60, dueDay: 10 },
  [
    "2025-10",
    "2025-11",
    "2025-12",
    "2026-01",
    "2026-02",
    "2026-03",
    "2026-04",
    "2026-05",
    "2026-06",
  ].map((k) => paid("water", k, 60, 8)),
);
// Rent: every month paid, October on the 1st, €450.
const rent = make(
  { id: "rent", name: "Rent", amount: 450, dueDay: 3 },
  [
    "2025-10",
    "2025-11",
    "2025-12",
    "2026-01",
    "2026-02",
    "2026-03",
    "2026-04",
    "2026-05",
    "2026-06",
    "2026-07",
    "2026-08",
    "2026-09",
    "2026-10",
  ].map((k) => paid("rent", k, 450, 1)),
);
// Phone and internet: started this month, nothing paid, due on the 20th and the 25th.
const phone = make({
  id: "phone",
  name: "Phone",
  amount: 20,
  dueDay: 20,
  anchorDate: new Date(2026, 9, 1),
  createdAt: new Date(2026, 9, 1),
});
const net = make({
  id: "net",
  name: "Internet",
  amount: 35,
  dueDay: 25,
  anchorDate: new Date(2026, 9, 1),
  createdAt: new Date(2026, 9, 1),
});

const sum = (amounts: (number | undefined)[]) =>
  Math.round(amounts.reduce<number>((total, a) => total + (a ?? 0), 0) * 100) /
  100;

describe("a bill's card", () => {
  it("lists a late bill's every unpaid period, red, adding up to everything it owes", () => {
    const card = stripCard(water, "outstanding", NOW);
    expect(card.late).toBe(true);
    expect(card.lines.map((l) => l.kind)).toEqual([
      "unpaid",
      "unpaid",
      "unpaid",
    ]);
    expect(card.lines.map((l) => l.date)).toEqual([
      new Date(2026, 6, 10),
      new Date(2026, 7, 10),
      new Date(2026, 8, 10),
    ]);
    expect(card.lines.every((l) => l.late)).toBe(true);
    // By hand: July, August, September at €60.
    expect(card.amount).toBe(3 * 60);
    expect(sum(card.lines.map((l) => l.amount))).toBe(card.amount);
  });

  it("dates a paid bill by the day it was paid, at what this period's payment was", () => {
    const card = stripCard(rent, "settled", NOW);
    expect(card.late).toBe(false);
    expect(card.lines).toEqual([
      {
        kind: "paid",
        date: new Date(2026, 9, 1),
        amount: 450,
        approx: false,
        late: false,
      },
    ]);
    expect(card.amount).toBe(450);
    expect(card.amount).toBe(paidThisPeriod(rent));
  });

  it("dates anything else by its next due day, at what it leaves each time", () => {
    const card = stripCard(phone, "outstanding", NOW);
    expect(card.lines).toEqual([
      {
        kind: "next",
        date: new Date(2026, 9, 20),
        amount: 20,
        approx: false,
        late: false,
      },
    ]);
    expect(card.amount).toBe(20);
  });
});

// The owner's report (2026-11-17): water every two months, two periods unpaid,
// one row showed one day and the total — the second period was hidden.
describe("a bill every two months with two unpaid periods", () => {
  const LATER = new Date(2026, 10, 20, 10, 0); // 20 November 2026
  const base = {
    userId: "u1",
    categoryId: "c1",
    frequency: "monthly",
    intervalCount: 2,
    isActive: true,
    anchorDate: new Date(2026, 0, 12),
    createdAt: new Date(2026, 0, 12),
    updatedAt: new Date(2026, 0, 12),
  } as Bill;
  const payments = [0, 2, 4, 6].map((m) =>
    paid("eydap", getPeriodKey(base, new Date(2026, m, 12)), 38.6, 12),
  );
  const eydap = computeBillStatus(
    { ...base, id: "eydap", name: "ΕΥΔΑΠ", amount: 38.6, dueDay: 12 },
    payments,
    LATER,
  );

  it("has a line for each, and the lines add up to the card's figure", () => {
    const card = stripCard(eydap, "outstanding", LATER);
    expect(card.lines.map((l) => l.date)).toEqual([
      new Date(2026, 8, 12),
      new Date(2026, 10, 12),
    ]);
    expect(card.lines.map((l) => l.amount)).toEqual([38.6, 38.6]);
    // By hand: 38.60 + 38.60 = 77.20 — and the late tile's own function says the same.
    expect(card.amount).toBe(77.2);
    expect(card.amount).toBe(amountOwedNow(eydap, LATER));
    expect(sum(card.lines.map((l) => l.amount))).toBe(card.amount);
  });

  it("marks red only a period past its deadline, not one inside its grace days", () => {
    const graced = computeBillStatus(
      {
        ...base,
        id: "eydap",
        name: "ΕΥΔΑΠ",
        amount: 38.6,
        dueDay: 12,
        graceDays: 10,
      },
      payments,
      LATER,
    );
    const card = stripCard(graced, "outstanding", LATER);
    // September's deadline (22 Sep) has gone; November's (22 Nov) has not.
    expect(card.lines.map((l) => l.late)).toEqual([true, false]);
    expect(billOverdue(graced, LATER).count).toBe(1);
    expect(card.amount).toBe(77.2);
  });
});

describe("a section's cards", () => {
  const cards = stripCards([net, water, phone], "outstanding", NOW);

  it("are by their earliest date, then by name", () => {
    expect(cards.map((c) => c.bill.name)).toEqual([
      "Water",
      "Phone",
      "Internet",
    ]);
  });

  it("put a bill with no date last", () => {
    const undated = {
      ...phone,
      id: "x",
      name: "Undated",
      nextDueDate: undefined,
      deadline: undefined,
    };
    const list = stripCards([undated, net], "outstanding", NOW);
    expect(list.map((c) => c.bill.name)).toEqual(["Internet", "Undated"]);
    expect(list[1].lines[0].date).toBeUndefined();
  });

  it("add up to the section's figure when nothing in it is late", () => {
    // By hand: €20 + €35 — and the heading's own function says the same.
    expect(
      sum(stripCards([phone, net], "outstanding", NOW).map((c) => c.amount)),
    ).toBe(55);
    expect(outstandingTotal([phone, net])).toBe(55);
  });
});

describe("a line's status icon", () => {
  it("is ✓ for a payment made, ⚠ for one past its deadline, «!» for one due and still in time", () => {
    expect(stripCard(rent, "settled", NOW).lines.map(lineStatus)).toEqual(["paid"]);
    expect(stripCard(water, "outstanding", NOW).lines.map(lineStatus)).toEqual(["late", "late", "late"]);
    expect(stripCard(phone, "outstanding", NOW).lines.map(lineStatus)).toEqual(["due"]);
  });

  it("says nothing on a line that only dates the bill", () => {
    expect(lineStatus({ kind: "starts", date: NOW, approx: false, late: false })).toBeUndefined();
    expect(lineStatus({ kind: "stopped", date: NOW, approx: false, late: false })).toBeUndefined();
  });
});
