import { describe, it, expect, beforeAll } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import i18n from "../../../i18n";
import type { MonthlyFlow } from "../analyticsUtils";
import { monthLedger } from "../dashboardUtils";
import { ChartCard } from "./ChartCard";
import MonthByMonthDetails from "./MonthByMonthDetails";

// July to October 2026, read on 6 October: three finished months and one running.
const flows: MonthlyFlow[] = [
  [1500, 1620],
  [1850, 1790],
  [1920, 1582.4],
  [0, 155.3],
].map(([income, expenses], i) => ({
  key: `2026-${String(7 + i).padStart(2, "0")}`,
  start: new Date(2026, 6 + i, 1),
  income,
  expenses,
  invested: 0,
  goals: 0,
  net: Math.round((income - expenses) * 100) / 100,
}));
const ledger = monthLedger(flows, new Date(2026, 9, 6));
const format = (n: number) => `€${n.toFixed(2)}`;
const label = (d: Date) => ["Jul", "Aug", "Sep", "Oct"][d.getMonth() - 6];

beforeAll(async () => {
  await i18n.changeLanguage("en");
});

const details = <MonthByMonthDetails ledger={ledger} trio={[]} formatCurrency={format} monthLabel={label} />;

describe("the month-by-month card", () => {
  it("keeps the figures off the card, and opens them only from the eye in its corner", () => {
    render(
      <ChartCard title="Month by month" details={{ content: details }}>
        <div>bars</div>
      </ChartCard>,
    );
    expect(screen.queryByText("Every month")).toBeNull();

    // A tap on the drawing is a tap on the chart, not a way into the sheet.
    fireEvent.click(screen.getByText("bars"));
    expect(screen.queryByText("Every month")).toBeNull();

    // One way in: the button in the header.
    const eye = screen.getByRole("button", { name: "Month by month: details" });
    expect(eye.tagName).toBe("BUTTON");
    fireEvent.click(eye);
    expect(screen.getByText("Every month")).toBeInTheDocument();
  });
});

describe("the details", () => {
  it("lists the newest month first, and tags the running, best and worst months", () => {
    render(details);
    const rows = within(screen.getAllByRole("rowgroup")[1]).getAllByRole("row");
    expect(rows.map((r) => within(r).getByRole("rowheader").textContent)).toEqual(["Octin progress", "Sepbest", "Aug", "Julworst"]);
  });

  it("totals every month and averages the finished ones", () => {
    render(details);
    const foot = within(screen.getAllByRole("rowgroup")[2]);
    // (1.500 + 1.850 + 1.920) / 3 = 1.756,67; net (−120 + 60 + 337,60) / 3 = 92,53.
    expect(foot.getByRole("row", { name: /Average/ })).toHaveTextContent("€1756.67");
    expect(foot.getByRole("row", { name: /Average/ })).toHaveTextContent("+€92.53");
    // All four: 277,60 − 155,30 = 122,30.
    expect(foot.getByRole("row", { name: /Total/ })).toHaveTextContent("+€122.30");
  });

  it("reads the period at a glance above the charts", () => {
    render(details);
    // Best month September, in the tile as well as in its row.
    expect(screen.getAllByText("Sep")).toHaveLength(2);
    expect(screen.getByText("2 of 3")).toBeInTheDocument();
    expect(screen.getByText("over 3 finished months")).toBeInTheDocument();
  });
});
