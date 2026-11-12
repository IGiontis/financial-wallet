import { describe, it, expect } from "vitest";
import { businessReach, closingFigures, closingLineIds, forBusiness, inMonth, lineUses, monthByExpenseLine, monthCalendar, monthEntries, monthSummary, personalMove, personalRecord } from "./businessSummary";
import { toISODay } from "../../shared/utils/dates";
import { nameKey } from "../../shared/utils/nameMatch";
import { BUSINESS_CATEGORY_ID } from "../../shared/utils/categories";
import type { BusinessEntry, BusinessExpense, BusinessIncome } from "../../shared/types/IndexTypes";

// The «Δουλειά» figures, checked hard: each by hand on a small month, then
// every figure of every month a SECOND way, from the raw closings — the month
// told by its "YYYY-MM" text rather than by the timestamps `inMonth` compares,
// the profit as a signed walk over every line in cents (+each income, −each
// expense), the expense bars added back up, and «Όλες» as the businesses added
// together.

let n = 0;
const inc = (lineId: string, amount: number): BusinessIncome => ({ lineId, amount });
const out = (lineId: string, amount: number): BusinessExpense => ({ lineId, amount });
const once = (name: string, amount: number): BusinessExpense => ({ name, amount });
const closing = (businessId: string, date: Date, incomes: BusinessIncome[], expenses: BusinessExpense[] = [], linked = true): BusinessEntry => {
  const id = `c${++n}`;
  const profit = closingFigures({ incomes, expenses }).profit;
  return { id, userId: "u1", businessId, date, incomes, expenses, lineIds: closingLineIds({ incomes, expenses }), ...(linked && Math.round(profit * 100) !== 0 ? { linkedTransactionId: `t-${id}` } : {}), createdAt: date, updatedAt: date };
};

/** The second way: the month as text; the profit as one signed walk over every amount, in cents. */
function byHand(entries: BusinessEntry[], month: Date, businessId?: string) {
  const key = toISODay(month).slice(0, 7);
  let walk = 0;
  let turnover = 0;
  let spent = 0;
  let days = 0;
  for (const e of entries) {
    if (toISODay(e.date).slice(0, 7) !== key || (businessId && e.businessId !== businessId)) continue;
    days++;
    for (const l of e.incomes) {
      walk += Math.round(l.amount * 100);
      turnover += Math.round(l.amount * 100);
    }
    for (const l of e.expenses) {
      walk -= Math.round(l.amount * 100);
      spent += Math.round(l.amount * 100);
    }
  }
  return { turnover: turnover / 100, expenses: spent / 100, profit: walk / 100, days };
}

const nov = new Date(2026, 10, 1);
const PH = "biz-pharmacy";
const MK = "biz-market";

describe("closingFigures", () => {
  it("counts a pharmacy's day by hand: 520 + 180 in; 350 stock, 60 staff, 40 a one-off → 250 profit", () => {
    const day = closing(PH, new Date(2026, 10, 12), [inc("till", 520), inc("eopyy", 180)], [out("stock", 350), out("staff", 60), once("Επισκευή ψυγείου", 40)]);
    // 520 + 180 = 700; 350 + 60 + 40 = 450; 700 − 450 = 250.
    expect(closingFigures(day)).toEqual({ turnover: 700, expenses: 450, profit: 250 });
    expect(personalMove(closingFigures(day).profit)).toEqual({ type: "income", amount: 250 });
  });

  it("a day with no expenses is all profit; a day of only expenses is a loss", () => {
    expect(closingFigures(closing(PH, nov, [inc("till", 315.4)]))).toEqual({ turnover: 315.4, expenses: 0, profit: 315.4 });
    expect(closingFigures(closing(PH, nov, [], [out("tax", 420.15)]))).toEqual({ turnover: 0, expenses: 420.15, profit: -420.15 });
  });

  it("adds in whole cents", () => {
    const day = closing(PH, nov, [inc("a", 0.1), inc("b", 0.2)], [out("x", 0.3)]);
    expect(closingFigures(day)).toEqual({ turnover: 0.3, expenses: 0.3, profit: 0 });
    expect(personalMove(closingFigures(day).profit)).toBeNull();
  });

  it("reads a closing written without lists as one with none", () => {
    expect(closingFigures({ incomes: undefined as unknown as BusinessIncome[], expenses: undefined as unknown as BusinessExpense[] })).toEqual({ turnover: 0, expenses: 0, profit: 0 });
  });

  it("names each line once, incomes first, never a one-off", () => {
    expect(closingLineIds({ incomes: [inc("till", 1), inc("eopyy", 2), inc("till", 3)], expenses: [out("stock", 1), once("x", 2), out("till", 1)] })).toEqual(["till", "eopyy", "stock"]);
  });
});

