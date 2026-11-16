import { MemoryRouter } from "react-router-dom";
import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import { act, render, screen } from "@testing-library/react";
import i18n from "../../i18n";
import BillsPage from "./BillsPage";
import { computeBillStatus } from "./billsUtils";
import type { Bill, BillWithStatus } from "../../shared/types/IndexTypes";

// The count on the page's «Πληρωμές» tab, on the real page, across a night.
//
// The page used to read the clock once, when it opened; the menu's badge reads
// the app's shared day. A phone left the page open overnight and the two
// counted different days — the tab said 1 while the menu said 2. The page now
// reads the shared day too (`useToday`), so its count moves with the date.
// `billsBadge.test.tsx` has the menu side and the payment.

const OPENED = new Date(2026, 5, 20, 23); // 23:00 on Saturday 20 June 2026

const monthly = (id: string, name: string, amount: number, dueDay: number): BillWithStatus =>
  computeBillStatus(
    { id, userId: "u1", name, amount, categoryId: "c1", frequency: "monthly", dueDay, isActive: true, anchorDate: new Date(2026, 5, 1), createdAt: new Date(2026, 5, 1), updatedAt: new Date(2026, 5, 1) } as Bill,
    [],
    OPENED,
  );

const page = vi.hoisted(() => ({ bills: [] as BillWithStatus[], idle: () => ({ mutate: () => {}, mutateAsync: async () => {}, isPending: false }) }));

vi.mock("./useBills", () => ({
  useBills: () => ({ data: page.bills, isLoading: false, isError: false }),
  useCreateBill: () => page.idle(),
  useUpdateBill: () => page.idle(),
  useDeleteBill: () => page.idle(),
  useMarkBillPaid: () => page.idle(),
  useUnmarkBillPaid: () => page.idle(),
  useUpdateBillPayment: () => page.idle(),
  useSettleOverdue: () => page.idle(),
}));
vi.mock("../transactions/hooks/useTransactions", () => ({
  useCategories: () => ({ data: [] }),
  useCreateCategoryScope: () => ({ mutateAsync: vi.fn() }),
}));
vi.mock("../incomes/useSalaryIncome", () => ({ useSalaryIncome: () => ({ monthly: 0, thisMonth: undefined, isLoading: false }) }));
vi.mock("../../shared/hooks/useCurrencyConverter", () => ({
  useCurrencyConverter: () => ({ format: (n: number) => `€${n.toFixed(2)}`, convert: (n: number) => n, convertToBase: (n: number) => n, baseCurrency: "EUR", displayCurrency: "EUR" }),
}));

beforeAll(async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(OPENED);
  // Phone due the 18th (late), Power the 25th (5 days), Rent the 28th (8 days, then 7).
  page.bills = [monthly("phone", "Phone", 15, 18), monthly("power", "Power", 80, 25), monthly("rent", "Rent", 450, 28)];
  window.matchMedia = ((query: string) => ({ matches: false, media: query, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, onchange: null, dispatchEvent: () => false })) as unknown as typeof window.matchMedia;
  await i18n.changeLanguage("en");
});

afterAll(() => {
  vi.useRealTimers();
});

describe("the «Πληρωμές» tab's count", () => {
  it("moves to the new day when the app comes back, as the menu's does", () => {
    render(<BillsPage view="pay" />, { wrapper: MemoryRouter });
    // By hand on the 20th: Phone late + Power in 5 days = 2 (Rent is 8 days off).
    expect(screen.getByRole("link", { name: /payments — 2 bills/i })).toBeInTheDocument();

    vi.setSystemTime(new Date(2026, 5, 21, 9));
    act(() => document.dispatchEvent(new Event("visibilitychange")));
    // By hand on the 21st: Rent is 7 days off now — 3.
    expect(screen.getByRole("link", { name: /payments — 3 bills/i })).toBeInTheDocument();
  }, 15_000);
});
