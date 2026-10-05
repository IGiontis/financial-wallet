import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import i18n from "../../i18n";
import type { Transaction } from "../../shared/types/IndexTypes";
import { resetIncomesMigration, useIncomesMigration } from "./useIncomesMigration";
import { useIncomeList } from "./useIncomes";

// The one-time move of the old Planner's salary and income lines to «Έσοδα»,
// against the real workspace hooks — only Firestore, the signed-in user and
// the records are stood in for. What these pin down is what gets written, and
// when: once, only after the account's own copy has arrived, never over an
// incomes list that exists, and never twice.

const NOW = new Date(2026, 8, 30, 10); // Wednesday 30 September 2026

const api = vi.hoisted(() => ({
  workspace: {} as Record<string, unknown>,
  /** Set to hold `getUser` back, as a slow network would. */
  gate: undefined as Promise<void> | undefined,
  save: vi.fn(),
  transactions: [] as Transaction[],
  transactionsFetched: true,
}));

vi.mock("../../firebase/firestore", () => ({
  getUser: async () => {
    if (api.gate) await api.gate;
    return { workspace: api.workspace };
  },
  saveWorkspaceValue: (...args: unknown[]) => {
    api.save(...args);
    return Promise.resolve();
  },
}));
vi.mock("../../shared/hooks/useAuth", () => ({ useAuth: () => ({ currentUser: { uid: "u1" } }) }));
vi.mock("../transactions/hooks/useTransactions", () => ({
  useTransactions: () => ({ data: api.transactionsFetched ? api.transactions : undefined, isFetched: api.transactionsFetched, isLoading: !api.transactionsFetched }),
  useCategories: () => ({ data: [{ id: "c-sal", name: "Salary", type: "income" }, { id: "c-other", name: "Other Income", type: "income" }] }),
}));

function wrapperFor(client: QueryClient) {
  return ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
const newClient = () => new QueryClient({ defaultOptions: { queries: { retry: false } } });

/** What was sent for one key, in order. */
const saved = (key: string) => api.save.mock.calls.filter(([, k]) => k === key).map(([, , value]) => value);
const settle = async () => {
  await act(async () => {
    vi.advanceTimersByTime(1000);
  });
};

const income = (amount: number, date: Date): Transaction =>
  ({ id: `t${date.getTime()}`, userId: "u1", type: "income", amount, categoryId: "c-sal", description: "pay", date, createdAt: date, updatedAt: date }) as Transaction;

beforeAll(async () => {
  await i18n.changeLanguage("en");
});

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(NOW);
  localStorage.clear();
  resetIncomesMigration();
  api.save.mockClear();
  api.gate = undefined;
  api.transactions = [];
  api.transactionsFetched = true;
  api.workspace = {};
});

afterEach(() => {
  vi.useRealTimers();
});

