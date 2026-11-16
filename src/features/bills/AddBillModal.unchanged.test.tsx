import { describe, it, expect, vi, beforeAll } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import i18n from "../../i18n";
import AddBillModal from "./AddBillModal";
import { saveButton, tile, toStep } from "./billWizardTest";
import type { Bill, Category, CreateBillDTO } from "../../shared/types/IndexTypes";

// «No change, no Save» on a bill (the owner, 2026-11-16). An edit read back
// with nothing changed offers no Save; a real change does; changing it back —
// or switching a pause on and off again — offers none again.

vi.mock("../../firebase/firestore", () => ({ getUser: vi.fn(() => Promise.resolve(null)) }));
vi.mock("../../firebase/exchangeRate", () => ({
  fetchExchangeRates: vi.fn(() => new Promise(() => {})),
  convertAmount: (n: number) => n,
  readStoredRates: () => undefined,
}));
vi.mock("../transactions/hooks/useTransactions", () => ({ useCreateCategoryScope: () => ({ mutateAsync: vi.fn() }) }));

const categories = [{ id: "c1", name: "Electricity", type: "expense", icon: "⚡", userId: "u1" }] as unknown as Category[];
const bill = {
  id: "b1",
  userId: "u1",
  name: "Edessa electricity",
  amount: 60,
  categoryId: "c1",
  frequency: "monthly",
  dueDay: 5,
  isActive: true,
  notes: "meter 4411",
  anchorDate: new Date(2025, 0, 1),
  createdAt: new Date(2025, 0, 1),
  updatedAt: new Date(2025, 0, 1),
} as Bill;

function open() {
  const saved: CreateBillDTO[] = [];
  render(
    <QueryClientProvider client={new QueryClient()}>
      <AddBillModal isOpen onClose={() => {}} categories={categories} bill={bill} onSubmit={async (data) => void saved.push(data)} />
    </QueryClientProvider>,
  );
  return saved;
}

beforeAll(async () => {
  window.matchMedia ??= ((query: string) =>
    ({ matches: false, media: query, onchange: null, addListener: () => {}, removeListener: () => {}, addEventListener: () => {}, removeEventListener: () => {}, dispatchEvent: () => false }) as MediaQueryList);
  await i18n.changeLanguage("en");
});

describe("editing a bill — No change, no Save", () => {
  it("read back unchanged: Save off, with «Nothing has changed»; Enter writes nothing", async () => {
    const saved = open();
    await toStep(5);
    expect(saveButton()).toBeDisabled();
    expect(screen.getByText("Nothing has changed")).toBeInTheDocument();
    await userEvent.keyboard("{Enter}");
    expect(saved).toHaveLength(0);
  });

  it("a trailing space on the name and 60 typed as 60.00 are no change", async () => {
    open();
    await userEvent.type(await screen.findByDisplayValue("Edessa electricity"), " ");
    await toStep(2);
    const amount = screen.getByLabelText(/^amount \(/i);
    await userEvent.clear(amount);
    await userEvent.type(amount, "60.00");
    await toStep(5);
    expect(saveButton()).toBeDisabled();
  });

  it("a pause switched on and off again is no change", async () => {
    open();
    await toStep(4);
    await userEvent.click(await tile(/stop for a while/i, true));
    await userEvent.click(await screen.findByRole("radio", { name: /for good/i }));
    await toStep(5);
    expect(saveButton()).toBeEnabled();
    await toStep(4);
    await userEvent.click(await tile(/stop for a while/i, false));
    await toStep(5);
    expect(saveButton()).toBeDisabled();
  });

  it("a real change turns Save on and saves; changed back, it is off again", async () => {
    const saved = open();
    await toStep(2);
    const amount = screen.getByLabelText(/^amount \(/i);
    await userEvent.clear(amount);
    await userEvent.type(amount, "65");
    await toStep(5);
    expect(saveButton()).toBeEnabled();
    expect(screen.queryByText("Nothing has changed")).toBeNull();

    await toStep(2);
    await userEvent.clear(screen.getByLabelText(/^amount \(/i));
    await userEvent.type(screen.getByLabelText(/^amount \(/i), "60");
    await toStep(5);
    expect(saveButton()).toBeDisabled();

    await toStep(2);
    await userEvent.clear(screen.getByLabelText(/^amount \(/i));
    await userEvent.type(screen.getByLabelText(/^amount \(/i), "65");
    await toStep(5);
    await userEvent.click(saveButton()!);
    await vi.waitFor(() => expect(saved).toHaveLength(1));
    expect(saved[0].amount).toBe(65);
  });
});
