import { describe, it, expect, beforeAll } from "vitest";
import { render, screen, within } from "@testing-library/react";
import i18n from "../../../i18n";
import { IncomeMonthsDetails, WaterfallDetails } from "./CardDetails";

// The sheets behind the analytics cards: the figures as columns, totalled at
// the foot, newest month first, coloured by the direction that is good news.

const format = (n: number) => `€${n.toFixed(2)}`;
const foot = () => within(screen.getAllByRole("rowgroup")[2]).getByRole("row");
const bodyRows = () => within(screen.getAllByRole("rowgroup")[1]).getAllByRole("row");

beforeAll(async () => {
  await i18n.changeLanguage("en");
});

describe("where the month went, in columns", () => {
  it("gives each step as a share of the income", () => {
    const steps = [
      { id: "__income__", amount: 2000, balance: 2000, kind: "income" as const },
      { id: "food", amount: -500, balance: 1500, kind: "expense" as const },
      { id: "__leftover__", amount: 1500, balance: 1500, kind: "result" as const },
    ];
    render(<WaterfallDetails steps={steps} nameFor={(id) => id} formatCurrency={format} />);
    const food = bodyRows()[1];
    expect(food).toHaveTextContent("−€500.00");
    expect(food).toHaveTextContent("25%");
  });
});

describe("how steady the income is, in columns", () => {
  it("sets each finished month against their average, and leaves the running one out of it", () => {
    // Three finished months averaging 1.700, and October five days in.
    const data = [
      { label: "Jul", income: 1450 },
      { label: "Aug", income: 1850 },
      { label: "Sep", income: 1800 },
      { label: "Oct", income: 0, running: true },
    ];
    expect((1450 + 1850 + 1800) / 3).toBe(1700);
    render(<IncomeMonthsDetails data={data} average={1700} note="" legend={null} formatCurrency={format} />);
    const [oct, sep, aug, jul] = bodyRows();
    expect(oct).toHaveTextContent("Oct · in progress€0.00—");
    expect(sep).toHaveTextContent("+€100.00");
    expect(aug).toHaveTextContent("+€150.00");
    expect(jul).toHaveTextContent("−€250.00");
    // The second way: gaps from a mean add up to nothing.
    expect(100 + 150 - 250).toBe(0);
    expect(foot()).toHaveTextContent("€1700.00");
    expect(screen.getByText(/The average counts finished months only/)).toBeInTheDocument();
  });
});