describe("moving the old Planner's incomes to «Έσοδα»", () => {
  it("moves a typed salary once, re-keys what was said about it, and leaves the old keys alone", async () => {
    api.workspace = {
      "planner-salary": { amount: "1450", day: "30" },
      "planner-lines": [{ id: "food", label: "Food", amount: 300, kind: "expense" }, { id: "room", label: "Room", amount: 250, kind: "income" }],
      "planner-skip": ["__salary__", "rent-bill"],
      "planner-occurrences": { "salary:__salary__:2026-09-30": { state: "received", date: "2026-09-25", amount: 1450 } },
    };
    const client = newClient();
    // Two screens' worth of callers at once: the move must still happen once.
    const { result } = renderHook(() => [useIncomesMigration(), useIncomeList()] as const, { wrapper: wrapperFor(client) });
    const second = renderHook(() => useIncomesMigration(), { wrapper: wrapperFor(client) });

    await waitFor(() => expect(result.current[1].incomes).toHaveLength(2));
    await settle();

    expect(saved("incomes")).toEqual([
      [
        { id: "salary", name: "Salary", kind: "salary", amount: 1450, frequency: "monthly", day: 30, start: "2026-09", isSalary: true, categoryId: "c-sal" },
        // The income line: undated, under the same id, so its switch keeps working.
        { id: "room", name: "Room", kind: "other", amount: 250, frequency: "monthly", start: "2026-09", categoryId: "c-other" },
      ],
    ]);
    // The salary switched off in the Planner stays off, under its new id; the
    // other switch is untouched.
    expect(saved("planner-skip")).toEqual([["__salary__", "rent-bill", "salary"]]);
    expect(saved("planner-occurrences")).toEqual([
      {
        "salary:__salary__:2026-09-30": { state: "received", date: "2026-09-25", amount: 1450 },
        "income:salary:2026-09-30": { state: "received", date: "2026-09-25", amount: 1450 },
      },
    ]);
    // Kept for safety: nothing deletes or rewrites the old figures.
    expect(saved("planner-salary")).toEqual([]);
    expect(saved("planner-lines")).toEqual([]);
    expect(result.current[0].pending).toBe(false);
    expect(second.result.current.pending).toBe(false);

    // Another visit in the same session, and another screen: nothing again.
    renderHook(() => useIncomesMigration(), { wrapper: wrapperFor(client) });
    await settle();
    expect(saved("incomes")).toHaveLength(1);
  });

  it("never runs once an incomes list exists — not even an empty one", async () => {
    api.workspace = { incomes: [], "planner-salary": { amount: "1450", day: "30" }, "planner-lines": [{ id: "room", label: "Room", amount: 250, kind: "income" }] };
    const { result } = renderHook(() => useIncomesMigration(), { wrapper: wrapperFor(newClient()) });
    await waitFor(() => expect(result.current.pending).toBe(false));
    await settle();
    expect(saved("incomes")).toEqual([]);
    expect(saved("planner-skip")).toEqual([]);
  });

  it("does nothing before the account's copy has arrived, and nothing after when it holds incomes", async () => {
    // This device: the old salary in its cache, no incomes — as on a phone
    // that has not seen the account since the update.
    localStorage.setItem("planner-salary", JSON.stringify({ amount: "1450", day: "30" }));
    let release!: () => void;
    api.gate = new Promise<void>((resolve) => (release = resolve));
    // The account, meanwhile, was moved on another device.
    api.workspace = { incomes: [{ id: "salary", name: "Μισθός", kind: "salary", amount: 1450, frequency: "monthly", day: 30, start: "2026-09", isSalary: true }], "planner-salary": { amount: "1450", day: "30" } };

    const { result } = renderHook(() => [useIncomesMigration(), useIncomeList()] as const, { wrapper: wrapperFor(newClient()) });
    await settle();
    // Waiting on the account: no move, and the list says "loading" rather than "none".
    expect(saved("incomes")).toEqual([]);
    expect(result.current[1]).toMatchObject({ incomes: [], isLoading: true });

    await act(async () => release());
    await waitFor(() => expect(result.current[1].incomes).toHaveLength(1));
    await settle();
    expect(saved("incomes")).toEqual([]);
    expect(result.current[1].incomes[0].name).toBe("Μισθός");
  });

  it("does not move over an incomes list this device holds that has not gone up yet", async () => {
    localStorage.setItem("incomes", JSON.stringify([{ id: "inc-1", name: "Rent", kind: "rent", amount: 400, frequency: "monthly", day: 5, start: "2026-09" }]));
    api.workspace = { "planner-salary": { amount: "1450", day: "30" } };
    const { result } = renderHook(() => useIncomesMigration(), { wrapper: wrapperFor(newClient()) });
    await waitFor(() => expect(result.current.pending).toBe(false));
    await settle();
    // Whatever goes up is this device's own list — never a moved salary.
    for (const value of saved("incomes")) expect(value).toEqual([{ id: "inc-1", name: "Rent", kind: "rent", amount: 400, frequency: "monthly", day: 5, start: "2026-09" }]);
  });

  it("waits for the records to complete a half-typed salary from the detected one, as the Planner did", async () => {
    // A day typed, no amount: the old Planner planned with the detected 1.450.
    api.workspace = { "planner-salary": { amount: "", day: "28" } };
    api.transactionsFetched = false;
    const { result, rerender } = renderHook(() => useIncomesMigration(), { wrapper: wrapperFor(newClient()) });
    await waitFor(() => expect(result.current.pending).toBe(true));
    await settle();
    expect(saved("incomes")).toEqual([]);

    api.transactions = [income(1450, new Date(2026, 6, 28)), income(1450, new Date(2026, 7, 28)), income(1450, new Date(2026, 8, 28))];
    api.transactionsFetched = true;
    rerender();
    await waitFor(() => expect(result.current.pending).toBe(false));
    await settle();
    expect(saved("incomes")).toEqual([[{ id: "salary", name: "Salary", kind: "salary", amount: 1450, frequency: "monthly", day: 28, start: "2026-09", isSalary: true, categoryId: "c-sal" }]]);
  });

  it("does nothing when the old Planner held nothing to move", async () => {
    api.workspace = { "planner-salary": { amount: "", day: "" }, "planner-lines": [{ id: "food", label: "Food", amount: 300, kind: "expense" }] };
    const { result } = renderHook(() => useIncomesMigration(), { wrapper: wrapperFor(newClient()) });
    await waitFor(() => expect(result.current.pending).toBe(false));
    await settle();
    expect(api.save).not.toHaveBeenCalledWith("u1", "incomes", expect.anything());
  });
});
