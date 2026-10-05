import { describe, it, expect, vi, beforeAll, beforeEach, afterAll } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import i18n from "../../i18n";
import BillsPage from "./BillsPage";
import { arrears, computeBillStatus, overdueBills } from "./billsUtils";
import type { Bill, BillPayment, BillWithStatus } from "../../shared/types/IndexTypes";

// The owner's water bill on the real page: €60 a month due on the 10th, paid
// for nine months and then not for four. On 5 October three of those are late
// and October is not due yet.
//
// Every screen used to judge the bill by October alone: a grey "unpaid" card,
// nothing on the late tile, and July to September kept apart as «Χρωστούμενα»
// in next month's breakdown. These read each screen's figure off the rendered
// page and hold it to the others and to the functions underneath.

const NOW = new Date(2026, 9, 5, 10, 0); // 5 October 2026

/** One payment per month key, each on the 8th of its month, with the expense the form writes. */
const paidMonths = (keys: string[]): BillPayment[] =>
  keys.map((key) => {
    const [y, m] = key.split("-").map(Number);
    return { id: `water-${key}`, userId: "u1", billId: "water", periodKey: key, amount: 60, paidDate: new Date(y, m - 1, 8), transactionId: `t-${key}`, createdAt: new Date(y, m - 1, 8) } as BillPayment;
  });

/** October 2025 to June 2026. */
const KEPT = paidMonths(["2025-10", "2025-11", "2025-12", "2026-01", "2026-02", "2026-03", "2026-04", "2026-05", "2026-06"]);

const water = (now: Date, payments: BillPayment[] = KEPT): BillWithStatus =>
  computeBillStatus(
    {
      id: "water",
      userId: "u1",
      name: "Water",
      amount: 60,
      categoryId: "c1",
      frequency: "monthly",
      dueDay: 10,
      isActive: true,
      anchorDate: new Date(2025, 9, 5),
      createdAt: new Date(2025, 9, 5),
      updatedAt: new Date(2025, 9, 5),
    } as Bill,
    payments,
    now,
  );

const page = vi.hoisted(() => ({ bills: [] as BillWithStatus[], settle: vi.fn(), idle: () => ({ mutate: () => {}, mutateAsync: async () => {}, isPending: false }) }));

