import { describe, it, expect } from "vitest";
import { mergeTargets, movedCount, planCategoryMerge } from "./categoryMerge";
import { categoryUsage, totalUsage } from "../categories/categoryUsage";

// A merge moves money from one category to another. Every figure here is
// checked a second way: the totals per category before and after, worked out
// by hand, and the moved count against the delete guard's own count.

const tx = (id: string, categoryId: string, amount: number) => ({ id, categoryId, amount });

/** Totals per category, summed independently of the plan. */
const totals = (rows: { categoryId: string; amount: number }[]) => {
  const out: Record<string, number> = {};
  for (const r of rows) out[r.categoryId] = Math.round(((out[r.categoryId] ?? 0) + r.amount) * 100) / 100;
  return out;
};

describe("mergeTargets: side to side, own into anything", () => {
  it("pairs each dropped document with the kept one of the same side", () => {
    expect(mergeTargets([{ id: "a-exp", type: "expense" }, { id: "a-inc", type: "income" }], [{ id: "b-inc", type: "income" }, { id: "b-exp", type: "expense" }])).toEqual({ "a-exp": "b-exp", "a-inc": "b-inc" });
  });

  it("refuses when the kept one lacks a side, when a built-in would go, and into itself", () => {
    expect(mergeTargets([{ id: "a-exp", type: "expense" }, { id: "a-inc", type: "income" }], [{ id: "b-exp", type: "expense" }])).toBeNull();
    expect(mergeTargets([{ id: "def", type: "expense", isDefault: true }], [{ id: "own", type: "expense" }])).toBeNull();
    expect(mergeTargets([{ id: "a", type: "expense" }], [{ id: "a", type: "expense" }])).toBeNull();
    expect(mergeTargets([{ id: "a", type: "expense" }], [{ id: "b", type: "income" }])).toBeNull();
  });
});

describe("planCategoryMerge", () => {
  const transactions = [tx("t1", "kafes", 3.5), tx("t2", "kafes", 4.2), tx("t3", "coffee", 2.5), tx("t4", "coffee", 3), tx("t5", "food", 12.3), tx("t6", "kafes", 1.8)];
  const bills = [{ id: "b1", categoryId: "kafes" }, { id: "b2", categoryId: "food" }];
  const incomes = [{ id: "i1", name: "x", categoryId: "kafes", amount: 5 }, { id: "i2", name: "y", categoryId: "salary" }, "junk-entry"];
  const plannerLines = [
    { id: "l1", amount: 50, categoryIds: ["kafes", "coffee"] },
    { id: "l2", amount: 80, categoryIds: ["food"] },
    { id: "l3", amount: 20, categoryIds: ["kafes"] },
    { id: "l4", amount: 10 },
  ];
  const pairs = { kafes: "coffee" };
  const plan = planCategoryMerge(pairs, { transactions, bills, incomes, plannerLines });

  it("moves exactly the records that point at the dropped category — and the guard agrees", () => {
    expect(plan.transactions).toEqual([
      { id: "t1", to: "coffee" },
      { id: "t2", to: "coffee" },
      { id: "t6", to: "coffee" },
    ]);
    expect(plan.bills).toEqual([{ id: "b1", to: "coffee" }]);
    expect(plan.moves).toEqual({ transactions: 3, bills: 1, incomes: 1, plannerLines: 2 });
    // A second count: the delete guard's own, over the same lists.
    const guard = categoryUsage(["kafes"], { transactions, bills, incomes: incomes.filter((i): i is Exclude<typeof i, string> => typeof i !== "string"), plannerLines });
    expect(guard).toEqual(plan.moves);
    expect(movedCount(plan)).toBe(totalUsage(guard));
    expect(plan.deleteIds).toEqual(["kafes"]);
  });

  it("reconciles every category's total before and after, by hand", () => {
    const before = totals(transactions);
    // By hand: kafes 3.5 + 4.2 + 1.8 = 9.5; coffee 2.5 + 3 = 5.5; food 12.3.
    expect(before).toEqual({ kafes: 9.5, coffee: 5.5, food: 12.3 });

    const moved = new Map(plan.transactions.map((m) => [m.id, m.to]));
    const after = totals(transactions.map((t) => ({ ...t, categoryId: moved.get(t.id) ?? t.categoryId })));
    // By hand: coffee takes all of kafes, 5.5 + 9.5 = 15; food untouched; kafes gone.
    expect(after).toEqual({ coffee: 15, food: 12.3 });
    // Nothing made or lost: the grand total is the same.
    const sum = (o: Record<string, number>) => Math.round(Object.values(o).reduce((a, b) => a + b, 0) * 100) / 100;
    expect(sum(after)).toBe(sum(before));
    expect(sum(after)).toBe(27.3);
  });

  it("rewrites incomes and Planner lines, keeping everything else as stored", () => {
    expect(plan.incomes).toEqual([{ id: "i1", name: "x", categoryId: "coffee", amount: 5 }, { id: "i2", name: "y", categoryId: "salary" }, "junk-entry"]);
    expect(plan.plannerLines).toEqual([
      // Already named the kept one: named once.
      { id: "l1", amount: 50, categoryIds: ["coffee"] },
      { id: "l2", amount: 80, categoryIds: ["food"] },
      { id: "l3", amount: 20, categoryIds: ["coffee"] },
      { id: "l4", amount: 10 },
    ]);
    // The lines' money is untouched: 50 + 80 + 20 + 10.
    expect((plan.plannerLines as { amount: number }[]).reduce((s, l) => s + l.amount, 0)).toBe(160);
  });

  it("leaves the workspace lists alone when nothing in them moves", () => {
    const quiet = planCategoryMerge({ other: "coffee" }, { transactions, bills, incomes, plannerLines });
    expect(quiet.incomes).toBeNull();
    expect(quiet.plannerLines).toBeNull();
    expect(movedCount(quiet)).toBe(0);
  });

  it("a «both» pair: each side moves to its own side", () => {
    const records = [tx("e", "bet-exp", 10), tx("i", "bet-inc", 25)];
    const both = mergeTargets([{ id: "bet-exp", type: "expense" }, { id: "bet-inc", type: "income" }], [{ id: "stoixima-exp", type: "expense" }, { id: "stoixima-inc", type: "income" }])!;
    const p = planCategoryMerge(both, { transactions: records, bills: [], incomes: [], plannerLines: [] });
    expect(p.transactions).toEqual([
      { id: "e", to: "stoixima-exp" },
      { id: "i", to: "stoixima-inc" },
    ]);
    expect(p.deleteIds.sort()).toEqual(["bet-exp", "bet-inc"]);
  });
});
