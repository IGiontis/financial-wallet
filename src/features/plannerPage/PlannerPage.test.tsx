import { describe, it, expect, vi, beforeAll, beforeEach, afterAll } from "vitest";
import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import i18n from "../../i18n";
import { PlannerPage } from "./PlannerPage";
import { buildPlan, type BudgetLine } from "./plannerUtils";
import { occurrenceKey } from "./plannerActuals";
import { SALARY_ROW_ID } from "./plannerUtils";
import { PAYDAY_HORIZON, paydayOutlook } from "../overview/overviewTabs";
import { computeBillStatus } from "../bills/billsUtils";
import type { CheckInReading } from "../accounts/accountsUtils";
import type { Bill, InvestmentGoalWithStats, Transaction } from "../../shared/types/IndexTypes";

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

const data = vi.hoisted(() => ({ transactions: [] as Transaction[], latest: undefined as unknown }));
// What the page saves, kept so it is read back on the next render and so a
// test can look at what an answer wrote.
const settings = vi.hoisted(() => new Map<string, unknown>());

vi.mock("../transactions/hooks/useTransactions", () => ({ useTransactions: () => ({ data: data.transactions, isLoading: false, isError: false }) }));
vi.mock("../budget/useInvestments", () => ({ useInvestmentGoals: () => ({ data: [GOAL], isLoading: false }) }));
vi.mock("../bills/useBills", () => ({ useBills: () => ({ data: BILLS, isLoading: false }) }));
vi.mock("../debts/useDebts", () => ({ useDebts: () => ({ data: [] }) }));
vi.mock("../../shared/hooks/useSalary", () => ({
  useSalary: () => ({ salary: SALARY, input: { amount: "", day: "" }, setInput: vi.fn(), detected: SALARY, isManual: false }),
}));
vi.mock("../../shared/hooks/useOpeningBalance", () => ({
  useOpeningBalance: () => ({ opening: { amount: 1000, date: new Date(2026, 8, 29), at: new Date(2026, 8, 29, 20) }, anchors: [], source: "readings", isLoading: false }),
}));
vi.mock("../accounts/useMoneyAccounts", () => ({ useMoneyAccounts: () => ({ latest: data.latest }) }));
vi.mock("../../shared/hooks/useCurrencyConverter", () => ({
  useCurrencyConverter: () => ({ format: (n: number) => `€${n.toFixed(2)}`, convert: (n: number) => n, baseCurrency: "EUR", displayCurrency: "EUR" }),
}));
vi.mock("../../shared/hooks/useWorkspaceSetting", async () => {
  const { useState } = await import("react");
  return {
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
const SALARY = { amount: 1450, dayOfMonth: 30, occurrences: 3 };

const payOnThe25th = { id: "pay-sep", userId: "u", type: "income", amount: 1450, categoryId: "c", description: "Salary", date: new Date(2026, 8, 25), createdAt: new Date(2026, 8, 25), updatedAt: new Date(2026, 8, 25) } as Transaction;
const READING = { at: new Date(2026, 8, 29, 20), total: 1000, added: [], checkIn: {} } as unknown as CheckInReading;

/** The Overview's answer, worked out as `usePaydayOutlook` works it, from the same inputs. */
const overviewAnswer = () =>
  paydayOutlook(
    buildPlan({ bills: BILLS, goals: [GOAL], lines: [OWN], debts: [], salary: SALARY, openingBalance: 1000, horizon: PAYDAY_HORIZON, now: NOW, actuals: { transactions: data.transactions, debts: [], overrides: {}, lastReadingAt: READING.at } }),
    NOW,
  );

const en = (options: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat("en", options);
const money = /^[+−]?€-?\d+\.\d\d$/;
const sumOf = (texts: string[]) => Math.round(texts.reduce((sum, text) => sum + (text.startsWith("−") ? -1 : 1) * Number(text.replace(/[^\d.]/g, "")), 0) * 100) / 100;

const renderPage = () =>
  render(
    <MemoryRouter>
      <PlannerPage />
    </MemoryRouter>,
  );

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
  settings.set("planner-horizon", 3);
  data.transactions = [payOnThe25th];
  data.latest = READING;
  watching = undefined;
});

describe("the Planner's first card", () => {
  it("gives the Overview's answer: 94,35 left on the eve of pay, ≈3,14 a day", () => {
    renderPage();
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

  it("gives the same answer on a year's view, though that plan is sampled by the week", () => {
    settings.set("planner-horizon", 12);
    renderPage();
    expect(screen.getByText("Left €94.35 · ≈€3.14/day")).toBeInTheDocument();
    expect(overviewAnswer().left).toBe(94.35);
  });

  it("writes out the figure as a sum that lands on it", async () => {
    renderPage();
    await userEvent.click(screen.getByRole("button", { name: "How it adds up" }));
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
  const day = en({ day: "numeric", month: "short" }).format(new Date(2026, 8, 30));
  const key = occurrenceKey("salary", SALARY_ROW_ID, new Date(2026, 8, 30));

  beforeEach(() => {
    // Not written down: the reading of the 29th may already hold it.
    data.transactions = [];
  });

  it("is asked about in the card, and not counted twice meanwhile", async () => {
    renderPage();
    expect(screen.getByText(`Your salary of ${day} wasn’t found in your transactions — has it come already?`)).toBeInTheDocument();
    expect(screen.getByText("Until you answer, it isn’t counted a second time.")).toBeInTheDocument();
    // Left out: the answer runs to October's pay, as the Overview's does.
    expect(overviewAnswer().left).toBe(94.35);
    expect(screen.getByText("Left €94.35 · ≈€3.14/day")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: `Salary · ${day}: It came` }));
    expect(settings.get("planner-occurrences")).toEqual({ [key]: { state: "received", date: "2026-09-30", amount: 1450 } });
    expect(screen.queryByText(/wasn’t found in your transactions/)).toBeNull();
  });

  it("records «not yet» as waiting", async () => {
    renderPage();
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
  it("names what you end with, and what the months add without the money you have", () => {
    renderPage();
    expect(screen.getAllByText("€2595.00").length).toBeGreaterThan(0);
    expect(screen.getByText("The months leave +€1595.00 (not counting the €1000.00 you have)")).toBeInTheDocument();
    expect(screen.getByText("You never go below zero")).toBeInTheDocument();
    expect(screen.getByText(`Lowest point €94.35 · ${en({ weekday: "short", day: "numeric", month: "short" }).format(new Date(2026, 9, 29))}`)).toBeInTheDocument();
    expect(screen.getByText("Coming in · 3 salaries")).toBeInTheDocument();
    expect(screen.getAllByText("+€4350.00").length).toBeGreaterThan(0);
    expect(screen.getAllByText("−€2755.00").length).toBeGreaterThan(0);
    expect(1000 + 4350 - 2755).toBe(2595);
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

  it("keeps one line for a year, from today to the window's end", () => {
    settings.set("planner-horizon", 12);
    renderPage();
    expect(screen.getByRole("img", { name: "What is left, day by day" })).toBeInTheDocument();
    // 1.000 + 12 × 1.450 − 12 × (515 + 100) − 3.610 of one's own = 7.410 at the end.
    expect(1000 + 12 * 1450 - 12 * (515 + 100) - 3610).toBe(7410);
  });
});
