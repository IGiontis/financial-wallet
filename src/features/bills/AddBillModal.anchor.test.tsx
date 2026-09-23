import { describe, it, expect, vi, beforeAll } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import i18n from "../../i18n";
import AddBillModal from "./AddBillModal";
import type { Bill, Category, CreateBillDTO } from "../../shared/types/IndexTypes";

// "Starting from" — the month a bill that comes every few months starts
// counting from. It was the last browser date picker left in the app; this pins
// down that the app's own one reads the saved month and writes back the one
// picked, since a month off here moves every due date the bill has.

vi.mock("../../firebase/firestore", () => ({ getUser: vi.fn(() => Promise.resolve(null)) }));
vi.mock("../../firebase/exchangeRate", () => ({
  fetchExchangeRates: vi.fn(() => new Promise(() => {})),
  convertAmount: (n: number) => n,
  readStoredRates: () => undefined,
}));
vi.mock("../transactions/hooks/useTransactions", () => ({ useCreateCategoryScope: () => ({ mutateAsync: vi.fn() }) }));

const categories = [{ id: "c1", name: "Water", type: "expense", icon: "💧", userId: "u1" }] as unknown as Category[];

// Water every two months, counted from March.
const water = {
  id: "w1",
  userId: "u1",
  name: "Water",
  amount: 68,
  categoryId: "c1",
  frequency: "monthly",
  intervalCount: 2,
  dueDay: 12,
  isActive: true,
  anchorDate: new Date(2026, 2, 1),
  createdAt: new Date(2026, 0, 1),
  updatedAt: new Date(2026, 0, 1),
} as Bill;

function open(bill: Bill) {
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

describe("the bill form's starting month", () => {
  it("is the app's own calendar, not the browser's", async () => {
    open(water);

    const field = await screen.findByLabelText("Starting from");
    expect(field.tagName).toBe("BUTTON");
    expect(document.querySelector('input[type="month"]')).toBeNull();
  });

  it("shows the month the bill was saved with", async () => {
    open(water);

    expect(await screen.findByLabelText("Starting from")).toHaveTextContent("Mar 2026");
  });

  it("saves the month picked, on its first day", async () => {
    const saved = open(water);

    await userEvent.click(await screen.findByLabelText("Starting from"));
    await userEvent.click(await screen.findByText("Jun"));
    await userEvent.click(screen.getByRole("button", { name: /save changes/i }));

    await waitFor(() => expect(saved).toHaveLength(1));
    const anchor = saved[0].anchorDate as Date;
    expect([anchor.getFullYear(), anchor.getMonth(), anchor.getDate()]).toEqual([2026, 5, 1]);
  });

  it("keeps the saved month when nothing is picked", async () => {
    const saved = open(water);

    // Save only enables once something changed — here, anything but the month.
    await userEvent.type(await screen.findByDisplayValue("Water"), " board");
    await userEvent.click(screen.getByRole("button", { name: /save changes/i }));

    await waitFor(() => expect(saved).toHaveLength(1));
    const anchor = saved[0].anchorDate as Date;
    expect([anchor.getFullYear(), anchor.getMonth(), anchor.getDate()]).toEqual([2026, 2, 1]);
  });
});
