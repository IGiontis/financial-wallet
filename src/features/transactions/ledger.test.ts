import { describe, it, expect } from "vitest";
import { buildLedger } from "./ledger";
import type { Transaction } from "../../shared/types/IndexTypes";

// October 2026, read on the 14th. Every figure worked out by hand first, then
// a second way: the running net's last value against the net, the days
// against the totals.

const at = (day: number, h: number, m = 0, month = 9) => new Date(2026, month, day, h, m);
let n = 0;
const tx = (extra: Partial<Transaction> & { amount: number; date: Date; createdAt: Date }): Transaction =>
  ({ id: `t${++n}`, userId: "u", type: "expense", categoryId: "food", description: "", updatedAt: extra.createdAt, ...extra }) as Transaction;

const RECORDS = [
  tx({ type: "income", categoryId: "salary", amount: 1450, description: "Μισθός", date: at(1, 0), createdAt: at(1, 9) }),
  tx({ amount: 50, description: "Σούπερ μάρκετ", accountId: "rev", date: at(1, 0), createdAt: at(1, 18) }),
  // On the 3rd: the rent written at 07:00, the coffee at 08:00 — the date's own hours say otherwise.
  tx({ categoryId: "coffee", amount: 3.5, description: "Καφές", date: at(3, 3), createdAt: at(3, 8) }),
  tx({ categoryId: "rent", amount: 400, description: "Ενοίκιο", date: at(3, 21), createdAt: at(3, 7) }),
  // Moves between pockets: a transfer (two halves, one row), a goal deposit, a loan received.
  tx({ amount: 200, description: "Revolut → Eurobank", transferId: "x", transferPart: "out", date: at(5, 0), createdAt: at(5, 10) }),
  tx({ type: "income", amount: 200, description: "Revolut → Eurobank", transferId: "x", transferPart: "in", date: at(5, 0), createdAt: at(5, 10) }),
  tx({ type: "investment", amount: 100, description: "Στόχος", isGoalTransaction: true, isInvestmentTransaction: true, contributionType: "deposit", date: at(6, 0), createdAt: at(6, 10) }),
  // Money back out of a goal is money in.
  tx({ type: "investment", amount: 30, description: "Από στόχο", isGoalTransaction: true, isInvestmentTransaction: true, contributionType: "withdrawal", date: at(7, 0), createdAt: at(7, 10) }),
  tx({ type: "income", amount: 500, description: "Δάνειο", debtId: "d", debtPart: "loan", date: at(8, 0), createdAt: at(8, 10) }),
  // September: outside.
  tx({ amount: 10, description: "Σεπτέμβρης", date: at(30, 0, 0, 8), createdAt: at(30, 9, 0, 8) }),
];

const OCT = { from: new Date(2026, 9, 1), to: new Date(2026, 9, 31), now: at(14, 12) };