vi.mock("./useBills", () => ({
  useBills: () => ({ data: page.bills, isLoading: false, isError: false }),
  useCreateBill: () => page.idle(),
  useUpdateBill: () => page.idle(),
  useDeleteBill: () => page.idle(),
  useMarkBillPaid: () => page.idle(),
  useUnmarkBillPaid: () => page.idle(),
  useUpdateBillPayment: () => page.idle(),
  useSettleOverdue: () => ({ ...page.idle(), mutate: page.settle }),
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
  window.matchMedia = ((query: string) => ({ matches: false, media: query, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, onchange: null, dispatchEvent: () => false })) as unknown as typeof window.matchMedia;
});

beforeEach(async () => {
  vi.setSystemTime(NOW);
  page.bills = [water(NOW)];
  localStorage.removeItem("bills-view");
  await i18n.changeLanguage("en");
});

afterAll(() => {
  vi.useRealTimers();
});

const chip = () => document.querySelector("[class*=_cardTags_]")?.children[0];

describe("water three periods behind, October not yet due", () => {
  it("is on the late tile: one bill, €180", () => {
    render(<BillsPage />);

    const tile = screen.getByRole("button", { name: /overdue/i });
    // Was "0 · none late".
    expect(tile).toHaveTextContent("1");
    expect(tile).toHaveTextContent("€180.00");
    // Second routes: by hand, and the arrears walk the breakdown lists.
    expect(3 * 60).toBe(180);
    expect(arrears(page.bills, NOW).reduce((s, i) => s + i.amount, 0)).toBe(180);
  });

  it("says on its card how many are unpaid and what they come to, and since when", () => {
    render(<BillsPage />);

    // Was a grey "in 5 days".
    expect(chip()).toHaveTextContent("3 unpaid · €180.00");
    // The deadline shown is July's, the oldest still owed — not October's.
    const card = chip()!.closest("[role=button]")!;
    expect(card).toHaveTextContent("Pay by");
    expect(card).toHaveTextContent("Jul 10");
  });

  it("lists it in the late list at the tile's figure, from July", async () => {
    render(<BillsPage />);

    await userEvent.click(screen.getByRole("button", { name: /overdue/i }));
    const dialog = await screen.findByRole("dialog");
    const row = within(dialog)
      .getAllByRole("button")
      .find((b) => /^Water/.test(b.textContent ?? ""))!;

    expect(row).toHaveTextContent("€180.00");
    // Late since 10 July: 21 + 31 + 30 + 5 days.
    expect(row).toHaveTextContent(`${21 + 31 + 30 + 5} days late`);
    expect(row).toHaveTextContent("3 unpaid since Jul 10");
    expect(within(dialog).getByText("€180.00 owed")).toBeInTheDocument();
  });

  it("asks €180 on its line — what is late, October not being due — dated July", () => {
    localStorage.setItem("bills-view", JSON.stringify("list"));
    render(<BillsPage />);

    const line = document.querySelector("[class*=_billLine_]")!;
    expect(line.querySelector("[class*=_lineTags_]")!.children[0]).toHaveTextContent("overdue");
    // Was "€60.00 · Oct 10".
    expect(line.querySelector("[class*=_lineAmount_]")).toHaveTextContent("€180.00");
    expect(line.querySelector("[class*=_lineAmount_]")).toHaveTextContent("Jul 10");
  });

  it("lists the same three in next month's breakdown, under the late tile's own name", async () => {
    render(<BillsPage />);

    await userEvent.click(screen.getByRole("button", { name: /next month/i }));
    const dialog = await screen.findByRole("dialog");
    const heading = within(dialog).getByText("Overdue");
    const section = heading.closest("[class*=_sectionHead_]")!;

    expect(section).toHaveTextContent("3 bills");
    expect(section).toHaveTextContent("€180.00");
  });

  it("says it in Greek with one word for it — «Ληξιπρόθεσμα», not «Χρωστούμενα»", async () => {
    await i18n.changeLanguage("el");
    render(<BillsPage />);

    expect(chip()).toHaveTextContent("3 απλήρωτοι · €180.00");
    await userEvent.click(screen.getByRole("button", { name: /επόμενος μήνας/i }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("Ληξιπρόθεσμα")).toBeInTheDocument();
    expect(within(dialog).queryByText(/Χρωστούμενα|χρωστούμενα/)).not.toBeInTheDocument();
  });

  it("says it in the bill's own dialog too, instead of a grey «Unpaid»", async () => {
    render(<BillsPage />);

    // The card — "Water" is also the "next up" tile's name.
    await userEvent.click(chip()!.closest("[role=button]")!);
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getAllByText("3 unpaid · €180.00").length).toBeGreaterThan(0);
    expect(within(dialog).getByText(/3 unpaid since .*Jul.*· €180\.00/)).toBeInTheDocument();
  });
});

describe("the same water after the 10th, and in its other states", () => {
  it("is four periods late once October's day has gone", () => {
    const after = new Date(2026, 9, 11, 10, 0);
    vi.setSystemTime(after);
    page.bills = [water(after)];
    render(<BillsPage />);

    const tile = screen.getByRole("button", { name: /overdue/i });
    expect(tile).toHaveTextContent("€240.00");
    expect(chip()).toHaveTextContent("4 unpaid · €240.00");
    // Second route: by hand, and the tile's own function.
    expect(4 * 60).toBe(overdueBills(page.bills, after).total);
  });

  it("reads one late period as how late it is", () => {
    // July and August paid after all; only September is open.
    page.bills = [water(NOW, [...KEPT, ...paidMonths(["2026-07", "2026-08"])])];
    render(<BillsPage />);

    // 10 September to 5 October: 20 + 5 days.
    expect(chip()).toHaveTextContent(`${20 + 5} days late`);
    expect(screen.getByRole("button", { name: /overdue/i })).toHaveTextContent("€60.00");
  });

  it("stays among what is still to pay when October is paid but July is not", () => {
    page.bills = [water(NOW, [...KEPT, ...paidMonths(["2026-10"])])];
    render(<BillsPage />);

    const sections = [...document.querySelectorAll("[class*=_listSection_]")].map((s) => s.textContent ?? "");
    // Was filed under "Paid", with a green tick and in no late figure.
    expect(sections).toHaveLength(1);
    expect(sections[0]).toMatch(/^Still to pay/);
    // The heading is what is left on the current periods: October is paid, so
    // nothing — the €180 is the late tile's, and is not added to it.
    expect(sections[0]).toContain("€0.00");
    expect(chip()).toHaveTextContent("3 unpaid · €180.00");
    expect(screen.getByRole("button", { name: /overdue/i })).toHaveTextContent("€180.00");
  });
});

// ─── Paying it, and saying it was paid ───────────────────────────────────────

describe("paying the water from the bill's own dialog", () => {
  const openDialog = async () => {
    // The card — "Water" is also the "next up" tile's name.
    await userEvent.click(chip()!.closest("[role=button]")!);
    return screen.findByRole("dialog");
  };

  it("opens the payment form on July, the oldest overdue, at €60", async () => {
    render(<BillsPage />);
    const dialog = await openDialog();

    await userEvent.click(within(dialog).getByRole("button", { name: i18n.t("bills.payNow") }));
    const form = await screen.findByRole("dialog");
    // Was October: the current period, which is not even late yet.
    expect((within(form).getByRole("combobox") as HTMLSelectElement).value).toBe("2026-07");
    expect((within(form).getByRole("spinbutton") as HTMLInputElement).value).toBe("60");
  });

  it("marks the ticked months paid without a transaction, and leaves an unticked one", async () => {
    page.settle.mockClear();
    render(<BillsPage />);
    const dialog = await openDialog();

    await userEvent.click(within(dialog).getByRole("button", { name: "I've paid these" }));
    const confirm = await screen.findByRole("dialog");
    expect(confirm).toHaveTextContent("Marked as paid without writing a transaction — the money has already left the bank.");
    const boxes = within(confirm).getAllByRole("checkbox");
    // July, August, September — all ticked, at €60 each. By hand: 3 × 60.
    expect(boxes).toHaveLength(3);
    expect(boxes.every((b) => (b as HTMLInputElement).checked)).toBe(true);
    expect(confirm).toHaveTextContent("Jul 10, 2026");
    expect(confirm).toHaveTextContent("Marking €180.00");

    // August left as it was.
    await userEvent.click(boxes[1]);
    expect(confirm).toHaveTextContent("Marking €120.00");
    await userEvent.click(within(confirm).getByRole("button", { name: "Mark 2 as paid" }));

    expect(page.settle).toHaveBeenCalledTimes(1);
    const [{ bill, items }] = page.settle.mock.calls[0] as [{ bill: BillWithStatus; items: { periodKey: string; amount: number }[] }];
    expect(bill.id).toBe("water");
    expect(items.map((i) => [i.periodKey, i.amount])).toEqual([
      ["2026-07", 60],
      ["2026-09", 60],
    ]);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("holds the marking back with no connection, and says why", async () => {
    // Online only: the list is a decision taken against this screen.
    const online = Object.getOwnPropertyDescriptor(Navigator.prototype, "onLine");
    Object.defineProperty(navigator, "onLine", { configurable: true, get: () => false });
    try {
      render(<BillsPage />);
      const dialog = await openDialog();
      await userEvent.click(within(dialog).getByRole("button", { name: "I've paid these" }));
      const confirm = await screen.findByRole("dialog");

      expect(within(confirm).getByRole("button", { name: "Mark 3 as paid" })).toBeDisabled();
      expect(confirm).toHaveTextContent(i18n.t("common.offlineBulk"));
    } finally {
      delete (navigator as unknown as Record<string, unknown>).onLine;
      if (online) Object.defineProperty(Navigator.prototype, "onLine", online);
    }
  });

  it("shows a month marked that way as paid with no transaction, and says so before deleting it", async () => {
    const marked = { id: "settled-jul", userId: "u1", billId: "water", periodKey: "2026-07", amount: 60, paidDate: new Date(2026, 6, 10), createdAt: new Date(2026, 9, 5) } as BillPayment;
    page.bills = [water(NOW, [...KEPT, marked])];
    render(<BillsPage />);
    // Two left, August and September: €120.
    expect(chip()).toHaveTextContent("2 unpaid · €120.00");
    const dialog = await openDialog();

    const tag = within(dialog).getByText("no transaction");
    const row = tag.closest("[class*=_paymentRow_]")!;
    expect(row).toHaveTextContent("€60.00");
    await userEvent.click(within(row as HTMLElement).getByRole("button", { name: i18n.t("common.delete") }));
    expect(within(dialog).getByText(/It wrote no expense/)).toBeInTheDocument();
  });
});
