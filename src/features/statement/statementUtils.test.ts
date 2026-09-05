import { describe, it, expect } from "vitest";
import { buildStatement, monthRange, withinPeriod, yearRange, yearsWithRecords } from "./statementUtils";
import type { Transaction } from "../../shared/types/IndexTypes";

const nameFor = (id: string) => ({ label: { c1: "Γυμναστήριο", c2: "Ρεύμα", c3: "Μισθός" }[id] ?? id, icon: "🧾" });

let n = 0;
const tx = (over: Partial<Transaction>): Transaction =>
  ({
    id: `t${n++}`,
    userId: "u1",
    amount: 100,
    type: "expense",
    categoryId: "c1",
    date: new Date(2026, 5, 15),
    description: "x",
    createdAt: new Date(2026, 5, 15),
    ...over,
  }) as Transaction;

describe("period ranges", () => {
  it("takes a year in whole, last day included", () => {
    const { from, to } = yearRange(2026);
    expect(from).toEqual(new Date(2026, 0, 1));
    // The trap: an exclusive end drops everything spent on New Year's Eve.
    expect(to.getMonth()).toBe(11);
    expect(to.getDate()).toBe(31);
    expect(to.getHours()).toBe(23);
  });

  it("ends a month on its own last day, whatever length it is", () => {
    expect(monthRange(2026, 1).to.getDate()).toBe(28); // February
    expect(monthRange(2024, 1).to.getDate()).toBe(29); // leap
    expect(monthRange(2026, 3).to.getDate()).toBe(30); // April
  });

  it("keeps a row dated on the closing instant", () => {
    const { from, to } = monthRange(2026, 5);
    const lastMoment = tx({ date: new Date(2026, 5, 30, 23, 30) });
    expect(withinPeriod([lastMoment], from, to)).toHaveLength(1);
  });
});

describe("yearsWithRecords", () => {
  const now = new Date(2026, 5, 1);

  it("lists the years there is something to print, newest first", () => {
    const years = yearsWithRecords([tx({ date: new Date(2024, 2, 1) }), tx({ date: new Date(2026, 2, 1) })], now);
    expect(years).toEqual([2026, 2024]);
  });

  it("always offers this year, so a new account has something to pick", () => {
    expect(yearsWithRecords([], now)).toEqual([2026]);
  });

  it("does not repeat a year that has many rows in it", () => {
    expect(yearsWithRecords([tx({}), tx({}), tx({})], now)).toEqual([2026]);
  });
});

describe("buildStatement", () => {
  const { from, to } = yearRange(2026);

  const rows = [
    tx({ categoryId: "c1", amount: 300, date: new Date(2026, 0, 10) }),
    tx({ categoryId: "c2", amount: 100, date: new Date(2026, 1, 10) }),
    tx({ categoryId: "c1", amount: 100, date: new Date(2026, 1, 20) }),
    tx({ categoryId: "c3", amount: 2000, type: "income", date: new Date(2026, 0, 25) }),
  ];

  it("splits both sides and nets them", () => {
    const s = buildStatement(rows, from, to, nameFor);

    expect(s.expenses).toBe(500);
    expect(s.income).toBe(2000);
    expect(s.net).toBe(1500);
    expect(s.count).toBe(4);
  });

  it("ranks the expense lines biggest first, with their share", () => {
    const s = buildStatement(rows, from, to, nameFor);

    expect(s.expenseLines.map((l) => [l.label, l.amount, l.count])).toEqual([
      ["Γυμναστήριο", 400, 2],
      ["Ρεύμα", 100, 1],
    ]);
    expect(s.expenseLines[0].share).toBeCloseTo(0.8, 5);
  });

  it("keeps every category rather than folding the tail into 'other'", () => {
    // On screen a long tail is folded to keep a chart readable. On a statement
    // that is a hole where a figure should be — and paper has room.
    const many = Array.from({ length: 9 }, (_, i) => tx({ categoryId: `cat${i}`, amount: 10 * (i + 1), date: new Date(2026, 3, 1) }));
    const s = buildStatement(many, from, to, nameFor);

    expect(s.expenseLines).toHaveLength(9);
    expect(s.expenseLines.some((l) => l.categoryId.startsWith("__"))).toBe(false);
  });

  it("totals what the rows above it add up to", () => {
    const s = buildStatement(rows, from, to, nameFor);
    const summed = s.expenseLines.reduce((total, line) => total + line.amount, 0);

    expect(summed).toBe(s.expenses);
  });

  it("leaves out anything dated outside the period", () => {
    const s = buildStatement([...rows, tx({ amount: 9999, date: new Date(2025, 11, 31) })], from, to, nameFor);
    expect(s.expenses).toBe(500);
  });

  it("gives one month row per month of the period", () => {
    const s = buildStatement(rows, from, to, nameFor);

    expect(s.months).toHaveLength(12);
    expect(s.months[0]).toMatchObject({ key: "2026-01", income: 2000, expenses: 300, net: 1700 });
    expect(s.months[1]).toMatchObject({ key: "2026-02", income: 0, expenses: 200, net: -200 });
  });

  it("narrows to a single month row when that is the period", () => {
    const feb = monthRange(2026, 1);
    const s = buildStatement(rows, feb.from, feb.to, nameFor);

    expect(s.months).toHaveLength(1);
    expect(s.expenses).toBe(200);
    expect(s.income).toBe(0);
  });

  it("counts a goal deposit as neither side, matching every other screen", () => {
    // Moving money into a goal is a transfer, not spending — a statement that
    // called it an expense would disagree with the app it came from.
    const s = buildStatement([...rows, tx({ amount: 500, isGoalTransaction: true, contributionType: "deposit", date: new Date(2026, 2, 1) })], from, to, nameFor);

    expect(s.expenses).toBe(500);
  });

  it("reports an empty period as empty rather than as zeros", () => {
    const s = buildStatement([], from, to, nameFor);

    expect(s.count).toBe(0);
    expect(s.expenseLines).toEqual([]);
    expect(s.incomeLines).toEqual([]);
  });
});
