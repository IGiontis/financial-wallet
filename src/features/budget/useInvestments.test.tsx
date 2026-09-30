import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { investmentKeys, useAddContribution, useDeleteContribution, useDeleteGoal, useInvestmentGoals } from "./useInvestments";
import { transactionKeys, useTransactions } from "../transactions/hooks/useTransactions";
import { goalHeldTotal } from "../accounts/accountsUtils";
import type { InvestmentContribution, InvestmentGoal, Transaction } from "../../shared/types/IndexTypes";

// Goals: saving into one without re-reading everything, and deleting one
// without leaving its money behind.

const api = vi.hoisted(() => ({
  getInvestmentGoals: vi.fn(),
  createInvestmentGoal: vi.fn(),
  updateInvestmentGoal: vi.fn(),
  deleteInvestmentGoal: vi.fn(),
  getAllContributions: vi.fn(),
  createContributionWithTransaction: vi.fn(),
  deleteContribution: vi.fn(),
  getTransactions: vi.fn(),
  createTransaction: vi.fn(),
  updateTransaction: vi.fn(),
  deleteTransaction: vi.fn(),
  getCategories: vi.fn(),
  createCategory: vi.fn(),
  updateCategory: vi.fn(),
  deleteCategory: vi.fn(),
  countCategoryUsage: vi.fn(),
  createCategories: vi.fn(),
  updateCategories: vi.fn(),
  deleteCategories: vi.fn(),
  newDocId: vi.fn(),
}));

vi.mock("../../firebase/firestore", () => api);
vi.mock("../../shared/hooks/useAuth", () => ({ useAuth: () => ({ currentUser: { uid: "u1" } }) }));

const GOALS = investmentKeys.goals("u1");
const CONTRIBUTIONS = investmentKeys.contributions("u1");
const TXS = transactionKeys.all("u1");
const day = (d: number) => new Date(2026, 5, d);

const goal = (id: string): InvestmentGoal => ({ id, userId: "u1", name: id, goalType: "targeted", isActive: true, isCompleted: false, createdAt: day(1), updatedAt: day(1) });

/** The server: goal A holds €500, goal B €200, both from the Goals page; plus a coffee. */
function seedServer() {
  const contributions: InvestmentContribution[] = [];
  const transactions: Transaction[] = [{ id: "t-coffee", userId: "u1", amount: 3, type: "expense", categoryId: "food", date: day(5), description: "Coffee", createdAt: day(5), updatedAt: day(5) }];
  const add = (goalId: string, id: string, amount: number, contributionType: "deposit" | "withdrawal", date: Date) => {
    contributions.push({ id: `c-${id}`, userId: "u1", goalId, amount, contributionType, date, createdAt: date, updatedAt: date });
    transactions.push({
      id: `t-${id}`,
      userId: "u1",
      amount,
      type: "investment",
      categoryId: "",
      date,
      description: goalId,
      isInvestmentTransaction: true,
      isGoalTransaction: true,
      goalId,
      goalName: goalId,
      contributionType,
      createdAt: date,
      updatedAt: date,
    });
  };
  add("gA", "a1", 400, "deposit", day(2));
  add("gA", "a2", 200, "deposit", day(3));
  add("gA", "a3", 100, "withdrawal", day(4));
  add("gB", "b1", 200, "deposit", day(2));
  api.getInvestmentGoals.mockImplementation(() => Promise.resolve([goal("gA"), goal("gB")]));
  api.getAllContributions.mockImplementation(() => Promise.resolve(contributions.map((c) => ({ ...c }))));
  api.getTransactions.mockImplementation(() => Promise.resolve(transactions.map((t) => ({ ...t }))));
}

let client: QueryClient;
function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

const settle = () => act(() => new Promise((resolve) => setTimeout(resolve, 20)));
const txs = () => client.getQueryData<Transaction[]>(TXS);
const contributions = () => client.getQueryData<InvestmentContribution[]>(CONTRIBUTIONS);

beforeEach(() => {
  vi.clearAllMocks();
  client = new QueryClient({ defaultOptions: { queries: { staleTime: 5 * 60 * 1000, retry: false }, mutations: { retry: false } } });
  seedServer();
  api.newDocId.mockImplementation((collection: string) => `${collection}-new`);
});

async function mountWith<T>(useMutationHook: () => T) {
  const hook = renderHook(() => ({ goals: useInvestmentGoals(), txs: useTransactions(), mutation: useMutationHook() }), { wrapper });
  await waitFor(() => expect(hook.result.current.goals.data).toHaveLength(2));
  await waitFor(() => expect(hook.result.current.txs.isSuccess).toBe(true));
  return hook;
}

