import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import i18n from "../../i18n";
import ContributionWizard from "./ContributionWizard";
import type { InvestmentGoalWithStats, Transaction } from "../../shared/types/IndexTypes";

// Money into and out of a savings goal. The owner's case: Eurobank 2.000 and
// Revolut 900, read on the 14th; on the 15th, 500 from Eurobank handed to
// Athanasia for the trip, and 200 of the goal kept in his own bank.

const spies = vi.hoisted(() => ({ expense: vi.fn() }));
vi.mock("react-toastify", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("../../shared/hooks/useCurrencyConverter", () => ({
  useCurrencyConverter: () => ({ format: (n: number) => `€${n.toFixed(2)}`, convert: (n: number) => n, convertToBase: (n: number) => n, baseCurrency: "EUR", displayCurrency: "EUR" }),
}));
const holdings = vi.hoisted(() => ({ transactions: [] as unknown[] }));
vi.mock("../accounts/useMoneyAccounts", () => {
  const accounts = [
    { id: "eurobank", name: "Eurobank", kind: "bank", main: true },
    { id: "revolut", name: "Revolut", kind: "bank" },
  ];
  const latest = { at: new Date(2026, 9, 14), checkIn: { id: "c", at: new Date(2026, 9, 14).toISOString(), amounts: { eurobank: 2000, revolut: 900 } } };
  return { useMoneyAccounts: () => ({ accounts, latest, transactions: holdings.transactions }) };
});
vi.mock("../transactions/hooks/useTransactions", () => ({
  useCategories: () => ({
    data: [
      { id: "travel", name: "Travel", type: "expense", icon: "✈️", isDefault: true, userId: null },
      { id: "other", name: "Other Expense", type: "expense", icon: "🧾", isDefault: true, userId: null },
    ],
  }),
  useCreateTransaction: () => ({ mutate: spies.expense }),
  useCreateCategoryScope: () => ({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false }),
}));
// The payee field is the transactions' own; a plain input stands in for it.
vi.mock("../transactions/components/PayeeInput", () => ({
  PayeeInput: ({ value, onChange, invalid }: { value: string; onChange: (v: string) => void; invalid?: boolean }) => (
    <input aria-label="Person" value={value} aria-invalid={invalid || undefined} onChange={(e) => onChange(e.target.value)} />
  ),
}));
vi.mock("../transactions/hooks/usePayees", () => ({ usePayees: () => ({ payees: ["Athanasia"] }) }));

const day = new Date(2026, 9, 15, 10);
const HANDED = {
  id: "m1",
  userId: "u",
  type: "investment",
  amount: 500,
  categoryId: "",
  description: "Trip",
  date: day,
  createdAt: day,
  updatedAt: day,
  isInvestmentTransaction: true,
  isGoalTransaction: true,
  goalId: "trip",
  goalName: "Trip",
  contributionType: "deposit",
  accountId: "eurobank",
  heldBy: "Athanasia",
} as Transaction;

const TRIP = { id: "trip", name: "Trip", icon: "✈️", goalType: "targeted", targetAmount: 2000, targetPeriod: "custom", totalSaved: 0, remaining: 2000, isActive: true } as unknown as InvestmentGoalWithStats;
const TRIP_FUNDED = { ...TRIP, totalSaved: 700, remaining: 1300 } as unknown as InvestmentGoalWithStats;

beforeAll(async () => {
  window.matchMedia = ((query: string) => ({ matches: false, media: query, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, onchange: null, dispatchEvent: () => false })) as unknown as typeof window.matchMedia;
  await i18n.changeLanguage("en");
});

beforeEach(() => {
  spies.expense.mockClear();
  holdings.transactions = [];
});

const next = (dialog: HTMLElement) => userEvent.click(within(dialog).getByRole("button", { name: /Next/ }));
const check = (dialog: HTMLElement) => within(dialog).getByRole("group", { name: "What will happen" });

/** Through amount and date, from the first step's answer. */
async function answerThenAmount(dialog: HTMLElement, choice: RegExp, amount: string) {
  await userEvent.click(within(dialog).getByRole("radio", { name: choice }));
  await next(dialog);
  await userEvent.type(within(dialog).getByLabelText(/Amount/), amount);
  await next(dialog);
  await next(dialog);
}

describe("putting money into a goal", () => {
  it("asks first where it goes, choosing nothing for you", async () => {
    render(<ContributionWizard goal={TRIP} kind="deposit" isGoal onClose={() => {}} onSubmit={vi.fn()} />);
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getAllByRole("radio").map((r) => r.getAttribute("aria-checked"))).toEqual(["false", "false"]);
    await next(dialog);
    expect(within(dialog).getByText("Choose where the money is going")).toBeInTheDocument();
  });

  it("kept on my card: set aside, the card unchanged", async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(<ContributionWizard goal={TRIP} kind="deposit" isGoal onClose={() => {}} onSubmit={onSubmit} />);
    const dialog = screen.getByRole("dialog");
    await answerThenAmount(dialog, /stays on my card/, "300");
    await userEvent.click(within(dialog).getByRole("button", { name: /^Revolut/ }));
    await next(dialog);
    expect(check(dialog)).toHaveTextContent("€0.00 → €300.00");
    expect(check(dialog)).toHaveTextContent("unchanged");
    await userEvent.click(within(dialog).getByRole("button", { name: "Add deposit" }));
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ amount: 300, contributionType: "deposit", accountId: "revolut", heldBy: undefined }));
  });

  it("given to Athanasia: the card and the person both asked, and Eurobank goes down 500", async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(<ContributionWizard goal={TRIP} kind="deposit" isGoal onClose={() => {}} onSubmit={onSubmit} />);
    const dialog = screen.getByRole("dialog");
    await answerThenAmount(dialog, /gave it to someone/, "500");
    // Neither assumed.
    expect(within(dialog).queryAllByRole("button", { pressed: true })).toHaveLength(0);
    await next(dialog);
    expect(within(dialog).getByText("Choose the card it left")).toBeInTheDocument();
    expect(within(dialog).getByLabelText("Person")).toBeInvalid();

    await userEvent.click(within(dialog).getByRole("button", { name: /^Eurobank/ }));
    await userEvent.type(within(dialog).getByLabelText("Person"), "Athanasia");
    await next(dialog);
    expect(check(dialog)).toHaveTextContent("€2000.00 → €1500.00");
    expect(check(dialog)).toHaveTextContent("Athanasia holds€500.00");
    await userEvent.click(within(dialog).getByRole("button", { name: "Add deposit" }));
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ amount: 500, contributionType: "deposit", accountId: "eurobank", heldBy: "Athanasia" }));
    expect(spies.expense).not.toHaveBeenCalled();
  });

  it("will not take more than a deadline goal still needs", async () => {
    render(<ContributionWizard goal={TRIP} kind="deposit" isGoal onClose={() => {}} onSubmit={vi.fn()} />);
    const dialog = screen.getByRole("dialog");
    await userEvent.click(within(dialog).getByRole("radio", { name: /stays on my card/ }));
    await next(dialog);
    await userEvent.type(within(dialog).getByLabelText(/Amount/), "2500");
    await next(dialog);
    expect(within(dialog).getByLabelText(/Amount/)).toBeInvalid();
  });
});

