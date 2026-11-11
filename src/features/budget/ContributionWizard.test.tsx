import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import userEvent from "@testing-library/user-event";
import i18n from "../../i18n";
import ContributionWizard from "./ContributionWizard";
import type { InvestmentGoalWithStats, Transaction } from "../../shared/types/IndexTypes";
import { expectNoErrors } from "../../test/noEarlyErrors";

// Money into and out of a savings goal. The owner's case: Eurobank 2.000 and
// Revolut 900, read on the 14th; on the 15th, 500 from Eurobank handed to
// Athanasia for the trip, and 200 of the goal kept in his own bank.

const spies = vi.hoisted(() => ({ expense: vi.fn(), covered: vi.fn() }));
// Someone else paid: the three writes are the hook's, checked on their own.
vi.mock("./useCoveredFunding", () => ({ useCoveredFunding: () => ({ mutate: spies.covered, mutateAsync: spies.covered }) }));
vi.mock("react-toastify", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("../../shared/hooks/useCurrencyConverter", () => ({
  useCurrencyConverter: () => ({ format: (n: number) => `€${n.toFixed(2)}`, convert: (n: number) => n, convertToBase: (n: number) => n, baseCurrency: "EUR", displayCurrency: "EUR" }),
}));
const TWO_CARDS = [
  { id: "eurobank", name: "Eurobank", kind: "bank", main: true },
  { id: "revolut", name: "Revolut", kind: "bank" },
];
const reading = (amounts: Record<string, number>) => ({ at: new Date(2026, 9, 14), checkIn: { id: "c", at: new Date(2026, 9, 14).toISOString(), amounts } });
const holdings = vi.hoisted(() => ({ transactions: [] as unknown[], accounts: [] as unknown[], latest: undefined as unknown }));
vi.mock("../accounts/useMoneyAccounts", () => ({
  useMoneyAccounts: () => ({ accounts: holdings.accounts, latest: holdings.latest, transactions: holdings.transactions }),
  useAccountList: () => holdings.accounts,
}));
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
  spies.covered.mockClear();
  holdings.transactions = [];
  holdings.accounts = TWO_CARDS;
  holdings.latest = reading({ eurobank: 2000, revolut: 900 });
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
    expect(within(dialog).getAllByRole("radio").map((r) => r.getAttribute("aria-checked"))).toEqual(["false", "false", "false"]);
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
    expect(within(dialog).getByText("Choose where the money came from: a card or cash.")).toBeInTheDocument();
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
    expect(within(dialog).getByText("Choose where the money went: a card or cash.")).toBeInTheDocument();
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
    render(
      <MemoryRouter>
        <ContributionWizard goal={TRIP_FUNDED} kind="withdrawal" isGoal onClose={() => {}} onSubmit={onSubmit} />
      </MemoryRouter>,
    );
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

describe("someone else paid part of the goal", () => {
  const TRIP_700 = { ...TRIP, targetAmount: 700, remaining: 550, totalSaved: 150 } as unknown as InvestmentGoalWithStats;

  it("asks who and what for, and no card — then writes the debt, the expense and the deposit as one", async () => {
    const onSubmit = vi.fn();
    render(<ContributionWizard goal={TRIP_700} kind="deposit" isGoal onClose={() => {}} onSubmit={onSubmit} />);
    const dialog = screen.getByRole("dialog");
    await answerThenAmount(dialog, /Someone paid it for me/, "550");

    // The card step is "Who": no card to choose, said so.
    expect(within(dialog).queryByRole("button", { name: /^Revolut/ })).toBeNull();
    expect(within(dialog).getByText(/No card moves/)).toBeInTheDocument();
    await userEvent.type(within(dialog).getByLabelText("Person"), "Nikos");
    await next(dialog);

    expect(check(dialog)).toHaveTextContent("€150.00 → €700.00");
    expect(check(dialog)).toHaveTextContent("Debt to Nikos");
    expect(check(dialog)).toHaveTextContent("€550.00");
    await userEvent.click(within(dialog).getByRole("button", { name: "Add deposit" }));

    // One write for all three, and not the ordinary deposit.
    expect(onSubmit).not.toHaveBeenCalled();
    expect(spies.expense).not.toHaveBeenCalled();
    expect(spies.covered).toHaveBeenCalledTimes(1);
    const [vars] = spies.covered.mock.calls[0];
    expect(vars.contribution).toMatchObject({ goalId: "trip", amount: 550, contributionType: "deposit", coveredBy: "Nikos" });
    // The debt is the person's, for what the goal is called, from the main account's books.
    expect(vars.debt).toMatchObject({ person: "Nikos", direction: "owed_by_me", amount: 550, label: "Trip", accountId: "", forGoalId: "trip" });
    // The expense is the cost, on no card of its own (the main account), the day they paid.
    expect(vars.expense).toMatchObject({ type: "expense", amount: 550, description: "Trip", categoryId: "other" });
    expect(vars.expense.accountId).toBeUndefined();
    // The three agree: one amount, one date.
    expect(new Set([vars.contribution.amount, vars.debt.amount, vars.expense.amount]).size).toBe(1);
    expect(vars.contribution.date).toEqual(vars.debt.date);
    expect(vars.debt.date).toEqual(vars.expense.date);
  });

  it("will not go on without a name, and will not take more than the goal still needs", async () => {
    render(<ContributionWizard goal={TRIP_700} kind="deposit" isGoal onClose={() => {}} onSubmit={vi.fn()} />);
    const dialog = screen.getByRole("dialog");
    await userEvent.click(within(dialog).getByRole("radio", { name: /Someone paid it for me/ }));
    await next(dialog);
    await userEvent.type(within(dialog).getByLabelText(/Amount/), "600");
    await next(dialog);
    // 600 is more than the 550 still needed: held on the amount step, and said.
    expect(within(dialog).getByLabelText(/Amount/)).toBeInTheDocument();
    expect(within(dialog).getByText("Cannot exceed remaining amount (€550.00)")).toBeInTheDocument();
    expect(spies.covered).not.toHaveBeenCalled();
  });
});

// ── Item 97a: the card is required ───────────────────────────────────────────
describe("the card or cash is always asked (item 97a)", () => {
  it("kept on a card: nothing chosen at first, and Next without a card says so — only then", async () => {
    render(<ContributionWizard goal={TRIP} kind="deposit" isGoal onClose={() => {}} onSubmit={vi.fn()} />);
    const dialog = screen.getByRole("dialog");
    await answerThenAmount(dialog, /stays on my card/, "100");
    expect(within(dialog).queryAllByRole("button", { pressed: true })).toHaveLength(0);
    expect(within(dialog).queryByRole("alert")).toBeNull();
    // No «no particular card» to pick any more.
    expect(within(dialog).queryByText(/No particular card/)).toBeNull();
    await next(dialog);
    expect(within(dialog).getByText("Choose where the money came from: a card or cash.")).toBeInTheDocument();
    expect(within(dialog).queryByRole("group", { name: "What will happen" })).toBeNull();
  });

  it("an investment's deposit asks the card too", async () => {
    const INVEST = { ...TRIP, id: "etf", name: "ETF", goalType: "open", targetPeriod: undefined } as unknown as InvestmentGoalWithStats;
    render(<ContributionWizard goal={INVEST} kind="deposit" isGoal={false} onClose={() => {}} onSubmit={vi.fn()} />);
    const dialog = screen.getByRole("dialog");
    await userEvent.type(within(dialog).getByLabelText(/Amount/), "100");
    await next(dialog);
    await next(dialog);
    await next(dialog);
    expect(within(dialog).getByText("Choose where the money came from: a card or cash.")).toBeInTheDocument();
  });

  it("with only one place, that one is chosen and shown — nothing to decide", async () => {
    holdings.accounts = [{ id: "cash", name: "Cash", kind: "cash" }];
    holdings.latest = reading({ cash: 400 });
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(<ContributionWizard goal={TRIP} kind="deposit" isGoal onClose={() => {}} onSubmit={onSubmit} />);
    const dialog = screen.getByRole("dialog");
    await answerThenAmount(dialog, /stays on my card/, "100");
    expect(within(dialog).getByRole("button", { name: /^Cash/, pressed: true })).toBeInTheDocument();
    await next(dialog);
    await userEvent.click(within(dialog).getByRole("button", { name: "Add deposit" }));
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ amount: 100, accountId: "cash" }));
  });
});

