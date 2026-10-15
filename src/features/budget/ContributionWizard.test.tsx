import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import i18n from "../../i18n";
import ContributionWizard from "./ContributionWizard";
import type { InvestmentGoalWithStats } from "../../shared/types/IndexTypes";

// Money into and out of a goal, step by step: Save only on the check, the card
// on the record, and — out of a goal — kept, or spent with an expense beside it.

const spies = vi.hoisted(() => ({ expense: vi.fn() }));
vi.mock("react-toastify", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("../../shared/hooks/useCurrencyConverter", () => ({
  useCurrencyConverter: () => ({ format: (n: number) => `€${n.toFixed(2)}`, convert: (n: number) => n, convertToBase: (n: number) => n, baseCurrency: "EUR", displayCurrency: "EUR" }),
}));
vi.mock("../accounts/useMoneyAccounts", () => {
  const accounts = [
    { id: "eurobank", name: "Eurobank", kind: "bank", main: true },
    { id: "revolut", name: "Revolut", kind: "bank" },
  ];
  const latest = { at: new Date(2026, 9, 14), checkIn: { id: "c", at: new Date(2026, 9, 14).toISOString(), amounts: { eurobank: 2000, revolut: 900 } } };
  return { useMoneyAccounts: () => ({ accounts, latest, transactions: [] }) };
});
vi.mock("../transactions/hooks/useTransactions", () => ({
  useCategories: () => ({
    data: [
      { id: "travel", name: "Travel", type: "expense", icon: "✈️", isDefault: true, userId: null },
      { id: "other", name: "Other Expense", type: "expense", icon: "🧾", isDefault: true, userId: null },
    ],
  }),
  useCreateTransaction: () => ({ mutate: spies.expense }),
  // The picker offers a new category; not what these check.
  useCreateCategoryScope: () => ({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false }),
}));

const TRIP = { id: "trip", name: "Trip", icon: "✈️", goalType: "targeted", targetAmount: 2000, targetPeriod: "custom", totalSaved: 1000, remaining: 1000, isActive: true } as unknown as InvestmentGoalWithStats;

beforeAll(async () => {
  window.matchMedia = ((query: string) => ({ matches: false, media: query, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, onchange: null, dispatchEvent: () => false })) as unknown as typeof window.matchMedia;
  await i18n.changeLanguage("en");
});

beforeEach(() => spies.expense.mockClear());

const next = (dialog: HTMLElement) => userEvent.click(within(dialog).getByRole("button", { name: /Next/ }));

describe("putting money into a goal", () => {
  it("saves only from the check, with the card it is kept in — and that card does not move", async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(<ContributionWizard goal={TRIP} kind="deposit" isGoal onClose={() => {}} onSubmit={onSubmit} />);
    const dialog = screen.getByRole("dialog");
    await userEvent.type(within(dialog).getByLabelText(/Amount/), "300");
    await next(dialog);
    await next(dialog);
    await userEvent.click(within(dialog).getByRole("button", { name: /^Revolut/ }));
    await next(dialog);
    expect(onSubmit).not.toHaveBeenCalled();

    const check = within(dialog).getByRole("group", { name: "What will happen" });
    expect(check).toHaveTextContent("€1000.00 → €1300.00");
    expect(check).toHaveTextContent("€700.00");
    expect(check).toHaveTextContent("unchanged");

    await userEvent.click(within(dialog).getByRole("button", { name: "Add deposit" }));
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ goalId: "trip", amount: 300, contributionType: "deposit", accountId: "revolut" }));
    expect(spies.expense).not.toHaveBeenCalled();
  });

  it("will not take more than a deadline goal still needs", async () => {
    render(<ContributionWizard goal={TRIP} kind="deposit" isGoal onClose={() => {}} onSubmit={vi.fn()} />);
    const dialog = screen.getByRole("dialog");
    await userEvent.type(within(dialog).getByLabelText(/Amount/), "1500");
    await next(dialog);
    expect(within(dialog).getByLabelText(/Amount/)).toBeInvalid();
  });
});

