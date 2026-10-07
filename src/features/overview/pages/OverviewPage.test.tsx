import { describe, it, expect, vi, beforeAll, beforeEach, afterAll } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import i18n from "../../../i18n";
import { OverviewPage } from "./OverviewPage";
import { computeBillStatus } from "../../bills/billsUtils";
import { computeDebtStatus } from "../../debts/debtsUtils";
import type { Bill, Debt, Transaction } from "../../../shared/types/IndexTypes";
import { readCheckIns, type CheckInReading } from "../../accounts/accountsUtils";
import { monthlyIncome, monthlySalary } from "../../../test/incomes";

// The overview's four tabs, on the real page.
//
// Each tab restates figures other pages own, so each is checked against a
// second route: the balance less the bills before pay day, worked by hand; the
// position against what was put in; the month's two figures against the
// transactions themselves.

const NOW = new Date(2026, 8, 26, 12); // 26 September

const data = vi.hoisted(() => ({ transactions: [] as Transaction[], bills: [] as unknown[], debts: [] as unknown[], readings: [] as unknown[], accounts: [] as unknown[] }));

// The chart is recharts, loaded lazily; what it draws is not what these check,
// and pulling it in slowed the next test past its timeout.
vi.mock("../components/CashFlowChart", () => ({ default: () => <div data-testid="cash-flow-chart" /> }));
vi.mock("../../transactions/hooks/useTransactions", () => ({
  useTransactions: () => ({ data: data.transactions, isLoading: false, isError: false }),
  useCreateTransaction: () => ({ mutate: vi.fn(), mutateAsync: vi.fn() }),
  useCategories: () => ({ data: [{ id: "shop", name: "Groceries", icon: "🛒", type: "expense" }] }),
}));
vi.mock("../../budget/useInvestments", () => ({ useInvestmentGoals: () => ({ data: [], isLoading: false }) }));
vi.mock("../../bills/useBills", () => ({ useBills: () => ({ data: data.bills }), useMarkBillPaid: () => ({ mutate: vi.fn() }) }));
// The account's saved figures: none of the planner's — only the salary on
// «Έσοδα», 1,700 on the 28th. What the page writes back is kept, so a test can
// see that it wrote nothing.
const saved = vi.hoisted(() => new Map<string, unknown>());
const stored = vi.hoisted(() => ({ incomes: [] as unknown[] }));
vi.mock("../../../shared/hooks/useWorkspaceSetting", () => ({
  useWorkspace: () => ({ data: { incomes: stored.incomes }, isSuccess: true, isLoading: false }),
  useWorkspaceSetting: (key: string, initial: unknown) => [key === "incomes" ? stored.incomes : initial, (value: unknown) => saved.set(key, value)],
}));
vi.mock("../../debts/useDebts", () => ({ useDebts: () => ({ data: data.debts }) }));
vi.mock("../../../shared/hooks/useOpeningBalance", () => ({ useOpeningBalance: () => ({ opening: undefined, anchors: [], source: undefined, isLoading: false }) }));
vi.mock("../../accounts/useMoneyAccounts", () => ({ useMoneyAccounts: () => ({ accounts: data.accounts, readings: data.readings, latest: data.readings.at(-1), setCheckIns: vi.fn() }) }));
vi.mock("../../../shared/hooks/useCurrencyConverter", () => ({
  useCurrencyConverter: () => ({ format: (n: number) => `€${n.toFixed(2)}`, convert: (n: number) => n, baseCurrency: "EUR", displayCurrency: "EUR" }),
}));

const tx = (id: string, type: "income" | "expense", amount: number, date: Date): Transaction =>
  ({ id, userId: "u", type, amount, categoryId: "c", description: id, date, createdAt: date, updatedAt: date }) as unknown as Transaction;

const bill = (id: string, name: string, amount: number, dueDay: number) =>
  computeBillStatus({ id, userId: "u", name, amount, categoryId: "c", frequency: "monthly", dueDay, isActive: true, anchorDate: new Date(2026, 0, 1), createdAt: new Date(2026, 0, 1), updatedAt: new Date(2026, 0, 1) } as Bill, [], NOW);

const renderPage = () =>
  render(
    <MemoryRouter>
      <OverviewPage />
    </MemoryRouter>,
  );

