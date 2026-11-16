import { describe, it, expect, vi, beforeAll } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import i18n from "../../i18n";
import AddBillModal from "./AddBillModal";
import { currentStep, fillNew, next, save, saveButton, tile, toStep } from "./billWizardTest";
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
vi.mock("../../firebase/exchangeRate", () => ({
  fetchExchangeRates: vi.fn(() => new Promise(() => {})),
  convertAmount: (n: number) => n,
  // Nothing saved from a previous session either, so there is no stored rate
  // standing in for the fetch that never resolves.
  readStoredRates: () => undefined,
}));
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


beforeAll(async () => {
  // jsdom has no matchMedia, and the month picker asks it whether it is on a
  // phone. A desktop answer is all these need.
  window.matchMedia ??= ((query: string) =>
    ({ matches: false, media: query, onchange: null, addListener: () => {}, removeListener: () => {}, addEventListener: () => {}, removeEventListener: () => {}, dispatchEvent: () => false }) as MediaQueryList);
  await i18n.changeLanguage("en");
});

describe("the bill form's pause", () => {
  it("opens an existing yearly pause as it was saved, on its own step", async () => {
    open(edessa({ from: "2026-11", to: "2027-03", yearly: true }));
    await toStep(4);

    expect(await tile(/stop for a while/i, true)).toBeChecked();
    expect(screen.getByRole("radio", { name: /for a while/i })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: /same months every year/i })).toBeChecked();
  });

  it("promises the €35 a month the list will show", async () => {
    open(edessa({ from: "2026-11", to: "2027-03", yearly: true }));
    await toStep(4);

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

  it("removes the pause when «Όχι» is picked on an edit, and hides its dates", async () => {
    // Left out, the old pause would stay on the bill: the save has to say null.
    const saved = open(edessa({ from: "2026-11", to: "2027-03", yearly: true }));
    await toStep(4);

    await userEvent.click(await tile(/stop for a while/i, false));
    // «Όχι» skips what only «Ναι» needs: the kind of pause and its months are gone.
    expect(screen.queryByRole("radio", { name: /for a while$/i })).toBeNull();
    expect(screen.queryByRole("checkbox", { name: /same months every year/i })).toBeNull();
    await save();

    await waitFor(() => expect(saved).toHaveLength(1));
    expect(saved[0].pause).toBeNull();
  });

  it("saves a bill that stops for good with no end month at all", async () => {
    const saved = open(edessa({ from: "2026-09", to: "2027-03" }));
    await toStep(4);

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
    await toStep(4);

    expect(await screen.findByText(/not charged for 5 months, then back to normal/i)).toBeInTheDocument();
  });

  it("refuses a stretch that ends before it starts: «Next» stops on that step and says why", async () => {
    const saved = open(edessa({ from: "2027-03", to: "2026-11" }));

    const name = await screen.findByDisplayValue("Edessa electricity");
    await userEvent.type(name, "!");
    await save();

    expect(await screen.findByText(/the end is before the start/i)).toBeInTheDocument();
    expect(currentStep()).toMatch(/^4/);
    expect(saveButton()).toBeNull();
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
    await fillNew("Water", "18", "c1");
    await next();
    await next();
    // A new bill's question starts on «Ναι» (owner, 2026-11-12): «Όχι» is picked here.
    expect(await tile(/stop for a while/i, true)).toBeChecked();
    expect(await tile(/stop for a while/i, false)).not.toBeChecked();
    await userEvent.click(await tile(/stop for a while/i, false));
    await userEvent.click(await tile(/paid late/i, false));
    await save();

    await waitFor(() => expect(saved).toHaveLength(1));
    expect(saved[0].pause).toBeUndefined();
  });
});

