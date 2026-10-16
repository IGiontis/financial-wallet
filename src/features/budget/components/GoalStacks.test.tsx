import { describe, it, expect, vi, beforeAll } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import i18n from "../../../i18n";
import { GoalStacks } from "./GoalStacks";
import type { GoalGroup } from "./goalGrouping";
import type { InvestmentGoalWithStats } from "../../../shared/types/IndexTypes";

// A goal's line in the list: the bar that shows how far, a tap that opens the
// goal's sheet with every action in it, and a "+" of its own.

vi.mock("../../../shared/hooks/useOfflineGuard", () => ({ useOfflineGuard: () => ({ locked: false, reason: "" }) }));

const fmt = (n: number) => `€${n.toFixed(2)}`;
const laptop = {
  id: "laptop",
  name: "Laptop",
  goalType: "targeted",
  targetAmount: 1200,
  totalSaved: 200,
  totalDeposited: 200,
  totalWithdrawn: 0,
  remaining: 1000,
  percentageReached: (200 / 1200) * 100,
  isActive: true,
  isCompleted: false,
  status: "behind",
  monthlyRequired: 600,
  deadline: new Date(2026, 10, 15),
  createdAt: new Date(2026, 8, 1),
} as unknown as InvestmentGoalWithStats;

const group = (goals: InvestmentGoalWithStats[]): GoalGroup => ({ id: "soon", label: "Soon", goals, remaining: 1000, monthlyNeeded: 600 }) as GoalGroup;

const actions = () => ({ onViewHistory: vi.fn(), onAddDeposit: vi.fn(), onWithdraw: vi.fn(), onDelete: vi.fn(), onEdit: vi.fn(), onTogglePause: vi.fn() });

beforeAll(async () => {
  await i18n.changeLanguage("en");
});

describe("a goal's line in the list", () => {
  it("fills the bar by how far the goal is", () => {
    const { container } = render(<GoalStacks groups={[group([laptop])]} storageKey="t" formatCurrency={fmt} {...actions()} />);
    const fill = container.querySelector<HTMLElement>("[class*='fill']")!;

    expect(fill.style.width).toBe(`${(200 / 1200) * 100}%`);
    // Empty-coloured goals fall back to the token instead of drawing nothing.
    expect(fill.style.background).not.toBe("");
    expect(screen.getByText("17%")).toBeInTheDocument();
  });

  it("opens the goal's sheet when tapped, with the money moves and the rest in it", async () => {
    const a = actions();
    render(<GoalStacks groups={[group([laptop])]} storageKey="t" formatCurrency={fmt} {...a} />);

    await userEvent.click(screen.getByRole("button", { name: /Laptop: details/ }));
    const sheet = screen.getByRole("dialog");
    // The same figures as the row: saved, and of what.
    expect(sheet).toHaveTextContent(/€200.00/);
    expect(sheet).toHaveTextContent(/€1200.00/);
    expect(sheet).toHaveTextContent("17%");

    await userEvent.click(within(sheet).getByRole("button", { name: /Withdraw/ }));
    expect(a.onWithdraw).toHaveBeenCalledWith(laptop);
    await userEvent.click(within(sheet).getByRole("button", { name: /Edit/ }));
    expect(a.onEdit).toHaveBeenCalledWith(laptop);
  });

  it("closes the sheet before asking about a delete", async () => {
    const a = actions();
    render(<GoalStacks groups={[group([laptop])]} storageKey="t" formatCurrency={fmt} {...a} />);

    await userEvent.click(screen.getByRole("button", { name: /Laptop: details/ }));
    await userEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: /Delete/ }));
    expect(a.onDelete).toHaveBeenCalledWith(laptop);
  });

  it("puts money in from the '+' without opening the sheet", async () => {
    const a = actions();
    render(<GoalStacks groups={[group([laptop])]} storageKey="t" formatCurrency={fmt} {...a} />);

    await userEvent.click(screen.getByRole("button", { name: /Add deposit — Laptop/ }));
    expect(a.onAddDeposit).toHaveBeenCalledWith(laptop);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
