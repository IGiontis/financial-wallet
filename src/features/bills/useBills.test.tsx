import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { getCurrentPeriodKey } from "./billsUtils";
import { billKeys, useBills, useCreateBill, useDeleteBill, useMarkBillPaid, useUnmarkBillPaid, useUpdateBill, useUpdateBillPayment } from "./useBills";
import { transactionKeys, useTransactions } from "../transactions/hooks/useTransactions";
import type { Bill, BillPayment, BillWithStatus, Transaction } from "../../shared/types/IndexTypes";

// Paying a bill without re-reading the bills, their payments and every
// transaction.
//
// Each of these used to finish by refetching the bills query — every bill and
// every payment — and, for a payment, the whole transaction list as well. The
// payment and its mirrored expense are now in both caches under the ids the
// write uses, and nothing is fetched again.

const api = vi.hoisted(() => ({
  getBills: vi.fn(),
  getBillPayments: vi.fn(),
  createBill: vi.fn(),
  updateBill: vi.fn(),
  deleteBill: vi.fn(),
  markBillPaid: vi.fn(),
  unmarkBillPaid: vi.fn(),
  updateBillPayment: vi.fn(),
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

const BILLS = billKeys.all("u1");
const TXS = transactionKeys.all("u1");
const day = (d: number) => new Date(2026, 5, d);

const power: Bill = { id: "b1", userId: "u1", name: "Power", amount: 80, categoryId: "utilities", frequency: "monthly", dueDay: 28, isActive: true, createdAt: new Date(2025, 0, 1), updatedAt: new Date(2025, 0, 1) };
const gym: Bill = { id: "b2", userId: "u1", name: "Gym", amount: 30, categoryId: "sport", frequency: "monthly", dueDay: 5, isActive: true, createdAt: new Date(2025, 0, 1), updatedAt: new Date(2025, 0, 1) };
const period = getCurrentPeriodKey(power);
const gymPaid: BillPayment = { id: "p-gym", userId: "u1", billId: "b2", periodKey: period, amount: 30, paidDate: day(5), transactionId: "t-gym", createdAt: day(5) };
const gymExpense: Transaction = { id: "t-gym", userId: "u1", amount: 30, type: "expense", categoryId: "sport", date: day(5), description: "Gym", billId: "b2", createdAt: day(5), updatedAt: day(5) };

let client: QueryClient;
function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

const settle = () => act(() => new Promise((resolve) => setTimeout(resolve, 20)));
const bills = () => client.getQueryData<BillWithStatus[]>(BILLS);
const bill = (id: string) => bills()?.find((b) => b.id === id);
const txs = () => client.getQueryData<Transaction[]>(TXS);

/** The server as it was before each test; every read is counted. */
beforeEach(() => {
  vi.clearAllMocks();
  client = new QueryClient({ defaultOptions: { queries: { staleTime: 5 * 60 * 1000, retry: false }, mutations: { retry: false } } });
  api.getBills.mockImplementation(() => Promise.resolve([{ ...power }, { ...gym }]));
  api.getBillPayments.mockImplementation(() => Promise.resolve([{ ...gymPaid }]));
  api.getTransactions.mockImplementation(() => Promise.resolve([{ ...gymExpense }]));
  api.newDocId.mockImplementation((collection: string) => `${collection}-new`);
});

async function mountWith<T>(useMutationHook: () => T) {
  const hook = renderHook(() => ({ bills: useBills(), txs: useTransactions(), mutation: useMutationHook() }), { wrapper });
  await waitFor(() => expect(hook.result.current.bills.isSuccess && hook.result.current.txs.isSuccess).toBe(true));
  return hook;
}

function expectNoRefetch() {
  expect(api.getBills).toHaveBeenCalledTimes(1);
  expect(api.getBillPayments).toHaveBeenCalledTimes(1);
  expect(api.getTransactions).toHaveBeenCalledTimes(1);
}

/** A failure refetches; these never answer, so what shows is the rollback alone. */
function refetchesNeverAnswer() {
  api.getBills.mockImplementation(() => new Promise(() => {}));
  api.getBillPayments.mockImplementation(() => new Promise(() => {}));
  api.getTransactions.mockImplementation(() => new Promise(() => {}));
}

describe("useMarkBillPaid", () => {
  it("puts the payment and its expense in both lists under their real ids, before and after the write", async () => {
    let answer!: (ids: unknown) => void;
    api.markBillPaid.mockReturnValue(new Promise((resolve) => (answer = resolve)));
    const { result } = await mountWith(useMarkBillPaid);

    act(() => result.current.mutation.mutate({ bill: bill("b1")!, paidDate: day(20), paidAmount: 92 }));

    // Before the server answers: already the ids the documents will have, so
    // undoing the payment right away deletes the right two documents.
    await waitFor(() => expect(bill("b1")?.isPaidThisPeriod).toBe(true));
    expect(bill("b1")?.payment).toMatchObject({ id: "billPayments-new", transactionId: "transactions-new", amount: 92, periodKey: period });
    expect(txs()?.find((t) => t.id === "transactions-new")).toMatchObject({ amount: 92, type: "expense", billId: "b1", description: "Power", categoryId: "utilities" });
    expect(api.markBillPaid).toHaveBeenCalledWith("u1", { id: "b1", name: "Power", amount: 80, categoryId: "utilities" }, period, day(20), 92, undefined, {
      paymentId: "billPayments-new",
      transactionId: "transactions-new",
    });

    await act(async () => answer({ paymentId: "billPayments-new", transactionId: "transactions-new" }));
    await settle();

    expectNoRefetch();
    expect(bill("b1")?.payments.map((p) => p.id)).toEqual(["billPayments-new"]);
    expect(txs()?.map((t) => t.id).sort()).toEqual(["t-gym", "transactions-new"]);
    // Both left fresh: they already hold what the server holds.
    expect(client.getQueryState(BILLS)?.isInvalidated).toBe(false);
    expect(client.getQueryState(TXS)?.isInvalidated).toBe(false);
  });

  it("rolls both lists back when the write fails", async () => {
    api.markBillPaid.mockRejectedValue(new Error("permission-denied"));
    const { result } = await mountWith(useMarkBillPaid);
    const before = { bills: bills(), txs: txs() };
    refetchesNeverAnswer();

    await act(() => result.current.mutation.mutateAsync({ bill: bill("b1")!, paidDate: day(20) }).catch(() => {}));

    expect(bills()).toEqual(before.bills);
    expect(txs()).toEqual(before.txs);
  });
});

describe("useUnmarkBillPaid", () => {
  it("takes the payment and its expense out of both lists without refetching", async () => {
    api.unmarkBillPaid.mockResolvedValue(undefined);
    const { result } = await mountWith(useUnmarkBillPaid);

    await act(() => result.current.mutation.mutateAsync({ paymentId: "p-gym", transactionId: "t-gym" }));
    await settle();

    expectNoRefetch();
    expect(bill("b2")).toMatchObject({ isPaidThisPeriod: false, payments: [] });
    expect(txs()).toEqual([]);
  });

  it("rolls both lists back when the write fails", async () => {
    api.unmarkBillPaid.mockRejectedValue(new Error("permission-denied"));
    const { result } = await mountWith(useUnmarkBillPaid);
    const before = { bills: bills(), txs: txs() };
    refetchesNeverAnswer();

    await act(() => result.current.mutation.mutateAsync({ paymentId: "p-gym", transactionId: "t-gym" }).catch(() => {}));

    expect(bills()).toEqual(before.bills);
    expect(txs()).toEqual(before.txs);
  });
});

describe("useUpdateBillPayment", () => {
  it("corrects the payment and its expense in both lists without refetching", async () => {
    api.updateBillPayment.mockResolvedValue(undefined);
    const { result } = await mountWith(useUpdateBillPayment);

    await act(() => result.current.mutation.mutateAsync({ paymentId: "p-gym", transactionId: "t-gym", amount: 35, paidDate: day(6) }));
    await settle();

    expectNoRefetch();
    expect(bill("b2")?.payment).toMatchObject({ id: "p-gym", amount: 35, paidDate: day(6) });
    expect(txs()?.[0]).toMatchObject({ id: "t-gym", amount: 35, date: day(6), description: "Gym" });
  });
});

describe("bills themselves", () => {
  it("shows a new bill at once under its real id, and does not refetch", async () => {
    api.createBill.mockResolvedValue("bills-new");
    const { result } = await mountWith(useCreateBill);

    await act(() => result.current.mutation.mutateAsync({ name: "Water", amount: 25, categoryId: "utilities", frequency: "monthly", dueDay: 15, notes: undefined, pause: null }));
    await settle();

    expectNoRefetch();
    expect(api.createBill).toHaveBeenCalledWith("u1", expect.objectContaining({ name: "Water" }), "bills-new");
    const water = bill("bills-new");
    expect(water).toMatchObject({ name: "Water", amount: 25, isActive: true, userId: "u1", isPaidThisPeriod: false });
    expect(water).not.toHaveProperty("pause");
    expect(water).not.toHaveProperty("notes");
  });

  it("takes a failed new bill back off the list", async () => {
    api.createBill.mockRejectedValue(new Error("permission-denied"));
    const { result } = await mountWith(useCreateBill);
    const before = bills();
    refetchesNeverAnswer();

    await act(() => result.current.mutation.mutateAsync({ name: "Water", amount: 25, categoryId: "utilities", frequency: "monthly" }).catch(() => {}));

    expect(bills()).toEqual(before);
  });

  it("edits a bill in place, a switched-off pause included", async () => {
    api.getBills.mockImplementation(() => Promise.resolve([{ ...power, pause: { from: "2026-11", to: "2027-02" } }, { ...gym }]));
    api.updateBill.mockResolvedValue(undefined);
    const { result } = await mountWith(useUpdateBill);

    await act(() => result.current.mutation.mutateAsync({ billId: "b1", data: { amount: 85, pause: null } }));
    await settle();

    expectNoRefetch();
    expect(bill("b1")).toMatchObject({ amount: 85, name: "Power" });
    expect(bill("b1")).not.toHaveProperty("pause");
  });

  it("drops a deleted bill without refetching", async () => {
    api.deleteBill.mockResolvedValue(undefined);
    const { result } = await mountWith(useDeleteBill);

    await act(() => result.current.mutation.mutateAsync("b1"));
    await settle();

    expectNoRefetch();
    expect(bills()?.map((b) => b.id)).toEqual(["b2"]);
  });
});
