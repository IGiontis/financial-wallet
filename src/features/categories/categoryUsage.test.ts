import { describe, expect, it } from "vitest";
import { categoryUsage, totalUsage } from "./categoryUsage";
import { allowedScopes, canChangeScope, typesToAdd } from "./categoryScope";

const sources = {
  transactions: [{ categoryId: "bet-x" }, { categoryId: "bet-i" }, { categoryId: "bet-x" }, { categoryId: "food" }, { categoryId: "" }, {}],
  bills: [{ categoryId: "bet-x" }, { categoryId: "rent" }],
  incomes: [{ categoryId: "bet-i" }, { categoryId: undefined }, {}],
  plannerLines: [{ categoryIds: ["bet-x", "bet-i"] }, { categoryIds: ["food"] }, {}, { categoryIds: [] }],
};

describe("categoryUsage", () => {
  it("counts each kind of record that uses either half of a pair", () => {
    expect(categoryUsage(["bet-x", "bet-i"], sources)).toEqual({ transactions: 3, bills: 1, incomes: 1, plannerLines: 1 });
  });

  it("counts a Planner line naming both halves once, and a record once", () => {
    // Reconciled the other way: each half alone, then what they share taken off.
    const x = categoryUsage(["bet-x"], sources);
    const i = categoryUsage(["bet-i"], sources);
    const both = categoryUsage(["bet-x", "bet-i"], sources);
    expect(both.transactions).toBe(x.transactions + i.transactions);
    expect(both.bills).toBe(x.bills + i.bills);
    expect(both.incomes).toBe(x.incomes + i.incomes);
    // The one line names both: counted in each alone, once together.
    expect(both.plannerLines).toBe(x.plannerLines + i.plannerLines - 1);
  });

  it("says unused when nothing points at it, and never matches an empty id", () => {
    const usage = categoryUsage(["nobody"], sources);
    expect(totalUsage(usage)).toBe(0);
    expect(totalUsage(categoryUsage([""], sources))).toBe(0);
  });

  it("totals the kinds", () => {
    expect(totalUsage({ transactions: 3, bills: 1, incomes: 1, plannerLines: 2 })).toBe(7);
  });
});

describe("categoryScope", () => {
  it("lets a one-sided category widen to both, never flip sides", () => {
    expect(allowedScopes("income")).toEqual(["income", "both"]);
    expect(allowedScopes("expense")).toEqual(["expense", "both"]);
    expect(canChangeScope("income", "expense")).toBe(false);
    expect(canChangeScope("expense", "income")).toBe(false);
    expect(canChangeScope("income", "both")).toBe(true);
    expect(canChangeScope("expense", "both")).toBe(true);
  });

  it("keeps a both category both", () => {
    expect(allowedScopes("both")).toEqual(["both"]);
    expect(canChangeScope("both", "income")).toBe(false);
    expect(canChangeScope("both", "expense")).toBe(false);
  });

  it("adds only the missing half", () => {
    expect(typesToAdd("income", "both")).toEqual(["expense"]);
    expect(typesToAdd("expense", "both")).toEqual(["income"]);
    expect(typesToAdd("expense", "expense")).toEqual([]);
    expect(typesToAdd("both", "both")).toEqual([]);
  });

  it("refuses a flip outright rather than writing anything", () => {
    expect(() => typesToAdd("income", "expense")).toThrow();
    expect(() => typesToAdd("both", "income")).toThrow();
  });
});
