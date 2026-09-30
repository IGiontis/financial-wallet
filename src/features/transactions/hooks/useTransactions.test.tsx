import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { computeBillStatus, getCurrentPeriodKey } from "../../bills/billsUtils";
import { billKeys } from "../../bills/billCache";
import type { Bill, BillPayment, BillWithStatus, Category, CreateTransactionDTO, Transaction } from "../../../shared/types/IndexTypes";
import { transactionKeys, useCreateTransaction, useUpdateTransaction, useDeleteTransaction, useTransactions, useCategories, useDeleteCategoryGroup } from "./useTransactions";

// Saving a transaction without re-reading every transaction.
//
// The list used to be refetched after every save. Each refetch is one read
// when the list was synced in the last half hour and the whole collection —
// ~1,500 documents — when it was not, which is exactly the case of a phone
// app opened after lunch to add one coffee. These pin down the replacement:
// the cache ends up holding what the write stored, under the id it stored it
// with, and the list's fetch function is not called again.

const api = vi.hoisted(() => ({
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

vi.mock("../../../firebase/firestore", () => api);
vi.mock("../../../shared/hooks/useAuth", () => ({ useAuth: () => ({ currentUser: { uid: "u1" } }) }));

const KEY = transactionKeys.all("u1");
const day = (d: number) => new Date(2026, 5, d);

const coffee: Transaction = { id: "t-coffee", userId: "u1", amount: 3, type: "expense", categoryId: "food", date: day(5), description: "Coffee", createdAt: day(5), updatedAt: day(5) };
const fuel: Transaction = {
  id: "t-fuel",
  userId: "u1",
  amount: 60,
  type: "expense",
  categoryId: "car",
  date: day(4),
  description: "Shell",
  accountId: "acc-1",
  metadata: { fuelType: "petrol", pricePerUnit: 2, quantity: 30, totalCost: 60 },
  createdAt: day(4),
  updatedAt: day(4),
};
const power: Transaction = { id: "t-power", userId: "u1", amount: 80, type: "expense", categoryId: "utilities", date: day(10), description: "Power", billId: "b1", createdAt: day(10), updatedAt: day(10) };
const server = [coffee, fuel, power];

let client: QueryClient;
function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

/** Resolves only when told to — a write the server has not answered yet. */
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

/** Lets any refetch that was going to start, start. */
const settle = () => act(() => new Promise((resolve) => setTimeout(resolve, 20)));

const cached = () => client.getQueryData<Transaction[]>(KEY);

beforeEach(() => {
  vi.clearAllMocks();
  // The app's own settings where they matter: five fresh minutes, one retry off.
  client = new QueryClient({ defaultOptions: { queries: { staleTime: 5 * 60 * 1000, retry: false }, mutations: { retry: false } } });
  api.getTransactions.mockImplementation(() => Promise.resolve(server.map((t) => ({ ...t }))));
});

/** Mounts the list and a mutation hook, and waits for the list's first load. */
async function mountWith<T>(useMutationHook: () => T) {
  const hook = renderHook(() => ({ list: useTransactions(), mutation: useMutationHook() }), { wrapper });
  await waitFor(() => expect(hook.result.current.list.isSuccess).toBe(true));
  expect(api.getTransactions).toHaveBeenCalledTimes(1);
  return hook;
}

/** After a failure the list is refetched; this one never answers, so what shows is the rollback alone. */
const refetchNeverAnswers = () => api.getTransactions.mockImplementation(() => new Promise(() => {}));

// ─── Create ──────────────────────────────────────────────────────────────────

describe("useCreateTransaction", () => {
  const bread: CreateTransactionDTO = { amount: 2.5, type: "expense", categoryId: "food", date: day(6), description: "Bread", notes: undefined };

  it("shows the row under its real id before the server answers, and never refetches the list", async () => {
    api.newDocId.mockReturnValue("tx-new");
    const write = deferred<string>();
    api.createTransaction.mockReturnValue(write.promise);
    const { result } = await mountWith(useCreateTransaction);

    act(() => result.current.mutation.mutate(bread));

    // On screen at once, already under the id the document will have.
    await waitFor(() => expect(cached()?.find((t) => t.id === "tx-new")).toMatchObject({ amount: 2.5, description: "Bread", userId: "u1" }));
    // The write is sent under that same id — one id, minted once.
    expect(api.createTransaction).toHaveBeenCalledWith("u1", bread, "tx-new");
    expect(api.newDocId).toHaveBeenCalledTimes(1);

    await act(async () => write.resolve("tx-new"));
    await settle();

    expect(api.getTransactions).toHaveBeenCalledTimes(1);
    expect(cached()?.map((t) => t.id)).toEqual(["t-power", "tx-new", "t-coffee", "t-fuel"]);
    // Undefined fields are not stored by Firestore, so not cached either.
    expect(cached()?.find((t) => t.id === "tx-new")).not.toHaveProperty("notes");
    // Left fresh: the list already holds what the server holds.
    expect(client.getQueryState(KEY)?.isInvalidated).toBe(false);
  });

  it("is not read again by the next screen that mounts the list", async () => {
    // Marking it stale would only move the cost: the very next tap after a save
    // usually opens another screen, and that screen would read all of it.
    api.newDocId.mockReturnValue("tx-new");
    api.createTransaction.mockResolvedValue("tx-new");
    const { result } = await mountWith(useCreateTransaction);

    await act(() => result.current.mutation.mutateAsync(bread));
    await settle();

    const next = renderHook(() => useTransactions(), { wrapper });
    await settle();
    expect(next.result.current.data?.some((t) => t.id === "tx-new")).toBe(true);
    expect(api.getTransactions).toHaveBeenCalledTimes(1);
  });

  it("puts the list back when the write fails", async () => {
    api.newDocId.mockReturnValue("tx-new");
    api.createTransaction.mockRejectedValue(new Error("permission-denied"));
    const { result } = await mountWith(useCreateTransaction);
    const before = cached();
    refetchNeverAnswers();

    await act(() => result.current.mutation.mutateAsync(bread).catch(() => {}));

    expect(cached()).toEqual(before);
  });

  it("does not turn a list that never loaded into a list of one", async () => {
    api.newDocId.mockReturnValue("tx-new");
    api.createTransaction.mockResolvedValue("tx-new");
    // Only the mutation is mounted: nothing has read the transactions yet.
    const { result } = renderHook(() => useCreateTransaction(), { wrapper });

    await act(() => result.current.mutateAsync(bread));

    expect(cached()).toBeUndefined();
    // The first screen to ask gets the whole list from the server.
    const list = renderHook(() => useTransactions(), { wrapper });
    await waitFor(() => expect(list.result.current.data).toHaveLength(3));
    expect(api.getTransactions).toHaveBeenCalledTimes(1);
  });
});

// ─── Update ──────────────────────────────────────────────────────────────────

describe("useUpdateTransaction", () => {
  it("leaves the row exactly as the write leaves the document, without refetching", async () => {
    api.updateTransaction.mockResolvedValue(undefined);
    const { result } = await mountWith(useUpdateTransaction);

    // No metadata in the edit removes the fuel details; `accountId: null` removes the account.
    await act(() => result.current.mutation.mutateAsync({ transactionId: "t-fuel", data: { amount: 65, description: "BP", accountId: null } }));
    await settle();

    expect(api.getTransactions).toHaveBeenCalledTimes(1);
    const row = cached()?.find((t) => t.id === "t-fuel");
    expect(row).toMatchObject({ amount: 65, description: "BP", categoryId: "car" });
    expect(row).not.toHaveProperty("metadata");
    expect(row).not.toHaveProperty("accountId");
    expect(cached()).toHaveLength(3);
    // Not a bill's expense: no payment to correct.
    expect(api.updateTransaction).toHaveBeenCalledWith("t-fuel", { amount: 65, description: "BP", accountId: null }, undefined);
  });

  it("puts the row back when the write fails", async () => {
    api.updateTransaction.mockRejectedValue(new Error("permission-denied"));
    const { result } = await mountWith(useUpdateTransaction);
    const before = cached();
    refetchNeverAnswers();

    await act(() => result.current.mutation.mutateAsync({ transactionId: "t-coffee", data: { amount: 30 } }).catch(() => {}));

    expect(cached()).toEqual(before);
  });
});

// ─── Delete ──────────────────────────────────────────────────────────────────

describe("useDeleteTransaction", () => {
  it("takes the row out without refetching", async () => {
    api.deleteTransaction.mockResolvedValue(undefined);
    const { result } = await mountWith(useDeleteTransaction);

    await act(() => result.current.mutation.mutateAsync(coffee));
    await settle();

    expect(api.getTransactions).toHaveBeenCalledTimes(1);
    expect(cached()?.map((t) => t.id)).toEqual(["t-fuel", "t-power"]);
    expect(api.deleteTransaction).toHaveBeenCalledWith("t-coffee", undefined);
  });

  it("puts the row back when the delete fails", async () => {
    api.deleteTransaction.mockRejectedValue(new Error("offline"));
    const { result } = await mountWith(useDeleteTransaction);
    const before = cached();
    refetchNeverAnswers();

    await act(() => result.current.mutation.mutateAsync(coffee).catch(() => {}));

    expect(cached()).toEqual(before);
  });
});

// ─── A bill's expense ────────────────────────────────────────────────────────

describe("a bill's expense", () => {
  const bill: Bill = { id: "b1", userId: "u1", name: "Power", amount: 80, categoryId: "utilities", frequency: "monthly", dueDay: 28, isActive: true, createdAt: new Date(2025, 0, 1), updatedAt: new Date(2025, 0, 1) };
  const payment: BillPayment = { id: "p1", userId: "u1", billId: "b1", periodKey: getCurrentPeriodKey(bill), amount: 80, paidDate: day(10), transactionId: "t-power", createdAt: day(10) };
  const bills = () => client.getQueryData<BillWithStatus[]>(billKeys.all("u1"));

  beforeEach(() => {
    client.setQueryData<BillWithStatus[]>(billKeys.all("u1"), [computeBillStatus(bill, [payment])]);
    expect(bills()?.[0].isPaidThisPeriod).toBe(true);
  });

  it("unpays the bill when the expense is deleted", async () => {
    api.deleteTransaction.mockResolvedValue(undefined);
    const { result } = await mountWith(useDeleteTransaction);

    await act(() => result.current.mutation.mutateAsync(power));

    // The payment's id comes from the bills on screen, so no lookup read.
    expect(api.deleteTransaction).toHaveBeenCalledWith("t-power", { userId: "u1", paymentId: "p1" });
    expect(bills()?.[0]).toMatchObject({ isPaidThisPeriod: false, payments: [] });
    expect(cached()?.map((t) => t.id)).toEqual(["t-coffee", "t-fuel"]);
  });

  it("corrects the payment when the expense's amount or day is edited", async () => {
    api.updateTransaction.mockResolvedValue(undefined);
    const { result } = await mountWith(useUpdateTransaction);

    await act(() => result.current.mutation.mutateAsync({ transactionId: "t-power", data: { amount: 95, date: day(12) } }));

    expect(api.updateTransaction).toHaveBeenCalledWith("t-power", { amount: 95, date: day(12) }, { userId: "u1", paymentId: "p1" });
    expect(bills()?.[0].payments[0]).toMatchObject({ id: "p1", amount: 95, paidDate: day(12), periodKey: payment.periodKey });
    expect(bills()?.[0].isPaidThisPeriod).toBe(true);
  });

  it("puts the payment back too when that edit fails", async () => {
    api.updateTransaction.mockRejectedValue(new Error("permission-denied"));
    const { result } = await mountWith(useUpdateTransaction);
    const before = bills();
    refetchNeverAnswers();

    await act(() => result.current.mutation.mutateAsync({ transactionId: "t-power", data: { amount: 95 } }).catch(() => {}));

    expect(bills()).toEqual(before);
  });
});

// ─── Categories ──────────────────────────────────────────────────────────────

describe("useDeleteCategoryGroup", () => {
  it("drops the categories without re-reading every transaction", async () => {
    const mine: Category = { id: "cat-1", name: "Car loan", type: "expense", isDefault: false, userId: "u1", createdAt: day(1), updatedAt: day(1) };
    const builtIn: Category = { id: "cat-0", name: "Food", type: "expense", isDefault: true, userId: null, createdAt: day(1), updatedAt: day(1) };
    api.getCategories.mockResolvedValue([builtIn, mine]);
    api.deleteCategories.mockResolvedValue(undefined);
    const { result } = renderHook(() => ({ list: useTransactions(), categories: useCategories(), remove: useDeleteCategoryGroup() }), { wrapper });
    await waitFor(() => expect(result.current.list.isSuccess && result.current.categories.isSuccess).toBe(true));

    await act(() => result.current.remove.mutateAsync(["cat-1"]));
    await settle();

    expect(client.getQueryData<Category[]>(transactionKeys.categories("u1"))).toEqual([builtIn]);
    expect(api.getCategories).toHaveBeenCalledTimes(1);
    expect(api.getTransactions).toHaveBeenCalledTimes(1);
  });
});
