import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from "vitest";
import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import i18n from "../../i18n";
import PersonDebtsModal from "./PersonDebtsModal";
import { computeDebtStatus, debtsByPerson, loanSplits, loanState } from "./debtsUtils";
import type { Debt, DebtPayment } from "../../shared/types/IndexTypes";

// One person's loans, one loan in front at a time.
//
// What is checked is what can go wrong with money on this sheet: the right loan
// in front, payments newest first with the loan's own split of each one, a
// payment button that fills in the figure actually due, a correction that
// writes what was typed, a delete that only happens once a payment has been
// opened, and a delete that cannot happen offline.

const spies = vi.hoisted(() => ({
  record: vi.fn(),
  update: vi.fn(),
  remove: vi.fn(),
  removeDebt: vi.fn(),
  editDebt: vi.fn(),
  createDebt: vi.fn(),
}));

vi.mock("./useDebts", () => ({
  useRecordRepayment: () => ({ mutate: spies.record, isPending: false }),
  useUpdateRepayment: () => ({ mutate: spies.update, isPending: false }),
  useDeleteRepayment: () => ({ mutate: spies.remove, isPending: false }),
  useDeleteDebt: () => ({ mutate: spies.removeDebt, isPending: false }),
  useUpdateDebt: () => ({ mutate: vi.fn(), isPending: false }),
  useEditDebt: () => ({ mutate: spies.editDebt, isPending: false }),
  useCreateDebt: () => ({ mutate: spies.createDebt, isPending: false }),
}));
vi.mock("../../shared/hooks/useCurrencyConverter", () => ({
  useCurrencyConverter: () => ({ baseCurrency: "EUR", format: (n: number) => `€${n.toFixed(2)}` }),
}));

const fmt = (n: number) => `€${n.toFixed(2)}`;
const pay = (id: string, debtId: string, amount: number, date: Date): DebtPayment => ({ id, userId: "u1", debtId, amount, date, createdAt: date });

const rent: Debt = {
  id: "rent",
  userId: "u1",
  person: "Nikos",
  direction: "owed_by_me",
  label: "March rent",
  amount: 500,
  date: new Date(2026, 2, 3),
  createdAt: new Date(2026, 2, 3),
  updatedAt: new Date(2026, 2, 3),
};

const car: Debt = {
  id: "car",
  userId: "u1",
  person: "Nikos",
  direction: "owed_by_me",
  label: "Car",
  amount: 6000,
  date: new Date(2026, 0, 10),
  interestRate: 7,
  termMonths: 36,
  createdAt: new Date(2026, 0, 10),
  updatedAt: new Date(2026, 0, 10),
};

// Settled, and the newest of the three: left to the list, it would open the sheet.
const concert: Debt = { ...rent, id: "concert", label: "Concert tickets", amount: 60, date: new Date(2026, 5, 1) };

// Stored newest first, the way the query hands them over.
const payments: DebtPayment[] = [
  pay("r2", "rent", 80, new Date(2026, 4, 2)),
  pay("r1", "rent", 120, new Date(2026, 3, 10)),
  pay("c3", "car", 185.26, new Date(2026, 3, 10)),
  pay("c2", "car", 185.26, new Date(2026, 2, 10)),
  pay("c1", "car", 185.26, new Date(2026, 1, 10)),
  pay("t1", "concert", 60, new Date(2026, 5, 20)),
];

const nikos = (debts: Debt[] = [concert, car, rent]) => debtsByPerson(debts.map((d) => computeDebtStatus(d, payments)))[0];

const renderSheet = (debts?: Debt[]) => render(<PersonDebtsModal person={nikos(debts)} formatCurrency={fmt} locale="en" knownPeople={["Nikos", "Maria"]} onClose={() => {}} />);

/** The sheet's own dialog — reactstrap does not name it after its header. */
const sheet = () => screen.getAllByRole("dialog").find((d) => within(d).queryByRole("group", { name: "Loans" }) || within(d).queryByRole("tablist"))!;
const payRows = () => within(screen.getByRole("list", { name: "Payments" })).getAllByRole("listitem").map((row) => row.textContent ?? "");

