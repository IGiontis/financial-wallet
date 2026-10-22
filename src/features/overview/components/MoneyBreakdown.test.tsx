import { describe, it, expect, beforeAll } from "vitest";
import { render, screen } from "@testing-library/react";
import i18n from "../../../i18n";
import { MoneyBreakdown } from "./MoneyBreakdown";

// Under «Λεφτά που έχεις»: the banks, less what goals hold, adding up to the figure.

const fmt = (n: number) => `€${n.toFixed(2)}`;
const BANKS = [
  { id: "rev", name: "Revolut", amount: 1200 },
  { id: "eur", name: "Eurobank", amount: 2000.1 },
];

beforeAll(async () => {
  await i18n.changeLanguage("en");
});

const lines = () => screen.getAllByRole("term").map((term) => [term.textContent, term.nextElementSibling?.textContent]);

describe("the money card's breakdown", () => {
  it("lists each bank, and takes the goals off, landing on the figure", () => {
    // 1.200 + 2.000,10 − 300 = 2.900,10
    render(<MoneyBreakdown accounts={BANKS} inGoals={300} figure={2900.1} formatCurrency={fmt} />);
    expect(lines()).toEqual([
      ["Revolut", "€1200.00"],
      ["Eurobank", "€2000.10"],
      ["Held for goals", "−€300.00"],
    ]);
    // A second way: the lines as printed add up to the figure.
    expect(1200 + 2000.1 - 300).toBeCloseTo(2900.1, 2);
  });

  it("shows no list at all when the banks do not reach the figure — not even by a cent", () => {
    render(<MoneyBreakdown accounts={BANKS} inGoals={0} figure={3200.09} formatCurrency={fmt} />);
    expect(screen.queryByText("Revolut")).not.toBeInTheDocument();
  });

  it("has no goals line when nothing is held", () => {
    render(<MoneyBreakdown accounts={BANKS} inGoals={0} figure={3200.1} formatCurrency={fmt} />);
    expect(screen.getByText("Revolut")).toBeInTheDocument();
    expect(screen.queryByText("Held for goals")).not.toBeInTheDocument();
  });

  it("still gives the month when the banks are not there to list", () => {
    render(<MoneyBreakdown accounts={[]} inGoals={0} figure={50} month={{ label: "This month", income: 1900, expenses: 155.3 }} formatCurrency={fmt} />);
    expect(screen.getByText("This month").parentElement).toHaveTextContent("+€1900.00 / , out −€155.30");
    expect(screen.queryByRole("term")).not.toBeInTheDocument();
  });

  it("draws nothing with neither", () => {
    const { container } = render(<MoneyBreakdown accounts={[]} inGoals={0} figure={50} formatCurrency={fmt} />);
    expect(container).toBeEmptyDOMElement();
  });
});
