import { describe, it, expect, vi, beforeAll } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import userEvent from "@testing-library/user-event";
import i18n from "../../../i18n";
import TransactionViewModal from "./TransactionsViewModal";
import type { Transaction } from "../../../shared/types/IndexTypes";

// The record's own sheet, which on a phone is where it is changed and deleted.
// A goal's or an investment's mirror is changed and deleted from its goal.

vi.mock("../../../shared/hooks/useCurrencyConverter", () => ({ useCurrencyConverter: () => ({ displayCurrency: "EUR" }) }));
vi.mock("../../accounts/useMoneyAccounts", () => ({
  useAccountList: () => [
    { id: "eb", name: "Eurobank", kind: "bank", main: true },
    { id: "rev", name: "Revolut", kind: "bank" },
  ],
}));

const today = new Date();
const row = (extra: Partial<Transaction> = {}) =>
  ({ id: "t", userId: "u", amount: 10, type: "expense", categoryId: "food", date: today, description: "Bread", createdAt: today, updatedAt: today, ...extra }) as Transaction;
const format = (n: number) => `€${n.toFixed(2)}`;

beforeAll(async () => {
  await i18n.changeLanguage("en");
});

describe("the record's sheet", () => {
  it("edits and deletes a plain record", async () => {
    const onEdit = vi.fn();
    const onDelete = vi.fn();
    render(<TransactionViewModal transaction={row()} categories={[]} formatCurrency={format} onClose={() => {}} onEdit={onEdit} onDelete={onDelete} />);
    await userEvent.click(screen.getByRole("button", { name: "Delete" }));
    await userEvent.click(screen.getByRole("button", { name: /Edit/ }));
    expect(onDelete).toHaveBeenCalledOnce();
    expect(onEdit).toHaveBeenCalledOnce();
  });

  it("says which card the money came out of or went into — the main one when none was named", () => {
    const { unmount } = render(<TransactionViewModal transaction={row({ accountId: "rev" })} categories={[]} formatCurrency={format} onClose={() => {}} />);
    expect(screen.getAllByText("Came out of Revolut").length).toBeGreaterThan(0);
    unmount();
    render(<TransactionViewModal transaction={row({ type: "income" })} categories={[]} formatCurrency={format} onClose={() => {}} />);
    expect(screen.getAllByText("Went into Eurobank (main)").length).toBeGreaterThan(0);
  });

  it("shows the time it was recorded — with its day when that was another one", () => {
    const at = new Date(2026, 9, 13, 16, 33);
    const { unmount } = render(<TransactionViewModal transaction={row({ date: new Date(2026, 9, 13), createdAt: at })} categories={[]} formatCurrency={format} onClose={() => {}} />);
    expect(screen.getByText("Recorded").nextSibling).toHaveTextContent("16:33");
    unmount();
    render(<TransactionViewModal transaction={row({ date: new Date(2026, 9, 10), createdAt: at })} categories={[]} formatCurrency={format} onClose={() => {}} />);
    expect(screen.getByText("Recorded").nextSibling).toHaveTextContent(/13 Oct/);
  });

  it("locks both for a goal's mirror", () => {
    render(
      <TransactionViewModal
        transaction={row({ type: "investment", isInvestmentTransaction: true, isGoalTransaction: true, contributionType: "deposit" })}
        categories={[]}
        formatCurrency={format}
        onClose={() => {}}
        onEdit={() => {}}
        onDelete={() => {}}
      />,
    );
    expect(screen.getByRole("button", { name: "Delete" })).toBeDisabled();
    expect(screen.getByRole("button", { name: /Edit/ })).toBeDisabled();
  });
});

describe("the expense of a goal a friend paid", () => {
  const covered = { lock: { kind: "covered" as const, debtId: "d1", person: "Nikos", payeeLocked: false }, pending: false };

  function DebtsStub() {
    const state = useLocation().state as { person?: string } | null;
    return <p>debts page for {state?.person}</p>;
  }

  it("is edited (payee, notes) but not deleted here, and says where it changes", async () => {
    const onEdit = vi.fn();
    render(
      <MemoryRouter initialEntries={["/transactions"]}>
        <Routes>
          <Route path="/transactions" element={<TransactionViewModal transaction={row({ amount: 550 })} categories={[]} formatCurrency={format} onClose={() => {}} onEdit={onEdit} onDelete={() => {}} lock={covered} />} />
          <Route path="/debts" element={<DebtsStub />} />
        </Routes>
      </MemoryRouter>,
    );
    expect(screen.getByRole("button", { name: "Delete" })).toBeDisabled();
    expect(screen.getByRole("button", { name: /Edit/ })).toBeEnabled();
    expect(screen.getByText(/Nikos/)).toBeInTheDocument();

    // The link opens Debts on the person the debt is with.
    await userEvent.click(screen.getByRole("link", { name: /Changed from Debts/ }));
    expect(screen.getByText("debts page for Nikos")).toBeInTheDocument();
  });

  it("holds both buttons while it isn't known yet whether a debt owns it", () => {
    render(<TransactionViewModal transaction={row()} categories={[]} formatCurrency={format} onClose={() => {}} onEdit={() => {}} onDelete={() => {}} lock={{ lock: undefined, pending: true }} />);
    expect(screen.getByRole("button", { name: "Delete" })).toBeDisabled();
    expect(screen.getByRole("button", { name: /Edit/ })).toBeDisabled();
    expect(screen.getByText(/Checking whether it belongs to a debt/)).toBeInTheDocument();
  });
});
