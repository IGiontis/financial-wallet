import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import i18n from "../../i18n";
import AddDebtModal from "./AddDebtModal";
import { coveredFundingVars } from "../budget/coveredFunding";

// Keki paid 200 € of the ski hotel: told from «Χρέη» as a new loan whose money
// went to the goal, it must write what «Το πλήρωσε κάποιος για μένα» writes on
// the goal — the deposit, the debt with no card, and the expense.

const spies = vi.hoisted(() => ({ create: vi.fn(), covered: vi.fn() }));
vi.mock("./useDebts", () => ({
  useCreateDebt: () => ({ mutate: spies.create, isPending: false }),
  useEditDebt: () => ({ mutate: vi.fn(), isPending: false }),
}));
vi.mock("../budget/useInvestments", () => ({
  useInvestmentGoals: () => ({
    data: [
      { id: "ski", name: "Ski", goalType: "targeted", isActive: true, isCompleted: false },
      { id: "etf", name: "ETF", goalType: "open_ended", isActive: true, isCompleted: false },
    ],
  }),
}));
vi.mock("../transactions/hooks/useTransactions", () => ({ useCategories: () => ({ data: [{ id: "other", name: "Other Expense", type: "expense" }, { id: "travel", name: "Travel", type: "expense" }] }) }));
vi.mock("../budget/useCoveredFunding", () => ({ useCoveredFunding: () => ({ mutate: spies.covered }) }));
vi.mock("../accounts/AccountPicker", () => ({ default: () => null }));
vi.mock("../../shared/hooks/useCurrencyConverter", () => ({ useCurrencyConverter: () => ({ baseCurrency: "EUR", format: (n: number) => `€${n.toFixed(2)}` }) }));

beforeAll(async () => {
  window.matchMedia ??= ((query: string) => ({ matches: false, media: query, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, onchange: null, dispatchEvent: () => false })) as unknown as typeof window.matchMedia;
  await i18n.changeLanguage("en");
});
beforeEach(() => {
  spies.create.mockClear();
  spies.covered.mockClear();
});

const open = () => render(<AddDebtModal knownPeople={["Keki"]} defaultPerson="Keki" onClose={() => {}} />);

describe("a new loan whose money went to a goal", () => {
  it("offers the goals — not the investments — once no card is involved", async () => {
    open();
    expect(screen.queryByLabelText("It went to a goal")).toBeNull();
    await userEvent.click(screen.getByLabelText("Money went into a card or cash"));
    const goals = screen.getByLabelText("It went to a goal") as HTMLSelectElement;
    expect([...goals.options].map((o) => o.textContent?.trim())).toEqual(["No goal", "🎯 Ski"]);
  });

  it("writes the goal's deposit, the debt and the expense — the same as from the goal", async () => {
    open();
    await userEvent.type(screen.getAllByPlaceholderText("0")[0], "200");
    await userEvent.click(screen.getByLabelText("Money went into a card or cash"));
    await userEvent.selectOptions(screen.getByLabelText("It went to a goal"), "ski");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(spies.create).not.toHaveBeenCalled();
    const [vars] = spies.covered.mock.calls[0];
    // A second way: the same builder the goal's wizard uses, with the same figures.
    const date = vars.debt.date as Date;
    expect(vars).toEqual(
      coveredFundingVars({
        goal: { id: "ski", name: "Ski" },
        who: "Keki",
        amount: 200,
        date,
        categoryId: "other",
        notes: "Paid by Keki",
        expenseNotes: "Paid by Keki · debt",
        debt: { label: "Ski", dueDate: undefined },
      }),
    );
    // The three are one amount: what went in the goal is what is owed and what was spent.
    expect([vars.contribution.amount, vars.debt.amount, vars.expense.amount]).toEqual([200, 200, 200]);
    expect(vars.debt).toMatchObject({ person: "Keki", direction: "owed_by_me", forGoalId: "ski" });
  });

  it("is an ordinary debt with no goal picked", async () => {
    open();
    await userEvent.type(screen.getAllByPlaceholderText("0")[0], "200");
    await userEvent.click(screen.getByLabelText("Money went into a card or cash"));
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(spies.covered).not.toHaveBeenCalled();
    expect(spies.create).toHaveBeenCalledWith(expect.objectContaining({ person: "Keki", amount: 200, accountId: undefined }), expect.anything());
  });

  it("says what no money moving means from the side the loan is on", async () => {
    open();
    await userEvent.click(screen.getByLabelText("Money went into a card or cash"));
    expect(screen.getByText(/they paid for something of yours/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /^I lent/ }));
    expect(screen.queryByText(/they paid for something of yours/)).toBeNull();
    expect(screen.queryByLabelText("It went to a goal")).toBeNull();
  });
});
