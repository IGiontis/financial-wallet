import { describe, it, expect, vi, beforeAll, beforeEach, afterAll } from "vitest";
import { render, screen, within, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import i18n from "../../i18n";
import type { Category, Transaction } from "../../shared/types/IndexTypes";
import type { Income } from "./incomesUtils";
import IncomesPage from "./IncomesPage";

// The page against the real hooks, with only Firestore and the signed-in user
// stood in for. What these pin down is what leaves the page: the transaction
// «Ήρθε» writes, and the words it keeps — because that is what every other
// screen will read back.

const NOW = new Date(2026, 8, 30, 10, 0); // Wednesday 30 September 2026

const api = vi.hoisted(() => ({
  user: { workspace: {} as Record<string, unknown>, baseCurrency: "EUR", currency: "EUR" },
  transactions: [] as unknown[],
  categories: [] as unknown[],
  createTransaction: vi.fn(),
  deleteTransaction: vi.fn(),
  saveWorkspaceValue: vi.fn(),
  ids: 0,
}));

vi.mock("../../firebase/firestore", () => ({
  getUser: () => Promise.resolve(api.user),
  saveWorkspaceValue: (...args: unknown[]) => {
    api.saveWorkspaceValue(...args);
    return Promise.resolve();
  },
  getTransactions: () => Promise.resolve(api.transactions),
  getCategories: () => Promise.resolve(api.categories),
  createTransaction: (...args: unknown[]) => {
    api.createTransaction(...args);
    return Promise.resolve(args[2]);
  },
  newDocId: () => `new-${++api.ids}`,
  deleteTransaction: (...args: unknown[]) => {
    api.deleteTransaction(...args);
    return Promise.resolve();
  },
  updateTransaction: () => Promise.resolve(),
  createCategories: () => Promise.resolve({}),
}));
vi.mock("../../shared/hooks/useAuth", () => ({ useAuth: () => ({ currentUser: { uid: "u1" } }) }));

const d = (m: number, day: number) => new Date(2026, m - 1, day);
let seq = 0;
const tx = (amount: number, date: Date, extra: Partial<Transaction> = {}) =>
  ({ id: `t${++seq}`, userId: "u1", amount, type: "income", categoryId: "c-other", date, description: "", createdAt: date, updatedAt: date, ...extra }) as Transaction;

const incomes: Income[] = [
  { id: "sal", name: "Μισθός", kind: "salary", amount: 1450, frequency: "monthly", day: 30, start: "2025-09", isSalary: true, categoryId: "c-salary", accountId: "eurobank" },
  { id: "rent", name: "Ενοίκιο που εισπράττω", kind: "rent", amount: 400, frequency: "monthly", day: 5, start: "2025-09", accountId: "revolut" },
  { id: "allow", name: "Επίδομα", kind: "allowance", amount: 70, frequency: "monthly", day: 20, start: "2025-09" },
  { id: "tut", name: "Ιδιαίτερα μαθήματα", kind: "work", amount: 300, variable: true, frequency: "monthly", day: 28, start: "2025-09", pause: { from: "2026-07", to: "2026-08", yearly: true }, categoryId: "c-free", accountId: "cash" },
];
const salaryRecord = tx(1450, d(9, 25), { incomeId: "sal", incomeDue: "2026-09-30", categoryId: "c-salary" });
const others = [
  tx(400, d(9, 5), { incomeId: "rent", incomeDue: "2026-09-05" }),
  tx(70, d(9, 21), { incomeId: "allow", incomeDue: "2026-09-20" }),
  tx(320, d(4, 28), { incomeId: "tut", incomeDue: "2026-04-28", categoryId: "c-free" }),
  tx(340, d(5, 28), { incomeId: "tut", incomeDue: "2026-05-28", categoryId: "c-free" }),
  tx(300, d(6, 29), { incomeId: "tut", incomeDue: "2026-06-28", categoryId: "c-free" }),
];
const accounts = [
  { id: "eurobank", name: "Eurobank", kind: "bank", main: true },
  { id: "revolut", name: "Revolut", kind: "bank" },
  { id: "cash", name: "Μετρητά", kind: "cash" },
];
const categories = [
  { id: "c-salary", name: "Salary", type: "income" },
  { id: "c-free", name: "Freelance", type: "income" },
  { id: "c-other", name: "Other Income", type: "income" },
] as Category[];

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <IncomesPage />
    </QueryClientProvider>,
  );
}

/** The amount the page prints, Greek style, whatever space Intl puts before the €. */
const money = (text: string) => new RegExp(`^${text.replace(".", "\\.")}\\s?€$`);

beforeAll(async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
  window.matchMedia = ((query: string) => ({ matches: false, media: query, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, onchange: null, dispatchEvent: () => false })) as unknown as typeof window.matchMedia;
  await i18n.changeLanguage("el");
});

afterAll(() => {
  vi.useRealTimers();
});

