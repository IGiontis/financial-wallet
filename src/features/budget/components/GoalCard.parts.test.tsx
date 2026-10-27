import { describe, it, expect, vi, beforeAll } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import i18n from "../../../i18n";
import { GoalCard } from "./InvestmentsShared";
import type { InvestmentGoalWithStats } from "../../../shared/types/IndexTypes";

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

const renderCard = (goal = SKI) =>
  render(
    <MemoryRouter>
      <GoalCard goal={goal} formatCurrency={money} onViewHistory={noop} onAddDeposit={noop} onWithdraw={noop} onDelete={noop} onEdit={noop} onTogglePause={noop} />
    </MemoryRouter>,
  );

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
  });

  it("has no eye on a goal of one figure", () => {
    renderCard({ ...SKI, parts: undefined } as InvestmentGoalWithStats);
    expect(screen.queryByRole("button", { name: /The parts of/ })).toBeNull();
  });
});
