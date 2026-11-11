import { describe, it, expect, vi, beforeAll } from "vitest";
import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import i18n from "../../../i18n";
import { GoalCard } from "./InvestmentsShared";
import type { InvestmentGoalWithStats } from "../../../shared/types/IndexTypes";
import { celebrateSave } from "../../../shared/feedback/saveFeedback";
import { PLAY_MS, pourSize } from "./tankPlay";

// The ski trip, written as its parts and 280 € in: one line saying 280 / 690 = 410,
// and the 👁 opening the parts — house and lift met, travel filling, food empty.

vi.mock("../../debts/useDebts", () => ({ useDebts: () => ({ data: [] }) }));
vi.mock("../../../shared/hooks/useOfflineGuard", () => ({ useOfflineGuard: () => ({ locked: false, reason: "" }) }));
vi.mock("../../../shared/hooks/useCurrencyConverter", () => ({ useCurrencyConverter: () => ({ format: (n: number) => `€${n.toFixed(2)}` }) }));
vi.mock("../useInvestments", () => ({ useContributions: () => ({ data: [], isLoading: false }) }));

const SKI = {
  id: "ski",
  userId: "u",
  name: "Ski",
  goalType: "targeted",
  targetPeriod: "custom",
  targetAmount: 690,
  totalSaved: 280,
  remaining: 410,
  deadline: new Date(2027, 1, 1),
  isActive: true,
  isCompleted: false,
  parts: [
    { id: "house", label: "House", min: 150, max: 200 },
    { id: "lift", label: "Lift", min: 50, max: 90 },
    { id: "travel", label: "Travel", min: 100, max: 200 },
    { id: "food", label: "Food", min: 150, max: 200 },
  ],
  createdAt: new Date(2026, 0, 1),
  updatedAt: new Date(2026, 0, 1),
} as unknown as InvestmentGoalWithStats;
const money = (n: number) => `€${n.toFixed(2)}`;
const noop = () => {};

beforeAll(async () => {
  await i18n.changeLanguage("en");
});

const card = (goal: InvestmentGoalWithStats) => (
  <MemoryRouter>
    <GoalCard goal={goal} formatCurrency={money} onViewHistory={noop} onAddDeposit={noop} onWithdraw={noop} onDelete={noop} onEdit={noop} onTogglePause={noop} />
  </MemoryRouter>
);
const renderCard = (goal = SKI) => render(card(goal));

