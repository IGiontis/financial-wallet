import { describe, it, expect, vi, beforeEach } from "vitest";
import { createElement, type ReactNode } from "react";
import { renderHook, waitFor, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider, useMutation } from "@tanstack/react-query";
import { useGoalLoans } from "./useGoalLoans";
import { coveredFundingKey } from "./useCoveredFunding";
import type { Debt, DebtPayment, DebtWithStatus, InvestmentGoalWithStats } from "../../shared/types/IndexTypes";

// The dialog's half of the fix for the owner's report (2026-11-12): a goal
// deleted right after someone's payment was recorded sometimes kept the debt
// without asking. The dialog must know every loan the goal links to before it
// lets him delete — reading from the server only what the device lacks.

const list = vi.hoisted(() => ({ state: { data: undefined as unknown, isSuccess: false, isError: false } }));
vi.mock("../debts/useDebts", () => ({ useDebts: () => list.state }));
vi.mock("../../shared/hooks/useAuth", () => ({ useAuth: () => ({ currentUser: { uid: "u1" } }) }));
const server = vi.hoisted(() => ({ getDebtsByIds: vi.fn() }));
vi.mock("../../firebase/firestore", () => ({ getDebtsByIds: server.getDebtsByIds }));
// Only its key is used here.
vi.mock("./useCoveredFunding", () => ({ coveredFundingKey: ["coveredFunding"] }));

const DAY = new Date(2026, 10, 12, 10);
const debt = (id: string, amount: number, person = "Nikos") => ({ id, userId: "u1", person, direction: "owed_by_me", amount, date: DAY, forGoalId: "trip", accountId: "", createdAt: DAY, updatedAt: DAY }) as Debt;
const withStatus = (d: Debt) => ({ ...d, payments: [], paid: 0, remaining: d.amount, isSettled: false }) as DebtWithStatus;
const GOAL = { id: "trip", covered: [{ person: "Nikos", amount: 300, debtIds: ["d1"] }] } as unknown as InvestmentGoalWithStats;

const mount = (goal = GOAL) => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => createElement(QueryClientProvider, { client }, children);
  return { client, ...renderHook(() => useGoalLoans(goal), { wrapper }) };
};

beforeEach(() => {
  list.state = { data: undefined, isSuccess: false, isError: false };
  server.getDebtsByIds.mockReset();
});

describe("a goal's loans, complete before the delete asks", () => {
  it("waits while the debts list is still loading — read as empty, it asked nothing (cause 1)", () => {
    const { result } = mount();
    expect(result.current.loading).toBe(true);
    expect(server.getDebtsByIds).not.toHaveBeenCalled();
  });

  it("the list loaded without the new debt: reads that one debt from the server (cause 2)", async () => {
    list.state = { data: [withStatus(debt("other", 50, "Maria"))], isSuccess: true, isError: false };
    const payments: DebtPayment[] = [];
    server.getDebtsByIds.mockResolvedValue({ debts: [debt("d1", 300)], payments });
    const { result } = mount();
    expect(result.current.loading).toBe(true);
    await waitFor(() => expect(result.current.loading).toBe(false));
    // Only the missing id is read — one debt, not the list.
    expect(server.getDebtsByIds).toHaveBeenCalledExactlyOnceWith("u1", ["d1"]);
    expect(result.current.debts.map((d) => [d.id, d.remaining])).toEqual([
      ["other", 50],
      ["d1", 300],
    ]);
  });

  it("the list holds every linked debt: no read at all", async () => {
    list.state = { data: [withStatus(debt("d1", 300))], isSuccess: true, isError: false };
    const { result } = mount();
    expect(result.current.loading).toBe(false);
    expect(result.current.debts.map((d) => d.id)).toEqual(["d1"]);
    expect(server.getDebtsByIds).not.toHaveBeenCalled();
  });

  it("the list failed: the linked debts are read from the server rather than taken as none", async () => {
    list.state = { data: undefined, isSuccess: false, isError: true };
    server.getDebtsByIds.mockResolvedValue({ debts: [debt("d1", 300)], payments: [] });
    const { result } = mount();
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.debts.map((d) => d.id)).toEqual(["d1"]);
  });

  it("a debt deleted meanwhile is not returned, and nothing waits for it", async () => {
    list.state = { data: [], isSuccess: true, isError: false };
    server.getDebtsByIds.mockResolvedValue({ debts: [], payments: [] });
    const { result } = mount();
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.debts).toEqual([]);
  });

  it("repayments read with the debt count: 300 lent, 100 back → 200 left", async () => {
    list.state = { data: [], isSuccess: true, isError: false };
    server.getDebtsByIds.mockResolvedValue({ debts: [debt("d1", 300)], payments: [{ id: "p1", userId: "u1", debtId: "d1", amount: 100, date: DAY, createdAt: DAY }] });
    const { result } = mount();
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.debts[0]).toMatchObject({ paid: 100, remaining: 200 });
  });

  it("waits while a «someone paid it for me» save is still on its way", async () => {
    list.state = { data: [withStatus(debt("d1", 300))], isSuccess: true, isError: false };
    let finish!: () => void;
    const client = new QueryClient();
    const wrapper = ({ children }: { children: ReactNode }) => createElement(QueryClientProvider, { client }, children);
    const { result } = renderHook(
      () => ({ loans: useGoalLoans(GOAL), save: useMutation({ mutationKey: coveredFundingKey, mutationFn: () => new Promise<void>((resolve) => (finish = resolve)) }) }),
      { wrapper },
    );
    act(() => result.current.save.mutate());
    await waitFor(() => expect(result.current.loans.loading).toBe(true));
    await act(async () => finish());
    await waitFor(() => expect(result.current.loans.loading).toBe(false));
  });
});
