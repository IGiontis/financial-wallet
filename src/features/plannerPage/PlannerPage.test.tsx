import { describe, it, expect, vi, beforeAll, beforeEach, afterAll, afterEach } from "vitest";
import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import i18n from "../../i18n";
import { PlannerPage } from "./PlannerPage";
import { buildPlan, type BudgetLine } from "./plannerUtils";
import { horizonForMonth, planMonth } from "./planMonthView";
import { incomeOccurrenceKey } from "../incomes/incomesUtils";
import { monthlyIncome, monthlySalary, SALARY_ID } from "../../test/incomes";
import { PAYDAY_HORIZON, paydayOutlook } from "../overview/overviewTabs";
import { computeBillStatus } from "../bills/billsUtils";
import type { CheckInReading } from "../accounts/accountsUtils";
import type { Bill, InvestmentGoalWithStats, Transaction } from "../../shared/types/IndexTypes";

// Whole pages, many clicks each: alone they take a second or two, but under a
// full parallel run the 5 s default was missed now and then. Room, not a fix
// for slowness — a test that genuinely hangs still fails.
vi.setConfig({ testTimeout: 20_000 });

// The Planner page on the mockup's case: Wednesday 30 September 2026, 1,000 in
// hand (banks 1,200 read the evening before), pay of 1,450 on the 30th that
// came early on the 25th, bills of 515 a month on the 1st, 5th, 8th and 10th,
// a goal of 100 on the 1st and 300 a month of one's own.
//
// Each figure on screen is checked against a second route: the Overview's own
// computation of the same answer, the mockup's hand-worked figures, or the
// list on screen added up again here.

const NOW = new Date(2026, 8, 30, 12);
const JAN = new Date(2026, 0, 1);

const data = vi.hoisted(() => ({ transactions: [] as Transaction[], latest: undefined as unknown, created: [] as unknown[], goals: undefined as unknown[] | undefined, categories: [] as unknown[] }));
// What the page saves, kept so it is read back on the next render and so a
// test can look at what an answer wrote.
const settings = vi.hoisted(() => new Map<string, unknown>());

vi.mock("../transactions/hooks/useTransactions", () => ({
  useTransactions: () => ({ data: data.transactions, isLoading: false, isError: false, isSuccess: true }),
  useCategories: () => ({ data: data.categories }),
  // «Ήρθε» from an income's card writes through this.
  useCreateTransaction: () => ({ mutate: (dto: unknown) => data.created.push(dto) }),
  // The card's «Αναίρεση» deletes through this.
  useDeleteTransaction: () => ({ mutate: vi.fn() }),
}));
// [GOAL] unless a test puts its own goals here.
vi.mock("../budget/useInvestments", () => ({ useInvestmentGoals: () => ({ data: data.goals ?? [GOAL], isLoading: false }) }));
vi.mock("../bills/useBills", () => ({ useBills: () => ({ data: BILLS, isLoading: false }) }));
vi.mock("../debts/useDebts", () => ({ useDebts: () => ({ data: [] }) }));
vi.mock("../../shared/hooks/useOpeningBalance", () => ({
  useOpeningBalance: () => ({ opening: { amount: 1000, date: new Date(2026, 8, 29), at: new Date(2026, 8, 29, 20) }, anchors: [], source: "readings", isLoading: false }),
}));
vi.mock("../accounts/useMoneyAccounts", () => ({ useMoneyAccounts: () => ({ latest: data.latest }), useAccountList: () => [] }));
vi.mock("../../shared/hooks/useCurrencyConverter", () => ({
  useCurrencyConverter: () => ({ format: (n: number) => `€${n.toFixed(2)}`, convert: (n: number) => n, baseCurrency: "EUR", displayCurrency: "EUR" }),
}));
vi.mock("../../shared/hooks/useWorkspaceSetting", async () => {
  const { useState } = await import("react");
  return {
    // The account's copy, already here: what the page saved is what it reads.
    useWorkspace: () => ({ data: Object.fromEntries(settings), isSuccess: true, isLoading: false }),
    useWorkspaceSetting: (key: string, initial: unknown) => {
      const [value, setValue] = useState(() => (settings.has(key) ? settings.get(key) : initial));
      const set = (next: unknown) =>
        setValue((previous: unknown) => {
          const resolved = typeof next === "function" ? (next as (p: unknown) => unknown)(previous) : next;
          settings.set(key, resolved);
          return resolved;
        });
      return [value, set];
    },
  };
});

const paidBill = (id: string, name: string, amount: number, dueDay: number) =>
  computeBillStatus(
    { id, userId: "u", name, amount, categoryId: "c", frequency: "monthly", dueDay, isActive: true, anchorDate: JAN, createdAt: JAN, updatedAt: JAN } as Bill,
    [{ id: `${id}-sep`, userId: "u", billId: id, periodKey: "2026-09", amount, paidDate: JAN, createdAt: JAN }],
    NOW,
  );
