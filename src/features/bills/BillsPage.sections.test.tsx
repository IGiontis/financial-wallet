import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import i18n from "../../i18n";
import BillsPage from "./BillsPage";
import { amountDueNext, computeBillStatus, monthForecast, overdueBills } from "./billsUtils";
import type { Bill, BillPayment, BillWithStatus } from "../../shared/types/IndexTypes";

// The two headings over the list, and the late list, on the real page.
//
// "Still to pay" added up the full price of every unpaid bill: a stopped flat
// and a paused holiday house that nothing else on the page counted, and a gym
// year of €360 with €120 of it already paid. "Paid" counted only the latest
// part of a year paid in two. These read the figures off the rendered page and
// check them against the rows beneath and against the functions the rest of
// the page is built on.

const NOW = new Date(2026, 10, 15, 10, 0); // 15 November 2026

const make = (bill: Partial<Bill>, payments: BillPayment[] = []): BillWithStatus =>
  computeBillStatus(
    {
      userId: "u1",
      categoryId: "c1",
      frequency: "monthly",
      isActive: true,
      anchorDate: new Date(2026, 0, 1),
      createdAt: new Date(2026, 0, 1),
      updatedAt: new Date(2026, 0, 1),
      ...bill,
    } as Bill,
    payments,
    NOW,
  );

const part = (billId: string, periodKey: string, index: number, amount: number, paidDate: Date): BillPayment =>
  ({ id: `${billId}-${index}`, userId: "u1", billId, periodKey, installmentIndex: index, amount, paidDate, createdAt: paidDate }) as BillPayment;

/**
 * Every month of 2026 paid from January through `lastMonth` (0-based). The
 * flat and the house were kept up to date until their pauses began, so the
 * pause is all these tests see of them — unpaid, every month since January
 * would be overdue, and rightly.
 */
const paidUntil = (billId: string, amount: number, lastMonth: number): BillPayment[] =>
  Array.from({ length: lastMonth + 1 }, (_, m) => ({ id: `${billId}-m${m}`, userId: "u1", billId, periodKey: `2026-${String(m + 1).padStart(2, "0")}`, amount, paidDate: new Date(2026, m, 1), createdAt: new Date(2026, m, 1) }) as BillPayment);

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
// No salary on «Έσοδα»: the page shows what it shows without one.
vi.mock("../incomes/useSalaryIncome", () => ({ useSalaryIncome: () => ({ monthly: 0, thisMonth: undefined, isLoading: false }) }));
vi.mock("../../shared/hooks/useCurrencyConverter", () => ({
  useCurrencyConverter: () => ({ format: (n: number) => `€${n.toFixed(2)}`, convert: (n: number) => n, convertToBase: (n: number) => n, baseCurrency: "EUR", displayCurrency: "EUR" }),
}));

beforeAll(async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
  page.bills = [
    // Late since the 10th — added this month, so November is all it owes.
    make({ id: "netflix", name: "Netflix", amount: 15, dueDay: 10, anchorDate: new Date(2026, 10, 1), createdAt: new Date(2026, 10, 1) }),
    // Gone for good since August, paid up to then.
    make({ id: "flat", name: "Flat", amount: 40, dueDay: 10, pause: { from: "2026-08" } }, paidUntil("flat", 40, 6)),
    // Off for the winter, paid up to then.
    make({ id: "house", name: "House", amount: 60, dueDay: 10, pause: { from: "2026-11", to: "2027-02" } }, paidUntil("house", 60, 9)),
    // €360 in three from 5 October: October's paid, November's late, December's to come.
    make({ id: "gym", name: "Gym", amount: 360, frequency: "yearly", dueMonth: 9, dueDay: 5, installmentCount: 3 }, [part("gym", "2026", 0, 120, new Date(2026, 9, 5))]),
    // €300 in two, March and April, both paid.
    make({ id: "cover", name: "Cover", amount: 300, frequency: "yearly", dueMonth: 2, dueDay: 1, installmentCount: 2 }, [
      part("cover", "2026", 1, 150, new Date(2026, 3, 1)),
      part("cover", "2026", 0, 150, new Date(2026, 2, 1)),
    ]),
  ];
  window.matchMedia = ((query: string) => ({ matches: false, media: query, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, onchange: null, dispatchEvent: () => false })) as unknown as typeof window.matchMedia;
  await i18n.changeLanguage("en");
});

afterAll(() => {
  vi.useRealTimers();
});

const headings = () =>
  [...document.querySelectorAll("[class*=_listSection_]")].map((section) => ({
    title: section.querySelector("[class*=_listSectionTitle_]")?.textContent ?? "",
    total: section.querySelector("[class*=_listSectionTotal_]")?.textContent ?? "",
  }));

describe("the list's headings", () => {
  it("says what is left to pay, without the stopped and paused bills", () => {
    render(<BillsPage />);

    const [outstanding, settled] = headings();
    expect(outstanding.title).toMatch(/^Still to pay/);
    // Was €475.00: 15 + 40 + 60 + 360.
    expect(outstanding.total).toBe("€255.00");
    // Second route, by hand: Netflix, and the gym's two parts still to come.
    expect(15 + 0 + 0 + (360 - 120)).toBe(255);
    // Third: what each unpaid bill says it still owes.
    const unpaid = page.bills.filter((b) => !b.isPaidThisPeriod);
    expect(unpaid.reduce((sum, b) => sum + b.outstandingAmount, 0)).toBe(255);

    expect(settled.title).toMatch(/^Paid/);
  });

  it("counts every part of a year paid in parts", () => {
    render(<BillsPage />);

    // Was €150.00, the April part alone.
    expect(headings()[1].total).toBe("€300.00");
  });

  it("says the same in the bill's own dialog", async () => {
    render(<BillsPage />);

    await userEvent.click(screen.getByText("Cover"));
    const dialog = await screen.findByRole("dialog");
    // Was "€150.00 paid". Second route: both parts, 150 + 150.
    expect(within(dialog).getByText(/€300\.00 paid/)).toBeInTheDocument();
    expect(150 + 150).toBe(300);
  });
});

describe("the late list on a part-paid bill", () => {
  it("asks for the late part, and the rows add up to the tile", async () => {
    render(<BillsPage />);

    const tile = screen.getByRole("button", { name: /overdue/i });
    expect(tile).toHaveTextContent("2");
    // Was €375.00: Netflix and the gym's whole year.
    expect(tile).toHaveTextContent("€135.00");

    await userEvent.click(tile);
    const dialog = await screen.findByRole("dialog");
    const rows = within(dialog)
      .getAllByRole("button")
      .map((row) => row.textContent ?? "")
      .filter((text) => /Netflix|Gym/.test(text));

    expect(rows).toHaveLength(2);
    expect(rows.find((r) => r.startsWith("Gym"))).toContain("€120.00");
    expect(rows.find((r) => r.startsWith("Netflix"))).toContain("€15.00");
    expect(within(dialog).getByText("€135.00 owed")).toBeInTheDocument();

    // Second route: the same bills through the functions, row by row.
    const late = overdueBills(page.bills, NOW);
    expect(late.bills.map((b) => amountDueNext(b, NOW)).reduce((s, a) => s + a, 0)).toBe(135);
    // Netflix is this month's only charge still open; the gym's November part is the other.
    expect(monthForecast(page.bills, NOW, 0).total).toBe(135);
  });
});