describe("taking money out of a goal", () => {
  it("files what was given away under Other expense unless another is picked", async () => {
    render(<ContributionWizard goal={TRIP} kind="withdrawal" isGoal onClose={() => {}} onSubmit={vi.fn().mockResolvedValue(undefined)} />);
    const dialog = screen.getByRole("dialog");
    await userEvent.click(within(dialog).getByRole("radio", { name: /gave it to someone/ }));
    await userEvent.type(within(dialog).getByLabelText(/To whom, or for what/), "Athanasia");
    expect(within(dialog).getByRole("option", { name: /Other expense/i })).toHaveAttribute("aria-selected", "true");
    await next(dialog);
    await userEvent.type(within(dialog).getByLabelText(/Amount/), "500");
    await next(dialog);
    await next(dialog);
    await next(dialog);
    await userEvent.click(within(dialog).getByRole("button", { name: "Confirm withdrawal" }));
    expect(spies.expense).toHaveBeenCalledWith(expect.objectContaining({ categoryId: "other", description: "Athanasia", amount: 500 }), expect.anything());
  });

  it("asks first what became of the money, and chooses nothing for you", async () => {
    render(<ContributionWizard goal={TRIP} kind="withdrawal" isGoal onClose={() => {}} onSubmit={vi.fn()} />);
    const dialog = screen.getByRole("dialog");
    // The first step, given-or-spent first, neither chosen.
    const [given, kept] = within(dialog).getAllByRole("radio");
    expect(given).toHaveTextContent(/^I gave it to someone/);
    expect(kept).toHaveTextContent(/^I'm keeping it/);
    expect([given, kept].map((r) => r.getAttribute("aria-checked"))).toEqual(["false", "false"]);
    await next(dialog);
    expect(within(dialog).getByText("Choose what became of the money")).toBeInTheDocument();
    expect(within(dialog).queryByLabelText(/Amount/)).toBeNull();
  });

  it("kept: only set free, no expense, the card unchanged", async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(<ContributionWizard goal={TRIP} kind="withdrawal" isGoal onClose={() => {}} onSubmit={onSubmit} />);
    const dialog = screen.getByRole("dialog");
    await userEvent.click(within(dialog).getByRole("radio", { name: /keeping it/ }));
    await next(dialog);
    await userEvent.type(within(dialog).getByLabelText(/Amount/), "200");
    await next(dialog);
    await next(dialog);
    await next(dialog);
    expect(within(dialog).getByRole("group", { name: "What will happen" })).toHaveTextContent("unchanged");
    await userEvent.click(within(dialog).getByRole("button", { name: "Confirm withdrawal" }));
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ amount: 200, contributionType: "withdrawal" }));
    expect(spies.expense).not.toHaveBeenCalled();
  });

  it("spent: the withdrawal and an expense of the same amount, off the card it left", async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(<ContributionWizard goal={TRIP} kind="withdrawal" isGoal onClose={() => {}} onSubmit={onSubmit} />);
    const dialog = screen.getByRole("dialog");
    await userEvent.click(within(dialog).getByRole("radio", { name: /gave it to someone/ }));
    // Who it went to may not be left out.
    await next(dialog);
    expect(within(dialog).getByLabelText(/To whom, or for what/)).toBeInvalid();
    await userEvent.type(within(dialog).getByLabelText(/To whom, or for what/), "Maria – trip");
    await userEvent.click(within(dialog).getByRole("option", { name: /Travel/ }));
    await next(dialog);
    await userEvent.type(within(dialog).getByLabelText(/Amount/), "500");
    await next(dialog);
    await next(dialog);
    await next(dialog);

    const check = within(dialog).getByRole("group", { name: "What will happen" });
    // Eurobank, the main one, 2.000 less 500.
    expect(check).toHaveTextContent("€2000.00 → €1500.00");
    expect(check).toHaveTextContent("−€500.00 · Maria – trip");

    await userEvent.click(within(dialog).getByRole("button", { name: "Confirm withdrawal" }));
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ amount: 500, contributionType: "withdrawal" }));
    expect(spies.expense).toHaveBeenCalledWith(expect.objectContaining({ amount: 500, type: "expense", categoryId: "travel", description: "Maria – trip" }), expect.anything());
  });
});