beforeEach(() => {
  localStorage.clear();
  api.createTransaction.mockClear();
  api.deleteTransaction.mockClear();
  api.saveWorkspaceValue.mockClear();
  api.categories = categories;
  api.transactions = [salaryRecord, ...others];
  api.user = { workspace: { incomes, "money-accounts": accounts }, baseCurrency: "EUR", currency: "EUR" };
});

describe("the Incomes page", () => {
  it("shows September as the design has it: 1.920 of ≈2.240, the lessons late", async () => {
    renderPage();
    const card = await screen.findByRole("region", { name: /Σεπτέμβριος · ήρθαν/ });
    expect(within(card).getByText(money("1.920,00"))).toBeInTheDocument();
    expect(within(card).getByText(/από ≈2\.240,00/)).toBeInTheDocument();
    expect(within(card).getByText(/λείπουν ≈320,00/)).toBeInTheDocument();

    const waiting = screen.getByRole("region", { name: "Περιμένεις" });
    expect(within(waiting).getByText("Ιδιαίτερα μαθήματα")).toBeInTheDocument();
    expect(within(waiting).getByText("αργεί 2 μέρες")).toBeInTheDocument();
    const arrived = screen.getByRole("region", { name: "Ήρθαν" });
    expect(within(arrived).getByText("✓ 25/9 · 5 μέρες νωρίς")).toBeInTheDocument();
  });

  it("writes «Ήρθε» as an income transaction tied to the lessons of 28 September", async () => {
    renderPage();
    await userEvent.click(await screen.findByRole("button", { name: "Ήρθε: Ιδιαίτερα μαθήματα" }));

    const sheet = await screen.findByRole("dialog");
    const amount = within(sheet).getByLabelText(/Πόσα ήρθαν/);
    // The mean of the last three, (320 + 340 + 300) / 3.
    expect(amount).toHaveValue(320);
    expect(within(sheet).getByRole("radio", { name: /Μετρητά/ })).toHaveAttribute("aria-checked", "true");
    expect(within(sheet).getByRole("radio", { name: "Σεπ" })).toHaveAttribute("aria-checked", "true");

    await userEvent.clear(amount);
    await userEvent.type(amount, "330");
    await userEvent.click(within(sheet).getByRole("button", { name: /Καταχώριση/ }));

    expect(api.createTransaction).toHaveBeenCalledTimes(1);
    const [userId, data] = api.createTransaction.mock.calls[0];
    expect(userId).toBe("u1");
    expect(data).toEqual({
      amount: 330,
      type: "income",
      categoryId: "c-free",
      date: new Date(2026, 8, 30),
      description: "Ιδιαίτερα μαθήματα",
      incomeId: "tut",
      incomeDue: "2026-09-28",
      accountId: "cash",
    });

    // On screen at once: the month is complete, at the amount that came.
    const card = screen.getByRole("region", { name: /Σεπτέμβριος · ήρθαν/ });
    await waitFor(() => expect(within(card).getByText(money("2.250,00"))).toBeInTheDocument());
    expect(within(card).getByText("ήρθαν όλα")).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Περιμένεις" })).not.toBeInTheDocument();
  });

  it("asks about the bank when the salary is unrecorded but a reading may hold it, and «Ναι» dates it on the reading", async () => {
    api.transactions = others;
    api.user.workspace["balance-check-ins"] = [{ id: "r1", at: new Date(2026, 8, 28, 20, 0).toISOString(), amounts: { eurobank: 3000 } }];
    renderPage();

    const question = await screen.findByRole("group", { name: "Μισθός: ήταν ήδη στην τράπεζα;" });
    await userEvent.click(within(question).getByRole("button", { name: "Ναι, ήταν μέσα" }));
    const sheet = await screen.findByRole("dialog");
    expect(within(sheet).getByText(/Μπαίνει πριν από την ενημέρωση/)).toBeInTheDocument();
    await userEvent.click(within(sheet).getByRole("button", { name: /Καταχώριση/ }));

    const [, data] = api.createTransaction.mock.calls[0];
    // No later than the reading's day — and on that day, so marked as inside it.
    expect(data).toMatchObject({ amount: 1450, date: new Date(2026, 8, 28), incomeId: "sal", incomeDue: "2026-09-30", accountId: "eurobank", inReading: true, categoryId: "c-salary" });
  });

  it("keeps «Όχι ακόμα» as the Planner's «περίμενε», and stops asking", async () => {
    api.transactions = others;
    api.user.workspace["balance-check-ins"] = [{ id: "r1", at: new Date(2026, 8, 28, 20, 0).toISOString(), amounts: { eurobank: 3000 } }];
    renderPage();

    const question = await screen.findByRole("group", { name: "Μισθός: ήταν ήδη στην τράπεζα;" });
    await userEvent.click(within(question).getByRole("button", { name: "Όχι ακόμα" }));

    expect(screen.queryByRole("group", { name: "Μισθός: ήταν ήδη στην τράπεζα;" })).not.toBeInTheDocument();
    // Due today, so «Ήρθε» is offered on it instead.
    expect(screen.getByRole("button", { name: "Ήρθε: Μισθός" })).toBeInTheDocument();
    await waitFor(() => expect(api.saveWorkspaceValue).toHaveBeenCalledWith("u1", "planner-occurrences", { "income:sal:2026-09-30": { state: "waiting" } }), { timeout: 2000 });
    expect(api.createTransaction).not.toHaveBeenCalled();
  });
});

