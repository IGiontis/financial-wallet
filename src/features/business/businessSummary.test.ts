import { describe, it, expect } from "vitest";
import { closingFigures, inMonth, lineCategoryIds, monthByCategory, monthCalendar, monthEntries, monthSummary, personalMove } from "./businessSummary";
import { toISODay } from "../../shared/utils/dates";
import type { BusinessEntry, BusinessExpense } from "../../shared/types/IndexTypes";

// The «Δουλειά» figures, checked hard: each by hand on the owner's own day and
// a small month, then every figure of every month a SECOND way, from the raw
// closings — the month told by its "YYYY-MM" text rather than by the
// timestamps `inMonth` compares, the profit as a signed walk over every line in
// cents (+turnover, −each expense), and the category bars added back up.

let n = 0;
const line = (categoryId: string, amount: number, note?: string): BusinessExpense => ({ categoryId, amount, ...(note ? { note } : {}) });
const closing = (date: Date, turnover: number, expenses: BusinessExpense[] = []): BusinessEntry => ({
  id: `c${++n}`,
  userId: "u1",
  date,
  turnover,
  expenses,
  createdAt: date,
  updatedAt: date,
});

/** The second way: the month as text; the profit as one signed walk over every amount, in cents. */
function byHand(entries: BusinessEntry[], month: Date) {
  const key = toISODay(month).slice(0, 7);
  let walk = 0;
  let turnover = 0;
  let out = 0;
  let days = 0;
  for (const e of entries) {
    if (toISODay(e.date).slice(0, 7) !== key) continue;
    days++;
    walk += Math.round(e.turnover * 100);
    turnover += Math.round(e.turnover * 100);
    for (const l of e.expenses) {
      walk -= Math.round(l.amount * 100);
      out += Math.round(l.amount * 100);
    }
  }
  return { turnover: turnover / 100, expenses: out / 100, profit: walk / 100, days };
}

const nov = new Date(2026, 10, 1);

describe("closingFigures", () => {
  it("counts the owner's own day: 800 in; 40 fuel, 350 stock, 50 the employee, 100 VAT + licence", () => {
    const day = closing(new Date(2026, 10, 12), 800, [line("transport", 40, "βενζίνη"), line("goods", 350), line("operating", 50, "υπάλληλος"), line("taxes", 100, "ΦΠΑ + άδεια")]);
    expect(closingFigures(day)).toEqual({ turnover: 800, expenses: 540, profit: 260 });
    expect(personalMove(closingFigures(day).profit)).toEqual({ type: "income", amount: 260 });
  });

  it("a day with no expenses is all profit; a day of only expenses is a loss", () => {
    expect(closingFigures(closing(nov, 315.4))).toEqual({ turnover: 315.4, expenses: 0, profit: 315.4 });
    expect(closingFigures(closing(nov, 0, [line("taxes", 420.15)]))).toEqual({ turnover: 0, expenses: 420.15, profit: -420.15 });
  });

  it("lets several lines share a category", () => {
    const day = closing(nov, 500, [line("goods", 120.5), line("goods", 79.5), line("transport", 12)]);
    expect(closingFigures(day).expenses).toBe(212);
    expect(lineCategoryIds(day.expenses)).toEqual(["goods", "transport"]);
  });

  it("adds in whole cents", () => {
    const day = closing(nov, 0.3, [line("a", 0.1), line("b", 0.2)]);
    expect(closingFigures(day).profit).toBe(0);
    expect(personalMove(closingFigures(day).profit)).toBeNull();
  });

  it("reads a closing written without lines as one with none", () => {
    expect(closingFigures({ turnover: 50, expenses: undefined as unknown as BusinessExpense[] })).toEqual({ turnover: 50, expenses: 0, profit: 50 });
  });
});

describe("personalMove", () => {
  it("is an income of a profit, an expense of a loss, and nothing at zero", () => {
    expect(personalMove(260)).toEqual({ type: "income", amount: 260 });
    expect(personalMove(-200)).toEqual({ type: "expense", amount: 200 });
    expect(personalMove(0)).toBeNull();
    // Less than half a cent either way is zero; a cent is not.
    expect(personalMove(0.004)).toBeNull();
    expect(personalMove(-0.01)).toEqual({ type: "expense", amount: 0.01 });
  });
});