// ── Item 97d: a deposit cannot set aside money the card does not have ────────
describe("a deposit takes no more than the card's free money (item 97d)", () => {
  /** Another goal's money, kept in Eurobank: deposited before the reading, so the reading holds it. */
  const otherGoal = (amount: number, contributionType: "deposit" | "withdrawal" = "deposit") =>
    ({
      ...HANDED,
      id: `other-${amount}-${contributionType}`,
      amount,
      date: new Date(2026, 9, 10),
      createdAt: new Date(2026, 9, 10),
      goalId: "car",
      goalName: "Car",
      contributionType,
      accountId: "eurobank",
      heldBy: undefined,
    }) as Transaction;

  const keepOn = async (amount: string, card: RegExp) => {
    render(<ContributionWizard goal={TRIP} kind="deposit" isGoal onClose={() => {}} onSubmit={vi.fn()} />);
    const dialog = screen.getByRole("dialog");
    await answerThenAmount(dialog, /stays on my card/, amount);
    await userEvent.click(within(dialog).getByRole("button", { name: card }));
    return dialog;
  };

  it("Eurobank holds 250: setting aside 500 there is refused, and said why", async () => {
    holdings.latest = reading({ eurobank: 250, revolut: 900 });
    const dialog = await keepOn("500", /^Eurobank/);
    expect(within(dialog).getByRole("alert")).toHaveTextContent("Eurobank has €250.00 free. If it holds more, update its balance in Banks first.");
    await next(dialog);
    expect(within(dialog).queryByRole("group", { name: "What will happen" })).toBeNull();
    expect(within(dialog).getByRole("alert")).toBeInTheDocument();
  });

  it("exactly the free amount goes through", async () => {
    holdings.latest = reading({ eurobank: 250, revolut: 900 });
    const dialog = await keepOn("250", /^Eurobank/);
    expect(within(dialog).queryByRole("alert")).toBeNull();
    await next(dialog);
    expect(check(dialog)).toHaveTextContent("€0.00 → €250.00");
  });

  it("money another goal already keeps in that card is not free — reconciled by hand from the reading", async () => {
    holdings.latest = reading({ eurobank: 250, revolut: 900 });
    holdings.transactions = [otherGoal(150), otherGoal(30, "withdrawal")];
    // By hand: the reading said 250; the car goal keeps 150 − 30 = 120 of it; 250 − 120 = 130 free.
    const free = 250 - (150 - 30);
    expect(free).toBe(130);

    const dialog = await keepOn(String(free + 1), /^Eurobank/);
    expect(within(dialog).getByRole("alert")).toHaveTextContent(`Eurobank has €${free.toFixed(2)} free (€120.00 is already in goals).`);
    await userEvent.click(within(dialog).getByRole("button", { name: /Back/ }));
    await userEvent.click(within(dialog).getByRole("button", { name: /Back/ }));
    const amount = within(dialog).getByLabelText(/Amount/);
    await userEvent.clear(amount);
    await userEvent.type(amount, String(free));
    await next(dialog);
    await next(dialog);
    expect(within(dialog).queryByRole("alert")).toBeNull();
    await next(dialog);
    expect(check(dialog)).toHaveTextContent(`€0.00 → €${free.toFixed(2)}`);
  });

  it("handing it to someone from a card checks the same free money", async () => {
    holdings.latest = reading({ eurobank: 250, revolut: 900 });
    render(<ContributionWizard goal={TRIP} kind="deposit" isGoal onClose={() => {}} onSubmit={vi.fn()} />);
    const dialog = screen.getByRole("dialog");
    await answerThenAmount(dialog, /gave it to someone/, "300");
    await userEvent.click(within(dialog).getByRole("button", { name: /^Eurobank/ }));
    expect(within(dialog).getByRole("alert")).toHaveTextContent("Eurobank has €250.00 free.");
  });

  it("with no bank reading yet the balance is unknown, and nothing is refused", async () => {
    holdings.latest = undefined;
    const dialog = await keepOn("1500", /^Eurobank/);
    expect(within(dialog).queryByRole("alert")).toBeNull();
    await next(dialog);
    expect(check(dialog)).toHaveTextContent("€0.00 → €1500.00");
  });

  it("the cards show their free money, most first, and those with no reading last in their usual order", async () => {
    holdings.accounts = [...TWO_CARDS, { id: "piggy", name: "Piggy", kind: "cash" }, { id: "alpha", name: "Alpha", kind: "bank" }];
    // Piggy and Alpha were added after the reading: their balance is unknown.
    holdings.latest = reading({ eurobank: 250, revolut: 900 });
    holdings.transactions = [otherGoal(200)];
    render(<ContributionWizard goal={TRIP} kind="deposit" isGoal onClose={() => {}} onSubmit={vi.fn()} />);
    const dialog = screen.getByRole("dialog");
    await answerThenAmount(dialog, /stays on my card/, "100");
    const picker = within(dialog).getByRole("group", { name: "Paid from" });
    const names = within(picker)
      .getAllByRole("button")
      .map((b) => b.getAttribute("aria-label"));
    // Revolut 900 free; Eurobank 250 − 200 = 50 free, not enough for 100; then the unknown two as listed.
    expect(names).toEqual(["Revolut, €900.00 free", "Eurobank, €50.00 not enough", "Piggy", "Alpha"]);
    expect(within(dialog).queryAllByRole("button", { pressed: true })).toHaveLength(0);
  });
});

