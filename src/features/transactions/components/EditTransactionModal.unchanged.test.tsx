import { describe, it, expect, vi, beforeAll } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import i18n from "../../../i18n";
import EditTransactionModal from "./EditTransactionModal";
import type { Transaction, UpdateTransactionDTO } from "../../../shared/types/IndexTypes";

// «No change, no Save» (the owner, 2026-11-16: he opened edit forms and could
// press Save with nothing changed). A transaction opened and read back offers
// nothing to save; a real change does; changing it back offers nothing again.

vi.mock("../hooks/usePayees", () => ({ usePayees: () => ({ payees: ["Coffee Island"] }) }));
vi.mock("../hooks/useTransactions", () => ({ useTransactions: () => ({ data: [] }) }));
vi.mock("../../../shared/hooks/useCurrencyConverter", () => ({
  useCurrencyConverter: () => ({ format: (n: number, c?: string) => new Intl.NumberFormat("en", { style: "currency", currency: c ?? "EUR" }).format(n), baseCurrency: "EUR", displayCurrency: "EUR", convert: (n: number) => n, convertToBase: (n: number) => n }),
}));
vi.mock("../../accounts/useMoneyAccounts", () => ({
  useMoneyAccounts: () => ({ accounts: [], checkIns: [], setCheckIns: vi.fn() }),
  useAccountList: () => [{ id: "eb", name: "Eurobank", kind: "bank", main: true }],
}));
vi.mock("../../accounts/AccountPicker", () => ({ default: () => <p>card picker</p> }));
vi.mock("../../accounts/ReviewCard", () => ({ default: () => <p>card effect</p> }));
vi.mock("../../categories/CategoryPicker", () => ({ default: () => null }));

// Stored at 18:40 — the form edits days, so the hour is no change.
const when = new Date(2026, 9, 14, 18, 40);
const coffee = { id: "t-1", userId: "u", amount: 3.5, type: "expense", categoryId: "food", date: when, description: "Coffee Island", notes: "with Maria", accountId: "eb", createdAt: when, updatedAt: when } as Transaction;
const categories = [{ id: "food", name: "Food", icon: "☕", type: "expense", isDefault: false, userId: "u" } as never];

beforeAll(async () => {
  window.matchMedia ??= ((query: string) => ({ matches: false, media: query, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, onchange: null, dispatchEvent: () => false })) as unknown as typeof window.matchMedia;
  await i18n.changeLanguage("en");
});

async function openDetails() {
  const onSubmit = vi.fn<(id: string, data: UpdateTransactionDTO) => Promise<void>>(async () => {});
  const user = userEvent.setup();
  render(
    <MemoryRouter>
      <EditTransactionModal transaction={coffee} isOpen onClose={() => {}} categories={categories} onSubmit={onSubmit} />
    </MemoryRouter>,
  );
  // Category → card → details.
  await user.click(screen.getByRole("button", { name: i18n.t("common.next") }));
  await user.click(screen.getByRole("button", { name: i18n.t("common.next") }));
  return { user, onSubmit };
}

const reviewButton = () => screen.getByRole("button", { name: i18n.t("transactions.reviewChanges") });
const notes = () => screen.getByPlaceholderText(i18n.t("common.optionalNote"));

describe("editing a transaction — No change, no Save", () => {
  it("opened and unchanged: «Review changes» is off, with «Nothing has changed»", async () => {
    await openDetails();
    expect(reviewButton()).toBeDisabled();
    expect(screen.getByText("Nothing has changed")).toBeInTheDocument();
  });

  it("3.5 typed as 3.50 and a note with a trailing space are no change", async () => {
    const { user } = await openDetails();
    const amount = screen.getByRole("spinbutton");
    await user.clear(amount);
    await user.type(amount, "3.50");
    await user.type(notes(), " ");
    expect(reviewButton()).toBeDisabled();
  });

  it("a real change turns Save on; changing it back turns it off again — on the review too", async () => {
    const { user, onSubmit } = await openDetails();
    await user.clear(notes());
    await user.type(notes(), "alone");
    expect(reviewButton()).toBeEnabled();
    expect(screen.queryByText("Nothing has changed")).toBeNull();
    await user.click(reviewButton());
    const save = screen.getByRole("button", { name: i18n.t("transactions.confirmAndSave") });
    expect(save).toBeEnabled();

    // Back to the details, and the note as it was.
    await user.click(screen.getByRole("button", { name: i18n.t("common.back") }));
    await user.clear(notes());
    await user.type(notes(), "with Maria");
    expect(reviewButton()).toBeDisabled();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("saves a real change once", async () => {
    const { user, onSubmit } = await openDetails();
    const amount = screen.getByRole("spinbutton");
    await user.clear(amount);
    await user.type(amount, "3.8");
    await user.click(reviewButton());
    await user.click(screen.getByRole("button", { name: i18n.t("transactions.confirmAndSave") }));
    expect(onSubmit).toHaveBeenCalledOnce();
    expect(onSubmit.mock.calls[0][1].amount).toBe(3.8);
  });
});