describe("personalMove and personalRecord", () => {
  it("is an income of a profit, an expense of a loss, and nothing at zero", () => {
    expect(personalMove(260)).toEqual({ type: "income", amount: 260 });
    expect(personalMove(-200)).toEqual({ type: "expense", amount: 200 });
    expect(personalMove(0)).toBeNull();
    // Less than half a cent either way is zero; a cent is not.
    expect(personalMove(0.004)).toBeNull();
    expect(personalMove(-0.01)).toEqual({ type: "expense", amount: 0.01 });
  });

  it("writes the record under «Δουλειά» — no category of the user's — named for the business", () => {
    const describe = (type: "income" | "expense") => `${type === "income" ? "Κέρδος" : "Ζημιά"} · Φαρμακείο`;
    const day = new Date(2026, 10, 12, 21);
    // 700 − 450 = +250, into the card.
    expect(personalRecord({ businessId: PH, date: day, incomes: [inc("till", 700)], expenses: [out("stock", 450)], accountId: "acc-card" }, describe)).toEqual({
      amount: 250,
      type: "income",
      categoryId: BUSINESS_CATEGORY_ID,
      date: day,
      description: "Κέρδος · Φαρμακείο",
      businessId: PH,
      accountId: "acc-card",
    });
    // 300 − 540 = −240: an expense of 240, out of the main account (no card named).
    expect(personalRecord({ businessId: PH, date: day, incomes: [inc("till", 300)], expenses: [out("rent", 540)] }, describe)).toEqual({ amount: 240, type: "expense", categoryId: BUSINESS_CATEGORY_ID, date: day, description: "Ζημιά · Φαρμακείο", businessId: PH });
    expect(personalRecord({ businessId: PH, date: day, incomes: [inc("till", 50)], expenses: [out("rent", 50)] }, describe)).toBeNull();
  });
});

