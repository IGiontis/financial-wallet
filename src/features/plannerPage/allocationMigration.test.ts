import { describe, it, expect } from "vitest";
import { bucketsIntoLines } from "./allocationMigration";
import type { BudgetLine } from "./plannerUtils";

// The Allocation page's buckets, carried into «Τα δικά μου» once: added where
// new, merged where the same name is already there, never a category twice.

const line = (id: string, label: string, amount: number, over: Partial<BudgetLine> = {}): BudgetLine => ({ id, label, amount, kind: "expense", ...over });
const bucket = (id: string, label: string, amount: number, categoryIds?: string[], kind = "expense") => ({ id, label, amount, kind, categoryIds });

describe("the buckets moved into the planner's lines", () => {
  it("adds each new bucket as a line, with its categories", () => {
    const next = bucketsIntoLines([line("rent", "Ενοίκιο", 400)], [bucket("b1", "Φαγητό", 250, ["groceries", "dining"]), bucket("b2", "Έξοδοι", 120)]);
    expect(next).toEqual([
      line("rent", "Ενοίκιο", 400),
      line("b1", "Φαγητό", 250, { categoryIds: ["groceries", "dining"] }),
      line("b2", "Έξοδοι", 120),
    ]);
  });

  it("does not add a bucket named like a line already there — the line keeps its figure and takes the categories it lacked", () => {
    const next = bucketsIntoLines([line("food", "φαγητό ", 300)], [bucket("b1", "Φαγητό", 250, ["groceries"])]);
    expect(next).toEqual([line("food", "φαγητό ", 300, { categoryIds: ["groceries"] })]);
  });

  it("never gives one category to two lines", () => {
    const next = bucketsIntoLines([line("food", "Φαγητό", 300, { categoryIds: ["groceries"] })], [bucket("b1", "Σούπερ", 100, ["groceries", "bakery"])]);
    expect(next[1]).toEqual(line("b1", "Σούπερ", 100, { categoryIds: ["bakery"] }));
  });

  it("leaves out income lines, empty buckets and anything malformed", () => {
    const next = bucketsIntoLines([], [bucket("i", "Ενοίκιο δωματίου", 150, undefined, "income"), bucket("e", "Τίποτα", 0), { id: 3 }, null, bucket("ok", "Βενζίνη", 80)]);
    expect(next.map((l) => l.id)).toEqual(["ok"]);
  });

  it("keeps ids apart: a bucket whose id a line already has gets one of its own", () => {
    const next = bucketsIntoLines([line("b1", "Ενοίκιο", 400)], [bucket("b1", "Φαγητό", 250)]);
    expect(next.map((l) => l.id)).toEqual(["b1", "alloc-b1"]);
  });

  it("changes nothing when there were no buckets", () => {
    const lines = [line("rent", "Ενοίκιο", 400)];
    expect(bucketsIntoLines(lines, [])).toBe(lines);
    expect(bucketsIntoLines(lines, undefined)).toBe(lines);
  });

  it("adds up, a second way: every euro of the buckets that were new is in the lines now", () => {
    const buckets = [bucket("b1", "Φαγητό", 250.5, ["g"]), bucket("b2", "Έξοδοι", 120), bucket("b3", "Ενοίκιο", 999)];
    const before = [line("rent", "Ενοίκιο", 400)];
    const next = bucketsIntoLines(before, buckets);
    const sum = (ls: BudgetLine[]) => ls.reduce((s, l) => s + l.amount, 0);
    // The rent bucket matched the rent line, so only food and going out are new.
    expect(sum(next) - sum(before)).toBeCloseTo(250.5 + 120, 6);
  });
});
