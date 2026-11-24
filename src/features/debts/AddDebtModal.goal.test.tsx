import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import i18n from "../../i18n";
import AddDebtModal from "./AddDebtModal";
import { coveredFundingVars } from "../budget/coveredFunding";

// Keki paid 200 € of the ski hotel: told from «Χρέη» as a new loan whose money
// went to the goal, it must write what «Το πλήρωσε κάποιος για μένα» writes on
// the goal — the deposit, the debt with no card, and the expense.

const spies = vi.hoisted(() => ({ create: vi.fn(), covered: vi.fn(), edit: vi.fn() }));
vi.mock("./useDebts", () => ({
  useCreateDebt: () => ({ mutate: spies.create, mutateAsync: async (...args: unknown[]) => (spies.create(...(args as [never])), "new-debt"), isPending: false }),
  useEditDebt: () => ({ mutate: spies.edit, mutateAsync: async (...args: unknown[]) => (spies.edit(...(args as [never])), undefined), isPending: false }),
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
vi.mock("../budget/useCoveredFunding", () => ({ useCoveredFunding: () => ({ mutateAsync: (vars: unknown) => (spies.covered(vars), new Promise(() => {})) }) }));
// A new debt has nothing tied to it yet; a saved covered one is given its link below.
const linked = vi.hoisted(() => ({ value: { link: undefined as unknown, goalName: undefined as string | undefined, ready: true, failed: false, retry: () => {} } }));
vi.mock("../budget/useCoveredLink", () => ({ useCoveredLink: () => linked.value }));
vi.mock("../accounts/AccountPicker", () => ({ default: () => null }));
// `useMoneyAccounts` too: the form asks it whether the card can carry what is
// being lent (`useSpendCheck`, rule 22). No reading here, so nothing is ever
// refused on a guess.
vi.mock("../accounts/useMoneyAccounts", () => ({
  useAccountList: () => [],
  useMoneyAccounts: () => ({ accounts: [], latest: undefined, transactions: [], checkIns: [], setCheckIns: vi.fn() }),
}));
vi.mock("../../shared/hooks/useCurrencyConverter", () => ({ useCurrencyConverter: () => ({ baseCurrency: "EUR", format: (n: number) => `€${n.toFixed(2)}` }) }));

beforeAll(async () => {
  window.matchMedia ??= ((query: string) => ({ matches: false, media: query, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, onchange: null, dispatchEvent: () => false })) as unknown as typeof window.matchMedia;
  await i18n.changeLanguage("en");
});
beforeEach(() => {
  spies.create.mockClear();
  spies.covered.mockClear();
  spies.edit.mockClear();
  linked.value = { link: undefined, goalName: undefined, ready: true, failed: false, retry: () => {} };
});

const open = () => render(<AddDebtModal knownPeople={["Keki"]} defaultPerson="Keki" onClose={() => {}} />);

// The wizard's steps: who → money (where, then how much) → interest → dates → review.
const next = () => userEvent.click(screen.getByRole("button", { name: /^Next/ }));
const back = () => userEvent.click(screen.getByRole("button", { name: /^‹ Back/ }));
/** From the first step to «Did the money …?», the amount typed there too. */
async function toMoney(amount?: string) {
  await next();
  if (amount) await userEvent.type(screen.getByLabelText(/^Amount/), amount);
}
/** From an answered money step: a plain debt, the day as it is, on to the review. */
async function moneyToReview() {
  await next();
  await userEvent.click(screen.getByRole("radio", { name: /^No, a plain debt/ }));
  await next();
  await next();
}
/** From a saved debt, every step already answered, to the review. */
async function toReview() {
  for (let i = 0; i < 4; i++) await next();
}

describe("a new loan whose money went to a goal", () => {
  it("offers the goals — not the investments — once no card is involved", async () => {
    open();
    await toMoney("200");
    expect(screen.queryByLabelText("It went to a goal")).toBeNull();
    await userEvent.click(screen.getByRole("radio", { name: /^No — they paid for you/ }));
    const goals = screen.getByLabelText("It went to a goal") as HTMLSelectElement;
    expect([...goals.options].map((o) => o.textContent?.trim())).toEqual(["No goal", "🎯 Ski"]);
  });

  it("writes the goal's deposit, the debt and the expense — the same as from the goal", async () => {
    open();
    await toMoney("200");
    await userEvent.click(screen.getByRole("radio", { name: /^No — they paid for you/ }));
    await userEvent.selectOptions(screen.getByLabelText("It went to a goal"), "ski");
    // No category chosen in advance: the select starts empty, naming the fallback.
    const category = screen.getByLabelText("Expense category") as HTMLSelectElement;
    expect(category.value).toBe("");
    expect(category.options[0].textContent).toMatch(/^None chosen — it goes to «Other/);
    await moneyToReview();
    // The fallback is applied at save and shown in the review.
    expect(screen.getByRole("button", { name: /^Expense categorys*Other/ })).toBeInTheDocument();
    // The review names the goal and the category before anything is written.
    expect(screen.getByRole("button", { name: /It went to a goal.*Ski/ })).toBeInTheDocument();
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
    await toMoney("200");
    await userEvent.click(screen.getByRole("radio", { name: /^No — they paid for you/ }));
    await moneyToReview();
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(spies.covered).not.toHaveBeenCalled();
    expect(spies.create).toHaveBeenCalledWith(expect.objectContaining({ person: "Keki", amount: 200, accountId: undefined }));
  });

  it("says what no money moving means from the side the loan is on", async () => {
    open();
    await toMoney("200");
    await userEvent.click(screen.getByRole("radio", { name: /^No — they paid for you/ }));
    expect(screen.getByRole("radiogroup", { name: "Did the money go in somewhere?" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: /^No — they paid for you/ })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByText(/they paid your hotel/)).toBeInTheDocument();
    await back();
    await userEvent.click(screen.getByRole("button", { name: /^I lent/ }));
    await next();
    // Lent: the question and the "no" turn round — it is now money that would have left.
    expect(screen.getByRole("radiogroup", { name: "Did the money come out of somewhere?" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: /^No — you paid for them/ })).toHaveAttribute("aria-checked", "true");
    expect(screen.queryByText(/they paid your hotel/)).toBeNull();
    expect(screen.queryByLabelText("It went to a goal")).toBeNull();
  });

  it("keeps the value contract: «yes» is \"\" (any card), «no» is undefined", async () => {
    open();
    await toMoney("50");
    // A new debt starts unanswered: neither tile chosen (no prefill, item 97).
    expect(screen.getByRole("radio", { name: /^Yes, into a card or cash/ })).toHaveAttribute("aria-checked", "false");
    expect(screen.getByRole("radio", { name: /^No — they paid for you/ })).toHaveAttribute("aria-checked", "false");
    await userEvent.click(screen.getByRole("radio", { name: /^No — they paid for you/ }));
    await userEvent.click(screen.getByRole("radio", { name: /^Yes, into a card or cash/ }));
    await moneyToReview();
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(spies.create).toHaveBeenCalledWith(expect.objectContaining({ amount: 50, accountId: "" }));
  });
});

describe("a saved debt that paid part of a goal, corrected", () => {
  const day = new Date(2026, 9, 20);
  const vars = coveredFundingVars({ goal: { id: "ski", name: "Ski" }, who: "Keki", amount: 200, date: day, categoryId: "travel", notes: "Paid by Keki", expenseNotes: "Paid by Keki · debt" });
  const debt = { ...vars.debt, id: "d1", userId: "u", coveredExpenseId: "e1", createdAt: day, updatedAt: day };
  const link = {
    goalId: "ski",
    contribution: { ...vars.contribution, id: "c1", userId: "u", debtId: "d1", createdAt: day, updatedAt: day },
    expense: { ...vars.expense, id: "e1", userId: "u", createdAt: day, updatedAt: day },
    expenseUnnamed: false,
  };
  const edit = () => {
    linked.value = { link, goalName: "Ski", ready: true, failed: false, retry: () => {} };
    render(<AddDebtModal debt={debt} knownPeople={["Keki"]} onClose={() => {}} />);
  };

  it("sends the goal's deposit and the expense with the new amount, and says so", async () => {
    edit();
    expect(screen.getByText(/Paid part of «Ski»/)).toBeInTheDocument();
    // The amount is on the money step, the second.
    await next();
    const amount = screen.getByDisplayValue("200");
    await userEvent.clear(amount);
    await userEvent.type(amount, "150");
    for (let i = 0; i < 3; i++) await next();
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    const [args] = spies.edit.mock.calls[0];
    expect(args.data.amount).toBe(150);
    expect(args.covered).toEqual({ contribution: { id: "c1", set: { amount: 150 } }, expense: { id: "e1", set: { amount: 150 } } });
  });

  it("keeps which way and that no card moved: those cannot be changed here", async () => {
    edit();
    expect(screen.getByRole("button", { name: /^I lent/ })).toBeDisabled();
    await next();
    // Hidden by Bootstrap's class, which the test page has no stylesheet for.
    expect(screen.getByRole("radiogroup", { name: "Did the money go in somewhere?" }).closest(".d-none")).not.toBeNull();
  });

  it("waits for the goal's records before it can save", async () => {
    linked.value = { link: undefined, goalName: undefined, ready: false, failed: false, retry: () => {} };
    render(<AddDebtModal debt={debt} knownPeople={["Keki"]} onClose={() => {}} />);
    await toReview();
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("says so when they could not be read, and reads them again on «Try again»", async () => {
    const retry = vi.fn();
    linked.value = { link: undefined, goalName: undefined, ready: false, failed: true, retry };
    render(<AddDebtModal debt={debt} knownPeople={["Keki"]} onClose={() => {}} />);
    expect(screen.getByRole("alert")).toHaveTextContent("couldn't be loaded");
    await toReview();
    expect(screen.getByRole("alert")).toHaveTextContent("couldn't be loaded");
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(retry).toHaveBeenCalledOnce();
  });
});