// ── Item 97b: no error before anything was touched ───────────────────────────
describe("the deposit and withdrawal dialogs open without errors", () => {
  it("a deposit: no error on opening, nor on each step reached with its answer given", async () => {
    render(<ContributionWizard goal={TRIP} kind="deposit" isGoal onClose={() => {}} onSubmit={vi.fn()} />);
    const dialog = screen.getByRole("dialog");
    expectNoErrors(dialog);
    await userEvent.click(within(dialog).getByRole("radio", { name: /gave it to someone/ }));
    await next(dialog);
    expectNoErrors(dialog);
    await userEvent.type(within(dialog).getByLabelText(/Amount/), "100");
    await next(dialog);
    expectNoErrors(dialog);
    await next(dialog);
    // The card and the person: asked, not yet wrong.
    expectNoErrors(dialog);
  });

  it("a withdrawal and an investment open clean too", () => {
    holdings.transactions = [HANDED];
    const { unmount } = render(<ContributionWizard goal={TRIP_FUNDED} kind="withdrawal" isGoal onClose={() => {}} onSubmit={vi.fn()} />);
    expectNoErrors(screen.getByRole("dialog"));
    unmount();
    render(<ContributionWizard goal={TRIP} kind="deposit" isGoal={false} onClose={() => {}} onSubmit={vi.fn()} />);
    expectNoErrors(screen.getByRole("dialog"));
  });
});
