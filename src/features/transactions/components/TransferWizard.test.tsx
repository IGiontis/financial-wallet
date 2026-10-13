import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import i18n from "../../../i18n";
import TransferWizard from "./TransferWizard";

// The transfer wizard: from, to, how much, then the check — the only place
// Save is. What is pinned is what it writes: one pair, out of the account
// chosen first and into the second, for the amount typed, and nothing at all
// before the check.

const saved = vi.hoisted(() => ({ calls: [] as unknown[] }));
vi.mock("../hooks/useTransfers", () => ({
  useSaveTransfer: () => ({ mutate: (vars: unknown) => saved.calls.push(vars) }),
}));
vi.mock("../../../firebase/firestore", () => ({ newDocId: () => "T1" }));
vi.mock("../../../shared/hooks/useCurrencyConverter", () => ({ useCurrencyConverter: () => ({ format: (n: number) => `€${n.toFixed(2)}`, baseCurrency: "EUR" }) }));
vi.mock("../../accounts/useMoneyAccounts", () => ({
  useMoneyAccounts: () => ({
    accounts: [
      { id: "eb", name: "Eurobank", kind: "bank", main: true },
      { id: "rev", name: "Revolut", kind: "bank" },
      { id: "cash", name: "Cash", kind: "cash" },
    ],
    latest: { at: new Date(2026, 9, 12), checkIn: { id: "c", at: new Date(2026, 9, 12).toISOString(), amounts: { eb: 2000, rev: 900, cash: 50 } } },
    transactions: [],
  }),
}));

const renderWizard = () =>
  render(
    <MemoryRouter>
      <TransferWizard onClose={() => {}} />
    </MemoryRouter>,
  );

beforeAll(async () => {
  window.matchMedia = ((query: string) => ({ matches: false, media: query, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, onchange: null, dispatchEvent: () => false })) as unknown as typeof window.matchMedia;
  await i18n.changeLanguage("en");
});

beforeEach(() => {
  saved.calls.length = 0;
});

describe("a transfer, step by step", () => {
  it("writes one pair, out of the first account and into the second, only from the check", async () => {
    renderWizard();
    const dialog = screen.getByRole("dialog");
    await userEvent.click(within(dialog).getByRole("button", { name: /^Revolut/ }));
    // The account it leaves is not offered as where it goes.
    expect(within(dialog).queryByRole("button", { name: /^Revolut/ })).toBeNull();
    await userEvent.click(within(dialog).getByRole("button", { name: /^Cash/ }));
    await userEvent.type(within(dialog).getByLabelText("Amount"), "200");
    await userEvent.click(within(dialog).getByRole("button", { name: /Next/ }));
    expect(saved.calls).toHaveLength(0);

    // The check: each account before and after, from what the next update starts from.
    expect(dialog).toHaveTextContent("€900.00 → €700.00");
    expect(dialog).toHaveTextContent("€50.00 → €250.00");

    await userEvent.click(within(dialog).getByRole("button", { name: /Confirm/ }));
    expect(saved.calls).toHaveLength(1);
    const { records } = saved.calls[0] as { records: { id: string; type: string; accountId: string; amount: number; transferId: string }[] };
    expect(records.map((r) => [r.id, r.type, r.accountId, r.amount, r.transferId])).toEqual([
      ["xfer_T1_out", "expense", "rev", 200, "T1"],
      ["xfer_T1_in", "income", "cash", 200, "T1"],
    ]);
  });

  it("will not go to the check without an amount", async () => {
    renderWizard();
    const dialog = screen.getByRole("dialog");
    await userEvent.click(within(dialog).getByRole("button", { name: /^Revolut/ }));
    await userEvent.click(within(dialog).getByRole("button", { name: /^Cash/ }));
    await userEvent.click(within(dialog).getByRole("button", { name: /Next/ }));
    expect(within(dialog).getByLabelText("Amount")).toBeInvalid();
    expect(within(dialog).queryByRole("button", { name: /Confirm/ })).toBeNull();
  });
});
