import { describe, it, expect, vi, beforeAll } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import i18n from "../../../i18n";
import { GoalCard } from "./InvestmentsShared";
import type { InvestmentGoalWithStats } from "../../../shared/types/IndexTypes";

// A paused goal (item 66, as corrected): among running cards it sits under a
// frosted veil and NOTHING on it can be used — no deposit, withdraw or edit —
// only «Resume» (and a «⋯» with history / delete) on the veil itself. Listed
// with only paused ones, the veil goes so the cards can be read; a grey band
// with a «Paused» chip says it, and the actions stay cut to resume / view.

vi.mock("../../debts/useDebts", () => ({ useDebts: () => ({ data: [] }) }));
vi.mock("../../../shared/hooks/useOfflineGuard", () => ({ useOfflineGuard: () => ({ locked: false, reason: "" }) }));
vi.mock("../../../shared/hooks/useCurrencyConverter", () => ({ useCurrencyConverter: () => ({ format: (n: number) => `€${n.toFixed(2)}` }) }));
vi.mock("../useInvestments", () => ({ useContributions: () => ({ data: [], isLoading: false }) }));

const TRIP = {
  id: "trip",
  userId: "u",
  name: "Trip",
  goalType: "targeted",
  targetPeriod: "custom",
  targetAmount: 700,
  totalSaved: 150,
  remaining: 550,
  deadline: new Date(2027, 5, 1),
  isActive: false,
  isCompleted: false,
  createdAt: new Date(2026, 0, 1),
  updatedAt: new Date(2026, 0, 1),
} as unknown as InvestmentGoalWithStats;

beforeAll(async () => {
  await i18n.changeLanguage("en");
});

function renderCard(goal: InvestmentGoalWithStats, pausedView?: boolean) {
  const spies = { deposit: vi.fn(), withdraw: vi.fn(), edit: vi.fn(), toggle: vi.fn(), history: vi.fn(), remove: vi.fn() };
  const view = render(
    <MemoryRouter>
      <GoalCard
        goal={goal}
        pausedView={pausedView}
        formatCurrency={(n) => `€${n.toFixed(2)}`}
        onViewHistory={spies.history}
        onAddDeposit={spies.deposit}
        onWithdraw={spies.withdraw}
        onDelete={spies.remove}
        onEdit={spies.edit}
        onTogglePause={spies.toggle}
      />
    </MemoryRouter>,
  );
  return { ...view, spies };
}

describe("a paused goal among running ones", () => {
  it("is veiled, and the card under the veil is inert and hidden from the reader", () => {
    const { container } = renderCard(TRIP);
    const veil = screen.getByTestId("goal-paused-veil");
    expect(veil).toHaveAccessibleName("«Trip» — paused");
    expect(within(veil).getByText("Paused")).toBeInTheDocument();
    const inner = container.querySelector("[inert]") as HTMLElement;
    expect(inner).not.toBeNull();
    expect(inner).toHaveAttribute("aria-hidden", "true");
    expect(inner).not.toContainElement(veil);
  });

  it("offers no deposit, withdraw or edit anywhere — not even hidden under the veil", () => {
    const { container } = renderCard(TRIP);
    // Every button the reader can reach is on the veil.
    const reachable = screen.getAllByRole("button");
    const veil = screen.getByTestId("goal-paused-veil");
    for (const button of reachable) expect(veil).toContainElement(button);
    // Under it, nothing that puts money in or takes it out exists at all.
    const inner = container.querySelector("[inert]") as HTMLElement;
    expect(within(inner).queryByText("Add deposit")).toBeNull();
    expect(within(inner).queryByText("Withdraw")).toBeNull();
    // The details sheet (which deposits and edits) is not opened from it either.
    expect(within(inner).getByRole("button", { name: /details/i, hidden: true })).toBeDisabled();
  });

  it("offers only «Resume» on the veil — no «⋯», nothing else", async () => {
    const { spies } = renderCard(TRIP);
    const veil = screen.getByTestId("goal-paused-veil");
    expect(within(veil).getAllByRole("button").map((b) => b.getAttribute("aria-label") ?? b.textContent)).toEqual(["Resume · Trip"]);
    await userEvent.click(within(veil).getByRole("button", { name: "Resume · Trip" }));
    expect(spies.toggle).toHaveBeenCalledWith(TRIP);
    expect(spies.deposit).not.toHaveBeenCalled();
    expect(spies.edit).not.toHaveBeenCalled();
    expect(spies.remove).not.toHaveBeenCalled();
  });
});

describe("a paused goal under the «Paused» filter", () => {
  it("has no veil and nothing inert: the card can be read", () => {
    const { container } = renderCard(TRIP, true);
    expect(screen.queryByTestId("goal-paused-veil")).toBeNull();
    expect(container.querySelector("[inert]")).toBeNull();
    expect(container.querySelector("[aria-hidden=true][class*=cardInner]")).toBeNull();
  });

  it("says it is paused in a grey band with the chip, and offers only resume and history", async () => {
    const { container, spies } = renderCard(TRIP, true);
    expect(screen.getByTestId("goal-paused-chip")).toHaveTextContent("Paused");
    expect(container.querySelector("[data-tone=paused]")).not.toBeNull();
    expect(screen.queryByRole("button", { name: "Add deposit" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Withdraw" })).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Resume" }));
    expect(spies.toggle).toHaveBeenCalledWith(TRIP);
    await userEvent.click(screen.getByRole("button", { name: "History" }));
    expect(spies.history).toHaveBeenCalledWith(TRIP);
    // Its «⋯» has no edit.
    await userEvent.click(screen.getByRole("button", { name: /Trip/, expanded: false }));
    expect(screen.getAllByRole("menuitem").map((i) => i.textContent)).toEqual(["History", "Resume", "Delete"]);
  });
});

describe("a running goal", () => {
  it("has no veil, no paused chip, and its deposit and edit", async () => {
    const { container, spies } = renderCard({ ...TRIP, isActive: true } as InvestmentGoalWithStats);
    expect(screen.queryByTestId("goal-paused-veil")).toBeNull();
    expect(screen.queryByTestId("goal-paused-chip")).toBeNull();
    expect(container.querySelector("[inert]")).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Add deposit" }));
    expect(spies.deposit).toHaveBeenCalledOnce();
  });
});
