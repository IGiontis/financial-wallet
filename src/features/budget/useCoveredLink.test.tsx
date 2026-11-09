import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { useCoveredLink } from "./useCoveredLink";
import type { Debt } from "../../shared/types/IndexTypes";

// A read that fails must say so and offer another go — not leave Save and
// Delete greyed out for good.

const reads = vi.hoisted(() => ({ contributions: vi.fn(), goals: vi.fn() }));
vi.mock("../../shared/hooks/useAuth", () => ({ useAuth: () => ({ currentUser: { uid: "u" } }) }));
vi.mock("../../firebase/firestore", () => ({ getAllContributions: reads.contributions, getInvestmentGoals: reads.goals }));
vi.mock("./useInvestments", () => ({ investmentKeys: { contributions: (u: string) => ["investments", u, "contributions"], goals: (u: string) => ["investments", u, "goals"] } }));
vi.mock("../transactions/hooks/useTransactions", () => ({ useTransactions: () => ({ data: [], isError: false, refetch: vi.fn() }) }));
vi.mock("../debts/useDebts", () => ({ useDebts: () => ({ data: [], isError: false, refetch: vi.fn() }) }));

const day = new Date(2026, 9, 20);
const debt = { id: "d1", userId: "u", person: "Nikos", direction: "owed_by_me", amount: 100, date: day, accountId: "", forGoalId: "ski", createdAt: day, updatedAt: day } as Debt;

let client: QueryClient;
const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;

beforeEach(() => {
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  reads.contributions.mockReset();
  reads.goals.mockReset().mockResolvedValue([{ id: "ski", name: "Ski" }]);
});

describe("useCoveredLink", () => {
  it("asks nothing of a debt that paid no goal, and is ready at once", () => {
    const { result } = renderHook(() => useCoveredLink({ ...debt, forGoalId: undefined }), { wrapper });
    expect(result.current).toMatchObject({ ready: true, failed: false, link: undefined });
    expect(reads.contributions).not.toHaveBeenCalled();
  });

  it("fails visibly when a read fails, and is ready after a retry that works", async () => {
    reads.contributions.mockRejectedValueOnce(new Error("offline")).mockResolvedValue([]);
    const { result } = renderHook(() => useCoveredLink(debt), { wrapper });
    await waitFor(() => expect(result.current.failed).toBe(true));
    expect(result.current.ready).toBe(false);
    act(() => result.current.retry());
    await waitFor(() => expect(result.current.ready).toBe(true));
    expect(result.current.failed).toBe(false);
    expect(result.current.goalName).toBe("Ski");
  });
});
