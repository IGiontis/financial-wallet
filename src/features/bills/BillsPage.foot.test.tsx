import { MemoryRouter } from "react-router-dom";
import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import i18n from "../../i18n";
import BillsPage from "./BillsPage";
import { computeBillStatus, expectedAmount } from "./billsUtils";
import type { Bill, BillPayment, BillWithStatus } from "../../shared/types/IndexTypes";

// «Κανονικό»'s foot: the payment before this one and the day coming, each a
// square date block with its word (owner, 2026-11-19). The head never changes
// with the density (`.claude/rules/ui.md` 10), «Απλό» has no foot at all, and a
// bill never paid shows «—» with its word rather than an empty block.

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
  useClearBill: () => page.idle(),
}));
vi.mock("../transactions/hooks/useTransactions", () => ({
  useCategories: () => ({ data: [] }),
  useCreateCategoryScope: () => ({ mutateAsync: vi.fn() }),
}));
vi.mock("../incomes/useSalaryIncome", () => ({ useSalaryIncome: () => ({ monthly: 0, thisMonth: undefined, isLoading: false }) }));
vi.mock("../../shared/hooks/useCurrencyConverter", () => ({
  useCurrencyConverter: () => ({ format: (n: number) => `£${n.toFixed(2)}`, convert: (n: number) => n, convertToBase: (n: number) => n, baseCurrency: "GBP", displayCurrency: "GBP" }),
}));

/** Rent of the 10th, paid for October and for this month; water every 2 months, never paid. */
const RENT_OCT = new Date(2026, 9, 10);
const RENT_NOV = new Date(2026, 10, 10);

beforeAll(async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
  page.bills = [
    make({ id: "rent", name: "Rent", amount: 400, dueDay: 10 }, [
      { id: "r-nov", userId: "u1", billId: "rent", periodKey: "2026-11", amount: 395, paidDate: RENT_NOV, createdAt: RENT_NOV } as BillPayment,
      { id: "r-oct", userId: "u1", billId: "rent", periodKey: "2026-10", amount: 390, paidDate: RENT_OCT, createdAt: RENT_OCT } as BillPayment,
    ]),
    make({ id: "water", name: "Water", amount: 60, dueDay: 20, intervalCount: 2, isVariableAmount: true }),
  ];
  window.matchMedia = ((query: string) => ({ matches: false, media: query, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, onchange: null, dispatchEvent: () => false })) as unknown as typeof window.matchMedia;
  await i18n.changeLanguage("en");
});

afterAll(() => {
  vi.useRealTimers();
  localStorage.clear();
});

/** The bill's card on the list, by the name in its head (not the month bar's piece of the same name). */
const card = (name: string) =>
  [...document.querySelectorAll("[class*=_stripCard_]")].find((el) => el.querySelector("[class*=_stripName_]")?.textContent?.includes(name)) as HTMLElement;
const foot = (name: string) => card(name).querySelector("[class*=_stripFoot_]") as HTMLElement | null;

describe("the «Κανονικό» card's foot", () => {
  it("names the payment before this one and the day coming, each with its date block", () => {
    render(<BillsPage view="all" />, { wrapper: MemoryRouter });

    const blocks = [...foot("Rent")!.querySelectorAll("[class*=_footBlock_]")].map((b) => b.textContent ?? "");
    expect(blocks).toHaveLength(2);
    // «Προηγούμενος»: the day of the LAST payment (10 Nov, not October's) and
    // what was handed over then — 395, the real figure, not the bill's 400.
    expect(blocks[0]).toContain("Previous");
    expect(blocks[0]).toContain("10");
    expect(blocks[0]).toContain("Nov");
    expect(blocks[0]).toContain("£395.00");
    // «Επόμενος»: the next due day and what the bill leaves each time — the
    // same figure `expectedAmount` gives, read a second way.
    expect(blocks[1]).toContain("Next");
    expect(blocks[1]).toContain("10");
    expect(blocks[1]).toContain("Dec");
    expect(blocks[1]).toContain("£400.00");
    expect(expectedAmount(page.bills[0])).toBe(400);
  });

  it("shows «—» with the word for a bill never paid, and marks a variable estimate", () => {
    render(<BillsPage view="all" />, { wrapper: MemoryRouter });

    const blocks = [...foot("Water")!.querySelectorAll("[class*=_footBlock_]")].map((b) => b.textContent ?? "");
    expect(blocks[0]).toContain("Previous");
    expect(blocks[0]).toContain("—");
    expect(blocks[0]).toContain("never paid");
    // The estimate of a variable bill carries its «~».
    expect(blocks[1]).toContain("~£60.00");
  });

  it("is the foot only: «Απλό» drops it and the head says the same at every density", async () => {
    render(<BillsPage view="all" />, { wrapper: MemoryRouter });
    const head = () => card("Rent").querySelector("[class*=_stripCardHead_]")!.textContent;
    const normalHead = head();
    expect(foot("Rent")).not.toBeNull();

    const density = screen.getByRole("group", { name: "How much detail" });
    await userEvent.click(within(density).getByRole("button", { name: "Simple" }));
    expect(foot("Rent")).toBeNull();
    expect(head()).toBe(normalHead);

    // «Αναλυτικό» says the same in its three figures, so it has no day blocks either.
    await userEvent.click(within(density).getByRole("button", { name: "Detailed" }));
    expect(foot("Rent")).toBeNull();
    expect(head()).toBe(normalHead);
  });
});