describe("monthSummary", () => {
  it("adds a small shop's November up, by hand", () => {
    const rows = [
      closing(new Date(2026, 10, 2), 800, [line("transport", 40), line("goods", 350), line("operating", 50), line("taxes", 100)]),
      closing(new Date(2026, 10, 3), 640.5, [line("goods", 210.25)]),
      // A loss: the month's tax day.
      closing(new Date(2026, 10, 4), 120, [line("taxes", 380)]),
      // October and December: not November's.
      closing(new Date(2026, 9, 31, 23, 59), 999, [line("goods", 1)]),
      closing(new Date(2026, 11, 1, 0, 0), 50),
    ];
    const m = monthSummary(rows, nov);
    // Turnover 800 + 640,50 + 120 = 1.560,50. Expenses 540 + 210,25 + 380 = 1.130,25.
    expect(m).toEqual({ turnover: 1560.5, expenses: 1130.25, profit: 430.25, days: 3 });
    expect(m).toEqual(byHand(rows, nov));
    // And the month's profit is the sum of its days' profits: 260 + 430,25 − 260.
    expect(rows.filter((r) => inMonth(r, nov)).reduce((s, r) => s + Math.round(closingFigures(r).profit * 100), 0) / 100).toBe(m.profit);
  });

  it("goes negative for a month of losses", () => {
    const rows = [closing(new Date(2026, 10, 2), 100, [line("goods", 300)]), closing(new Date(2026, 10, 3), 50, [line("taxes", 75.5)])];
    expect(monthSummary(rows, nov)).toEqual({ turnover: 150, expenses: 375.5, profit: -225.5, days: 2 });
  });

  it("is all zeros for an empty month, and for a month with closings only around it", () => {
    const zero = { turnover: 0, expenses: 0, profit: 0, days: 0 };
    expect(monthSummary([], nov)).toEqual(zero);
    expect(monthSummary([closing(new Date(2026, 9, 31, 23, 59, 59, 999), 10), closing(new Date(2026, 11, 1), 10)], nov)).toEqual(zero);
  });

  it("puts the last millisecond of a month in it and the first of the next in the next — across a new year too", () => {
    const lastOfDec = closing(new Date(2026, 11, 31, 23, 59, 59, 999), 1);
    const firstOfJan = closing(new Date(2027, 0, 1, 0, 0, 0, 0), 2);
    const lastOfFeb = closing(new Date(2027, 1, 28, 23, 59), 4, [line("x", 8)]);
    const rows = [lastOfDec, firstOfJan, lastOfFeb];
    expect(monthSummary(rows, new Date(2026, 11, 15)).turnover).toBe(1);
    expect(monthSummary(rows, new Date(2027, 0, 31)).turnover).toBe(2);
    expect(monthSummary(rows, new Date(2027, 1, 1))).toEqual({ turnover: 4, expenses: 8, profit: -4, days: 1 });
    expect(inMonth(lastOfDec, new Date(2027, 0, 1))).toBe(false);
    expect(inMonth(firstOfJan, new Date(2026, 11, 1))).toBe(false);
    for (const month of [new Date(2026, 11, 1), new Date(2027, 0, 1), new Date(2027, 1, 1), new Date(2027, 2, 1)]) expect(monthSummary(rows, month)).toEqual(byHand(rows, month));
  });

  it("adds money in whole cents: ten 0,10 and ten 0,20 make 3,00", () => {
    const rows = [...Array.from({ length: 10 }, (_, i) => closing(new Date(2026, 10, 1 + i), 0.1)), ...Array.from({ length: 10 }, (_, i) => closing(new Date(2026, 10, 11 + i), 0.2))];
    expect(monthSummary(rows, nov).turnover).toBe(3);
  });

  it("takes dates as Firestore hands them back (a Timestamp-like object, or a date string)", () => {
    const ts = { toDate: () => new Date(2026, 10, 5) } as unknown as Date;
    const rows = [closing(ts, 20, [line("x", 5)]), closing("2026-11-06T10:00:00" as unknown as Date, 7)];
    expect(monthSummary(rows, nov)).toEqual({ turnover: 27, expenses: 5, profit: 22, days: 2 });
  });

  it("reconciles every figure of a year of invented closings a second way", () => {
    let seed = 7;
    const rand = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
    const rows: BusinessEntry[] = [];
    for (let i = 0; i < 500; i++) {
      const month = Math.floor(rand() * 12);
      const day = 1 + Math.floor(rand() * new Date(2026, month + 1, 0).getDate());
      const at = rand() < 0.1 ? new Date(2026, month, day, 23, 59, 59, 999) : rand() < 0.1 ? new Date(2026, month, day, 0, 0) : new Date(2026, month, day, 20, 30);
      const lines = Array.from({ length: Math.floor(rand() * 6) }, () => line(`c${Math.floor(rand() * 4)}`, Math.round((1 + rand() * 50000)) / 100));
      rows.push(closing(at, Math.round(rand() * 120000) / 100, lines));
    }
    let days = 0;
    for (let month = 0; month < 12; month++) {
      const at = new Date(2026, month, 1);
      const m = monthSummary(rows, at);
      expect(m).toEqual(byHand(rows, at));
      expect(Math.round((m.turnover - m.expenses) * 100)).toBe(Math.round(m.profit * 100));
      // The bars add up to the tile, line by line.
      const bars = monthByCategory(rows, at);
      expect(bars.reduce((s, b) => s + Math.round(b.total * 100), 0)).toBe(Math.round(m.expenses * 100));
      expect(bars.reduce((s, b) => s + b.count, 0)).toBe(rows.filter((r) => inMonth(r, at)).reduce((s, r) => s + r.expenses.length, 0));
      // The days' personal moves add up to the month's profit: incomes in, expenses out.
      const moved = monthEntries(rows, at).reduce((s, r) => {
        const move = personalMove(closingFigures(r).profit);
        return s + (move ? (move.type === "income" ? 1 : -1) * Math.round(move.amount * 100) : 0);
      }, 0);
      expect(moved).toBe(Math.round(m.profit * 100));
      days += m.days;
    }
    expect(days).toBe(rows.length);
  });
});

