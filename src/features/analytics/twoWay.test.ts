import { describe, it, expect } from "vitest";
import { sameName, twoWay, twoWayOptions } from "./twoWay";
import type { Category, Transaction } from "../../shared/types/IndexTypes";

// One category both ways, on the case it was made for: stakes filed under
// «Sports Betting», wins under «Other Income» with the bookmaker's name.
// Every figure is worked out by hand first, then checked a second way.

const cat = (id: string, name: string, type: "income" | "expense") => ({ id, name, type }) as Pick<Category, "id" | "name" | "type">;
const CATEGORIES = [cat("bet", "Sports Betting", "expense"), cat("oi", "Other Income", "income"), cat("fun", "Entertainment", "expense"), cat("food", "Groceries", "expense")];

let n = 0;
const tx = (type: "income" | "expense", categoryId: string, amount: number, date: Date, description: string, extra: Partial<Transaction> = {}): Transaction =>
  ({ id: `t${++n}`, userId: "u", type, categoryId, amount, date, description, createdAt: date, updatedAt: date, ...extra }) as Transaction;
const d = (m: number, day: number) => new Date(2026, m - 1, day, 12);

const RECORDS = [
  // August: three stakes, 10 + 20 + 50 = 80.
  tx("expense", "bet", 10, d(8, 3), "Stoiximan"),
  tx("expense", "bet", 20, d(8, 10), "Novibet"),
  tx("expense", "bet", 50, d(8, 20), "Stoiximan"),
  // September: a stake of 30, a win of 100 — written by hand, "stoiximan " — and two that are not this.
  tx("expense", "bet", 30, d(9, 5), "Stoiximan"),
  tx("income", "oi", 100, d(9, 12), "stoiximan "),
  tx("income", "oi", 15, d(9, 14), "Refund"),
  tx("expense", "fun", 7, d(9, 20), "Stoiximan"),
  // October: a win of 24.37, and a transfer that is no one's income.
  tx("income", "oi", 24.37, d(10, 2), "Stoiximan"),
  tx("income", "oi", 200, d(10, 3), "Stoiximan", { transferId: "x1", transferPart: "in" }),
  // Before the window.
  tx("expense", "bet", 999, d(7, 30), "Stoiximan"),
  tx("expense", "food", 40, d(9, 1), "Lidl"),
];

const NOW = new Date(2026, 9, 13, 10);
const FROM = new Date(2026, 7, 1);

describe("one category, both ways", () => {
  const r = twoWay(RECORDS, CATEGORIES, "bet", { from: FROM, now: NOW });

  it("counts out 4 times, 110, and in 2 times, 124.37 — the wins found by name", () => {
    expect([r.outCount, r.out]).toEqual([4, 110]);
    expect(10 + 20 + 50 + 30).toBe(110);
    expect([r.inCount, r.in]).toEqual([2, 124.37]);
    expect(r.net).toBe(14.37);
    // Of every 1 out, 1.13 came back.
    expect(r.returned).toBeCloseTo(124.37 / 110, 6);
  });

  it("puts each month on its own: Aug −80, Sep 100 − 30, Oct +24.37", () => {
    expect(r.buckets.map((b) => [b.key, b.in, b.inCount, b.out, b.outCount, b.net])).toEqual([
      ["2026-08-01", 0, 0, 80, 3, -80],
      ["2026-09-01", 100, 1, 30, 1, 70],
      ["2026-10-01", 24.37, 1, 0, 0, 24.37],
    ]);
    // A second way: the months add up to the totals, and the running figure ends on the net.
    expect(Math.round(r.buckets.reduce((s, b) => s + b.net, 0) * 100) / 100).toBe(r.net);
    expect(r.buckets.map((b) => b.cumNet)).toEqual([-80, -10, 14.37]);
    expect(r.buckets.at(-1)).toMatchObject({ cumIn: r.in, cumOut: r.out });
  });

  it("says which names brought the other side in, and leaves out what is not this", () => {
    expect(r.linked).toEqual([{ name: "stoiximan", count: 2, amount: 124.37 }]);
    // The «Refund» of 15, the 7 under «Entertainment», the transfer of 200: none of them.
    expect(r.in + r.out).toBe(234.37);
  });

  it("names the biggest each way", () => {
    expect(r.biggestIn).toMatchObject({ amount: 100, label: "stoiximan" });
    expect(r.biggestOut).toMatchObject({ amount: 50, label: "Stoiximan" });
  });

  it("drops the names when switched off — then only the stakes", () => {
    const own = twoWay(RECORDS, CATEGORIES, "bet", { from: FROM, now: NOW, linkNames: false });
    expect([own.in, own.out, own.net]).toEqual([0, 110, -110]);
    expect(own.linked).toHaveLength(1);
  });

  it("works from the income side too: the wins, with the stakes found by name", () => {
    const wins = twoWay(RECORDS, CATEGORIES, "oi", { from: FROM, now: NOW });
    // All of «Other Income»: 100 + 15 + 24.37. Out, by its names: the four stakes to Stoiximan
    // in the window plus the 7 under «Entertainment» — 10 + 50 + 30 + 7. Novibet is not a name it has.
    expect([wins.in, wins.out]).toEqual([139.37, 97]);
  });

  it("goes back to the first record for everything, and by week when asked", () => {
    const all = twoWay(RECORDS, CATEGORIES, "bet", { from: null, now: NOW });
    expect(all.buckets[0].key).toBe("2026-07-01");
    expect(all.out).toBe(110 + 999);

    const weeks = twoWay(RECORDS, CATEGORIES, "bet", { from: new Date(2026, 9, 1), now: NOW, byWeek: true });
    // From Monday 28 Sep to the week of the 13th: 28/9, 5/10, 12/10.
    expect(weeks.buckets.map((b) => b.key)).toEqual(["2026-09-28", "2026-10-05", "2026-10-12"]);
    expect(weeks.buckets[0]).toMatchObject({ in: 24.37, inCount: 1 });
  });
});

describe("a category made twice, once each side", () => {
  const twins = [cat("s-out", "Στοίχημα", "expense"), cat("s-in", "ΣΤΟΊΧΗΜΑ ", "income")];
  const records = [tx("expense", "s-out", 40, d(9, 1), ""), tx("income", "s-in", 90, d(9, 9), "")];

  it("is one topic, whichever of the two is picked", () => {
    for (const id of ["s-out", "s-in"]) {
      const r = twoWay(records, twins, id, { from: FROM, now: NOW });
      expect([r.in, r.out, r.net]).toEqual([90, 40, 50]);
    }
    expect(sameName("ΣΤΟΊΧΗΜΑ ")).toBe(sameName("Στοίχημα"));
  });

  it("is offered once", () => {
    expect(twoWayOptions(records, twins)).toHaveLength(1);
  });
});

describe("what the picker offers", () => {
  it("money both ways first, then the rest by how many records, and nothing without one", () => {
    const options = twoWayOptions(RECORDS, [...CATEGORIES, cat("gym", "Gym", "expense")]);
    expect(options.map((o) => [o.id, o.bothWays])).toEqual([
      ["bet", true],
      ["oi", true],
      ["fun", true],
      ["food", false],
    ]);
  });
});