beforeAll(async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
  window.matchMedia ??= ((query: string) => ({ matches: false, media: query, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, onchange: null, dispatchEvent: () => false })) as unknown as typeof window.matchMedia;
  await i18n.changeLanguage("en");
});

afterAll(() => vi.useRealTimers());

beforeEach(() => {
  localStorage.removeItem("overview-tab");
  saved.clear();
  stored.incomes = [monthlySalary(1700, 28)];
  // August: 3000 in, 500 out. September so far: 150 in, 309,45 out. Balance 2340,55.
  data.transactions = [
    tx("salary-aug", "income", 3000, new Date(2026, 7, 28)),
    tx("rent-aug", "expense", 500, new Date(2026, 7, 2)),
    tx("gig", "income", 150, new Date(2026, 8, 12)),
    { ...tx("shop", "expense", 309.45, new Date(2026, 8, 14)), categoryId: "shop" } as Transaction,
  ];
  data.bills = [bill("water", "Water", 68.4, 20), bill("phone", "Phone", 25, 30)];
  data.readings = [];
  data.accounts = [];
  data.debts = [
    computeDebtStatus({ id: "loan", userId: "u", person: "Nikos", direction: "owed_by_me", label: "Rent loan", amount: 300, date: new Date(2026, 5, 1), dueDate: new Date(2026, 8, 30), createdAt: new Date(2026, 5, 1), updatedAt: new Date(2026, 5, 1) } as Debt, [], NOW),
  ];
});

