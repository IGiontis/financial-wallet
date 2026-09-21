import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from "vitest";
import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import i18n from "../../i18n";
import PersonDebtsModal from "./PersonDebtsModal";
import { computeDebtStatus, debtsByPerson } from "./debtsUtils";
import type { Debt, DebtPayment } from "../../shared/types/IndexTypes";

// One person's loans, as a line through time.
//
// What is checked here is what can go wrong with money on this screen: the
// history in the order it happened and adding up to what is left, a correction
// that writes the figure and the day actually typed, a delete that only happens
// once a payment has been opened, and a delete that cannot happen offline.

const spies = vi.hoisted(() => ({
  record: vi.fn(),
  update: vi.fn(),
  remove: vi.fn(),
  removeDebt: vi.fn(),
  editDebt: vi.fn(),
}));

vi.mock("./useDebts", () => ({
  useRecordRepayment: () => ({ mutate: spies.record, isPending: false }),
  useUpdateRepayment: () => ({ mutate: spies.update, isPending: false }),
  useDeleteRepayment: () => ({ mutate: spies.remove, isPending: false }),
  useDeleteDebt: () => ({ mutate: spies.removeDebt, isPending: false }),
  useUpdateDebt: () => ({ mutate: vi.fn(), isPending: false }),
  useEditDebt: () => ({ mutate: spies.editDebt, isPending: false }),
  useCreateDebt: () => ({ mutate: vi.fn(), isPending: false }),
}));
vi.mock("../../shared/hooks/useCurrencyConverter", () => ({
  useCurrencyConverter: () => ({ baseCurrency: "EUR", format: (n: number) => `€${n.toFixed(2)}` }),
}));

const fmt = (n: number) => `€${n.toFixed(2)}`;

const loan: Debt = {
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

// Stored newest first, the way the query hands them over — the screen has to
// put them back in order itself.
const payments: DebtPayment[] = [
  { id: "p2", userId: "u1", debtId: "rent", amount: 80, date: new Date(2026, 4, 2), createdAt: new Date(2026, 4, 2) },
  { id: "p1", userId: "u1", debtId: "rent", amount: 120, date: new Date(2026, 3, 10), createdAt: new Date(2026, 3, 10) },
];

const nikos = () => debtsByPerson([computeDebtStatus(loan, payments)])[0];

const renderModal = () => render(<PersonDebtsModal person={nikos()} formatCurrency={fmt} locale="en" knownPeople={["Nikos", "Maria"]} onClose={() => {}} />);

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

describe("the history", () => {
  it("reads in the order it happened, and ends on what is left", () => {
    renderModal();
    const rows = within(screen.getByRole("list", { name: "History" }))
      .getAllByRole("listitem")
      .map((row) => row.textContent ?? "");

    expect(rows[0]).toMatch(/You took.*€500\.00/);
    expect(rows[1]).toMatch(/You paid back.*€120\.00/);
    expect(rows[2]).toMatch(/You paid back.*€80\.00/);
    // Second route, by hand: 500 − 120 − 80.
    expect(500 - 120 - 80).toBe(300);
    expect(rows[3]).toMatch(/Today.*€300\.00 left/);
  });
});

describe("correcting a payment", () => {
  it("opens with the payment's own figure and day", async () => {
    renderModal();

    await userEvent.click(screen.getByRole("button", { name: /You paid back.*€80\.00/ }));

    expect(screen.getByLabelText("Amount")).toHaveValue(80);
    expect(screen.getByLabelText("When")).toHaveValue("2026-05-02");
  });

  it("saves the figure and the day that were typed", async () => {
    renderModal();
    await userEvent.click(screen.getByRole("button", { name: /You paid back.*€80\.00/ }));

    const amount = screen.getByLabelText("Amount");
    await userEvent.clear(amount);
    await userEvent.type(amount, "90");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(spies.update).toHaveBeenCalledTimes(1);
    const [vars] = spies.update.mock.calls[0];
    expect(vars.paymentId).toBe("p2");
    expect(vars.amount).toBe(90);
    // The local calendar day — 2 May, not 1 May at 21:00 UTC.
    expect([vars.date.getFullYear(), vars.date.getMonth(), vars.date.getDate()]).toEqual([2026, 4, 2]);
    expect(spies.record).not.toHaveBeenCalled();
  });

  it("refuses a zero", async () => {
    renderModal();
    await userEvent.click(screen.getByRole("button", { name: /You paid back.*€80\.00/ }));

    const amount = screen.getByLabelText("Amount");
    await userEvent.clear(amount);
    await userEvent.type(amount, "0");

    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
  });

  it("deletes only from inside the opened payment", async () => {
    renderModal();
    // Nothing on the closed rows can delete a payment any more.
    expect(screen.queryByRole("button", { name: "Delete" })).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /You paid back.*€120\.00/ }));
    await userEvent.click(screen.getByRole("button", { name: "Delete" }));

    expect(spies.remove).toHaveBeenCalledWith("p1", expect.anything());
  });
});

describe("recording a payment", () => {
  it("starts from what is left, dated today", async () => {
    renderModal();

    await userEvent.click(screen.getByRole("button", { name: "Payment" }));
    expect(screen.getByLabelText("Amount")).toHaveValue(300);
    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    const [vars] = spies.record.mock.calls[0];
    expect(vars).toMatchObject({ debtId: "rent", amount: 300 });
    const now = new Date();
    expect([vars.date.getFullYear(), vars.date.getMonth(), vars.date.getDate()]).toEqual([now.getFullYear(), now.getMonth(), now.getDate()]);
  });
});

describe("the loan itself", () => {
  it("opens the loan form filled in, to correct it", async () => {
    renderModal();

    await userEvent.click(screen.getByRole("button", { name: "Edit" }));

    // reactstrap does not name its dialogs after their header, so find the one
    // that carries it.
    await screen.findByText("Edit loan");
    const dialog = screen.getAllByRole("dialog").find((d) => within(d).queryByText("Edit loan"))!;
    expect(within(dialog).getByPlaceholderText("0")).toHaveValue(500);
    expect(within(dialog).getByDisplayValue("March rent")).toBeInTheDocument();
  });

  it("will not delete a loan offline", () => {
    renderModal();
    Object.defineProperty(navigator, "onLine", { value: false, configurable: true });
    act(() => {
      window.dispatchEvent(new Event("offline"));
    });

    expect(screen.getByRole("button", { name: "Delete loan" })).toBeDisabled();
  });
});