describe("the bill form's on/off question", () => {
  it("opens a switched-off bill on «Όχι», and saves it back on with «Ναι»", async () => {
    const saved = open({ ...edessa(), isActive: false });
    expect(await tile(/is it active/i, false)).toBeChecked();
    await userEvent.click(await tile(/is it active/i, true));
    await save();
    await waitFor(() => expect(saved).toHaveLength(1));
    expect(saved[0].isActive).toBe(true);
  });

  it("starts a new bill on «Ναι» for «is it active?» (owner, 2026-11-12), and goes on with that answer", async () => {
    open(null);
    expect(await tile(/is it active/i, true)).toBeChecked();
    expect(await tile(/is it active/i, false)).not.toBeChecked();
    expect(screen.queryByText("Pick Yes or No")).toBeNull();
    await userEvent.type(await screen.findByLabelText(/^name/i), "Water");
    expect(await next()).toBe(true);
    expect(screen.queryByText("Pick Yes or No")).toBeNull();
  });
});

describe("the bill form's yes / no questions", () => {
  it("asks each as two tiles, no switches, and «Ναι» on «late» reveals the days in the same step", async () => {
    open(null);
    await fillNew("Water", "18", "c1");
    expect(screen.queryByRole("switch")).toBeNull();
    await next();
    await next();
    expect(currentStep()).toMatch(/^4/);
    // «Ναι» from the start (owner, 2026-11-12): the days are there; «Όχι» takes them away.
    expect(document.querySelector('[name="graceDays"]')).not.toBeNull();
    await userEvent.click(await tile(/paid late/i, false));
    expect(document.querySelector('[name="graceDays"]')).toBeNull();
    await userEvent.click(await tile(/paid late/i, true));
    expect(document.querySelector('[name="graceDays"]')).not.toBeNull();
  });

  it("saves «Ναι» on a changing amount as a variable bill, and the days of grace given", async () => {
    const saved = open(null);
    await fillNew("Water", "18", "c1");
    await userEvent.click(await tile(/amount change/i, true));
    await next();
    await next();
    await userEvent.click(await tile(/paid late/i, true));
    await userEvent.type(document.querySelector('[name="graceDays"]') as HTMLInputElement, "20");
    await userEvent.click(await tile(/stop for a while/i, false));
    await save();
    await waitFor(() => expect(saved).toHaveLength(1));
    expect(saved[0].isVariableAmount).toBe(true);
    expect(saved[0].graceDays).toBe(20);
  });
});