describe("monthSummary, one business and «Όλες»", () => {
  const rows = [
    closing(PH, new Date(2026, 10, 2), [inc("till", 500), inc("eopyy", 300)], [out("stock", 350), out("staff", 60), out("rent", 130)]), // 800 − 540 = +260
    closing(PH, new Date(2026, 10, 3), [inc("till", 640.5)], [out("stock", 210.25)]), // +430,25
    // A loss: the month's tax day.
    closing(PH, new Date(2026, 10, 4), [inc("till", 120)], [out("tax", 380)]), // −260
    closing(MK, new Date(2026, 10, 4), [inc("sales", 310.4)], [out("produce", 180), out("fuel", 25.6)]), // +104,80
    closing(MK, new Date(2026, 10, 7), [inc("sales", 90)], [out("produce", 150)]), // rained off: −60
    // October and December: not November's.
    closing(PH, new Date(2026, 9, 31, 23, 59), [inc("till", 999)], [out("stock", 1)]),
    closing(MK, new Date(2026, 11, 1, 0, 0), [inc("sales", 50)]),
  ];

  it("adds each business's November up, by hand", () => {
    // Pharmacy: turnover 800 + 640,50 + 120 = 1.560,50; expenses 540 + 210,25 + 380 = 1.130,25; profit 430,25.
    expect(monthSummary(forBusiness(rows, PH), nov)).toEqual({ turnover: 1560.5, expenses: 1130.25, profit: 430.25, days: 3 });
    // Market: turnover 310,40 + 90 = 400,40; expenses 205,60 + 150 = 355,60; profit 44,80.
    expect(monthSummary(forBusiness(rows, MK), nov)).toEqual({ turnover: 400.4, expenses: 355.6, profit: 44.8, days: 2 });
    // «Όλες»: 1.560,50 + 400,40 = 1.960,90; 1.130,25 + 355,60 = 1.485,85; 430,25 + 44,80 = 475,05; 5 days.
    expect(monthSummary(forBusiness(rows, undefined), nov)).toEqual({ turnover: 1960.9, expenses: 1485.85, profit: 475.05, days: 5 });
  });

  it("matches the walk by hand, and «Όλες» is the businesses added together", () => {
    for (const id of [PH, MK, undefined]) expect(monthSummary(forBusiness(rows, id), nov)).toEqual(byHand(rows, nov, id));
    // The days' profits, one by one: 260 + 430,25 − 260 + 104,80 − 60 = 475,05.
    expect(monthEntries(rows, nov).reduce((s, r) => s + Math.round(closingFigures(r).profit * 100), 0)).toBe(47505);
  });

  it("goes negative for a month of losses", () => {
    const losing = [closing(MK, new Date(2026, 10, 2), [inc("sales", 100)], [out("produce", 300)]), closing(MK, new Date(2026, 10, 3), [inc("sales", 50)], [once("Πρόστιμο", 75.5)])];
    expect(monthSummary(losing, nov)).toEqual({ turnover: 150, expenses: 375.5, profit: -225.5, days: 2 });
  });

  it("is all zeros for an empty month, and for a month with closings only around it", () => {
    const zero = { turnover: 0, expenses: 0, profit: 0, days: 0 };
    expect(monthSummary([], nov)).toEqual(zero);
    expect(monthSummary([closing(PH, new Date(2026, 9, 31, 23, 59, 59, 999), [inc("t", 10)]), closing(PH, new Date(2026, 11, 1), [inc("t", 10)])], nov)).toEqual(zero);
  });

  it("puts the last millisecond of a month in it and the first of the next in the next — across a new year too", () => {
    const lastOfDec = closing(PH, new Date(2026, 11, 31, 23, 59, 59, 999), [inc("t", 1)]);
    const firstOfJan = closing(MK, new Date(2027, 0, 1, 0, 0, 0, 0), [inc("s", 2)]);
    const lastOfFeb = closing(PH, new Date(2027, 1, 28, 23, 59), [inc("t", 4)], [out("x", 8)]);
    const all = [lastOfDec, firstOfJan, lastOfFeb];
    expect(monthSummary(all, new Date(2026, 11, 15)).turnover).toBe(1);
    expect(monthSummary(all, new Date(2027, 0, 31)).turnover).toBe(2);
    expect(monthSummary(all, new Date(2027, 1, 1))).toEqual({ turnover: 4, expenses: 8, profit: -4, days: 1 });
    expect(inMonth(lastOfDec, new Date(2027, 0, 1))).toBe(false);
    expect(inMonth(firstOfJan, new Date(2026, 11, 1))).toBe(false);
    for (const month of [new Date(2026, 11, 1), new Date(2027, 0, 1), new Date(2027, 1, 1), new Date(2027, 2, 1)]) expect(monthSummary(all, month)).toEqual(byHand(all, month));
  });

  it("takes dates as Firestore hands them back (a Timestamp-like object, or a date string)", () => {
    const ts = { toDate: () => new Date(2026, 10, 5) } as unknown as Date;
    const got = [closing(PH, ts, [inc("t", 20)], [out("x", 5)]), closing(PH, "2026-11-06T10:00:00" as unknown as Date, [inc("t", 7)])];
    expect(monthSummary(got, nov)).toEqual({ turnover: 27, expenses: 5, profit: 22, days: 2 });
  });

  it("reconciles every figure of a year of invented closings of three businesses a second way", () => {
    let seed = 7;
    const rand = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
    const ids = ["b1", "b2", "b3"];
    const year: BusinessEntry[] = [];
    for (let i = 0; i < 600; i++) {
      const month = Math.floor(rand() * 12);
      const day = 1 + Math.floor(rand() * new Date(2026, month + 1, 0).getDate());
      const at = rand() < 0.1 ? new Date(2026, month, day, 23, 59, 59, 999) : rand() < 0.1 ? new Date(2026, month, day, 0, 0) : new Date(2026, month, day, 20, 30);
      const incomes = Array.from({ length: 1 + Math.floor(rand() * 3) }, () => inc(`i${Math.floor(rand() * 3)}`, Math.round(rand() * 60000) / 100));
      const expenses = Array.from({ length: Math.floor(rand() * 6) }, () => (rand() < 0.2 ? once(`once${Math.floor(rand() * 2)}`, Math.round(1 + rand() * 30000) / 100) : out(`e${Math.floor(rand() * 4)}`, Math.round(1 + rand() * 50000) / 100)));
      year.push(closing(ids[Math.floor(rand() * 3)], at, incomes, expenses));
    }
    let days = 0;
    for (let month = 0; month < 12; month++) {
      const at = new Date(2026, month, 1);
      const all = monthSummary(year, at);
      expect(all).toEqual(byHand(year, at));
      expect(Math.round((all.turnover - all.expenses) * 100)).toBe(Math.round(all.profit * 100));
      // «Όλες» is each business's own figures added up.
      const each = ids.map((id) => monthSummary(forBusiness(year, id), at));
      ids.forEach((id, i) => expect(each[i]).toEqual(byHand(year, at, id)));
      expect(each.reduce((s, m) => s + Math.round(m.turnover * 100), 0)).toBe(Math.round(all.turnover * 100));
      expect(each.reduce((s, m) => s + Math.round(m.expenses * 100), 0)).toBe(Math.round(all.expenses * 100));
      expect(each.reduce((s, m) => s + Math.round(m.profit * 100), 0)).toBe(Math.round(all.profit * 100));
      expect(each.reduce((s, m) => s + m.days, 0)).toBe(all.days);
      // The bars add up to the tile, expense by expense — all and each.
      const bars = monthByExpenseLine(year, at);
      expect(bars.reduce((s, b) => s + Math.round(b.total * 100), 0)).toBe(Math.round(all.expenses * 100));
      expect(bars.reduce((s, b) => s + b.count, 0)).toBe(year.filter((r) => inMonth(r, at)).reduce((s, r) => s + r.expenses.length, 0));
      for (const id of ids) expect(monthByExpenseLine(forBusiness(year, id), at).reduce((s, b) => s + Math.round(b.total * 100), 0)).toBe(Math.round(byHand(year, at, id).expenses * 100));
      // The days' personal moves add up to the month's profit: incomes in, expenses out.
      const moved = monthEntries(year, at).reduce((s, r) => {
        const move = personalMove(closingFigures(r).profit);
        return s + (move ? (move.type === "income" ? 1 : -1) * Math.round(move.amount * 100) : 0);
      }, 0);
      expect(moved).toBe(Math.round(all.profit * 100));
      days += all.days;
    }
    expect(days).toBe(year.length);
  });
});