describe("the ledger of a month", () => {
  const ledger = buildLedger(RECORDS, OCT);

  it("counts in 1.480 and out 453,50 — moves between pockets listed, not counted", () => {
    // In: the salary 1.450 and the 30 back from the goal. Out: 50 + 3,50 + 400.
    expect([ledger.in, ledger.out, ledger.net]).toEqual([1480, 453.5, 1026.5]);
    expect(1450 + 30 - (50 + 3.5 + 400)).toBe(1026.5);
    // Eight rows: the transfer is one, September is out.
    expect(ledger.count).toBe(8);
    // A second way: the days add up to the same totals.
    expect(ledger.days.reduce((s, d) => s + d.in, 0)).toBe(1480);
    expect(ledger.days.reduce((s, d) => s + d.out, 0)).toBe(453.5);
  });

  it("runs the net record by record, in the order they were written, and ends on the net", () => {
    const oldestFirst = [...ledger.days].reverse().flatMap((d) => [...d.rows].reverse());
    expect(oldestFirst.map((r) => [r.tx.description, r.running])).toEqual([
      ["Μισθός", 1450],
      ["Σούπερ μάρκετ", 1400],
      ["Ενοίκιο", 1000],
      ["Καφές", 996.5],
      ["Revolut → Eurobank", 996.5],
      ["Στόχος", 996.5],
      ["Από στόχο", 1026.5],
      ["Δάνειο", 1026.5],
    ]);
    expect(oldestFirst.at(-1)!.running).toBe(ledger.net);
  });

  it("lists each day newest first, by when it was written — not by the date's own hour", () => {
    const third = ledger.days.find((d) => d.date.getDate() === 3)!;
    expect(third.rows.map((r) => r.tx.description)).toEqual(["Καφές", "Ενοίκιο"]);
    expect([third.in, third.out]).toEqual([0, 403.5]);
    expect(ledger.days[0].date.getDate()).toBe(8);
  });

  it("spends 453,50 over the 14 days begun: 32,39 a day", () => {
    expect(ledger.perDay).toBe(32.39);
    expect(Math.round((453.5 / 14) * 100) / 100).toBe(32.39);
  });

  it("splits the spending by category, largest first, the shares making the whole", () => {
    expect(ledger.spending.map((c) => [c.categoryId, c.amount])).toEqual([
      ["rent", 400],
      ["food", 50],
      ["coffee", 3.5],
    ]);
    expect(ledger.spending.reduce((s, c) => s + c.share, 0)).toBeCloseTo(1, 10);
    expect(ledger.earning.map((c) => c.categoryId)).toEqual(["salary", "food"]);
  });

  it("keeps each category's records — only the counted ones, newest first, adding up to its figure", () => {
    // «food» out is the supermarket alone: the transfer and the goal deposit carry the same category but are moves.
    const food = ledger.spending.find((c) => c.categoryId === "food")!;
    expect(food.rows.map((r) => r.tx.description)).toEqual(["Σούπερ μάρκετ"]);
    // «food» in is the 30 back from the goal, not the supermarket.
    expect(ledger.earning.find((c) => c.categoryId === "food")!.rows.map((r) => r.tx.description)).toEqual(["Από στόχο"]);
    // A second way: every category's rows sum to its amount and number its count, and the side's rows to its total.
    for (const c of [...ledger.spending, ...ledger.earning]) {
      expect(c.rows.reduce((s, r) => s + r.amount, 0)).toBeCloseTo(c.amount, 10);
      expect(c.rows).toHaveLength(c.count);
    }
    expect(ledger.spending.flatMap((c) => c.rows).reduce((s, r) => s + r.amount, 0)).toBe(ledger.out);
    // Newest first: two coffees a day apart list the later one on top.
    const two = buildLedger(
      [tx({ categoryId: "coffee", amount: 2, description: "first", date: at(2, 9), createdAt: at(2, 9) }), tx({ categoryId: "coffee", amount: 3, description: "second", date: at(4, 9), createdAt: at(4, 9) })],
      OCT,
    );
    expect(two.spending[0].rows.map((r) => r.tx.description)).toEqual(["second", "first"]);
  });
});

describe("narrowing it", () => {
  it("to money in, money out, or the moves", () => {
    expect(buildLedger(RECORDS, { ...OCT, kind: "in" }).count).toBe(2);
    expect(buildLedger(RECORDS, { ...OCT, kind: "out" }).count).toBe(3);
    const moves = buildLedger(RECORDS, { ...OCT, kind: "moves" });
    expect(moves.days.flatMap((d) => d.rows.map((r) => r.tx.description)).sort()).toEqual(["Revolut → Eurobank", "Δάνειο", "Στόχος"].sort());
    expect([moves.in, moves.out]).toEqual([0, 0]);
  });

  it("to one card, and to a word", () => {
    const rev = buildLedger(RECORDS, { ...OCT, account: "rev", accountOf: (t) => t.accountId ?? "main" });
    expect(rev.days.flatMap((d) => d.rows.map((r) => r.tx.description))).toEqual(["Σούπερ μάρκετ"]);
    expect(buildLedger(RECORDS, { ...OCT, query: "καφ" }).out).toBe(3.5);
  });

  it("to one category — its rows, and the out they add up to", () => {
    const food = buildLedger(RECORDS, { ...OCT, categories: ["food"] });
    const rows = food.days.flatMap((d) => d.rows);
    expect(rows.every((r) => r.tx.categoryId === "food")).toBe(true);
    // A second way: the counted rows of the category, added up by hand — the supermarket's 50, nothing of September's.
    expect(food.out).toBe(Math.round(rows.filter((r) => r.counted && r.sign < 0).reduce((sum, r) => sum + r.amount, 0) * 100) / 100);
    expect(buildLedger(RECORDS, { ...OCT, categories: ["rent"] }).out).toBe(400);
    expect(buildLedger(RECORDS, { ...OCT, categories: ["rent"], kind: "in" }).count).toBe(0);
  });

  it("to a name that is both an income and an expense category: both, in and out", () => {
    const both = buildLedger(RECORDS, { ...OCT, categories: ["salary", "rent"] });
    expect([both.in, both.out]).toEqual([1450, 400]);
    // A second way: the two on their own add up to the pair.
    expect(buildLedger(RECORDS, { ...OCT, categories: ["salary"] }).count + buildLedger(RECORDS, { ...OCT, categories: ["rent"] }).count).toBe(both.count);
  });
});
