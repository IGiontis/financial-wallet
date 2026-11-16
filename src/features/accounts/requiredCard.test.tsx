import { describe, it, expect, vi, beforeAll } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import i18n from "../../i18n";
import AddTransactionModal from "../transactions/components/AddTransactionModal";
import EditTransactionModal from "../transactions/components/EditTransactionModal";
import MarkPaidModal from "../bills/MarkPaidModal";
import ArrivedSheet from "../incomes/components/ArrivedSheet";
import RepaymentWizard from "../debts/RepaymentWizard";
import { computeBillStatus } from "../bills/billsUtils";
import { makeFormats } from "../incomes/incomeText";
import type { Bill, Category, DebtWithStatus, Transaction, UpdateTransactionDTO } from "../../shared/types/IndexTypes";
import type { Income, IncomeStatus } from "../incomes/incomesUtils";

// Item 97a: in every money form the card or cash is REQUIRED. No «no particular
// card», nothing chosen for you (except when there is only one place), the
// error only once Next was pressed without one, and the review names it.
// An old record that names none is asked for one when it is edited.

const places = vi.hoisted(() => ({
  accounts: [
    { id: "eb", name: "Eurobank", kind: "bank", main: true },
    { id: "rev", name: "Revolut", kind: "bank" },
  ] as { id: string; name: string; kind: "bank" | "cash"; main?: boolean }[],
}));
vi.mock("./useMoneyAccounts", () => ({
  useAccountList: () => places.accounts,
  useMoneyAccounts: () => ({ accounts: places.accounts, latest: undefined, transactions: [], checkIns: [], setCheckIns: vi.fn(), readings: [], isLoading: false }),
}));
vi.mock("../../shared/hooks/useCurrencyConverter", () => ({
  useCurrencyConverter: () => ({ format: (n: number) => `€${n.toFixed(2)}`, convert: (n: number) => n, convertToBase: (n: number) => n, baseCurrency: "EUR", displayCurrency: "EUR" }),
}));
vi.mock("../transactions/hooks/usePayees", () => ({ usePayees: () => ({ payees: ["Lidl"] }) }));
vi.mock("../transactions/hooks/useTransactions", () => ({ useTransactions: () => ({ data: [] }) }));
const groceries = { id: "food", name: "Groceries", icon: "🛒", type: "expense", isDefault: true, userId: null } as unknown as Category;
vi.mock("../categories/CategoryPicker", () => ({
  default: ({ onChange }: { onChange: (id: string, c: Category) => void }) => (
    <button type="button" onClick={() => onChange(groceries.id, groceries)}>
      pick groceries
    </button>
  ),
}));
// The payee field is its own component, tested on its own: a plain input here.
vi.mock("../transactions/components/PayeeInput", () => ({
  PayeeInput: ({ value, onChange }: { value: string; onChange: (v: string) => void }) => <input aria-label="Payee" value={value} onChange={(e) => onChange(e.target.value)} />,
}));
const repay = vi.hoisted(() => vi.fn());
vi.mock("../debts/useDebts", () => ({ useRecordRepayment: () => ({ mutate: repay, mutateAsync: async (...args: unknown[]) => (repay(...(args as [never])), undefined), isPending: false }) }));

const OUT = "Choose where the money came from: a card or cash.";
const IN = "Choose where the money went: a card or cash.";

beforeAll(async () => {
  window.matchMedia ??= ((query: string) => ({ matches: false, media: query, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, onchange: null, dispatchEvent: () => false })) as unknown as typeof window.matchMedia;
  await i18n.changeLanguage("en");
});

const pressed = (root: HTMLElement) => within(root).queryAllByRole("button", { pressed: true });