describe("monthByCategory", () => {
  it("adds each category up, biggest first, and puts deleted ones under one row", () => {
    const rows = [
      closing(new Date(2026, 10, 5), 900, [line("goods", 350), line("transport", 40), line("goods", 100)]),
      closing(new Date(2026, 10, 6), 900, [line("gone", 12), line("taxes", 100)]),
      closing(new Date(2026, 11, 1), 900, [line("goods", 5000)]),
    ];
    expect(monthByCategory(rows, nov, new Set(["goods", "transport", "taxes"]))).toEqual([
      { categoryId: "goods", total: 450, count: 2 },
      { categoryId: "taxes", total: 100, count: 1 },
      { categoryId: "transport", total: 40, count: 1 },
      { categoryId: "", total: 12, count: 1 },
    ]);
  });
});

describe("monthEntries", () => {
  it("lists the month newest first, the later written first on the same day", () => {
    const a = closing(new Date(2026, 10, 3), 1);
    const b = closing(new Date(2026, 10, 20), 1);
    const c = { ...closing(new Date(2026, 10, 3), 1), createdAt: new Date(2026, 10, 3, 12) };
    const outside = closing(new Date(2026, 11, 1), 1);
    expect(monthEntries([a, b, c, outside], nov).map((e) => e.id)).toEqual([b.id, c.id, a.id]);
  });
});

describe("monthCalendar", () => {
  it("puts each closing on its day, adds a day of two up, and splits the month into profits in and losses out", () => {
    const rows = [
      closing(new Date(2026, 10, 2, 21), 800, [line("transport", 40), line("goods", 350), line("operating", 50), line("taxes", 100)]), // +260
      closing(new Date(2026, 10, 2, 9), 100, [line("goods", 300)]), // −200, the same day
      closing(new Date(2026, 10, 4), 50, [line("operating", 50)]), // 0
      closing(new Date(2026, 10, 30, 23, 59), 10.1, [line("goods", 0.2)]), // +9,90
      closing(new Date(2026, 11, 1), 900), // December's
    ];
    const { days, totals } = monthCalendar(rows, nov);
    expect([...days.keys()].sort((a, b) => a - b)).toEqual([2, 4, 30]);
    expect(days.get(2)).toMatchObject({ profit: 60, gained: true, lost: true });
    expect(days.get(2)!.entries.map((e) => e.turnover)).toEqual([800, 100]);
    expect(days.get(4)).toMatchObject({ profit: 0, gained: false, lost: false });
    expect(days.get(30)!.profit).toBe(9.9);
    // In: 260 + 9,90; out: 200. The zero day is in neither.
    expect(totals).toEqual({ in: 269.9, out: 200, inCount: 2, outCount: 1 });
  });

  it("is empty for an empty month", () => {
    const { days, totals } = monthCalendar([], nov);
    expect(days.size).toBe(0);
    expect(totals).toEqual({ in: 0, out: 0, inCount: 0, outCount: 0 });
  });

  it("reconciles a second way over a year of invented closings: in − out is the month's profit, the days add up to it, and in and out are the personal records", () => {
    let seed = 11;
    const rand = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
    const rows: BusinessEntry[] = [];
    for (let i = 0; i < 400; i++) {
      const month = Math.floor(rand() * 12);
      const day = 1 + Math.floor(rand() * new Date(2026, month + 1, 0).getDate());
      const lines = Array.from({ length: Math.floor(rand() * 5) }, () => line("c", Math.round(1 + rand() * 40000) / 100));
      rows.push(closing(new Date(2026, month, day, Math.floor(rand() * 24)), Math.round(rand() * 60000) / 100, lines));
    }
    for (let month = 0; month < 12; month++) {
      const at = new Date(2026, month, 1);
      const { days, totals } = monthCalendar(rows, at);
      const m = byHand(rows, at);
      expect(Math.round(totals.in * 100) - Math.round(totals.out * 100)).toBe(Math.round(m.profit * 100));
      expect([...days.values()].reduce((s, d) => s + Math.round(d.profit * 100), 0)).toBe(Math.round(m.profit * 100));
      expect([...days.values()].reduce((s, d) => s + d.entries.length, 0)).toBe(m.days);
      // The personal records, as written: incomes are «in», expenses «out».
      const key = toISODay(at).slice(0, 7);
      const moves = rows.filter((r) => toISODay(r.date).slice(0, 7) === key).map((r) => personalMove(closingFigures(r).profit)).filter((x) => x !== null);
      expect(moves.filter((x) => x.type === "income").reduce((s, x) => s + Math.round(x.amount * 100), 0)).toBe(Math.round(totals.in * 100));
      expect(moves.filter((x) => x.type === "expense").reduce((s, x) => s + Math.round(x.amount * 100), 0)).toBe(Math.round(totals.out * 100));
      expect(moves.filter((x) => x.type === "income").length).toBe(totals.inCount);
      expect(moves.filter((x) => x.type === "expense").length).toBe(totals.outCount);
    }
  });
});