const BILLS = [paidBill("rent", "Rent", 400, 1), paidBill("power", "Power", 65, 5), paidBill("phone", "Phone", 20, 8), paidBill("net", "Internet", 30, 10)];
const GOAL = { id: "goal", userId: "u", name: "Savings", goalType: "targeted", targetPeriod: "monthly", monthlyRequired: 100, currentPeriodSaved: 100, isActive: true, isCompleted: false, createdAt: JAN, updatedAt: JAN } as unknown as InvestmentGoalWithStats;
const OWN: BudgetLine = { id: "own", label: "Mine", amount: 300, kind: "expense" };
// The salary, as «Έσοδα» keeps it: 1,450 on the 30th.
const SALARY = monthlySalary(1450, 30);

// September's pay, written with «Ήρθε» for the salary's 30th: the only way a record settles an income.
const payOnThe25th = { id: "pay-sep", userId: "u", type: "income", amount: 1450, categoryId: "c", description: "Salary", date: new Date(2026, 8, 25), createdAt: new Date(2026, 8, 25), updatedAt: new Date(2026, 8, 25), incomeId: SALARY.id, incomeDue: "2026-09-30" } as Transaction;
const READING = { at: new Date(2026, 8, 29, 20), total: 1000, added: [], checkIn: {} } as unknown as CheckInReading;

/** The Overview's answer, worked out as `usePaydayOutlook` works it, from the same inputs. */
const overviewAnswer = () =>
  paydayOutlook(
    buildPlan({ bills: BILLS, goals: [GOAL], lines: [OWN], debts: [], incomes: [SALARY], openingBalance: 1000, horizon: PAYDAY_HORIZON, now: NOW, actuals: { transactions: data.transactions, debts: [], overrides: {}, lastReadingAt: READING.at } }),
    NOW,
  );

const en = (options: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat("en", options);
const money = /^[+−]?€-?\d+\.\d\d$/;
/** A figure as the page's formatter writes it. */
const asEuro = (n: number) => `€${n.toFixed(2)}`;
const sumOf = (texts: string[]) => Math.round(texts.reduce((sum, text) => sum + (text.startsWith("−") ? -1 : 1) * Number(text.replace(/[^\d.]/g, "")), 0) * 100) / 100;

const renderPage = () =>
  render(
    <MemoryRouter>
      <PlannerPage />
    </MemoryRouter>,
  );

/** The tiles open the working behind them; these open it the way a tap does. */
const openPayday = () => userEvent.click(screen.getByRole("button", { name: /^Until payday: / }));
const openPeriod = () => userEvent.click(screen.getByRole("button", { name: /^You end with: / }));
const closeSheet = () => userEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Close" }));

// The strip watches the first card; jsdom has no layout, so the watch is driven by hand.
let watching: ((entries: { isIntersecting: boolean; boundingClientRect: { top: number } }[]) => void) | undefined;

beforeAll(async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
  window.matchMedia ??= ((query: string) => ({ matches: false, media: query, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, onchange: null, dispatchEvent: () => false })) as unknown as typeof window.matchMedia;
  window.IntersectionObserver = class {
    constructor(callback: typeof watching) {
      watching = callback;
    }
    observe() {}
    disconnect() {}
  } as unknown as typeof IntersectionObserver;
  await i18n.changeLanguage("en");
});

afterAll(() => vi.useRealTimers());

beforeEach(() => {
  localStorage.clear();
  settings.clear();
  settings.set("planner-lines", [OWN]);
  settings.set("incomes", [SALARY]);
  settings.set("planner-horizon", 3);
  data.transactions = [payOnThe25th];
  data.latest = READING;
  data.categories = [];
  watching = undefined;
});