beforeAll(async () => {
  // jsdom has no matchMedia; the name field asks it whether the screen is narrow.
  window.matchMedia = ((query: string) => ({ matches: false, media: query, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, onchange: null, dispatchEvent: () => false })) as unknown as typeof window.matchMedia;
  await i18n.changeLanguage("en");
});

beforeEach(() => {
  Object.values(spies).forEach((spy) => spy.mockReset());
});

afterEach(() => {
  Object.defineProperty(navigator, "onLine", { value: true, configurable: true });
});

describe("which loan is in front", () => {
  it("opens on one still owed, with the paid-off one last", () => {
    renderSheet();
    const chips = within(screen.getByRole("group", { name: "Loans" })).getAllByRole("button");

    // Open ones in the list's own order (newest first), the settled one after
    // them even though it is the newest of all.
    expect(chips.map((c) => c.textContent)).toEqual([expect.stringMatching(/^March rent/), expect.stringMatching(/^Car/), expect.stringMatching(/^Concert tickets.*Settled/)]);
    expect(chips[0]).toHaveAttribute("aria-pressed", "true");
  });

  it("swaps the whole sheet to the loan picked", async () => {
    renderSheet();
    const dialog = sheet();
    // Second route: 500 − 120 − 80.
    expect(500 - 120 - 80).toBe(300);
    expect(within(dialog).getByText("Left to pay back").nextSibling).toHaveTextContent("€300.00");
    expect(within(dialog).getByText("of €500.00 · no interest")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /^Car/ }));

    expect(within(dialog).getByText("of €6000.00 · 7% fixed")).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Pay €185.26" })).toBeInTheDocument();
  });

  it("shows no chips for a single loan", () => {
    renderSheet([rent]);

    expect(screen.queryByRole("group", { name: "Loans" })).not.toBeInTheDocument();
    expect(screen.getByText("March rent")).toBeInTheDocument();
  });
});

describe("the payments tab", () => {
  it("lists payments newest first and ends where the loan began", async () => {
    renderSheet([rent]);

    const rows = payRows();
    expect(rows[0]).toMatch(/May 2.*€80\.00/);
    expect(rows[1]).toMatch(/Apr 10.*€120\.00/);
    expect(rows[2]).toMatch(/You took.*€500\.00/);
  });

  it("splits a loan payment into what came off the debt and the interest, as the loan maths does", () => {
    renderSheet([car]);
    const debt = nikos([car]).debts[0];
    const split = loanSplits(debt)!.get("c3")!;

    // The newest payment, read off the screen and off the maths separately.
    expect(payRows()[0]).toContain(`${fmt(split.principal)} off the debt · ${fmt(split.interest)} interest`);
    expect(Math.round((split.principal + split.interest) * 100)).toBe(18526);
  });

  it("does not split money between people, which carries no interest", () => {
    renderSheet([rent]);

    expect(payRows().join(" ")).not.toMatch(/interest/);
  });
});

describe("recording a payment", () => {
  it("offers the month's payment on a loan, and fills it in", async () => {
    renderSheet([car]);
    const instalment = loanState(nikos([car]).debts[0])!.instalment;
    expect(instalment).toBe(185.26);

    await userEvent.click(screen.getByRole("button", { name: "Pay €185.26" }));
    expect(screen.getByLabelText("Amount")).toHaveValue(185.26);
    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(spies.record).toHaveBeenCalledWith(expect.objectContaining({ debtId: "car", amount: 185.26 }), expect.anything());
  });

  it("offers what is left between people, dated today", async () => {
    renderSheet([rent]);

    await userEvent.click(screen.getByRole("button", { name: "Payment" }));
    expect(screen.getByLabelText("Amount")).toHaveValue(300);
    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    const [vars] = spies.record.mock.calls[0];
    expect(vars).toMatchObject({ debtId: "rent", amount: 300 });
    const now = new Date();
    expect([vars.date.getFullYear(), vars.date.getMonth(), vars.date.getDate()]).toEqual([now.getFullYear(), now.getMonth(), now.getDate()]);
  });

  it("has nothing to pay on a loan already settled", () => {
    renderSheet([concert]);

    expect(screen.queryByRole("button", { name: /^Pay|^Payment/ })).not.toBeInTheDocument();
  });
});

