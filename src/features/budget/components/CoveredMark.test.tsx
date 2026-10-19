import { describe, it, expect, vi, beforeAll } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import i18n from "../../../i18n";
import { CoveredMark } from "./CoveredMark";

// «550 € με χρέος στον Νίκο» on a goal someone else paid part of: what is still
// owed, going down as it is paid back, and gone once it is cleared.

const debts = vi.hoisted(() => ({ data: undefined as unknown }));
vi.mock("../../debts/useDebts", () => ({ useDebts: () => ({ data: debts.data }) }));
vi.mock("../../../shared/hooks/useCurrencyConverter", () => ({ useCurrencyConverter: () => ({ format: (n: number) => `€${n.toFixed(2)}` }) }));

const goal = { covered: [{ person: "Nikos", amount: 550, debtId: "d1" }] };
const renderMark = () =>
  render(
    <MemoryRouter>
      <CoveredMark goal={goal} />
    </MemoryRouter>,
  );

beforeAll(async () => {
  await i18n.changeLanguage("en");
});

describe("the mark on a goal someone else paid part of", () => {
  it("says what was covered while the debts are still loading", () => {
    debts.data = undefined;
    renderMark();
    expect(screen.getByRole("link")).toHaveTextContent("€550.00 owed to Nikos");
  });

  it("then says what is still owed — less once part of it is paid back", () => {
    debts.data = [{ id: "d1", remaining: 350, isSettled: false }];
    renderMark();
    expect(screen.getByRole("link")).toHaveTextContent("€350.00 owed to Nikos");
    expect(screen.getByRole("link")).toHaveAttribute("href", "/debts");
  });

  it("is gone once the debt is cleared, or the debt is gone", () => {
    debts.data = [{ id: "d1", remaining: 0, isSettled: true }];
    const { container, unmount } = renderMark();
    expect(container).toBeEmptyDOMElement();
    unmount();

    debts.data = [];
    const again = renderMark();
    expect(again.container).toBeEmptyDOMElement();
  });

  it("is nothing on a goal nobody paid for", () => {
    debts.data = [];
    const { container } = render(
      <MemoryRouter>
        <CoveredMark goal={{}} />
      </MemoryRouter>,
    );
    expect(container).toBeEmptyDOMElement();
  });
});