describe("the overview", () => {
  it("opens on Summary: the pay-day answer and the tiles, and nothing another tab shows", () => {
    renderPage();

    expect(screen.getByRole("tab", { name: /Summary/ })).toHaveAttribute("aria-selected", "true");
    expect(screen.getAllByRole("tab")[0]).toHaveTextContent("Summary");
    const panel = screen.getByRole("tabpanel");
    expect(within(panel).getByText("You make it to payday")).toBeInTheDocument();
    expect(within(panel).getByRole("link", { name: /Bills/ })).toHaveAttribute("href", "/bills");
    // What wants doing is Today's, the month's figures the month's.
    expect(within(panel).queryByText("Water")).toBeNull();
    expect(within(panel).queryByText("In this month")).toBeNull();
  });

  it("puts the tabs first, above every figure", () => {
    renderPage();
    const tabs = screen.getByRole("tablist");
    const answer = screen.getByText("You make it to payday");
    expect(tabs.compareDocumentPosition(answer) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("shows each part on one tab only", async () => {
    renderPage();
    const seen = new Map<string, string>();
    for (const tab of screen.getAllByRole("tab")) {
      await userEvent.click(tab);
      const text = screen.getByRole("tabpanel").textContent ?? "";
      for (const part of ["You make it to payday", "In this month", "Nothing is late", "Needs attention", "Today ·", "Where it went"]) {
        if (!text.includes(part)) continue;
        expect(seen.get(part) ?? tab.textContent).toBe(tab.textContent);
        seen.set(part, tab.textContent ?? "");
      }
    }
  });

  it("shows what wants doing on Today, and on The month where it went, adding up to what went out", async () => {
    renderPage();
    await userEvent.click(screen.getByRole("tab", { name: /To do/ }));
    expect(within(screen.getByRole("tabpanel")).getByText("Water")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("tab", { name: /^Month$/ }));
    const panel = screen.getByRole("tabpanel");
    expect(within(panel).getByText("🛒 Groceries")).toBeInTheDocument();
    // This month only: 150 in, 309,45 out — August does not count.
    expect(within(panel).getByText("€150.00")).toBeInTheDocument();
    // Twice: as what went out, and as the one category it all went on — the
    // two are counted the same way, so they have to agree.
    expect(within(panel).getAllByText("€309.45")).toHaveLength(2);
  });

  it("says on Summary whether the money lasts to pay day — the Planner's figure", async () => {
    renderPage();
    // Second route: 3000 − 500 + 150 − 309,45 = 2340,55 in hand, less the
    // water (20th, late, so owed now) before pay on the 28th; the phone on the 30th is after.
    expect(3000 - 500 + 150 - 309.45 - 68.4).toBeCloseTo(2272.15, 2);
    expect(screen.getByText("€2340.55")).toBeInTheDocument();
    expect(screen.getByText("You make it to payday")).toBeInTheDocument();
    expect(screen.getByText("€2272.15")).toBeInTheDocument();
    expect(screen.getByText("Bills €68.40")).toBeInTheDocument();

    // The month tab keeps the month, and no second answer of its own.
    await userEvent.click(screen.getByRole("tab", { name: /^Month$/ }));
    const panel = screen.getByRole("tabpanel");
    const text = panel.textContent ?? "";
    expect(text.indexOf("In this month")).toBeLessThan(text.lastIndexOf("Water"));
    expect(within(panel).queryByText("€2272.15")).not.toBeInTheDocument();
    expect(within(panel).queryByText("Total income")).not.toBeInTheDocument();
  });

  it("says when it does not last, and where it breaks", () => {
    // 50 in hand, and the late water (68,40) is owed today: 50 − 68,40 = −18,40,
    // the only outgoing before pay on the 28th.
    data.transactions = [tx("little", "income", 50, new Date(2026, 8, 1))];
    renderPage();
    expect(screen.getByText("You don't make it to payday")).toBeInTheDocument();
    expect(50 - 68.4).toBeCloseTo(-18.4, 2);
    expect(screen.getByText("€-18.40")).toBeInTheDocument();
    expect(screen.getByText(/You need €68.40 and have €50.00\. You go below zero on .*, at “Water”\./)).toBeInTheDocument();
  });

  it("is for looking: no actions, every row of the list leads to its page", async () => {
    renderPage();
    await userEvent.click(screen.getByRole("tab", { name: /To do/ }));
    const panel = screen.getByRole("tabpanel");
    // Nothing to press on the list itself — paying is done on Πάγια, and so on.
    expect(within(panel).queryAllByRole("button")).toHaveLength(0);
    expect(within(panel).getByRole("link", { name: /Water/ })).toHaveAttribute("href", "/bills");
    expect(within(panel).getByRole("link", { name: /Rent loan/ })).toHaveAttribute("href", "/debts");
    // And no add button of its own.
    expect(screen.queryByRole("button", { name: "New transaction" })).toBeNull();
  });

  it("lists what was written down today", async () => {
    data.transactions = [...data.transactions, { ...tx("Coffee", "expense", 3.4, new Date(2026, 8, 26, 9)), categoryId: "shop" } as Transaction];
    renderPage();
    await userEvent.click(screen.getByRole("tab", { name: /To do/ }));
    const panel = screen.getByRole("tabpanel");
    expect(within(panel).getByText("Today · 1 entry")).toBeInTheDocument();
    expect(within(panel).getByText("Coffee")).toBeInTheDocument();
  });

  it("keeps the period dashboard, with its range picker and chart, in its own tab", async () => {
    renderPage();
    await userEvent.click(screen.getByRole("tab", { name: /Period/ }));

    const panel = screen.getByRole("tabpanel");
    expect(within(panel).getByText("Total income")).toBeInTheDocument();
    expect(within(panel).getByRole("button", { name: "This month" })).toBeInTheDocument();
  });

  it("shows the net position: cash less what is owed", async () => {
    renderPage();
    await userEvent.click(screen.getByRole("tab", { name: /Net worth/ }));

    // 2340,55 cash − 300 owed = 2040,55.
    expect(within(screen.getByRole("tabpanel")).getAllByText("€2040.55").length).toBeGreaterThan(0);
  });

  it("links every tile to its page", async () => {
    renderPage();
    await userEvent.click(screen.getByRole("tab", { name: /Summary/ }));

    const hrefs = within(screen.getByRole("tabpanel"))
      .getAllByRole("link")
      .map((a) => a.getAttribute("href"));
    expect(hrefs).toEqual(expect.arrayContaining(["/bills", "/transactions", "/debts", "/goals", "/analytics"]));
  });

  it("remembers the tab last chosen", async () => {
    const first = renderPage();
    await userEvent.click(screen.getByRole("tab", { name: /Net worth/ }));
    first.unmount();

    renderPage();
    expect(screen.getByRole("tab", { name: /Net worth/ })).toHaveAttribute("aria-selected", "true");
  });

  it("says all clear when nothing wants doing", async () => {
    data.bills = [];
    data.debts = [];
    renderPage();
    // One line, on Today.
    await userEvent.click(screen.getByRole("tab", { name: /To do/ }));
    expect(screen.queryByText(/Needs attention/)).not.toBeInTheDocument();

    expect(screen.getByText("Nothing is late or due in the next week.")).toBeInTheDocument();
  });

  it("shows what the bank readings found gone without a record, and links to them", async () => {
    // Read on the 10th and the 20th with the gig and the shop in between:
    // 2,000 + 150 − 309.45 = 1,840.55 expected, 1,800 found.
    const accounts = [{ id: "eb", name: "Eurobank", kind: "bank" as const, main: true }];
    const checkIns = [
      { id: "a", at: new Date(2026, 8, 10, 20).toISOString(), amounts: { eb: 2000 } },
      { id: "b", at: new Date(2026, 8, 20, 20).toISOString(), amounts: { eb: 1800 } },
    ];
    data.readings = readCheckIns(checkIns, accounts, data.transactions) as CheckInReading[];
    data.accounts = accounts;
    expect((data.readings as CheckInReading[])[1].unlogged).toBeCloseTo(1800 - (2000 + 150 - 309.45), 2);

    renderPage();
    // Under the figure, on Summary: how old the reading is and what it found.
    // 20 Sep 20:00 to 26 Sep 12:00 is five whole days and sixteen hours.
    expect(screen.getByText("Banks: 5 days ago")).toBeInTheDocument();
    const found = screen.getByRole("link", { name: /found €40.55 not written down/ });
    expect(found).toHaveAttribute("href", "/accounts");

    await userEvent.click(screen.getByRole("tab", { name: /^Month$/ }));
    const line = within(screen.getByRole("tabpanel")).getByRole("link", { name: /not written down/ });
    expect(line).toHaveTextContent("€40.55");
    expect(line).toHaveAttribute("href", "/accounts");
  });

  it("shows pay the last bank reading may already hold, and points to «Έσοδα» to answer", async () => {
    // Pay is due on the 28th (the salary on «Έσοδα» above) and is not written down.
    // The banks were read on the 20th — on or after the 18th, the earliest it
    // could have come — so it may already be in the money the plan starts from.
    const accounts = [{ id: "eb", name: "Eurobank", kind: "bank" as const, main: true }];
    data.readings = readCheckIns([{ id: "a", at: new Date(2026, 8, 20, 20).toISOString(), amounts: { eb: 1800 } }], accounts, data.transactions) as CheckInReading[];
    data.accounts = accounts;

    renderPage();
    await userEvent.click(screen.getByRole("tab", { name: /To do/ }));
    const panel = screen.getByRole("tabpanel");
    // In «Έσοδα»'s own words, and answered there.
    const row = within(panel).getByRole("link", { name: /Salary: was it already in the bank?/ });
    expect(row).toHaveAttribute("href", "/incomes");
    expect(row).toHaveTextContent("Needs an answer");
    expect(row).toHaveTextContent("€1700.00");
    // Nothing is written from the Overview.
    expect(saved.size).toBe(0);
  });

  it("lists a late income as a row to «Έσοδα», and counts it in the answer as the Planner does", async () => {
    // The allowance of the 20th has not come: six days late. The plan holds it
    // on today, so the eve of pay day has it: 2.340,55 + 70 − the water 68,40.
    stored.incomes = [monthlySalary(1700, 28), monthlyIncome("allow", "Allowance", 70, 20)];
    renderPage();
    // The answer on Summary, the row on To do.
    expect(screen.getByText("€2342.15")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("tab", { name: /To do/ }));
    const panel = screen.getByRole("tabpanel");
    const row = within(panel).getByRole("link", { name: /Allowance/ });
    expect(row).toHaveAttribute("href", "/incomes");
    expect(row).toHaveTextContent("6 days late");
    expect(row).toHaveTextContent("€70.00");
    expect(2340.55 + 70 - 68.4).toBeCloseTo(2342.15, 2);
    // Still nothing to press.
    expect(within(panel).queryAllByRole("button")).toHaveLength(0);
  });

  it("does not ask when the banks were read before the pay could have come", () => {
    const accounts = [{ id: "eb", name: "Eurobank", kind: "bank" as const, main: true }];
    data.readings = readCheckIns([{ id: "a", at: new Date(2026, 8, 17, 20).toISOString(), amounts: { eb: 1800 } }], accounts, data.transactions) as CheckInReading[];
    data.accounts = accounts;
    renderPage();
    expect(screen.queryByText(/was it already in the bank/)).toBeNull();
  });
});
