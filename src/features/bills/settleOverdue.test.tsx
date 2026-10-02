import { describe, it, expect, vi, beforeAll, beforeEach, afterAll } from "vitest";
import { render, screen, renderHook, act, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import i18n from "../../i18n";
import MarkPaidModal from "./MarkPaidModal";
import { arrears, billCoverage, billOverdue, computeBillStatus, getPeriodOptions, monthForecast, overdueBills } from "./billsUtils";
import { billKeys, useBills, useSettleOverdue, useUnmarkBillPaid } from "./useBills";
import { transactionKeys, useTransactions } from "../transactions/hooks/useTransactions";
import type { Bill, BillPayment, BillWithStatus, Transaction } from "../../shared/types/IndexTypes";

// The two ways out of "overdue".
//
// Paying through the form now starts with the oldest overdue period, at what it
// is owed for — water four months behind used to open on October's €60 and
// leave July to September where they were. And "I've paid these" marks months
// the bank already paid as settled, writing payments and no transaction, so
// the balance does not lose the money a second time.
//
// Every figure is checked a second way: by hand from the bill's price, against
// the late total and the arrears walk, and — for "no transaction" — against
// what was actually sent to the database and what the transactions hold.

const NOW = new Date(2026, 9, 11, 10, 0); // 11 October 2026, after the 10th

/** One payment per month key, each on the 8th of its month, with an expense. */
const paidMonths = (keys: string[], withTransaction = true): BillPayment[] =>
  keys.map((key) => {
    const [y, m] = key.split("-").map(Number);
    return {
      id: `water-${key}`,
      userId: "u1",
      billId: "water",
      periodKey: key,
      amount: 60,
      paidDate: new Date(y, m - 1, 8),
      ...(withTransaction ? { transactionId: `t-${key}` } : {}),
      createdAt: new Date(y, m - 1, 8),
    } as BillPayment;
  });

/** October 2025 to June 2026 — July, August, September and October not. */
const KEPT_KEYS = ["2025-10", "2025-11", "2025-12", "2026-01", "2026-02", "2026-03", "2026-04", "2026-05", "2026-06"];
const KEPT = paidMonths(KEPT_KEYS);

const WATER: Bill = {
  id: "water",
  userId: "u1",
  name: "Water",
  amount: 60,
  categoryId: "utilities",
  frequency: "monthly",
  dueDay: 10,
  isActive: true,
  anchorDate: new Date(2025, 9, 5),
  createdAt: new Date(2025, 9, 5),
  updatedAt: new Date(2025, 9, 5),
};

const water = (payments: BillPayment[] = KEPT, now = NOW): BillWithStatus => computeBillStatus(WATER, payments, now);

// ─── Mocks for the form and the hooks ────────────────────────────────────────

const api = vi.hoisted(() => ({
  getBills: vi.fn(),
  getBillPayments: vi.fn(),
  createBill: vi.fn(),
  updateBill: vi.fn(),
  deleteBill: vi.fn(),
  markBillPaid: vi.fn(),
  markBillPeriodsSettled: vi.fn(),
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
vi.mock("../../shared/hooks/useCurrencyConverter", () => ({
  useCurrencyConverter: () => ({ format: (n: number) => `€${n.toFixed(2)}`, convert: (n: number) => n, convertToBase: (n: number) => n, baseCurrency: "EUR", displayCurrency: "EUR" }),
}));

beforeAll(async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  // jsdom has no matchMedia; the date field asks it whether the screen is narrow.
  window.matchMedia = ((query: string) => ({ matches: false, media: query, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, onchange: null, dispatchEvent: () => false })) as unknown as typeof window.matchMedia;
  await i18n.changeLanguage("en");
});

beforeEach(() => vi.setSystemTime(NOW));

afterAll(() => vi.useRealTimers());

// ─── The payment form ────────────────────────────────────────────────────────

describe("the payment form, on a bill with something overdue", () => {
  const openFor = (bill: BillWithStatus) => render(<MarkPaidModal bill={bill} isSaving={false} onClose={() => {}} onConfirm={() => {}} />);
  const period = () => (screen.getByRole("combobox") as HTMLSelectElement).value;
  const amount = () => Number((screen.getByRole("spinbutton") as HTMLInputElement).value);

  it("starts with July, the oldest overdue, at €60 — not October", () => {
    openFor(water());

    // Was "2026-10": the current period, leaving July to September overdue.
    expect(period()).toBe("2026-07");
    expect(amount()).toBe(60);
    // Second route: the oldest item of the late figure itself.
    expect(billOverdue(water(), NOW).items[0]).toMatchObject({ periodKey: "2026-07", amount: 60 });
    expect(screen.getByText(/oldest overdue first/i)).toBeInTheDocument();
  });

  it("leaves three overdue, €180, once July is paid that way", () => {
    // What the form files: July, €60, with its expense.
    const afterJuly = water([...KEPT, ...paidMonths(["2026-07"])]);

    expect(billOverdue(afterJuly, NOW).items.map((i) => i.periodKey)).toEqual(["2026-08", "2026-09", "2026-10"]);
    expect(overdueBills([afterJuly], NOW).total).toBe(180);
    // By hand: four at €60, less the one paid.
    expect(4 * 60 - 60).toBe(180);
    // And the form moves on to August next time.
    openFor(afterJuly);
    expect(period()).toBe("2026-08");
  });

  it("keeps today's choice when nothing is overdue", () => {
    // Paid to September, on 5 October: October is unpaid but not late.
    const upToDate = computeBillStatus(WATER, paidMonths([...KEPT_KEYS, "2026-07", "2026-08", "2026-09"]), new Date(2026, 9, 5));
    vi.setSystemTime(new Date(2026, 9, 5, 10, 0));
    openFor(upToDate);

    expect(period()).toBe("2026-10");
    expect(screen.queryByText(/oldest overdue first/i)).not.toBeInTheDocument();
  });

  it("reaches a period ten months back — the late figure looks back twelve", () => {
    // Everything paid but December 2025.
    const keys = ["2025-10", "2025-11", "2026-01", "2026-02", "2026-03", "2026-04", "2026-05", "2026-06", "2026-07", "2026-08", "2026-09", "2026-10"];
    const bill = water(paidMonths(keys));
    expect(billOverdue(bill, NOW).items.map((i) => i.periodKey)).toEqual(["2025-12"]);

    openFor(bill);
    // At six periods back the form stopped at April 2026: December was owed and
    // could not be chosen.
    expect(period()).toBe("2025-12");
    expect([...(screen.getByRole("combobox") as HTMLSelectElement).options].map((o) => o.value)).toContain("2025-12");
  });

  it("starts a part-paid year on its late part, which it used to offer as already paid", () => {
    // €360 a year in three from 5 October; October's paid, November's late.
    const gym = computeBillStatus(
      { ...WATER, id: "gym", name: "Gym", amount: 360, frequency: "yearly", dueMonth: 9, dueDay: 5, installmentCount: 3, anchorDate: new Date(2026, 0, 1), createdAt: new Date(2026, 0, 1) },
      [{ id: "g0", userId: "u1", billId: "gym", periodKey: "2026", installmentIndex: 0, amount: 120, paidDate: new Date(2026, 9, 5), createdAt: new Date(2026, 9, 5) }],
      new Date(2026, 10, 15),
    );
    vi.setSystemTime(new Date(2026, 10, 15, 10, 0));

    // One part of three paid is not "paid": the period stays choosable.
    expect(getPeriodOptions(gym, gym.payments, new Date(2026, 10, 15)).find((o) => o.key === "2026")?.isPaid).toBe(false);
    openFor(gym);
    expect(period()).toBe("2026");
    expect(amount()).toBe(120);
    expect(screen.getByText(/2 of 3/)).toBeInTheDocument();
  });
});

// ─── "I've paid these", in the figures ───────────────────────────────────────

describe("marked paid without a transaction, in every figure", () => {
  it("clears all of it, and counts as paid everywhere a payment does", () => {
    const settled = water([...KEPT, ...paidMonths(["2026-07", "2026-08", "2026-09", "2026-10"], false)]);

    expect(billOverdue(settled, NOW).count).toBe(0);
    expect(arrears([settled], NOW)).toEqual([]);
    expect(overdueBills([settled], NOW).total).toBe(0);
    expect(settled.isPaidThisPeriod).toBe(true);
    // The calendar paints the months paid; this month's breakdown has October
    // among what is already paid, at €60, not among what is still to pay.
    const cells = billCoverage(settled, [2026], NOW).filter((c) => c.month >= 6 && c.month <= 9);
    expect(cells.map((c) => c.status)).toEqual(["paid", "paid", "paid", "paid"]);
    expect(monthForecast([settled], NOW, 0)).toMatchObject({ total: 0, prepaid: 60, prepaidCount: 1 });
  });

  it("leaves an unticked month overdue", () => {
    // August and October marked; September left as it was.
    const partly = water([...KEPT, ...paidMonths(["2026-07"]), ...paidMonths(["2026-08", "2026-10"], false)]);

    expect(billOverdue(partly, NOW).items.map((i) => i.periodKey)).toEqual(["2026-09"]);
    expect(overdueBills([partly], NOW).total).toBe(60);
  });

  it("makes a month overdue again when its payment is deleted", () => {
    const all = [...KEPT, ...paidMonths(["2026-07"]), ...paidMonths(["2026-08", "2026-09", "2026-10"], false)];
    const withoutAugust = all.filter((p) => p.periodKey !== "2026-08");

    expect(billOverdue(water(all), NOW).count).toBe(0);
    expect(billOverdue(water(withoutAugust), NOW).items.map((i) => i.periodKey)).toEqual(["2026-08"]);
    expect(billOverdue(water(withoutAugust), NOW).total).toBe(60);
  });
});

// ─── "I've paid these", through the cache and the database ───────────────────

describe("useSettleOverdue", () => {
  const BILLS = billKeys.all("u1");
  const TXS = transactionKeys.all("u1");
  const expense: Transaction = { id: "t-other", userId: "u1", amount: 42, type: "expense", categoryId: "food", date: new Date(2026, 9, 2), description: "Shop", createdAt: new Date(2026, 9, 2), updatedAt: new Date(2026, 9, 2) };

  let client: QueryClient;
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  const cached = () => client.getQueryData<BillWithStatus[]>(BILLS)!.find((b) => b.id === "water")!;
  const transactions = () => client.getQueryData<Transaction[]>(TXS)!;
  /** What the transactions add up to — the balance the money screens read. */
  const balance = () => transactions().reduce((sum, tx) => sum + (tx.type === "income" ? tx.amount : -tx.amount), 0);

  beforeEach(() => {
    vi.clearAllMocks();
    client = new QueryClient({ defaultOptions: { queries: { staleTime: 5 * 60 * 1000, retry: false }, mutations: { retry: false } } });
    api.getBills.mockResolvedValue([{ ...WATER }]);
    api.getBillPayments.mockResolvedValue(KEPT.map((p) => ({ ...p })));
    api.getTransactions.mockResolvedValue([{ ...expense }]);
    let n = 0;
    api.newDocId.mockImplementation((collection: string) => `${collection}-${++n}`);
  });

  async function mount() {
    const hook = renderHook(() => ({ bills: useBills(), txs: useTransactions(), settle: useSettleOverdue(), unmark: useUnmarkBillPaid() }), { wrapper });
    await waitFor(() => expect(hook.result.current.bills.isSuccess && hook.result.current.txs.isSuccess).toBe(true));
    return hook;
  }

  it("writes the ticked months as payments with no transaction, in one batch, and the balance does not move", async () => {
    api.markBillPeriodsSettled.mockResolvedValue(undefined);
    const hook = await mount();
    const before = { transactions: structuredClone(transactions()), balance: balance() };
    const items = billOverdue(cached(), NOW).items.filter((i) => i.periodKey !== "2026-09");

    await act(() => hook.result.current.settle.mutateAsync({ bill: cached(), items }));

    // One batch of three, none with a transaction, each at its month's €60.
    expect(api.markBillPeriodsSettled).toHaveBeenCalledTimes(1);
    const [, sent] = api.markBillPeriodsSettled.mock.calls[0] as [string, Record<string, unknown>[]];
    expect(sent.map((p) => [p.periodKey, p.amount])).toEqual([
      ["2026-07", 60],
      ["2026-08", 60],
      ["2026-10", 60],
    ]);
    expect(sent.every((p) => !("transactionId" in p))).toBe(true);
    // Nothing written through the paths that make an expense.
    expect(api.markBillPaid).not.toHaveBeenCalled();
    expect(api.createTransaction).not.toHaveBeenCalled();
    expect(transactions()).toEqual(before.transactions);
    expect(balance()).toBe(before.balance);
    expect(balance()).toBe(-42);

    // September, left unticked, is all that is still overdue. By hand: 4 − 3.
    expect(billOverdue(cached(), new Date()).items.map((i) => i.periodKey)).toEqual(["2026-09"]);
    expect(cached().payments.filter((p) => !p.transactionId)).toHaveLength(3);
  });

  it("puts everything back when the write fails", async () => {
    api.markBillPeriodsSettled.mockRejectedValue(new Error("offline"));
    api.getBills.mockResolvedValueOnce([{ ...WATER }]).mockImplementation(() => new Promise(() => {}));
    api.getBillPayments.mockResolvedValueOnce(KEPT.map((p) => ({ ...p }))).mockImplementation(() => new Promise(() => {}));
    const hook = await mount();

    await act(async () => {
      await hook.result.current.settle.mutateAsync({ bill: cached(), items: billOverdue(cached(), NOW).items }).catch(() => {});
    });

    expect(billOverdue(cached(), new Date()).count).toBe(4);
    expect(cached().payments).toHaveLength(KEPT.length);
  });

  it("makes a month overdue again when its payment is deleted, and deletes no transaction", async () => {
    const settledAugust = { ...paidMonths(["2026-08"], false)[0], id: "settled-aug" };
    api.getBillPayments.mockResolvedValue([...KEPT, settledAugust].map((p) => ({ ...p })));
    api.unmarkBillPaid.mockResolvedValue(undefined);
    const hook = await mount();
    expect(billOverdue(cached(), new Date()).items.map((i) => i.periodKey)).toEqual(["2026-07", "2026-09", "2026-10"]);

    await act(() => hook.result.current.unmark.mutateAsync({ paymentId: "settled-aug", transactionId: settledAugust.transactionId }));

    expect(api.unmarkBillPaid).toHaveBeenCalledWith({ id: "settled-aug", transactionId: undefined });
    expect(api.deleteTransaction).not.toHaveBeenCalled();
    expect(billOverdue(cached(), new Date()).items.map((i) => i.periodKey)).toEqual(["2026-07", "2026-08", "2026-09", "2026-10"]);
    expect(transactions()).toHaveLength(1);
  });
});