describe("correcting a payment", () => {
  it("opens with the payment's own figure and day", async () => {
    renderSheet([rent]);

    await userEvent.click(screen.getByRole("button", { name: /May 2.*€80\.00/ }));

    expect(screen.getByLabelText("Amount")).toHaveValue(80);
    // The app's calendar field, showing the payment's own day.
    expect(screen.getByLabelText("When")).toHaveTextContent("02 May 2026");
  });

  it("saves the figure and the day that were typed", async () => {
    renderSheet([rent]);
    await userEvent.click(screen.getByRole("button", { name: /May 2.*€80\.00/ }));

    const amount = screen.getByLabelText("Amount");
    await userEvent.clear(amount);
    await userEvent.type(amount, "90");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    const [vars] = spies.update.mock.calls[0];
    expect(vars).toMatchObject({ paymentId: "r2", amount: 90 });
    // The local calendar day — 2 May, not 1 May at 21:00 UTC.
    expect([vars.date.getFullYear(), vars.date.getMonth(), vars.date.getDate()]).toEqual([2026, 4, 2]);
    expect(spies.record).not.toHaveBeenCalled();
  });

  it("refuses a zero", async () => {
    renderSheet([rent]);
    await userEvent.click(screen.getByRole("button", { name: /May 2.*€80\.00/ }));

    const amount = screen.getByLabelText("Amount");
    await userEvent.clear(amount);
    await userEvent.type(amount, "0");

    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
  });

  it("deletes only from inside the opened payment", async () => {
    renderSheet([rent]);
    expect(screen.queryByRole("button", { name: "Delete" })).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /Apr 10.*€120\.00/ }));
    await userEvent.click(screen.getByRole("button", { name: "Delete" }));

    expect(spies.remove).toHaveBeenCalledWith("r1", expect.anything());
  });
});

describe("the other tabs", () => {
  it("asks 'what if' only of a loan, where paying more changes something", async () => {
    renderSheet([rent]);
    expect(screen.queryByRole("tab", { name: "What if…" })).not.toBeInTheDocument();
  });

  it("opens the pay-more question on a loan", async () => {
    renderSheet([car]);

    await userEvent.click(screen.getByRole("tab", { name: "What if…" }));

    expect(screen.getByText("Pay extra each month")).toBeInTheDocument();
  });

  it("opens the loan form filled in, to correct the loan", async () => {
    renderSheet([rent]);

    await userEvent.click(screen.getByRole("tab", { name: "Details" }));
    await userEvent.click(screen.getByRole("button", { name: /Edit loan/ }));

    await screen.findAllByText("Edit loan");
    const form = screen.getAllByRole("dialog").find((d) => within(d).queryByDisplayValue("March rent"))!;
    expect(within(form).getByPlaceholderText("0")).toHaveValue(500);
  });

  it("will not delete a loan offline", async () => {
    renderSheet([rent]);
    await userEvent.click(screen.getByRole("tab", { name: "Details" }));

    Object.defineProperty(navigator, "onLine", { value: false, configurable: true });
    act(() => {
      window.dispatchEvent(new Event("offline"));
    });

    expect(screen.getByRole("button", { name: /Delete loan/ })).toBeDisabled();
  });
});

describe("a new loan from the sheet", () => {
  it("starts it with the same person", async () => {
    renderSheet([rent]);

    await userEvent.click(screen.getByRole("button", { name: "New loan" }));

    await screen.findByText("Record a loan");
    expect(screen.getByDisplayValue("Nikos")).toBeInTheDocument();
  });
});