describe("monthByExpenseLine", () => {
  it("adds each expense line up, biggest first, one-offs by name within their business", () => {
    const rows = [
      closing(PH, new Date(2026, 10, 5), [inc("till", 900)], [out("stock", 350), out("rent", 40), out("stock", 100), once("Επισκευή ψυγείου", 30)]),
      closing(PH, new Date(2026, 10, 6), [inc("till", 900)], [once("επισκευη  ψυγειου", 12), out("tax", 100)]),
      closing(MK, new Date(2026, 10, 6), [inc("sales", 300)], [once("Επισκευή ψυγείου", 5)]),
      closing(PH, new Date(2026, 11, 1), [inc("till", 900)], [out("stock", 5000)]),
    ];
    expect(monthByExpenseLine(rows, nov)).toEqual([
      { key: "line:stock", businessId: PH, lineId: "stock", total: 450, count: 2 },
      { key: "line:tax", businessId: PH, lineId: "tax", total: 100, count: 1 },
      // 30 + 12: the same name, typed two ways, in the same business.
      { key: `once:${PH}:${nameKey("Επισκευή ψυγείου")}`, businessId: PH, name: "Επισκευή ψυγείου", total: 42, count: 2 },
      { key: "line:rent", businessId: PH, lineId: "rent", total: 40, count: 1 },
      // Another business's one-off of that name is its own row.
      { key: `once:${MK}:${nameKey("Επισκευή ψυγείου")}`, businessId: MK, name: "Επισκευή ψυγείου", total: 5, count: 1 },
    ]);
    // 450 + 100 + 40 + 42 + 5 = 637 = the month's expenses tile.
    expect(monthSummary(rows, nov).expenses).toBe(637);
  });
});

