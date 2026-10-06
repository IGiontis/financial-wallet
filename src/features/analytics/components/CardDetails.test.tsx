import { describe, it, expect, beforeAll } from "vitest";
import { render, screen, within } from "@testing-library/react";
import i18n from "../../../i18n";
import { FlowDetails, PlanDetails, WaterfallDetails } from "./CardDetails";

// The sheets behind the analytics cards: the figures as columns, totalled at
// the foot, newest month first, coloured by the direction that is good news.

const format = (n: number) => `€${n.toFixed(2)}`;
const foot = () => within(screen.getAllByRole("rowgroup")[2]).getByRole("row");
const bodyRows = () => within(screen.getAllByRole("rowgroup")[1]).getAllByRole("row");

beforeAll(async () => {
  await i18n.changeLanguage("en");
});

describe("income and spending, in columns", () => {
  const data = [
    { label: "Aug", income: 1850, expenses: 1790, net: 60 },
    { label: "Sep", income: 1920, expenses: 1582.4, net: 337.6 },
  ];

  it("lists the newest month first and totals each column", () => {
    render(<FlowDetails data={data} formatCurrency={format} legend={null} />);
    expect(bodyRows().map((r) => within(r).getByRole("rowheader").textContent)).toEqual(["Sep", "Aug"]);
    // 1.850 + 1.920 = 3.770; 1.790 + 1.582,40 = 3.372,40; and the nets add to their difference.
    expect(foot()).toHaveTextContent("€3770.00€3372.40+€397.60");
    expect(Math.round((3770 - 3372.4) * 100) / 100).toBe(60 + 337.6);
  });
});

describe("spending against the plan, in columns", () => {
  const rows = [
    { label: "Sep", actual: 1582.4, plan: 858.99, lastYear: 1340 },
    { label: "Oct", actual: 155.3, plan: 166.25, lastYear: null },
  ];

  it("signs the gap, and colours over the plan red though the number is positive", () => {
    render(<PlanDetails rows={rows} note="" legend={null} formatCurrency={format} />);
    const [oct, sep] = bodyRows();
    const gap = (row: HTMLElement) => within(row).getAllByRole("cell")[2];
    expect(gap(sep)).toHaveTextContent("+€723.41");
    expect(gap(sep).style.color).toBe("var(--color-expense)");
    expect(gap(oct)).toHaveTextContent("−€10.95");
    expect(gap(oct).style.color).toBe("var(--color-income)");
    // The foot's gap is the two columns' totals apart: 1.737,70 − 1.025,24.
    expect(foot()).toHaveTextContent("+€712.46");
    expect(Math.round((1737.7 - 1025.24) * 100) / 100).toBe(712.46);
  });
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
