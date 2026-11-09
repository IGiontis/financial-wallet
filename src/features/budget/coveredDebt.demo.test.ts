import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from "vitest";
import { enterDemo, exitDemo } from "../../demo/demoMode";
import { seedDemo } from "../../demo/demoSession";
import { deleteDoc, doc, memoryCollection } from "../../demo/memoryFirestore";
import { coveredEdit, coveredLinkOf } from "./coveredLink";
import { computeGoalStats } from "./investmentsUtils";
import { firestoreToDate } from "../../shared/utils/dates";
import type { CreateDebtDTO, Debt, InvestmentContribution, InvestmentGoal, Transaction } from "../../shared/types/IndexTypes";

// The demo's own covered debt — a friend paid the ferry, 160 — edited and
// deleted through the data layer against the in-memory store, which refuses
// to update or delete a missing document the way the production rules do.

vi.mock("firebase/firestore", () => ({}));
vi.mock("firebase/auth", () => ({ GoogleAuthProvider: class GoogleAuthProvider {} }));
vi.mock("firebase/app-check", () => ({}));
vi.mock("firebase/app", () => ({ initializeApp: () => ({}), FirebaseError: class FirebaseError extends Error {} }));

const DEBT = "debt-despina";
type Api = typeof import("../../firebase/firestore");
let api: Api;

beforeAll(async () => {
  enterDemo();
  api = await import("../../firebase/firestore");
});
afterAll(() => exitDemo());
beforeEach(() => {
  seedDemo("en");
});

const rows = <T>(name: string) => Object.entries(memoryCollection(name)).map(([id, data]) => ({ ...data, id }) as T);
const read = () => {
  const debts = rows<Debt>("debts");
  const debt = debts.find((d) => d.id === DEBT)!;
  const contributions = rows<InvestmentContribution>("investmentContributions");
  const transactions = rows<Transaction>("transactions");
  const goals = rows<InvestmentGoal>("investmentGoals");
  return { debt, contributions, transactions, goals, link: debt && coveredLinkOf(debt, debts, contributions, transactions, goals) };
};
const form = (debt: Debt, over: Partial<CreateDebtDTO>): CreateDebtDTO => ({
  person: debt.person,
  direction: debt.direction,
  label: debt.label,
  amount: debt.amount,
  date: firestoreToDate(debt.date),
  accountId: debt.accountId,
  ...over,
});

describe("a covered debt in the demo", () => {
  it("edited 160 → 120: the debt, the goal's deposit and the expense move together", async () => {
    const before = read();
    expect(before.link?.contribution?.amount).toBe(160);
    expect(before.link?.expense?.amount).toBe(160);
    const goal = before.goals.find((g) => g.id === before.debt.forGoalId)!;
    const savedBefore = computeGoalStats(goal, before.contributions.filter((c) => c.goalId === goal.id)).totalSaved;

    const next = form(before.debt, { amount: 120 });
    const plan = coveredEdit(before.debt, next, before.link);
    if (!plan.ok) throw new Error("refused");
    expect(await api.editCoveredDebt(DEBT, next, plan.edit)).toEqual({ contribution: true, expense: true });

    const after = read();
    expect(after.debt.amount).toBe(120);
    expect(after.link?.contribution?.amount).toBe(120);
    expect(after.link?.expense?.amount).toBe(120);
    const stats = computeGoalStats(goal, after.contributions.filter((c) => c.goalId === goal.id));
    // A second way: the goal went down by exactly what the debt did.
    expect(stats.totalSaved).toBeCloseTo(savedBefore - 40, 2);
    expect(stats.totalCovered).toBe(after.debt.amount);
  });

  it("a deposit already gone is left out, and the save still lands", async () => {
    const before = read();
    const next = form(before.debt, { amount: 100 });
    const plan = coveredEdit(before.debt, next, before.link);
    if (!plan.ok) throw new Error("refused");
    await deleteDoc(doc(null, "investmentContributions", before.link!.contribution!.id));
    expect(await api.editCoveredDebt(DEBT, next, plan.edit)).toEqual({ contribution: false, expense: true });
    expect(read().debt.amount).toBe(100);
    expect(read().link?.expense?.amount).toBe(100);
  });

  it("deleted: the goal's deposit and the expense go with it, the rest stays", async () => {
    const before = read();
    const count = { c: before.contributions.length, t: before.transactions.length };
    const gone = await api.deleteCoveredDebt("demo", DEBT, [], { contributionId: before.link?.contribution?.id, expenseId: before.link?.expense?.id });
    expect(gone).toEqual({ contributionId: before.link?.contribution?.id, expenseId: before.link?.expense?.id });
    const after = rows<Debt>("debts");
    expect(after.some((d) => d.id === DEBT)).toBe(false);
    expect(rows("investmentContributions")).toHaveLength(count.c - 1);
    // The loan's own record is cleared by the debts' sync after, as for any debt.
    expect(rows("transactions")).toHaveLength(count.t - 1);
  });

  it("deleting names only what is there: an expense already gone does not fail the batch", async () => {
    const before = read();
    await deleteDoc(doc(null, "transactions", before.link!.expense!.id));
    const gone = await api.deleteCoveredDebt("demo", DEBT, [], { contributionId: before.link?.contribution?.id, expenseId: before.link?.expense?.id });
    expect(gone.expenseId).toBeUndefined();
    expect(rows<Debt>("debts").some((d) => d.id === DEBT)).toBe(false);
  });
});