describe("what cannot be taken back asks first", () => {
  it("deletes an income from its ⋮ only after a yes, and «Ακύρωση» keeps it", async () => {
    renderPage();
    const openMenu = async () => userEvent.click(await screen.findByRole("button", { name: "Επίδομα: ενέργειες" }));

    await openMenu();
    await userEvent.click(screen.getByRole("menuitem", { name: "Διαγραφή" }));
    let sheet = await screen.findByRole("dialog");
    expect(within(sheet).getByText("Σίγουρα θες να διαγράψεις το «Επίδομα»;")).toBeInTheDocument();
    await userEvent.click(within(sheet).getByRole("button", { name: "Ακύρωση" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Επίδομα: λεπτομέρειες" })).toBeInTheDocument();

    await openMenu();
    await userEvent.click(screen.getByRole("menuitem", { name: "Διαγραφή" }));
    sheet = await screen.findByRole("dialog");
    await userEvent.click(within(sheet).getByRole("button", { name: "Διαγραφή" }));
    await waitFor(() => expect(screen.queryByRole("button", { name: "Επίδομα: λεπτομέρειες" })).not.toBeInTheDocument());
    await waitFor(
      () =>
        expect(api.saveWorkspaceValue).toHaveBeenCalledWith(
          "u1",
          "incomes",
          incomes.filter((i) => i.id !== "allow"),
        ),
      { timeout: 2000 },
    );
  });

  it("undoes an «Ήρθε» — deleting its transaction — only after a yes, and goes back to the card either way", async () => {
    renderPage();
    await userEvent.click(await screen.findByRole("button", { name: "Μισθός: λεπτομέρειες" }));
    const undo = () => within(screen.getByRole("dialog")).getByRole("button", { name: /^Αναίρεση της καταχώρισης της .*25\/9$/ });

    await userEvent.click(undo());
    let sheet = screen.getByRole("dialog");
    expect(within(sheet).getByRole("heading", { name: "Αναίρεση του «Ήρθε»" })).toBeInTheDocument();
    expect(within(sheet).getByText(/Θα σβηστεί η συναλλαγή των 1\.450,00\s?€/)).toBeInTheDocument();
    await userEvent.click(within(sheet).getByRole("button", { name: "Ακύρωση" }));
    expect(api.deleteTransaction).not.toHaveBeenCalled();
    // The card again, the record still on it.
    expect(undo()).toBeInTheDocument();

    await userEvent.click(undo());
    sheet = screen.getByRole("dialog");
    await userEvent.click(within(sheet).getByRole("button", { name: "Αναίρεση" }));
    await waitFor(() => expect(api.deleteTransaction).toHaveBeenCalledTimes(1));
    expect(api.deleteTransaction.mock.calls[0][0]).toBe(salaryRecord.id);
    // Back on the card, and the record is gone from it.
    await waitFor(() => expect(within(screen.getByRole("dialog")).getByRole("button", { name: "Επεξεργασία" })).toBeInTheDocument());
    await waitFor(() => expect(within(screen.getByRole("dialog")).queryByRole("button", { name: /^Αναίρεση της καταχώρισης/ })).not.toBeInTheDocument());
  });
});

describe("an empty page", () => {
  const found = [d(5, 29), d(6, 30), d(7, 30), d(8, 31), d(9, 25)].map((date) => tx(1450, date, { categoryId: "c-salary" }));

  beforeEach(() => {
    api.transactions = found;
    api.user = { workspace: { "money-accounts": accounts }, baseCurrency: "EUR", currency: "EUR" };
  });

  it("offers the salary found in the records and opens the form filled in, saving nothing on its own", async () => {
    renderPage();
    expect(await screen.findByText(/Μισθός 1\.450,00\s?€ γύρω στις 30/)).toBeInTheDocument();
    expect(screen.getByText(/5 μήνες στη σειρά/)).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Πρόσθεσέ τον" }));
    const sheet = await screen.findByRole("dialog");
    expect(within(sheet).getByLabelText(/Όνομα/)).toHaveValue("Μισθός");
    expect(within(sheet).getByLabelText(/Ποσό/)).toHaveValue(1450);
    expect(api.saveWorkspaceValue).not.toHaveBeenCalledWith("u1", "incomes", expect.anything());
  });

  it("remembers «Όχι» for that salary", async () => {
    renderPage();
    await userEvent.click(await screen.findByRole("button", { name: "Όχι" }));
    expect(screen.queryByText(/γύρω στις 30/)).not.toBeInTheDocument();
    await waitFor(() => expect(api.saveWorkspaceValue).toHaveBeenCalledWith("u1", "incomes-declined-salary", ["1450@30"]), { timeout: 2000 });
    expect(api.saveWorkspaceValue).not.toHaveBeenCalledWith("u1", "incomes", expect.anything());
  });
});