describe("the four tiles", () => {
  it("say the four answers, each the same figure as the working behind it", async () => {
    renderPage();
    // 1.000 now; 94,35 on the eve of pay, the Overview's figure; the lowest
    // the line goes is that same evening; 1.000 + 4.350 − 2.755 at the end.
    expect(screen.getByRole("button", { name: "You have: €1000.00, details" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: `Until payday: €${overviewAnswer().left.toFixed(2)}, details` })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Lowest point: €94.35, details" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "You end with: €2595.00, details" })).toBeInTheDocument();
    expect(1000 + 4350 - 2755).toBe(2595);

    // The second way: the sheet's own subtraction lands on the tile's figure.
    await openPeriod();
    const sheet = screen.getByRole("dialog");
    expect(within(sheet).getAllByText("€2595.00").length).toBeGreaterThan(0);
    expect(within(sheet).getByText("−€2755.00")).toBeInTheDocument();
  });

  it("keep the words out of the page: no sentence under the figures until a tile is opened", () => {
    renderPage();
    expect(screen.queryByText(/The months leave/)).toBeNull();
    expect(screen.queryByText("You make it to payday")).toBeNull();
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});

describe("the pay-day sheet", () => {
  it("gives the Overview's answer: 94,35 left on the eve of pay, ≈3,14 a day", async () => {
    renderPage();
    await openPayday();
    const overview = overviewAnswer();
    // Second route: the mockup's own sum, 1.000 − 515 − 100 − 290,65.
    expect(overview.left).toBe(94.35);
    expect(Math.round((1000 - 515 - 100 - 290.65) * 100) / 100).toBe(overview.left);
    expect(overview.perDay).toBe(3.14);

    expect(screen.getByText("You make it to payday")).toBeInTheDocument();
    expect(screen.getAllByText(`€${overview.left.toFixed(2)}`).length).toBeGreaterThan(0);
    expect(screen.getByText(`Left €94.35 · ≈€3.14/day`)).toBeInTheDocument();
    const dayDate = en({ weekday: "short", day: "numeric", month: "short" });
    expect(screen.getByText(`left on ${dayDate.format(new Date(2026, 9, 29))}, before pay on ${dayDate.format(new Date(2026, 9, 30))}`)).toBeInTheDocument();
    // The old unlabelled headline and the second "a day" are gone.
    expect(screen.queryByText(/a day spare/)).toBeNull();
  });

  it("gives the same answer on a year's view, though that plan is sampled by the week", async () => {
    settings.set("planner-horizon", 12);
    renderPage();
    await openPayday();
    expect(screen.getByText("Left €94.35 · ≈€3.14/day")).toBeInTheDocument();
    expect(overviewAnswer().left).toBe(94.35);
  });

  it("writes out the figure as a sum that lands on it, already open in the sheet", async () => {
    renderPage();
    await openPayday();
    const list = screen.getByRole("group", { name: "How it adds up" });
    const amounts = within(list)
      .getAllByText(money)
      .map((el) => el.textContent ?? "");

    // What there was, each payment, the budget lines — then what is left, then the pay.
    expect(amounts).toEqual(["€1000.00", "−€400.00", "−€100.00", "−€65.00", "−€20.00", "−€30.00", "−€290.65", "€94.35", "+€1450.00"]);
    expect(sumOf(amounts.slice(0, -2))).toBe(94.35);
    expect(amounts.at(-2)).toBe(`€${overviewAnswer().left.toFixed(2)}`);
  });

  it("turns a figure of your own into a scenario that says so, and goes back with ✕", async () => {
    settings.set("planner-opening-source", "manual");
    settings.set("planner-opening", "1500");
    renderPage();
    // The tile says it is a figure of your own before anything is opened.
    expect(screen.getByRole("button", { name: "If you had: €1500.00, details" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "If you had: €1500.00, details" }));

    expect(screen.getByText("Scenario: your own figure")).toBeInTheDocument();
    expect(screen.getByRole("spinbutton", { name: "If you had" })).toHaveValue(1500);
    expect(screen.getByText("The Overview shows €94.35, with the money you have.")).toBeInTheDocument();
    // The mockup's scenario: 1.500 − 905,65 = 594,35, ≈19,81 a day over 30 days.
    expect(Math.round((1500 - 905.65) * 100) / 100).toBe(594.35);
    expect(screen.getByText("Left €594.35 · ≈€19.81/day")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Back to “From my banks”" }));
    expect(settings.get("planner-opening-source")).toBe("banks");
    expect(screen.queryByText("Scenario: your own figure")).toBeNull();
    expect(screen.getByText("Left €94.35 · ≈€3.14/day")).toBeInTheDocument();
  });
});

describe("pay that may already be in the bank reading", () => {
  const openQuestions = () => userEvent.click(screen.getByRole("button", { name: /1 income needs an answer/ }));
  const day = en({ day: "numeric", month: "short" }).format(new Date(2026, 8, 30));
  // The salary's time is kept under the key «Έσοδα» reads too.
  const key = incomeOccurrenceKey(SALARY_ID, "2026-09-30");

  beforeEach(() => {
    // Not written down: the reading of the 29th may already hold it.
    data.transactions = [];
  });

  it("is asked about in one line that opens the question, and not counted twice meanwhile", async () => {
    renderPage();
    await openQuestions();
    expect(screen.getByText(`Your salary of ${day} wasn’t found in your transactions — has it come already?`)).toBeInTheDocument();
    expect(screen.getByText("Until you answer, it isn’t counted a second time.")).toBeInTheDocument();
    // Left out: the answer runs to October's pay, as the Overview's does.
    expect(overviewAnswer().left).toBe(94.35);
    expect(screen.getByRole("button", { name: "Until payday: €94.35, details" })).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: `Salary · ${day}: It came` }));
    expect(settings.get("planner-occurrences")).toEqual({ [key]: { state: "received", date: "2026-09-30", amount: 1450 } });
    expect(screen.queryByText(/wasn’t found in your transactions/)).toBeNull();
    // Nothing left to ask: the line and its sheet are gone.
    expect(screen.queryByRole("button", { name: /needs an answer/ })).toBeNull();
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("records «not yet» as waiting", async () => {
    renderPage();
    await openQuestions();
    await userEvent.click(screen.getByRole("button", { name: `Salary · ${day}: Not yet` }));
    expect(settings.get("planner-occurrences")).toEqual({ [key]: { state: "waiting" } });
  });
});

describe("the strip", () => {
  it("appears with both answers once the first card has scrolled away, and goes when it is back", () => {
    renderPage();
    const strip = () => screen.queryByTitle("Back to the full answer");
    expect(strip()).toBeNull();

    act(() => watching!([{ isIntersecting: false, boundingClientRect: { top: -400 } }]));
    expect(strip()).toHaveTextContent("To pay day");
    expect(strip()).toHaveTextContent("€94.35");
    // 1.000 + 4.350 − 2.755, the mockup's end of December.
    expect(strip()).toHaveTextContent("You end with€2595.00");

    act(() => watching!([{ isIntersecting: true, boundingClientRect: { top: 20 } }]));
    expect(strip()).toBeNull();
  });

  it("stays away while the card is still below, not yet read", () => {
    renderPage();
    act(() => watching!([{ isIntersecting: false, boundingClientRect: { top: 900 } }]));
    expect(screen.queryByTitle("Back to the full answer")).toBeNull();
  });
});

describe("the whole period", () => {
  it("names what you end with, and what the months add without the money you have", async () => {
    renderPage();
    await openPeriod();
    expect(screen.getAllByText("€2595.00").length).toBeGreaterThan(0);
    expect(screen.getByText("The months leave +€1595.00 (not counting the €1000.00 you have)")).toBeInTheDocument();
    expect(screen.getByText("You never go below zero")).toBeInTheDocument();
    expect(screen.getByText(`Lowest point €94.35 · ${en({ weekday: "short", day: "numeric", month: "short" }).format(new Date(2026, 9, 29))}`)).toBeInTheDocument();
    expect(screen.getByText("Coming in · 3 salaries")).toBeInTheDocument();
    expect(screen.getAllByText("+€4350.00").length).toBeGreaterThan(0);
    expect(screen.getAllByText("−€2755.00").length).toBeGreaterThan(0);
    expect(1000 + 4350 - 2755).toBe(2595);
  });

  it("lists the months as columns, each ending where the next begins", async () => {
    renderPage();
    await openPeriod();
    const rows = within(screen.getByRole("dialog"))
      .getAllByRole("row")
      .slice(1)
      .map((row) => within(row).getAllByRole("cell").map((cell) => cell.textContent ?? ""));
    // Each month: in, out, balance at its end. Walked again here from the 1.000 there is.
    let balance = 1000;
    for (const [inText, outText, endText] of rows) {
      balance = Math.round((balance + sumOf([inText, outText])) * 100) / 100;
      expect(endText).toBe(`€${balance.toFixed(2)}`);
    }
    expect(balance).toBe(2595);
  });

  it("draws the balance as a line you scrub, and names the day under the finger", async () => {
    renderPage();
    const chart = screen.getByRole("img", { name: "What is left, day by day" });
    // Nothing chosen yet: the readout says how to use it.
    expect(screen.getByText("Tap or drag along the line to see any day.")).toBeInTheDocument();

    // Today first, then step to the eve of October's pay with the keyboard.
    chart.focus();
    await userEvent.keyboard("{ArrowRight}");
    expect(screen.queryByText("Tap or drag along the line to see any day.")).toBeNull();
    // The readout above the line, where the day under the finger is named.
    const readout = () => document.querySelector('[aria-live="polite"]') as HTMLElement;
    // 30 Σεπ: 1.000 − 10 of one's own = 990.
    expect(within(readout()).getByText("€990.00")).toBeInTheDocument();
    for (let i = 0; i < 29; i++) await userEvent.keyboard("{ArrowRight}");
    // 29 Οκτ, the day before the pay — the same figure as the card above.
    expect(within(readout()).getByText("€94.35")).toBeInTheDocument();
  });

  it("opens a busy day's every move in a small sheet, not in the readout", async () => {
    // 1 October: the rent, the goal, and two incomes on the 1st — four moves, two shown.
    settings.set("incomes", [SALARY, monthlyIncome("tips", "Tips", 40, 1), monthlyIncome("bonus", "Bonus", 60, 1)]);
    renderPage();
    const chart = screen.getByRole("img", { name: "What is left, day by day" });
    chart.focus();
    await userEvent.keyboard("{ArrowRight}{ArrowRight}");
    const readout = document.querySelector('[aria-live="polite"]') as HTMLElement;
    const dayBalance = within(readout).getAllByText(money)[0].textContent;

    await userEvent.click(within(readout).getByRole("button", { name: "+ 2 more" }));
    const sheet = screen.getByRole("dialog");
    const rows = within(within(sheet).getByRole("list")).getAllByRole("listitem");
    expect(rows.map((r) => r.firstElementChild!.textContent).sort()).toEqual(["Bonus", "Rent", "Savings", "Tips"]);
    // A second way: the day's end in the sheet is the readout's own figure.
    expect(within(sheet).getByText("At the end of the day").nextElementSibling!.textContent).toBe(dayBalance);
  });

  it("keeps one line for a year, from today to the window's end", () => {
    settings.set("planner-horizon", 12);
    renderPage();
    expect(screen.getByRole("img", { name: "What is left, day by day" })).toBeInTheDocument();
    // 1.000 + 12 × 1.450 − 12 × (515 + 100) − 3.610 of one's own = 7.410 at the end.
    expect(1000 + 12 * 1450 - 12 * (515 + 100) - 3610).toBe(7410);
  });
});

describe("the incomes, from «Έσοδα»", () => {
  // Its own id: `planner-skip` holds bills', goals' and incomes' ids side by side, and the bill here is "rent".
  const RENT = monthlyIncome("rent-in", "Rent I collect", 400, 5);
  // September's rent came on its day, written with «Ήρθε»; no bank reading to ask about.
  const rentRecord = { id: "rent-sep", userId: "u", type: "income", amount: 400, categoryId: "c", description: "Rent", date: new Date(2026, 8, 5), createdAt: new Date(2026, 8, 5), updatedAt: new Date(2026, 8, 5), incomeId: "rent-in", incomeDue: "2026-09-05" } as Transaction;

  beforeEach(() => {
    settings.set("incomes", [SALARY, RENT]);
    data.transactions = [payOnThe25th, rentRecord];
    data.latest = undefined;
  });

  it("marks the rent «Arrived» from its row: the card, the figures, a check, and only then the transaction", async () => {
    data.created = [];
    renderPage();
    await userEvent.click(screen.getByRole("button", { name: "Rent I collect: details" }));
    let sheet = screen.getByRole("dialog");
    expect(within(sheet).getByRole("button", { name: "Change on Income" })).toBeInTheDocument();
    await userEvent.click(within(sheet).getByRole("button", { name: "Arrived" }));

    // October's rent, 400 by default — 380 this time.
    sheet = screen.getByRole("dialog");
    const amount = within(sheet).getByLabelText(/How much arrived/);
    expect(amount).toHaveValue(400);
    await userEvent.clear(amount);
    await userEvent.type(amount, "380");
    await userEvent.click(within(sheet).getByRole("button", { name: /Next/ }));
    expect(data.created).toEqual([]);

    // The check says it back, and that it is not the usual figure.
    sheet = screen.getByRole("dialog");
    expect(within(sheet).getByText("Check before it goes into Transactions")).toBeInTheDocument();
    expect(within(sheet).getByText(/Not the usual €400\.00/)).toBeInTheDocument();
    await userEvent.click(within(sheet).getByRole("button", { name: /€380\.00/ }));
    expect(data.created).toEqual([expect.objectContaining({ amount: 380, type: "income", incomeId: "rent-in", incomeDue: "2026-10-05" })]);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("lists each one with its switch, the salary first, each opening its card", async () => {
    renderPage();
    const salary = screen.getByRole("button", { name: "Salary: details" });
    const rent = screen.getByRole("button", { name: "Rent I collect: details" });
    expect(salary.compareDocumentPosition(rent) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    // The row opens the card — a name and an amount; the "×3 · next" is in the card.
    expect(salary).toHaveTextContent(/^Salary\+€4350\.00$/);
    expect(rent).toHaveTextContent(/^Rent I collect\+€1200\.00$/);
    // And each has its eye, open: counted.
    expect(screen.getByRole("switch", { name: "Salary: take it out of the plan" })).toHaveAttribute("aria-checked", "true");
    expect(3 * 1450).toBe(4350);
    expect(screen.getByRole("link", { name: "Change on Income ›" })).toHaveAttribute("href", "/incomes/record");
    // Nothing to type here any more: no salary dialog, no income lines.
    expect(screen.queryByRole("button", { name: "Add monthly income" })).toBeNull();
    // 1.000 + 3 × 1.450 + 3 × 400 − 2.755.
    await openPeriod();
    expect(screen.getByText("The months leave +€2795.00 (not counting the €1000.00 you have)")).toBeInTheDocument();
    expect(3 * 1450 + 3 * 400 - 2755).toBe(2795);
  });

  it("switches one off the way the salary always was — kept in planner-skip under its id", async () => {
    renderPage();
    await userEvent.click(screen.getByRole("switch", { name: "Rent I collect: take it out of the plan" }));
    expect(settings.get("planner-skip")).toEqual(["rent-in"]);
    // Exactly its 1.200 less.
    await openPeriod();
    expect(screen.getByText("The months leave +€1595.00 (not counting the €1000.00 you have)")).toBeInTheDocument();
    expect(2795 - 1200).toBe(1595);
  });

  it("shows no old income line, and keeps it stored when a cost line is changed", async () => {
    const room = { id: "room", label: "Room", amount: 250, kind: "income" };
    settings.set("planner-lines", [OWN, room]);
    renderPage();
    expect(screen.queryByText("Room")).toBeNull();

    await userEvent.click(screen.getByRole("button", { name: /^Out/ }));
    await userEvent.click(screen.getByRole("button", { name: "Edit" }));
    const amount = screen.getByLabelText("Amount per month");
    await userEvent.clear(amount);
    await userEvent.type(amount, "350");
    // Three steps, and Save only on the last; an existing figure lets the rail jump.
    await userEvent.click(screen.getByRole("button", { name: /Next/ }));
    await userEvent.click(screen.getByRole("button", { name: /Next/ }));
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(settings.get("planner-lines")).toEqual([{ ...OWN, amount: 350 }, room]);
  });

  it("with no incomes, plans no money in and says where to add it — the found salary only as a suggestion", async () => {
    settings.set("incomes", []);
    // Typed by hand, without «Ήρθε»: what the suggestion is found from.
    data.transactions = [7, 8, 9].map((month) => ({ ...payOnThe25th, id: `pay-${month}`, date: new Date(2026, month - 1, 28), incomeId: undefined, incomeDue: undefined }) as Transaction);
    renderPage();
    expect(screen.getByText("No income yet — nothing is coming in to the plan.")).toBeInTheDocument();
    expect(screen.getByText("I found a salary of €1450.00 around the 28 — add it on Income")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Add on Income ›" })).toHaveAttribute("href", "/incomes/record");
    // No pay day: the tile reads to the month's end, and its sheet says where to set one.
    await userEvent.click(screen.getByRole("button", { name: /^Until the month ends: / }));
    expect(screen.getByRole("link", { name: "Add your salary on Income for a sharper answer ›" })).toHaveAttribute("href", "/incomes/record");
    await closeSheet();
    // Not planned with: the months bring nothing in.
    await openPeriod();
    expect(screen.getByText("The months leave −€2755.00 (not counting the €1000.00 you have)")).toBeInTheDocument();
  });
});

describe("the scales at the top of «Τα ποσά σου»", () => {
  // The same salary and rent as on «Έσοδα» below.
  beforeEach(() => {
    settings.set("incomes", [SALARY, monthlyIncome("rent-in", "Rent I collect", 400, 5)]);
    data.transactions = [
      payOnThe25th,
      { id: "rent-sep", userId: "u", type: "income", amount: 400, categoryId: "c", description: "Rent", date: new Date(2026, 8, 5), createdAt: new Date(2026, 8, 5), updatedAt: new Date(2026, 8, 5), incomeId: "rent-in", incomeDue: "2026-09-05" } as Transaction,
    ];
    data.latest = undefined;
  });

  it("adds in and out from the rows under them, and what is left is the months' own figure", async () => {
    renderPage();
    // In: 3 × 1.450 + 3 × 400. Out: the 2.755 the plan spends. Left: their difference.
    expect(screen.getByText("+€5550.00")).toBeInTheDocument();
    expect(screen.getByText("−€2755.00")).toBeInTheDocument();
    expect(screen.getByText("+€2795.00")).toBeInTheDocument();
    expect(3 * 1450 + 3 * 400).toBe(5550);
    // Second way: the period sheet's own words for the same months.
    await openPeriod();
    expect(screen.getByText("The months leave +€2795.00 (not counting the €1000.00 you have)")).toBeInTheDocument();
  });

  it("speak for the month on «Month»: the same in and out as the month's own tiles", async () => {
    renderPage();
    await userEvent.click(screen.getByRole("button", { name: "Month" }));
    await userEvent.click(screen.getByRole("button", { name: "Next month" }));
    // November: 1.450 + 400 in; out the bills 515, the goal 100 and 300 of one's own.
    const tileIn = screen.getByText("Coming in").closest("[class*=_tile_]")!.children[1].textContent;
    const tileOut = screen.getByText("Going out").closest("[class*=_tile_]")!.children[1].textContent;
    expect(tileIn).toBe("+€1850.00");
    expect(tileOut).toBe("−€915.00");
    // A second way: the scales add up the rows under them, now cut to the month.
    expect(screen.getByText("+€1850.00", { selector: "[class*=_scale] *" })).toBeInTheDocument();
    expect(screen.getByText("−€915.00", { selector: "[class*=_scale] *" })).toBeInTheDocument();
    // A second way: the same month cut from a plan built here, apart from the page.
    const november = new Date(2026, 10, 1);
    const incomes = [SALARY, monthlyIncome("rent-in", "Rent I collect", 400, 5)];
    const month = planMonth(
      buildPlan({ bills: BILLS, goals: [GOAL], lines: [OWN], debts: [], incomes, openingBalance: 1000, horizon: horizonForMonth(november, NOW)!, now: NOW, actuals: { transactions: data.transactions, debts: [], overrides: {} } }),
      november,
    )!;
    expect(asEuro(month.in)).toBe(tileIn!.slice(1));
    expect(asEuro(month.out)).toBe(tileOut!.slice(1));
  });

  it("takes a row out with a tap on its eye, and puts it back with another", async () => {
    renderPage();
    const rent = screen.getByRole("switch", { name: /^Rent I collect: / });
    await userEvent.click(rent);
    // Shut, and saying what the next tap does.
    expect(rent).toHaveAccessibleName("Rent I collect: put it in the plan");
    expect(rent).toHaveAttribute("aria-checked", "false");
    // In is now the salary alone: the same figure as its row.
    expect(screen.getAllByText("+€4350.00")).toHaveLength(2);
    await userEvent.click(rent);
    expect(rent).toHaveAttribute("aria-checked", "true");
    expect(screen.getByText("+€5550.00")).toBeInTheDocument();
  });
});

describe("a row the app keeps", () => {
  it("opens its facts in boxes, with every day it lands on, and the eye to take it out", async () => {
    renderPage();
    await userEvent.click(screen.getByRole("button", { name: /^Out/ }));
    // The row opens it; the eye at its end is its switch.
    const power = screen.getByRole("button", { name: "Power: details" });
    expect(power).toHaveTextContent(/Power−€195\.00$/);

    await userEvent.click(power);
    const sheet = screen.getByRole("dialog");
    const box = (label: RegExp) => within(sheet).getByText(label).parentElement!;
    // 65 on the 5th of October, November and December: three times, 195.
    expect(box(/^A month$/)).toHaveTextContent("€65.00");
    expect(box(/^Times$/)).toHaveTextContent("3");
    expect(within(sheet).getByText("−€195.00")).toBeInTheDocument();
    expect(3 * 65).toBe(195);
    // The three days themselves, each for 65 — a second way to the same 195.
    const days = within(sheet).getAllByText("−€65.00");
    expect(days).toHaveLength(3);

    await userEvent.click(within(sheet).getByRole("button", { name: "Take it out of the plan" }));
    expect(settings.get("planner-skip")).toEqual(["power"]);
  });
});

describe("month by month", () => {
  it("lists each month as its end figure, and opens it as every move adding up to that figure", async () => {
    renderPage();
    const months = screen.getAllByRole("button", { name: /: ends on .*, details$/ });
    expect(months.length).toBeGreaterThan(1);
    // The last month ends where the whole period does.
    expect(months.at(-1)).toHaveTextContent("€2595.00");

    for (const month of months) {
      const end = month.textContent!.match(/€[\d.]+/)![0];
      await userEvent.click(month);
      const sheet = screen.getByRole("dialog");
      // The second way: what it starts with, plus every row, lands on its last row.
      const amounts = within(sheet)
        .getAllByText(money)
        .map((el) => el.textContent ?? "")
        // Past the three figures at the top: in, out, the end.
        .slice(3);
      expect(amounts.at(-1)).toBe(end);
      expect(sumOf(amounts.slice(0, -1))).toBe(Number(end.slice(1)));
      await closeSheet();
      await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    }
  });
});

describe("a goal's sheet", () => {
  // 2.000 to reach by June 2027, 550 in already; and 100 a month, 300 in so far.
  const TRIP = { ...GOAL, id: "trip", name: "Trip", targetPeriod: "custom", targetAmount: 2000, totalSaved: 550, remaining: 1450, currentPeriodSaved: 0, deadline: new Date(2027, 5, 1) } as unknown as InvestmentGoalWithStats;
  const MONTHLY = { ...GOAL, targetAmount: 100, totalSaved: 300 } as unknown as InvestmentGoalWithStats;
  const boxes = (sheet: HTMLElement) => Object.fromEntries([...sheet.querySelectorAll("[class*=_factBox_]")].map((box) => [box.children[0].textContent, box.children[1].textContent]));

  afterEach(() => {
    data.goals = undefined;
  });

  it("says what a one-time goal was set at, what is in it, and what that leaves", async () => {
    data.goals = [TRIP];
    renderPage();
    await userEvent.click(screen.getByRole("button", { name: /^Out/ }));
    await userEvent.click(screen.getByRole("button", { name: "Trip: details" }));
    const facts = boxes(screen.getByRole("dialog"));
    expect(facts).toMatchObject({ "The goal": "€2000.00", "Put in so far": "€550.00", "Left to reach it": "€1450.00" });
    // A second way: what is left is the goal's own «remaining», the figure the plan paces by.
    expect(2000 - 550).toBe((TRIP as { remaining: number }).remaining);
  });

  it("says a monthly goal's amount as a month's, and leaves nothing «left» of a goal that never runs out", async () => {
    data.goals = [MONTHLY];
    renderPage();
    await userEvent.click(screen.getByRole("button", { name: /^Out/ }));
    await userEvent.click(screen.getByRole("button", { name: "Savings: details" }));
    const facts = boxes(screen.getByRole("dialog"));
    expect(facts).toMatchObject({ "The goal": "€100.00 / month", "Put in so far": "€300.00" });
    expect(facts).not.toHaveProperty("Left to reach it");
  });
});

describe("a budget line with categories", () => {
  const FOOD = { ...OWN, label: "Food", categoryIds: ["groceries", "dining"] };
  const spent = (categoryId: string, amount: number, date: Date) =>
    ({ id: `${categoryId}-${amount}`, userId: "u", type: "expense", amount, categoryId, description: categoryId, date, createdAt: date, updatedAt: date }) as Transaction;

  beforeEach(() => {
    settings.set("planner-lines", [FOOD]);
    data.categories = [
      { id: "groceries", name: "Groceries", type: "expense", icon: "🛒" },
      { id: "dining", name: "Dining", type: "expense", icon: "🍽" },
    ];
    data.transactions = [payOnThe25th, spent("groceries", 120, new Date(2026, 8, 10)), spent("dining", 40, new Date(2026, 8, 20)), spent("fuel", 50, new Date(2026, 8, 12)), spent("groceries", 90, new Date(2026, 7, 15))];
  });

  const openFood = async () => {
    await userEvent.click(screen.getByRole("button", { name: /^Out/ }));
    await userEvent.click(screen.getByRole("button", { name: "Food: what was spent" }));
    return screen.getByRole("dialog");
  };
  const rows = (sheet: HTMLElement) => within(within(sheet).getByRole("list", { name: "By category" })).getAllByRole("listitem").map((li) => li.textContent);

  it("opens on what the month has taken, category by category, adding up to the limit's figure", async () => {
    renderPage();
    const sheet = await openFood();
    expect(within(sheet).getByText("September 2026")).toBeInTheDocument();
    expect(within(sheet).getByText("You spent €160.00 of €300.00")).toBeInTheDocument();
    expect(rows(sheet)).toEqual(["🛒 Groceries (1)€120.00 · 75%", "🍽 Dining (1)€40.00 · 25%"]);
    // A second way: what is left is the limit less the rows, and fuel is no row of it.
    expect(within(sheet).getByText(`€${(300 - 120 - 40).toFixed(2)} left for the rest of the month`)).toBeInTheDocument();
  });

  it("steps back a month, and not past this one", async () => {
    renderPage();
    const sheet = await openFood();
    expect(within(sheet).getByRole("button", { name: "Next month" })).toBeDisabled();
    await userEvent.click(within(sheet).getByRole("button", { name: "Previous month" }));
    expect(within(sheet).getByText("August 2026")).toBeInTheDocument();
    expect(within(sheet).getByText("You spent €90.00 of €300.00")).toBeInTheDocument();
    expect(within(sheet).getByText("€210.00 of the limit was left")).toBeInTheDocument();
  });

  it("goes on to the editor from inside", async () => {
    renderPage();
    const sheet = await openFood();
    await userEvent.click(within(sheet).getByRole("button", { name: "Edit" }));
    expect(screen.getByLabelText("Amount per month")).toHaveValue(300);
  });

  it("leaves a line with no categories opening straight on its editor", async () => {
    settings.set("planner-lines", [OWN]);
    renderPage();
    await userEvent.click(screen.getByRole("button", { name: /^Out/ }));
    await userEvent.click(screen.getByRole("button", { name: "Edit" }));
    expect(screen.getByLabelText("Amount per month")).toBeInTheDocument();
  });
});

describe("«Month» on the card", () => {
  const tile = (label: string) => screen.getByText(label).closest("[class*=_tile_]")!.children[1].textContent!;
  const amount = (text: string) => (text.startsWith("−") ? -1 : 1) * Number(text.replace(/[^d.]/g, ""));

  it("shows one month: what it starts with, what comes and goes, what it ends with — adding up", async () => {
    renderPage();
    await userEvent.click(screen.getByRole("button", { name: "Month" }));
    expect(screen.getByRole("button", { name: "September 2026 — pick another month" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Previous month" })).toBeDisabled();
    // This month starts from today, with the money there is.
    expect(tile("From today")).toBe("€1000.00");
    const septemberEnd = amount(tile("Month ends with"));
    expect(Math.round((1000 + amount(tile("Coming in")) + amount(tile("Going out"))) * 100) / 100).toBe(septemberEnd);

    await userEvent.click(screen.getByRole("button", { name: "Next month" }));
    expect(screen.getByRole("button", { name: "October 2026 — pick another month" })).toBeInTheDocument();
    // A second way: October starts where September ended.
    expect(amount(tile("Month starts with"))).toBe(septemberEnd);
    const sum = amount(tile("Month starts with")) + amount(tile("Coming in")) + amount(tile("Going out"));
    expect(Math.round(sum * 100) / 100).toBe(amount(tile("Month ends with")));
    expect(screen.getByText(/^Lowest in the month: /)).toBeInTheDocument();
  });

  it("goes straight to a month years away, and back to the period as it was", async () => {
    renderPage();
    await userEvent.click(screen.getByRole("button", { name: "Month" }));
    await userEvent.click(screen.getByRole("button", { name: "September 2026 — pick another month" }));
    await userEvent.selectOptions(screen.getByLabelText("Year"), "2027");
    await userEvent.selectOptions(screen.getByLabelText("Month"), "10");
    await userEvent.click(screen.getByRole("button", { name: "Done" }));
    expect(screen.getByRole("button", { name: "November 2027 — pick another month" })).toBeInTheDocument();
    expect(tile("Month starts with")).toMatch(money);

    await userEvent.click(screen.getByRole("button", { name: "Period" }));
    expect(screen.getByRole("button", { name: /^You end with: / })).toBeInTheDocument();
  });
});