describe("a new transaction", () => {
  it("asks where the money came from, chooses nothing, and will not go on without an answer", async () => {
    places.accounts = [
      { id: "eb", name: "Eurobank", kind: "bank", main: true },
      { id: "rev", name: "Revolut", kind: "bank" },
    ];
    const onSubmit = vi.fn(async () => {});
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <AddTransactionModal isOpen onClose={() => {}} categories={[groceries]} onSubmit={onSubmit} />
      </MemoryRouter>,
    );
    const dialog = screen.getByRole("dialog");
    await user.click(within(dialog).getByRole("button", { name: /^Expense/ }));
    await user.click(within(dialog).getByRole("button", { name: "pick groceries" }));

    expect(within(dialog).getByText("Where did the money come from?")).toBeInTheDocument();
    expect(pressed(dialog)).toHaveLength(0);
    expect(within(dialog).queryByText(/No particular card/)).toBeNull();
    // No red before anything was pressed.
    expect(within(dialog).queryByText(OUT)).toBeNull();

    await user.click(within(dialog).getByRole("button", { name: "Next" }));
    expect(within(dialog).getByText(OUT)).toBeInTheDocument();
    expect(within(dialog).queryByRole("spinbutton")).toBeNull();

    await user.click(within(dialog).getByRole("button", { name: "Revolut" }));
    await user.type(within(dialog).getByRole("spinbutton"), "12");
    await user.type(within(dialog).getByLabelText("Payee"), "Lidl");
    await user.click(within(dialog).getByRole("button", { name: i18n.t("transactions.reviewBtn") }));
    // The review names the card.
    expect(dialog).toHaveTextContent(/Paid from\s*Revolut/);
    await user.click(within(dialog).getByRole("button", { name: i18n.t("transactions.confirmAndSave") }));
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ amount: 12, accountId: "rev" }));
  });

  it("with only cash, cash is chosen and shown — there is nothing to decide", async () => {
    places.accounts = [{ id: "cash", name: "Cash", kind: "cash" }];
    const onSubmit = vi.fn(async () => {});
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <AddTransactionModal isOpen onClose={() => {}} categories={[groceries]} onSubmit={onSubmit} />
      </MemoryRouter>,
    );
    const dialog = screen.getByRole("dialog");
    await user.click(within(dialog).getByRole("button", { name: /^Expense/ }));
    await user.click(within(dialog).getByRole("button", { name: "pick groceries" }));
    expect(within(dialog).getByRole("button", { name: "Cash", pressed: true })).toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: "Next" }));
    await user.type(within(dialog).getByRole("spinbutton"), "5");
    await user.type(within(dialog).getByLabelText("Payee"), "Kiosk");
    await user.click(within(dialog).getByRole("button", { name: i18n.t("transactions.reviewBtn") }));
    await user.click(within(dialog).getByRole("button", { name: i18n.t("transactions.confirmAndSave") }));
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ amount: 5, accountId: "cash" }));
  });
});

describe("editing an old transaction that names no card", () => {
  it("shows the picker empty and asks for one before it can be saved", async () => {
    places.accounts = [
      { id: "eb", name: "Eurobank", kind: "bank", main: true },
      { id: "rev", name: "Revolut", kind: "bank" },
    ];
    const when = new Date(2026, 9, 14);
    const old = { id: "t-old", userId: "u", amount: 40, type: "expense", categoryId: "food", date: when, description: "Lidl", createdAt: when, updatedAt: when } as Transaction;
    const onSubmit = vi.fn<(id: string, data: UpdateTransactionDTO) => Promise<void>>(async () => {});
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <EditTransactionModal transaction={old} isOpen onClose={() => {}} categories={[groceries]} onSubmit={onSubmit} />
      </MemoryRouter>,
    );
    const dialog = screen.getByRole("dialog");
    await user.click(within(dialog).getByRole("button", { name: "Next" }));
    // Not the main account, not anything: empty.
    expect(pressed(dialog)).toHaveLength(0);
    expect(within(dialog).queryByText(OUT)).toBeNull();
    await user.click(within(dialog).getByRole("button", { name: "Next" }));
    expect(within(dialog).getByText(OUT)).toBeInTheDocument();

    await user.click(within(dialog).getByRole("button", { name: "Eurobank" }));
    await user.click(within(dialog).getByRole("button", { name: i18n.t("transactions.reviewChanges") }));
    await user.click(within(dialog).getByRole("button", { name: i18n.t("transactions.confirmAndSave") }));
    const [, data] = onSubmit.mock.calls[0];
    expect(data.accountId).toBe("eb");
    // Nothing else of it moved.
    expect(data.amount).toBe(40);
  });
});

describe("paying a bill", () => {
  const BILL: Bill = {
    id: "water",
    userId: "u1",
    name: "Water",
    amount: 60,
    categoryId: "utilities",
    frequency: "monthly",
    dueDay: 10,
    isActive: true,
    anchorDate: new Date(2026, 0, 5),
    createdAt: new Date(2026, 0, 5),
    updatedAt: new Date(2026, 0, 5),
  };

  it("asks the card on its own step, never assumed, and writes the one chosen", async () => {
    places.accounts = [
      { id: "eb", name: "Eurobank", kind: "bank", main: true },
      { id: "rev", name: "Revolut", kind: "bank" },
    ];
    const onConfirm = vi.fn();
    const user = userEvent.setup();
    render(<MarkPaidModal bill={computeBillStatus(BILL, [], new Date())} isSaving={false} onClose={() => {}} onConfirm={onConfirm} />);
    const dialog = screen.getByRole("dialog");
    // WHERE before HOW MUCH: the card is the first step.
    expect(within(dialog).getByText("Where did the money come from?")).toBeInTheDocument();
    expect(pressed(dialog)).toHaveLength(0);
    expect(within(dialog).queryByText(OUT)).toBeNull();
    await user.click(within(dialog).getByRole("button", { name: /Next/ }));
    expect(within(dialog).getByText(OUT)).toBeInTheDocument();
    expect(within(dialog).queryByRole("button", { name: "Mark as paid" })).toBeNull();

    await user.click(within(dialog).getByRole("button", { name: "Revolut" }));
    // Then the amount, then the day.
    await user.click(within(dialog).getByRole("button", { name: /Next/ }));
    expect(within(dialog).getByRole("spinbutton")).toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: /Next/ }));
    await user.click(within(dialog).getByRole("button", { name: /Next/ }));
    expect(within(dialog).getByRole("group", { name: "What will happen" })).toHaveTextContent("Revolut");
    await user.click(within(dialog).getByRole("button", { name: "Mark as paid" }));
    expect(onConfirm.mock.calls[0][4]).toBe("rev");
  });
});

