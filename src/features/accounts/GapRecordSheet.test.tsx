import { describe, it, expect, vi, beforeAll } from "vitest";
import { render, screen } from "@testing-library/react";
import userEventBase from "@testing-library/user-event";
import i18n from "../../i18n";
import GapRecordSheet from "./GapRecordSheet";
import type { GapWrites } from "./gapRecords";

// −73 € on Eurobank: two records of 68 €, a running counter, a check that adds
// up, and one save with both.

const spies = vi.hoisted(() => ({ save: vi.fn(async () => {}) }));
vi.mock("../debts/useDebts", () => ({ useDebts: () => ({ data: [] }) }));
vi.mock("./useGapRecords", () => ({ useSaveGapRecords: () => ({ mutateAsync: spies.save, isPending: false }), gapNewId: () => Math.random().toString(36).slice(2) }));
vi.mock("../../shared/hooks/useAuth", () => ({ useAuth: () => ({ currentUser: { uid: "u" } }) }));
vi.mock("../../shared/components/DateField", () => ({
  DateField: ({ id, value, onChange }: { id?: string; value: string; onChange: (v: string) => void }) => <input id={id} value={value} onChange={(e) => onChange(e.target.value)} />,
}));

// No delay between keys: the machine these run on is busy, and the typing is not what is tested.
const userEvent = userEventBase.setup({ delay: null });
const fmt = (n: number) => `€${n.toFixed(2)}`;
const accounts = [
  { id: "euro", name: "Eurobank", kind: "bank" as const, main: true },
  { id: "cash", name: "Cash", kind: "cash" as const },
];
const categories = [{ id: "food", name: "Food", type: "expense", icon: "🍔" }] as never[];

beforeAll(async () => {
  window.matchMedia ??= ((query: string) => ({ matches: false, media: query, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, onchange: null, dispatchEvent: () => false })) as unknown as typeof window.matchMedia;
  await i18n.changeLanguage("en");
});

describe("several records for one difference", () => {
  it("counts down what is left, reviews, and saves them together", async () => {
    render(<GapRecordSheet accountId="euro" accountName="Eurobank" change={-73} categories={categories} accounts={accounts} earliest="2026-10-30" baseCurrency="EUR" formatCurrency={fmt} onClose={() => {}} now={new Date(2026, 10, 3, 18)} />);

    const amount = screen.getByLabelText("Amount");
    // Starts on the whole difference.
    expect(amount).toHaveValue("73.00");
    await userEvent.clear(amount);
    await userEvent.type(amount, "18");
    await userEvent.selectOptions(screen.getByLabelText("Category"), "food");
    await userEvent.click(screen.getByRole("button", { name: "Add it to the list" }));
    expect(screen.getByText("−€55.00")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("radio", { name: "Moved to another of my cards" }));
    await userEvent.clear(screen.getByLabelText("Amount"));
    await userEvent.type(screen.getByLabelText("Amount"), "50");
    await userEvent.selectOptions(screen.getByLabelText("To which account"), "cash");
    await userEvent.click(screen.getByRole("button", { name: "Add it to the list" }));
    expect(screen.getByText("−€5.00")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /Next/ }));
    // The check: difference = records + what is left.
    expect(screen.getByText("−€73.00")).toBeInTheDocument();
    expect(screen.getByText("−€68.00")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Save 2 records" }));

    expect(spies.save).toHaveBeenCalledTimes(1);
    const writes = (spies.save.mock.calls[0] as unknown as [GapWrites])[0];
    expect(writes.transactions).toHaveLength(1);
    expect(writes.transactions[0].data).toMatchObject({ type: "expense", amount: 18, categoryId: "food", accountId: "euro", inReading: true });
    expect(writes.transfers.map((h) => [h.type, h.accountId, h.amount])).toEqual([
      ["expense", "euro", 50],
      ["income", "cash", 50],
    ]);
  }, 30_000);

  it("warns once the records go past the difference", async () => {
    render(<GapRecordSheet accountId="euro" accountName="Eurobank" change={-10} categories={categories} accounts={accounts} baseCurrency="EUR" formatCurrency={fmt} onClose={() => {}} now={new Date(2026, 10, 3, 18)} />);
    await userEvent.clear(screen.getByLabelText("Amount"));
    await userEvent.type(screen.getByLabelText("Amount"), "15");
    await userEvent.selectOptions(screen.getByLabelText("Category"), "food");
    await userEvent.click(screen.getByRole("button", { name: "Add it to the list" }));
    expect(screen.getByText(/come to more than the difference: the update will show \+€5.00/)).toBeInTheDocument();
  }, 30_000);
});