describe("the bill wizard's steps", () => {
  it("goes one topic a step, will not pass a step with something missing, and has Save only on the check", async () => {
    open(null);
    expect(currentStep()).toMatch(/^1/);
    // A new bill's rail is closed ahead: the check cannot be jumped to.
    expect(within(screen.getByRole("dialog")).getByRole("button", { name: /^5/ })).toBeDisabled();
    expect(await next()).toBe(false);
    expect(screen.getByText(/name is required|enter a name/i)).toBeInTheDocument();
    await fillNew("Water", "18", "c1");
    expect(saveButton()).toBeNull();
    // Back is always free; Cancel only on the first step.
    await userEvent.click(screen.getByRole("button", { name: /back/i }));
    expect(currentStep()).toMatch(/^1/);
    expect(screen.getByRole("button", { name: /cancel/i })).toBeInTheDocument();
  });

  it("asks «how often» as a number and a unit from lists on one row, and the day from a list of 1–31", async () => {
    open(null);
    await fillNew("Water", "18", "c1");
    await next();
    const count = screen.getByLabelText("How often") as HTMLSelectElement;
    const unit = screen.getByLabelText("Unit") as HTMLSelectElement;
    expect(count.tagName).toBe("SELECT");
    expect(count.parentElement).toBe(unit.parentElement);
    expect([...count.options].map((o) => o.value)).toEqual(["1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11"]);
    await userEvent.selectOptions(unit, "weekly");
    expect([...count.options].map((o) => o.value)).toEqual(["1", "2", "3"]);
    await userEvent.selectOptions(unit, "yearly");
    expect((screen.getByLabelText("How often") as HTMLSelectElement).options).toHaveLength(10);
    await userEvent.selectOptions(unit, "monthly");
    // The day is a small grid of 1–31 (and «No day», as the empty option was), not a 31-row dropdown.
    await userEvent.click(document.querySelector<HTMLButtonElement>("#bill-due-day")!);
    expect(within(screen.getByRole("listbox")).getAllByRole("option").map((o) => o.textContent)).toEqual(Array.from({ length: 31 }, (_, i) => String(i + 1)));
    expect(screen.getByRole("button", { name: "No day" })).toBeInTheDocument();
  });

  it("lists every answer on the check, each going back to its step", async () => {
    open(edessa({ from: "2026-11", to: "2027-03", yearly: true }));
    await toStep(5);
    const check = screen.getByRole("dialog");
    const rows = [...check.querySelectorAll("button[class*=wizRow]")].map((row) => row.firstElementChild!.textContent);
    expect(rows).toEqual(["Name", "Active", "Amount", "Category", "Repeats", "Due", "Starts in (optional)", "Can be paid late", "This bill stops for a while", "Notes"]);
    await userEvent.click([...check.querySelectorAll("button[class*=wizRow]")][3]);
    expect(currentStep()).toMatch(/^2/);
  });

  it("writes exactly what the one-page form wrote — a new bill, field by field", async () => {
    const saved = open(null);
    await fillNew("Water", "18", "c1");
    await next();
    await userEvent.selectOptions(screen.getByLabelText("How often"), "2");
    await userEvent.click(document.querySelector<HTMLButtonElement>("#bill-due-day")!);
    await userEvent.click(screen.getByRole("option", { name: /^31/ }));
    await next();
    await userEvent.click(await tile(/paid late/i, true));
    await userEvent.type(document.querySelector('[name="graceDays"]') as HTMLInputElement, "10");
    await userEvent.type(document.querySelector('[name="notes"]') as HTMLTextAreaElement, "  by the meter  ");
    await userEvent.click(await tile(/stop for a while/i, false));
    await save();
    await waitFor(() => expect(saved).toHaveLength(1));
    const now = new Date();
    // The one-page form's save, worked out by hand for these answers.
    expect(saved[0]).toStrictEqual({
      name: "Water",
      amount: 18,
      isVariableAmount: false,
      categoryId: "c1",
      frequency: "monthly",
      intervalCount: 2,
      installmentCount: 1,
      installmentIntervalMonths: 1,
      anchorDate: new Date(now.getFullYear(), now.getMonth(), 1),
      dueDay: 31,
      graceDays: 10,
      dueMonth: undefined,
      notes: "by the meter",
      pause: undefined,
      startsOn: undefined,
      isActive: true,
    });
  });

  it("writes exactly what the one-page form wrote — an edit, field by field", async () => {
    const saved = open({ ...edessa({ from: "2026-11", to: "2027-03", yearly: true }), graceDays: 20, notes: "old", startsOn: "2025-02" });
    await userEvent.type(await screen.findByDisplayValue("Edessa electricity"), "!");
    await toStep(5);
    await userEvent.click(saveButton()!);
    await waitFor(() => expect(saved).toHaveLength(1));
    expect(saved[0]).toStrictEqual({
      name: "Edessa electricity!",
      amount: 60,
      isVariableAmount: false,
      categoryId: "c1",
      frequency: "monthly",
      intervalCount: 1,
      installmentCount: 1,
      installmentIntervalMonths: 1,
      anchorDate: new Date(2025, 0, 1),
      dueDay: 5,
      graceDays: 20,
      // An edit says «no due month» out loud for a bill that is not yearly, so a
      // month left from when it was yearly is taken off (DATA_FLOW «Clearing a field»).
      dueMonth: null,
      notes: "old",
      pause: { from: "2026-11", to: "2027-03", yearly: true },
      startsOn: "2025-02",
      isActive: true,
    });
  });
});

describe("the bill form's backdrop", () => {
  it("does not close on a click beside it — a half-filled form is not thrown away", async () => {
    const onClose = vi.fn();
    render(
      <QueryClientProvider client={new QueryClient()}>
        <AddBillModal isOpen onClose={onClose} categories={categories} bill={null} onSubmit={async () => {}} />
      </QueryClientProvider>,
    );
    await userEvent.type(await screen.findByPlaceholderText(/Rent, Netflix/), "Water");
    // The dialog layer itself, outside the white box — where a stray tap lands.
    await userEvent.click(document.querySelector(".modal") as HTMLElement);
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByDisplayValue("Water")).toBeInTheDocument();
  });
});
