import { describe, it, expect, vi, beforeAll } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import i18n from "../../i18n";
import AddBillModal from "./AddBillModal";
import type { Bill, BillPause, Category, CreateBillDTO } from "../../shared/types/IndexTypes";

// The bill form's "this bill stops" section, end to end.
//
// What matters is what gets saved, because the save is where a pause can go
// quietly wrong: switched off on an edit it has to be removed rather than left
// behind, and a pause that does not come back must not carry a stray end month.
// The preview is checked too — it is a promise about money made before saving.

vi.mock("../../firebase/firestore", () => ({ getUser: vi.fn(() => Promise.resolve(null)) }));
// No rates: the converter then hands amounts back unchanged, which keeps every
// figure below exactly the one typed.
vi.mock("../../firebase/exchangeRate", () => ({ fetchExchangeRates: vi.fn(() => new Promise(() => {})), convertAmount: (n: number) => n }));
vi.mock("../transactions/hooks/useTransactions", () => ({ useCreateCategoryScope: () => ({ mutateAsync: vi.fn() }) }));

const categories = [{ id: "c1", name: "Electricity", type: "expense", icon: "⚡", userId: "u1" }] as unknown as Category[];

const edessa = (pause?: BillPause) =>
  ({
    id: "b1",
    userId: "u1",
    name: "Edessa electricity",
    amount: 60,
    categoryId: "c1",
    frequency: "monthly",
    dueDay: 5,
    isActive: true,
    anchorDate: new Date(2025, 0, 1),
    createdAt: new Date(2025, 0, 1),
    updatedAt: new Date(2025, 0, 1),
    pause,
  }) as Bill;

function open(bill: Bill | null) {
  const saved: CreateBillDTO[] = [];
  render(
    <QueryClientProvider client={new QueryClient()}>
      <AddBillModal isOpen onClose={() => {}} categories={categories} bill={bill} onSubmit={async (data) => void saved.push(data)} />
    </QueryClientProvider>,
  );
  return saved;
}

const save = () => userEvent.click(screen.getByRole("button", { name: /save changes|add bill/i }));

beforeAll(async () => {
  // jsdom has no matchMedia, and the month picker asks it whether it is on a
  // phone. A desktop answer is all these need.
  window.matchMedia ??= ((query: string) =>
    ({ matches: false, media: query, onchange: null, addListener: () => {}, removeListener: () => {}, addEventListener: () => {}, removeEventListener: () => {}, dispatchEvent: () => false }) as MediaQueryList);
  await i18n.changeLanguage("en");
});

describe("the bill form's pause", () => {
  it("opens an existing yearly pause as it was saved", async () => {
    open(edessa({ from: "2026-11", to: "2027-03", yearly: true }));

    expect(await screen.findByRole("switch", { name: /stops for a while/i })).toBeChecked();
    expect(screen.getByRole("radio", { name: /for a while/i })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: /same months every year/i })).toBeChecked();
  });

  it("promises the €35 a month the list will show", async () => {
    open(edessa({ from: "2026-11", to: "2027-03", yearly: true }));

    // €60 charged April to October: 7 × 60 = 420 a year, 420 / 12 = 35.
    expect(await screen.findByText(/about €35\.00 a month instead of €60\.00/i)).toBeInTheDocument();
  });

  it("saves the pause it was given, unchanged", async () => {
    const saved = open(edessa({ from: "2026-11", to: "2027-03", yearly: true }));

    const name = await screen.findByDisplayValue("Edessa electricity");
    await userEvent.type(name, " house");
    await save();

    await waitFor(() => expect(saved).toHaveLength(1));
    expect(saved[0].pause).toStrictEqual({ from: "2026-11", to: "2027-03", yearly: true });
  });

  it("removes the pause when it is switched off on an edit", async () => {
    // Left out, the old pause would stay on the bill: the save has to say null.
    const saved = open(edessa({ from: "2026-11", to: "2027-03", yearly: true }));

    await userEvent.click(await screen.findByRole("switch", { name: /stops for a while/i }));
    await save();

    await waitFor(() => expect(saved).toHaveLength(1));
    expect(saved[0].pause).toBeNull();
  });

  it("saves a bill that stops for good with no end month at all", async () => {
    const saved = open(edessa({ from: "2026-09", to: "2027-03" }));

    await userEvent.click(await screen.findByRole("radio", { name: /for good/i }));
    expect(screen.getByText(/never shows as owed\. its history stays/i)).toBeInTheDocument();
    // "Until" and "every year" belong to a stretch; they go with it.
    expect(screen.queryByRole("checkbox", { name: /same months every year/i })).not.toBeInTheDocument();

    await save();

    await waitFor(() => expect(saved).toHaveLength(1));
    expect(saved[0].pause).toStrictEqual({ from: "2026-09" });
  });

  it("describes a one-off stretch by its length", async () => {
    open(edessa({ from: "2026-11", to: "2027-03" }));

    expect(await screen.findByText(/not charged for 5 months, then back to normal/i)).toBeInTheDocument();
  });

  it("refuses a stretch that ends before it starts", async () => {
    const saved = open(edessa({ from: "2027-03", to: "2026-11" }));

    const name = await screen.findByDisplayValue("Edessa electricity");
    await userEvent.type(name, "!");
    await save();

    expect(await screen.findByText(/the end is before the start/i)).toBeInTheDocument();
    expect(saved).toHaveLength(0);
  });

  it("lets the same months wrap the new year when it repeats", async () => {
    // November to March typed the other way round is a winter, not a mistake.
    const saved = open(edessa({ from: "2027-11", to: "2027-03", yearly: true }));

    const name = await screen.findByDisplayValue("Edessa electricity");
    await userEvent.type(name, "!");
    await save();

    await waitFor(() => expect(saved).toHaveLength(1));
    expect(saved[0].pause).toStrictEqual({ from: "2027-11", to: "2027-03", yearly: true });
  });

  it("stores no pause at all for a new bill that never stops", async () => {
    // `null` is an edit's way of removing a pause; a new bill has none to remove.
    const saved = open(null);

    await screen.findByRole("switch", { name: /stops for a while/i });
    const field = (name: string) => document.querySelector(`[name="${name}"]`) as HTMLInputElement;
    await userEvent.type(field("name"), "Water");
    await userEvent.type(field("amount"), "18");
    await userEvent.selectOptions(field("categoryId"), "c1");
    await save();

    await waitFor(() => expect(saved).toHaveLength(1));
    expect(saved[0].pause).toBeUndefined();
  });
});