describe("an income that arrived", () => {
  const day = new Date(2026, 9, 1);
  const income = { id: "sal", name: "Salary", kind: "salary", amount: 1200, frequency: "monthly", day: 1, start: "2026-01" } as unknown as Income;
  const status = {
    key: "income:sal:2026-10-01",
    incomeId: "sal",
    date: day,
    due: "2026-10-01",
    forMonth: "2026-10",
    amount: 1200,
    state: "due",
    expected: 1200,
    expectedDate: day,
    approximate: false,
    overridden: false,
    canArrive: true,
  } as unknown as IncomeStatus;
  const sheet = (inc: Income, onConfirm = vi.fn()) =>
    render(<ArrivedSheet income={inc} status={status} options={[status]} expected={{ amount: 1200, estimated: false, recent: [] }} accounts={places.accounts} f={makeFormats("en")} onConfirm={onConfirm} onClose={() => {}} />);

  it("does not put it on the main account by itself: Next without a place says so", async () => {
    places.accounts = [
      { id: "eb", name: "Eurobank", kind: "bank", main: true },
      { id: "rev", name: "Revolut", kind: "bank" },
    ];
    const onConfirm = vi.fn();
    const user = userEvent.setup();
    sheet(income, onConfirm);
    const dialog = screen.getByRole("dialog");
    // WHERE before HOW MUCH: the account it came into is asked above the amount.
    const where = within(dialog).getByRole("radiogroup", { name: i18n.t("incomes.arrived.where") });
    expect(where.compareDocumentPosition(within(dialog).getByRole("spinbutton")) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    // Neither place is ticked.
    expect(within(dialog).queryAllByRole("radio", { checked: true })).toHaveLength(0);
    expect(within(dialog).queryByText(IN)).toBeNull();
    await user.click(within(dialog).getByRole("button", { name: /Next/ }));
    expect(within(dialog).getByText(IN)).toBeInTheDocument();
    await user.click(within(dialog).getByRole("radio", { name: "Revolut" }));
    await user.click(within(dialog).getByRole("button", { name: /Next/ }));
    expect(dialog).toHaveTextContent("Revolut");
    await user.click(within(dialog).getByRole("button", { name: /^Record/ }));
    expect(onConfirm).toHaveBeenCalledWith(status, expect.objectContaining({ amount: 1200, accountId: "rev" }));
  });

  it("starts on the account the income itself names — the owner's own answer, not a default", () => {
    sheet({ ...income, accountId: "rev" } as Income);
    expect(screen.getByRole("radio", { name: "Revolut" })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("radio", { name: "Eurobank" })).toHaveAttribute("aria-checked", "false");
  });
});

describe("a repayment", () => {
  it("starts unanswered — not even on the card the debt went through: «Yes», then a card must be chosen", async () => {
    places.accounts = [
      { id: "eb", name: "Eurobank", kind: "bank", main: true },
      { id: "rev", name: "Revolut", kind: "bank" },
    ];
    repay.mockClear();
    const debt = { id: "d1", person: "Nikos", direction: "owed_by_me", amount: 100, remaining: 100, paid: 0, accountId: "eb", date: new Date(2026, 8, 1), payments: [], isSettled: false } as unknown as DebtWithStatus;
    const user = userEvent.setup();
    render(<RepaymentWizard debt={debt} suggested={100} formatCurrency={(n) => `€${n.toFixed(2)}`} onClose={() => {}} />);
    const dialog = screen.getByRole("dialog");
    // WHERE before HOW MUCH: did money move, and through which card, is the first step.
    // Neither tile chosen, no card list yet, no error.
    expect(within(dialog).queryAllByRole("radio", { checked: true })).toHaveLength(0);
    expect(within(dialog).queryByRole("button", { name: "Eurobank" })).toBeNull();
    await user.click(within(dialog).getByRole("button", { name: /Next/ }));
    expect(within(dialog).getByText("Pick Yes or No")).toBeInTheDocument();
    await user.click(within(dialog).getByRole("radio", { name: /^Yes,/ }));
    expect(within(dialog).getByRole("button", { name: "Eurobank" })).toHaveAttribute("aria-pressed", "false");
    expect(within(dialog).queryByText(OUT)).toBeNull();
    await user.click(within(dialog).getByRole("button", { name: /Next/ }));
    expect(within(dialog).getByText(OUT)).toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: "Revolut" }));
    // Then the amount (100 suggested) and the day, then the check.
    await user.click(within(dialog).getByRole("button", { name: /Next/ }));
    expect(within(dialog).getByRole("spinbutton")).toHaveValue(100);
    await user.click(within(dialog).getByRole("button", { name: /Next/ }));
    await user.click(within(dialog).getByRole("button", { name: /Next/ }));
    await user.click(within(dialog).getByRole("button", { name: "Save" }));
    expect(repay).toHaveBeenCalledWith(expect.objectContaining({ amount: 100, accountId: "rev" }));
  });
});