describe("lineUses and businessReach — what the confirmations count, from the closings on the device", () => {
  const rows = [
    closing(PH, new Date(2026, 10, 2), [inc("till", 800)], [out("stock", 540)]), // +260
    closing(PH, new Date(2026, 10, 3), [inc("till", 100), inc("eopyy", 20)], [out("rent", 400)]), // −280
    closing(PH, new Date(2026, 10, 4), [inc("till", 50)], [out("stock", 50)]), // 0: no record
    closing(PH, new Date(2026, 10, 5), [inc("till", 70.1)], [], false), // +70,10 but its record is gone
    closing(MK, new Date(2026, 10, 5), [inc("sales", 300)], [out("produce", 100)]), // +200, another business
  ];

  it("counts each line's closings once, however many times a closing names it", () => {
    const uses = lineUses([...rows, closing(PH, nov, [inc("till", 1), inc("till", 2)])]);
    expect(uses.get("till")).toBe(5);
    expect(uses.get("eopyy")).toBe(1);
    expect(uses.get("stock")).toBe(2);
    expect(uses.get("sales")).toBe(1);
  });

  it("says what deleting a business takes with it: closings, records, and what they added up to", () => {
    // Pharmacy: 4 closings; records: +260 and −280 (the zero day has none, the 70,10 one lost its own).
    expect(businessReach(rows, PH)).toEqual({ closings: 4, records: 2, profitIn: 260, lossOut: 280 });
    expect(businessReach(rows, MK)).toEqual({ closings: 1, records: 1, profitIn: 200, lossOut: 0 });
    expect(businessReach(rows, "nope")).toEqual({ closings: 0, records: 0, profitIn: 0, lossOut: 0 });
  });
});

describe("monthEntries", () => {
  it("lists the month newest first, the later written first on the same day", () => {
    const a = closing(PH, new Date(2026, 10, 3), [inc("t", 1)]);
    const b = closing(MK, new Date(2026, 10, 20), [inc("s", 1)]);
    const c = { ...closing(PH, new Date(2026, 10, 3), [inc("t", 1)]), createdAt: new Date(2026, 10, 3, 12) };
    const outside = closing(PH, new Date(2026, 11, 1), [inc("t", 1)]);
    expect(monthEntries([a, b, c, outside], nov).map((e) => e.id)).toEqual([b.id, c.id, a.id]);
  });
});

describe("monthCalendar", () => {
  it("puts each closing on its day, adds a day of two businesses up, and splits the month into profits in and losses out", () => {
    const rows = [
      closing(PH, new Date(2026, 10, 2, 21), [inc("till", 800)], [out("stock", 540)]), // +260
      closing(MK, new Date(2026, 10, 2, 9), [inc("sales", 100)], [out("produce", 300)]), // −200, the same day
      closing(PH, new Date(2026, 10, 4), [inc("till", 50)], [out("stock", 50)]), // 0
      closing(PH, new Date(2026, 10, 30, 23, 59), [inc("till", 10.1)], [out("stock", 0.2)]), // +9,90
      closing(PH, new Date(2026, 11, 1), [inc("till", 900)]), // December's
    ];
    const { days, totals } = monthCalendar(rows, nov);
    expect([...days.keys()].sort((a, b) => a - b)).toEqual([2, 4, 30]);
    expect(days.get(2)).toMatchObject({ profit: 60, gained: true, lost: true });
    expect(days.get(2)!.entries.map((e) => e.businessId)).toEqual([PH, MK]);
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
      const expenses = Array.from({ length: Math.floor(rand() * 5) }, () => out("c", Math.round(1 + rand() * 40000) / 100));
      rows.push(closing(rand() < 0.5 ? PH : MK, new Date(2026, month, day, Math.floor(rand() * 24)), [inc("t", Math.round(rand() * 60000) / 100)], expenses));
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