function expectNoRefetch() {
  expect(api.getInvestmentGoals).toHaveBeenCalledTimes(1);
  expect(api.getAllContributions).toHaveBeenCalledTimes(1);
  expect(api.getTransactions).toHaveBeenCalledTimes(1);
}

/** Banks & cash's "in goals" against what the goals on screen say they hold. */
function heldVsSaved(goals: { totalSaved: number }[]) {
  return { held: goalHeldTotal(txs() ?? []), saved: goals.reduce((sum, g) => sum + g.totalSaved, 0) };
}

describe("useAddContribution", () => {
  const vars = () => ({ data: { goalId: "gB", amount: 50, contributionType: "deposit" as const, date: day(8), notes: undefined }, goalName: "gB", isGoalTransaction: true });

  it("puts the contribution and its mirror on screen under their real ids, and never refetches", async () => {
    api.createContributionWithTransaction.mockResolvedValue({ contributionId: "investmentContributions-new", transactionId: "transactions-new" });
    const { result } = await mountWith(useAddContribution);

    await act(() => result.current.mutation.mutateAsync(vars()));
    await settle();

    expectNoRefetch();
    expect(api.createContributionWithTransaction).toHaveBeenCalledWith("u1", vars().data, expect.objectContaining({ goalId: "gB", isGoalTransaction: true, amount: 50 }), {
      contributionId: "investmentContributions-new",
      transactionId: "transactions-new",
    });
    expect(contributions()?.find((c) => c.id === "investmentContributions-new")).toMatchObject({ goalId: "gB", amount: 50, userId: "u1" });
    expect(txs()?.find((t) => t.id === "transactions-new")).toMatchObject({ goalId: "gB", amount: 50, isInvestmentTransaction: true, isGoalTransaction: true, type: "investment" });
    // The goal's figures and Banks & cash move together.
    const b = result.current.goals.data.find((g) => g.id === "gB")!;
    expect(b.totalSaved).toBe(250);
    expect(heldVsSaved(result.current.goals.data)).toEqual({ held: 750, saved: 750 });
  });

  it("rolls both lists back when the write fails", async () => {
    api.createContributionWithTransaction.mockRejectedValue(new Error("permission-denied"));
    const { result } = await mountWith(useAddContribution);
    const before = { contributions: contributions(), txs: txs() };
    api.getAllContributions.mockImplementation(() => new Promise(() => {}));
    api.getTransactions.mockImplementation(() => new Promise(() => {}));

    await act(() => result.current.mutation.mutateAsync(vars()).catch(() => {}));

    expect(contributions()).toEqual(before.contributions);
    expect(txs()).toEqual(before.txs);
  });
});

describe("useDeleteGoal", () => {
  it("takes the goal, its contributions and their mirrors out of every list, without refetching", async () => {
    api.deleteInvestmentGoal.mockResolvedValue({ contributionIds: ["c-a1", "c-a2", "c-a3"], transactionIds: ["t-a1", "t-a2", "t-a3"] });
    const { result } = await mountWith(useDeleteGoal);
    expect(heldVsSaved(result.current.goals.data)).toEqual({ held: 700, saved: 700 });

    await act(() => result.current.mutation.mutateAsync("gA"));
    await settle();

    expect(api.deleteInvestmentGoal).toHaveBeenCalledWith("u1", "gA");
    expectNoRefetch();
    expect(client.getQueryData<InvestmentGoal[]>(GOALS)?.map((g) => g.id)).toEqual(["gB"]);
    expect(contributions()?.map((c) => c.id)).toEqual(["c-b1"]);
    expect(txs()?.map((t) => t.id).sort()).toEqual(["t-b1", "t-coffee"]);
    // The invariant the bug broke: "in goals" is what the remaining goals hold.
    expect(heldVsSaved(result.current.goals.data)).toEqual({ held: 200, saved: 200 });
  });
});

describe("useDeleteContribution", () => {
  it("takes the contribution and the mirror the delete found out of both lists", async () => {
    api.deleteContribution.mockResolvedValue({ transactionId: "t-a2" });
    const { result } = await mountWith(useDeleteContribution);
    const c = contributions()!.find((x) => x.id === "c-a2")!;

    await act(() => result.current.mutation.mutateAsync(c));
    await settle();

    expect(api.deleteContribution).toHaveBeenCalledWith("u1", c);
    expectNoRefetch();
    expect(contributions()?.map((x) => x.id)).not.toContain("c-a2");
    expect(txs()?.map((t) => t.id)).not.toContain("t-a2");
    expect(heldVsSaved(result.current.goals.data)).toEqual({ held: 500, saved: 500 });
  });
});
