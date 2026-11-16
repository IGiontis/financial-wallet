import { describe, it, expect, vi, beforeAll } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import i18n from "../../../i18n";
import EditTransactionModal from "./EditTransactionModal";
import type { Transaction, UpdateTransactionDTO } from "../../../shared/types/IndexTypes";
import type { LockState } from "../hooks/useRecordLocks";

// The expense of a goal a friend paid is one of three records that say the
// same thing (the goal's deposit, the debt, the expense). Edited here, its
// money must not move: amount, date, card and type stay the debt's. The payee
// and the notes are its own.

vi.mock("../hooks/usePayees", () => ({ usePayees: () => ({ payees: ["Ski centre"] }) }));
vi.mock("../hooks/useTransactions", () => ({ useTransactions: () => ({ data: [] }) }));
// A display currency other than the base: the ordinary path converts the
// amount there and back, which can move a cent. The covered path must not.
vi.mock("../../../shared/hooks/useCurrencyConverter", () => ({
  useCurrencyConverter: () => ({ baseCurrency: "EUR", displayCurrency: "USD", convert: (n: number) => n * 1.0837, convertToBase: (n: number) => n / 1.0837 }),
}));
const setCheckIns = vi.fn();
vi.mock("../../accounts/useMoneyAccounts", () => ({
  useMoneyAccounts: () => ({ accounts: [], checkIns: [], setCheckIns }),
  useAccountList: () => [{ id: "eb", name: "Eurobank", kind: "bank", main: true }],
}));
vi.mock("../../accounts/AccountPicker", () => ({ default: () => <p>card picker</p> }));
vi.mock("../../accounts/ReviewCard", () => ({ default: () => <p>card effect</p> }));
vi.mock("../../categories/CategoryPicker", () => ({ default: () => null }));

const when = new Date(2026, 9, 14);
const ski = { id: "t-ski", userId: "u", amount: 550.37, type: "expense", categoryId: "fun", date: when, description: "Ski trip", accountId: "eb", createdAt: when, updatedAt: when } as Transaction;
const lockOf = (payeeLocked: boolean): LockState => ({ lock: { kind: "covered", debtId: "d1", person: "Nikos", payeeLocked }, pending: false });

beforeAll(async () => {
  window.matchMedia ??= ((query: string) => ({ matches: false, media: query, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, onchange: null, dispatchEvent: () => false })) as unknown as typeof window.matchMedia;
  await i18n.changeLanguage("en");
});

async function saveWithNote(lock: LockState) {
  const onSubmit = vi.fn<(id: string, data: UpdateTransactionDTO) => Promise<void>>(async () => {});
  const user = userEvent.setup();
  render(
    <MemoryRouter>
      <EditTransactionModal transaction={ski} isOpen onClose={() => {}} categories={[{ id: "fun", name: "Fun", icon: "🎿", type: "expense", isDefault: false, userId: "u" } as never]} onSubmit={onSubmit} lock={lock} />
    </MemoryRouter>,
  );
  await user.click(screen.getByRole("button", { name: i18n.t("common.next") }));
  // Straight to the details: no card step for money that follows the debt.
  expect(screen.queryByText("card picker")).not.toBeInTheDocument();
  expect(screen.getByRole("spinbutton")).toBeDisabled();
  expect(screen.getByRole("link", { name: /Changed from Debts/ })).toBeInTheDocument();

  await user.type(screen.getByPlaceholderText(i18n.t("common.optionalNote")), "lift pass");
  await user.click(screen.getByRole("button", { name: i18n.t("transactions.reviewChanges") }));
  // Nothing about a card changes, so no card effect to confirm.
  expect(screen.queryByText("card effect")).not.toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: i18n.t("transactions.confirmAndSave") }));
  return onSubmit;
}

describe("editing a goal's covered expense", () => {
  it("writes back the stored amount, day, card and type to the cent — only the notes change", async () => {
    const onSubmit = await saveWithNote(lockOf(false));

    expect(onSubmit).toHaveBeenCalledOnce();
    const [id, data] = onSubmit.mock.calls[0];
    expect(id).toBe("t-ski");
    // Exactly the stored figure, not 550.37 → USD → EUR.
    expect(data.amount).toBe(550.37);
    expect(data.type).toBe("expense");
    expect(data.accountId).toBe("eb");
    // The day is not sent at all: left out, the stored one stays exactly as it
    // is — not rewritten from a form value (and a day dated after today before
    // the «happened» rule is not refused for an edit that never touched it).
    expect(data.date).toBeUndefined();
    expect(data.description).toBe("Ski trip");
    expect(data.notes).toBe("lift pass");
    // The money didn't move: no bank reading is corrected.
    expect(setCheckIns).not.toHaveBeenCalled();
  });

  it("keeps the payee too when the debt finds the expense only by its figures", async () => {
    const onSubmit = await saveWithNote(lockOf(true));
    expect(onSubmit.mock.calls[0][1].description).toBe("Ski trip");
    expect(onSubmit.mock.calls[0][1].amount).toBe(550.37);
  });

  it("shows the payee field locked in that case, open otherwise", async () => {
    for (const payeeLocked of [true, false]) {
      const user = userEvent.setup();
      const { unmount } = render(
        <MemoryRouter>
          <EditTransactionModal transaction={ski} isOpen onClose={() => {}} categories={[]} onSubmit={vi.fn()} lock={lockOf(payeeLocked)} />
        </MemoryRouter>,
      );
      await user.click(screen.getByRole("button", { name: i18n.t("common.next") }));
      expect(screen.getByRole("combobox")).toHaveProperty("disabled", payeeLocked);
      unmount();
    }
  });
});