describe("a goal card", () => {
  it("puts its money in the three boxes: put in, what is left, the total", () => {
    const { container } = renderCard();
    const box = (label: string) => screen.getByText(label).previousElementSibling!.textContent;
    expect([box("put in"), box("left"), box("total")]).toEqual(["€280.00", "€410.00", "€690.00"]);
    // In that order on the card, left to right.
    expect([...container.querySelectorAll("p")].map((p) => p.textContent).filter((x) => ["put in", "left", "total"].includes(x ?? ""))).toEqual(["put in", "left", "total"]);
    // A second way: what is left is the whole less what is in.
    expect(690 - 280).toBe(410);
    // And no figure beside the ring: the status alone.
    expect(container.textContent).not.toContain("of €690.00");
  });

  it("opens its parts from the eye, each with what it holds of its «to»", async () => {
    renderCard();
    await userEvent.click(screen.getByRole("button", { name: "The parts of «Ski»" }));
    const rows = within(screen.getByRole("list", { name: "The parts" })).getAllByRole("listitem");
    expect(rows.map((r) => r.firstElementChild!.textContent)).toEqual(["House€150.00 / €200.00", "Lift€50.00 / €90.00", "Travel€80.00 / €200.00", "Food€0.00 / €200.00"]);
    // Each row its range and where it stands; 150 + 50 + 80 + 0 is the 280 in.
    expect(rows.map((r) => r.lastElementChild!.textContent)).toEqual([
      "from €150.00 to €200.00reached its «from»",
      "from €50.00 to €90.00reached its «from»",
      "from €100.00 to €200.00filling",
      "from €150.00 to €200.00nothing yet",
    ]);
  });

  it("fills «put in» and drains «left» as shares of the whole, the whole always full", () => {
    renderCard();
    const level = (label: string) => (screen.getByText(label).parentElement as HTMLElement).style.getPropertyValue("--level");
    expect(parseFloat(level("put in"))).toBeCloseTo((280 / 690) * 100, 5);
    expect(parseFloat(level("left"))).toBeCloseTo((410 / 690) * 100, 5);
    // A second way: the two tanks together hold exactly the whole.
    expect(parseFloat(level("put in")) + parseFloat(level("left"))).toBeCloseTo(100, 5);
    expect(level("total")).toBe("100%");
  });

  it("an empty goal's «put in» tank is empty, with no surface to ripple", () => {
    renderCard({ ...SKI, totalSaved: 0, remaining: 690 } as InvestmentGoalWithStats);
    const tile = screen.getByText("put in").parentElement as HTMLElement;
    expect(tile.style.getPropertyValue("--level")).toBe("0%");
    expect(tile.dataset.surface).toBe("empty");
    expect((screen.getByText("left").parentElement as HTMLElement).dataset.surface).toBe("full");
  });

  it("says on the card how many parts it has", () => {
    renderCard();
    expect(screen.getByRole("button", { name: "The parts of «Ski»" })).toHaveTextContent("4 parts");
  });

  it("has no eye on a goal of one figure", () => {
    renderCard({ ...SKI, parts: undefined } as InvestmentGoalWithStats);
    expect(screen.queryByRole("button", { name: /The parts of/ })).toBeNull();
  });

  it("opens the goal's details from its deadline", async () => {
    renderCard();
    expect(screen.queryByRole("dialog")).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Ski: details and actions" }));
    const sheet = screen.getByRole("dialog");
    expect(within(sheet).getByText("Ski")).toBeInTheDocument();
    // The sheet's own close, in its foot, puts it away again.
    await userEvent.click(within(sheet).getAllByRole("button", { name: "Close" }).at(-1)!);
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("plays a deposit on its tanks after the dialog over it has gone — once, the two tanks together", () => {
    vi.useFakeTimers();
    try {
      const { rerender } = renderCard();
      const tile = (label: string) => screen.getByText(label).parentElement as HTMLElement;
      const level = (label: string) => parseFloat(tile(label).style.getPropertyValue("--level"));
      // The deposit dialog is open over the card; 100 € goes in.
      const dialog = document.createElement("div");
      dialog.className = "modal show";
      document.body.appendChild(dialog);
      rerender(card({ ...SKI, totalSaved: 380, remaining: 310 } as InvestmentGoalWithStats));
      act(() => celebrateSave({ collection: "investmentContributions", id: "ski" }));
      act(() => void vi.advanceTimersByTime(3000));
      // Under the dialog the card holds the old levels; the figure is already the new one.
      expect(level("put in")).toBeCloseTo((280 / 690) * 100, 5);
      expect(tile("put in").dataset.fx).toBeUndefined();
      expect(screen.getByText("put in").previousElementSibling!.textContent).toBe("€380.00");

      dialog.remove();
      act(() => void vi.advanceTimersByTime(1000));
      // Poured into «put in», drained from «left», from the old levels to the new.
      expect(level("put in")).toBeCloseTo((380 / 690) * 100, 5);
      expect(level("left")).toBeCloseTo((310 / 690) * 100, 5);
      expect(level("put in") + level("left")).toBeCloseTo(100, 5);
      expect(parseFloat(tile("put in").style.getPropertyValue("--from"))).toBeCloseTo((280 / 690) * 100, 5);
      expect(parseFloat(tile("left").style.getPropertyValue("--from"))).toBeCloseTo((410 / 690) * 100, 5);
      expect([tile("put in").dataset.fx, tile("left").dataset.fx, tile("total").dataset.fx]).toEqual(["pour", "drain", undefined]);
      // Sized by the amount: 100 of 690 in, so the stream and the bubbles of that share.
      const size = pourSize(100 / 690);
      expect(tile("put in").querySelectorAll("[class*=bubble]")).toHaveLength(size.bubbles);
      expect(tile("put in").style.getPropertyValue("--pour-w")).toBe(`${size.width}px`);
      expect(tile("put in").style.getPropertyValue("--pour-ms")).toBe(`${size.ms}ms`);
      expect(level("total")).toBe(100);

      act(() => void vi.advanceTimersByTime(PLAY_MS));
      expect(tile("put in").dataset.fx).toBeUndefined();
      // Another goal's save, or the same figures again: nothing more.
      act(() => celebrateSave({ collection: "investmentContributions", id: "other" }));
      rerender(card({ ...SKI, totalSaved: 380, remaining: 310 } as InvestmentGoalWithStats));
      act(() => void vi.advanceTimersByTime(3000));
      expect(tile("put in").dataset.fx).toBeUndefined();
    } finally {
      vi.useRealTimers();
    }
  });
});
