import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import i18n from "../../i18n";
import BillsPage from "./BillsPage";
import { computeBillStatus } from "./billsUtils";
import type { Bill, BillWithStatus } from "../../shared/types/IndexTypes";

// The two tiles at the top of the Bills page that open something.
//
// "To pay this period" stopped opening once the month it opens became a number:
// this period is month 0, and `{breakdownMonth && …}` read the 0 as "nothing
// open". Nothing tested the page itself, so nothing noticed. These click the
// real tiles on the real page, which is the only place that bug could be seen.

const NOW = new Date(2026, 8, 16, 10, 0); // 16 September 2026

const bill = (id: string, name: string, amount: number, dueDay: number): BillWithStatus =>
  computeBillStatus(
    {
      id,
      userId: "u1",
      name,
      amount,
      categoryId: "c1",
      frequency: "monthly",
      dueDay,
      isActive: true,
      anchorDate: new Date(2026, 0, 1),
      createdAt: new Date(2026, 0, 1),
      updatedAt: new Date(2026, 0, 1),
    } as Bill,
    [],
    NOW,
  );

// Mocks are hoisted above everything else in the file, so what they hand out
// lives in a holder they can see, filled in once the helpers above exist.
const page = vi.hoisted(() => ({ bills: [] as BillWithStatus[], idle: () => ({ mutate: () => {}, mutateAsync: async () => {}, isPending: false }) }));

vi.mock("./useBills", () => ({
  useBills: () => ({ data: page.bills, isLoading: false, isError: false }),
  useCreateBill: () => page.idle(),
  useUpdateBill: () => page.idle(),
  useDeleteBill: () => page.idle(),
  useMarkBillPaid: () => page.idle(),
  useUnmarkBillPaid: () => page.idle(),
  useUpdateBillPayment: () => page.idle(),
}));
vi.mock("../transactions/hooks/useTransactions", () => ({
  useCategories: () => ({ data: [] }),
  useCreateCategoryScope: () => ({ mutateAsync: vi.fn() }),
}));
vi.mock("../../shared/hooks/useSalary", () => ({ useSalary: () => ({ salary: undefined }) }));
vi.mock("../../shared/hooks/useCurrencyConverter", () => ({
  useCurrencyConverter: () => ({ format: (n: number) => `€${n.toFixed(2)}`, convert: (n: number) => n, convertToBase: (n: number) => n, baseCurrency: "EUR", displayCurrency: "EUR" }),
}));

beforeAll(async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
  page.bills = [bill("rent", "Rent", 420, 1), bill("water", "Water", 68.4, 3), bill("phone", "Phone", 25, 28)];
  // jsdom has no matchMedia; the page asks it whether the screen is narrow.
  window.matchMedia = ((query: string) => ({ matches: false, media: query, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, onchange: null, dispatchEvent: () => false })) as unknown as typeof window.matchMedia;
  await i18n.changeLanguage("en");
});

afterAll(() => {
  vi.useRealTimers();
});

describe("the Bills page tiles", () => {
  it("opens this period's breakdown", async () => {
    render(<BillsPage />);

    await userEvent.click(screen.getByRole("button", { name: /to pay this period/i }));

    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText(i18n.t("bills.thisMonthTitle"))).toBeInTheDocument();
  });

  it("opens the late bills from the count of them", async () => {
    render(<BillsPage />);

    const tile = screen.getByRole("button", { name: /overdue/i });
    // The tile's own figures, read before opening: two late, €488.40 between them.
    expect(tile).toHaveTextContent("2");
    expect(tile).toHaveTextContent("€488.40");

    await userEvent.click(tile);
    const dialog = await screen.findByRole("dialog");

    // Most late first, and only the late ones — the phone is not due until the 28th.
    const names = within(dialog)
      .getAllByRole("button")
      .map((row) => row.textContent ?? "")
      .filter((text) => /Rent|Water|Phone/.test(text));
    expect(names).toHaveLength(2);
    expect(names[0]).toMatch(/^Rent/);
    expect(names[1]).toMatch(/^Water/);

    // The list adds up to the tile. Second route: by hand, 420 + 68.40.
    expect(420 + 68.4).toBeCloseTo(488.4, 2);
    expect(within(dialog).getByText("€488.40 owed")).toBeInTheDocument();
  });

  it("leaves the tile inert when nothing is late", async () => {
    // Nothing to list, so nothing to press — a button that opens an empty
    // dialog is worse than no button.
    vi.setSystemTime(new Date(2026, 8, 1, 0, 1));
    render(<BillsPage />);

    expect(screen.queryByRole("button", { name: /overdue/i })).not.toBeInTheDocument();
    vi.setSystemTime(NOW);
  });
});

describe("status and cadence under each bill's name", () => {
  it("puts the status first, then the cadence, on every card", () => {
    render(<BillsPage />);

    const rows = [...document.querySelectorAll("[class*=_cardTags_]")];
    expect(rows).toHaveLength(3);
    for (const row of rows) {
      expect(row.children[1]).toHaveClass("badge");
      expect(row.children[1]).toHaveTextContent("Monthly");
    }
  });

  it("gives every line in the list a status, first, so they line up", async () => {
    localStorage.setItem("bills-view", JSON.stringify("list"));
    render(<BillsPage />);

    const rows = [...document.querySelectorAll("[class*=_lineTags_]")];
    expect(rows.map((row) => row.children[0].textContent)).toEqual(expect.arrayContaining(["late", "unpaid"]));
    for (const row of rows) expect(row.children[1]).toHaveClass("badge");
    localStorage.removeItem("bills-view");
  });
});