describe("taking money out of a goal Athanasia holds 500 of", () => {
  beforeEach(() => {
    holdings.transactions = [HANDED];
  });

  it("offers what she can do with hers, and what can be done with yours", () => {
    render(<ContributionWizard goal={TRIP_FUNDED} kind="withdrawal" isGoal onClose={() => {}} onSubmit={vi.fn()} />);
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getAllByRole("radio").map((r) => r.querySelector(".fw-semibold")?.textContent)).toEqual([
      "Athanasia gave it back",
      "Athanasia spent it on the goal",
      "I gave it to someone / spent it",
      "I'm keeping it",
    ]);
  });

  it("she gave it back: into the card chosen, which goes up", async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(<ContributionWizard goal={TRIP_FUNDED} kind="withdrawal" isGoal onClose={() => {}} onSubmit={onSubmit} />);
    const dialog = screen.getByRole("dialog");
    await answerThenAmount(dialog, /gave it back/, "200");
    await next(dialog);
    expect(within(dialog).getByText("Choose the card it left")).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole("button", { name: /^Revolut/ }));
    await next(dialog);
    expect(check(dialog)).toHaveTextContent("€900.00 → €1100.00");
    expect(check(dialog)).toHaveTextContent("Athanasia holds€300.00");
    await userEvent.click(within(dialog).getByRole("button", { name: "Confirm withdrawal" }));
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ amount: 200, contributionType: "withdrawal", accountId: "revolut", heldBy: "Athanasia" }));
    expect(spies.expense).not.toHaveBeenCalled();
  });

  it("she spent it: an expense on the card it was handed from, and no card moves", async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(<ContributionWizard goal={TRIP_FUNDED} kind="withdrawal" isGoal onClose={() => {}} onSubmit={onSubmit} />);
    const dialog = screen.getByRole("dialog");
    await answerThenAmount(dialog, /spent it on the goal/, "500");
    // No card to choose: it left Eurobank when it was handed over.
    expect(within(dialog).queryByRole("button", { name: /^Revolut/ })).toBeNull();
    await next(dialog);
    expect(check(dialog)).toHaveTextContent("unchanged (it had already left)");
    await userEvent.click(within(dialog).getByRole("button", { name: "Confirm withdrawal" }));
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ amount: 500, contributionType: "withdrawal", accountId: "eurobank", heldBy: "Athanasia" }));
    expect(spies.expense).toHaveBeenCalledWith(expect.objectContaining({ amount: 500, type: "expense", categoryId: "other", accountId: "eurobank" }), expect.anything());
  });

  it("will not take from her more than she holds", async () => {
    render(<ContributionWizard goal={TRIP_FUNDED} kind="withdrawal" isGoal onClose={() => {}} onSubmit={vi.fn()} />);
    const dialog = screen.getByRole("dialog");
    await userEvent.click(within(dialog).getByRole("radio", { name: /gave it back/ }));
    await next(dialog);
    await userEvent.type(within(dialog).getByLabelText(/Amount/), "600");
    await next(dialog);
    expect(within(dialog).getByText("Only €500.00 there")).toBeInTheDocument();
  });

  it("from my own bank, spent: card and person asked, the card goes down", async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(<ContributionWizard goal={TRIP_FUNDED} kind="withdrawal" isGoal onClose={() => {}} onSubmit={onSubmit} />);
    const dialog = screen.getByRole("dialog");
    await answerThenAmount(dialog, /I gave it to someone/, "200");
    await userEvent.click(within(dialog).getByRole("button", { name: /^Revolut/ }));
    await userEvent.type(within(dialog).getByLabelText("Person"), "Maria");
    await userEvent.click(within(dialog).getByRole("button", { name: "Change category" }));
    await userEvent.click(within(dialog).getByRole("option", { name: /Travel/ }));
    await next(dialog);
    expect(check(dialog)).toHaveTextContent("€900.00 → €700.00");
    await userEvent.click(within(dialog).getByRole("button", { name: "Confirm withdrawal" }));
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ amount: 200, heldBy: undefined, accountId: "revolut" }));
    expect(spies.expense).toHaveBeenCalledWith(expect.objectContaining({ amount: 200, categoryId: "travel", description: "Maria", accountId: "revolut" }), expect.anything());
  });
});
