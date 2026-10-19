import { describe, it, expect } from "vitest";
import { categoryOwners, lineSpentThisMonth, spentByCategory } from "./lineSpending";
import { buildPlan, THIS_MONTH, type BudgetLine } from "./plannerUtils";
import type { Transaction } from "../../shared/types/IndexTypes";

// «Φαγητό 250 € τον μήνα», linked to the food categories: on the 19th of
// October, with 210 already spent, the plan takes 40 more from the rest of the
// month — not 13/31 of 250 — and the whole 250 from November on.

const round2 = (n: number) => Math.round(n * 100) / 100;
const NOW = new Date(2026, 9, 19, 10);

const tx = (categoryId: string, amount: number, date: Date, over: Partial<Transaction> = {}): Transaction =>
  ({ id: `t${Math.random()}`, userId: "u", amount, type: "expense", categoryId, date, description: "x", createdAt: date, updatedAt: date, ...over }) as Transaction;

const food = (over: Partial<BudgetLine> = {}): BudgetLine => ({ id: "food", label: "Φαγητό", amount: 250, kind: "expense", categoryIds: ["groceries", "dining"], ...over });

const october = [tx("groceries", 160, new Date(2026, 9, 3)), tx("dining", 50, new Date(2026, 9, 12)), tx("groceries", 30, new Date(2026, 8, 28)), tx("fuel", 70, new Date(2026, 9, 5))];

const planOf = (lines: BudgetLine[], horizon: number, transactions = october, skipIds = new Set<string>()) =>
  buildPlan({ bills: [], goals: [], incomes: [], lines, now: NOW, horizon, openingBalance: 1000, skipIds, actuals: { transactions, debts: [], overrides: {} } });

/** Every euro the walk took for the lines, a day at a time — the second way. */
const walked = (plan: ReturnType<typeof planOf>) => round2(Array.from(plan.daily.lineOut).reduce((sum, n) => sum + n, 0));

describe("what was spent, by category", () => {
  it("adds up real spending per category inside the window, and nothing outside it", () => {
    const spent = spentByCategory(october, new Date(2026, 9, 1), new Date(2026, 9, 31));
    expect(spent.get("groceries")).toBe(160);
    expect(spent.get("dining")).toBe(50);
    expect(spent.get("fuel")).toBe(70);
  });

  it("does not count a goal deposit as spending", () => {
    const transfer = tx("groceries", 200, new Date(2026, 9, 5), { isGoalTransaction: true, contributionType: "deposit" });
    expect(spentByCategory([...october, transfer], new Date(2026, 9, 1), new Date(2026, 9, 31)).get("groceries")).toBe(160);
  });

  it("gives each line with categories its month, and says nothing of one without", () => {
    const spent = lineSpentThisMonth([food(), { id: "fun", categoryIds: [] }, { id: "misc" }], october, NOW);
    // 160 + 50 in October; September's 30 is another month.
    expect(spent.get("food")).toBe(210);
    expect(spent.has("fun")).toBe(false);
    expect(spent.has("misc")).toBe(false);
  });

  it("knows which line has each category, the first one to claim it", () => {
    const owners = categoryOwners([food(), { id: "out", label: "Έξοδοι", categoryIds: ["dining", "bars"] }]);
    expect(owners.get("dining")).toEqual({ id: "food", label: "Φαγητό" });
    expect(owners.get("bars")).toEqual({ id: "out", label: "Έξοδοι" });
  });
});

describe("a limit in the plan", () => {
  it("charges the rest of this month what is left of it: 250 − 210 = 40", () => {
    const plan = planOf([food()], THIS_MONTH);
    const row = plan.rows.find((r) => r.id === "food")!;
    expect(row).toMatchObject({ total: -40, perMonth: -250, spent: 210 });
    // The second way: what the walk took, day by day, and what the balance ends on.
    expect(walked(plan)).toBe(40);
    expect(plan.endingBalance).toBe(960);
  });

  it("then the whole limit every month after: 40 + 3 × 250 to the end of January", () => {
    const plan = planOf([food()], 3);
    expect(plan.rows.find((r) => r.id === "food")!.total).toBe(-790);
    expect(walked(plan)).toBe(790);
  });

  it("charges nothing more once it is used up — what went over has left the bank already", () => {
    const over = [...october, tx("dining", 100, new Date(2026, 9, 18))];
    const plan = planOf([food()], THIS_MONTH, over);
    expect(plan.rows.find((r) => r.id === "food")).toMatchObject({ total: 0, spent: 310 });
    expect(walked(plan)).toBe(0);
  });

  it("leaves a line without categories as it was: its share of the days left", () => {
    const plain = planOf([food({ categoryIds: undefined })], THIS_MONTH);
    // 19 to 31 October is 13 days of 31.
    expect(plain.rows.find((r) => r.id === "food")!.total).toBe(-round2((250 * 13) / 31));
    expect(plain.rows.find((r) => r.id === "food")!.spent).toBeUndefined();
  });

  it("is not charged at all when switched off, whatever was spent", () => {
    const plan = planOf([food()], 3, october, new Set(["food"]));
    expect(plan.rows.find((r) => r.id === "food")!.total).toBe(0);
    expect(walked(plan)).toBe(0);
  });

  it("does not read this month's spending into a season that has not started", () => {
    // Skiing from December: October's spending under its categories is not its business.
    const ski = food({ id: "ski", from: "2026-12", to: "2027-03" });
    const plan = planOf([ski], 3);
    // December and January, the whole 250 each.
    expect(plan.rows.find((r) => r.id === "ski")!.total).toBe(-500);
    expect(walked(plan)).toBe(500);
    expect(plan.rows.find((r) => r.id === "ski")!.spent).toBeUndefined();
  });
});
