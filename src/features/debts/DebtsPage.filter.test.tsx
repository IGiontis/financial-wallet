import { describe, it, expect, vi, beforeAll } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import i18n from "../../i18n";
import { DebtsPage } from "./DebtsPage";
import { computeDebtStatus } from "./debtsUtils";
import type { Debt } from "../../shared/types/IndexTypes";

// The two tiles filter the list. Once one is tapped there has to be a way back
// to everyone: the same tile again, or the «Show everyone» button beside them.

const day = new Date(2026, 9, 1);
const debt = (id: string, person: string, direction: Debt["direction"]): Debt => ({ id, userId: "u", person, direction, amount: 100, date: day, createdAt: day, updatedAt: day });
const debts = [computeDebtStatus(debt("a", "Nikos", "owed_by_me"), []), computeDebtStatus(debt("b", "Maria", "owed_to_me"), [])];

vi.mock("./useDebts", () => ({ useDebts: () => ({ data: debts, isLoading: false, isSuccess: true, isFetching: false }), useHealDebtCash: () => {} }));
vi.mock("../transactions/hooks/useTransactions", () => ({ useTransactions: () => ({ data: [], isSuccess: true, isFetching: false }) }));
vi.mock("./PersonDebtsModal", () => ({ default: () => null }));
vi.mock("./AddDebtModal", () => ({ default: () => null }));
vi.mock("./DebtOrder", () => ({ DebtOrder: () => null }));
vi.mock("../../shared/hooks/usePageAdd", () => ({ usePageAdd: () => {} }));
vi.mock("../../shared/hooks/useNarrowScreen", () => ({ useNarrowScreen: () => false }));
vi.mock("../../shared/hooks/useCurrencyConverter", () => ({ useCurrencyConverter: () => ({ baseCurrency: "EUR", format: (n: number) => `€${n.toFixed(2)}` }) }));

beforeAll(async () => {
  await i18n.changeLanguage("en");
});

const people = () => ["Nikos", "Maria"].filter((name) => screen.queryByRole("button", { name: new RegExp(`^${name}`) }));
const tile = (name: RegExp) => screen.getByRole("button", { name });

describe("the Debts page's two tiles", () => {
  it("filter the list, and say so by being pressed", async () => {
    render(<DebtsPage />);
    expect(people()).toEqual(["Nikos", "Maria"]);
    expect(tile(/^You owe/)).toHaveAttribute("aria-pressed", "false");
    await userEvent.click(tile(/^You owe/));
    expect(people()).toEqual(["Nikos"]);
    expect(tile(/^You owe/)).toHaveAttribute("aria-pressed", "true");
    expect(tile(/^Owed to you/)).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByRole("status")).toHaveTextContent("Only people you owe");
  });

  it("come back to everyone when the pressed tile is tapped again", async () => {
    render(<DebtsPage />);
    await userEvent.click(tile(/^Owed to you/));
    expect(people()).toEqual(["Maria"]);
    await userEvent.click(tile(/^Owed to you/));
    expect(people()).toEqual(["Nikos", "Maria"]);
    expect(tile(/^Owed to you/)).toHaveAttribute("aria-pressed", "false");
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("come back to everyone from «Show everyone»", async () => {
    render(<DebtsPage />);
    await userEvent.click(tile(/^You owe/));
    await userEvent.click(screen.getByRole("button", { name: "Show everyone" }));
    expect(people()).toEqual(["Nikos", "Maria"]);
    expect(tile(/^You owe/)).toHaveAttribute("aria-pressed", "false");
  });

  it("switch straight from one side to the other", async () => {
    render(<DebtsPage />);
    await userEvent.click(tile(/^You owe/));
    await userEvent.click(tile(/^Owed to you/));
    expect(people()).toEqual(["Maria"]);
    expect(tile(/^You owe/)).toHaveAttribute("aria-pressed", "false");
  });
});
