import { describe, it, expect, vi, beforeAll, beforeEach, afterAll } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import i18n from "../../i18n";
import { BillAlertPopup } from "./BillAlertPopup";
import { billAlerts } from "./billAlerts";
import { computeBillStatus } from "./billsUtils";
import type { Bill, BillWithStatus } from "../../shared/types/IndexTypes";

// The popup on arrival, 28 October: electricity late since the 10th, water due the 30th.

const NOW = new Date(2026, 9, 28, 10);
const bill = (id: string, name: string, dueDay: number, amount: number): Bill =>
  ({ id, userId: "u", name, amount, categoryId: "c", frequency: "monthly", dueDay, isActive: true, createdAt: new Date(2026, 9, 1), updatedAt: new Date(2026, 9, 1) }) as Bill;
const BILLS: BillWithStatus[] = [bill("power", "ΔΕΗ", 10, 85), bill("water", "Νερό", 30, 60)].map((b) => computeBillStatus(b, [], NOW));

const settings = vi.hoisted(() => ({ values: {} as Record<string, unknown>, writes: [] as [string, unknown][] }));
vi.mock("./useBills", () => ({ useBills: () => ({ data: BILLS }) }));
vi.mock("../../shared/hooks/useWorkspaceSetting", () => ({
  useWorkspace: () => ({ isSuccess: true }),
  useWorkspaceSetting: (key: string, initial: unknown) => [key in settings.values ? settings.values[key] : initial, (value: unknown) => settings.writes.push([key, value])],
}));
vi.mock("../../shared/hooks/useCurrencyConverter", () => ({ useCurrencyConverter: () => ({ format: (n: number) => `€${n.toFixed(2)}` }) }));

beforeAll(async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
  await i18n.changeLanguage("en");
});
afterAll(() => vi.useRealTimers());
beforeEach(() => {
  settings.values = {};
  settings.writes = [];
});

const renderPopup = () =>
  render(
    <MemoryRouter>
      <BillAlertPopup />
    </MemoryRouter>,
  );

describe("the bills popup", () => {
  it("lists the late one to pay now and the coming one apart, with what the days ahead need", () => {
    renderPopup();
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByRole("region", { name: "To pay now" })).toHaveTextContent("ΔΕΗoverdue 18 days€85.00");
    expect(within(dialog).getByRole("region", { name: "Within 5 days" })).toHaveTextContent("Νερόin 2 days · Oct 30€60.00");
    expect(within(dialog).getByText("You need by Oct 30")).toBeInTheDocument();
    // A second way: the total is the two together.
    expect(within(dialog).getByText("€145.00")).toBeInTheDocument();
    expect(85 + 60).toBe(145);
  });

  it("says the money is needed now when every one has gone — not by the oldest deadline", () => {
    settings.values = { "bill-alerts-reach": "1d" }; // the water off: only the late electricity
    renderPopup();
    expect(screen.getByText("You need now")).toBeInTheDocument();
    expect(screen.queryByText(/You need by/)).toBeNull();
  });

  it("closed as it is, keeps nothing — it comes back next time", async () => {
    renderPopup();
    await userEvent.click(screen.getAllByRole("button", { name: "Close" }).at(-1)!);
    expect(settings.writes).toEqual([]);
  });

  it("«Don't show me these again» keeps exactly the payments listed", async () => {
    renderPopup();
    await userEvent.click(screen.getByRole("checkbox", { name: "Don't show me these again" }));
    await userEvent.click(screen.getByRole("button", { name: "Go to bills" }));
    expect(settings.writes).toEqual([["bill-alerts-seen", billAlerts(BILLS, NOW).map((a) => a.key)]]);
  });

  it("stays away once they are put away, and when switched off", () => {
    settings.values = { "bill-alerts-seen": billAlerts(BILLS, NOW).map((a) => a.key) };
    const { unmount } = renderPopup();
    expect(screen.queryByRole("dialog")).toBeNull();
    unmount();

    settings.values = { "bill-alerts": false };
    renderPopup();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("leaves out the bills switched off in the settings", () => {
    settings.values = { "bill-alerts-off": ["power"] };
    renderPopup();
    expect(screen.queryByText("ΔΕΗ")).toBeNull();
    expect(screen.getByText("Νερό")).toBeInTheDocument();
  });

  it("links to its settings", async () => {
    renderPopup();
    await userEvent.click(screen.getByRole("button", { name: "Settings: which bills, how early, or never" }));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("takes a bill's own reach over the general one", () => {
    // The water on one day: it goes, though the rest look five days ahead.
    settings.values = { "bill-alerts-scope": "bill", "bill-alerts-by-bill": { water: "1d" } };
    renderPopup();
    expect(screen.queryByText("Νερό")).toBeNull();
    expect(screen.getByText("ΔΕΗ")).toBeInTheDocument();
  });

  it("ignores the bills' own reaches while one reach is for all", () => {
    settings.values = { "bill-alerts-scope": "all", "bill-alerts-by-bill": { water: "1d" } };
    renderPopup();
    expect(screen.getByText("Νερό")).toBeInTheDocument();
  });

  it("looks as far as the settings say: a day only leaves the water out", () => {
    settings.values = { "bill-alerts-reach": "1d" };
    renderPopup();
    expect(screen.queryByRole("region", { name: /Within/ })).toBeNull();
    expect(screen.getByText("ΔΕΗ")).toBeInTheDocument();
  });
});
