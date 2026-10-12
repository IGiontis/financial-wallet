import { describe, it, expect, beforeAll } from "vitest";
import { render, screen, within } from "@testing-library/react";
import i18n from "../../../i18n";
import PlanMonthRows from "./PlanMonthRows";
import { monthRows } from "../monthRows";
import type { PlanPeriod } from "../plannerUtils";

// The months as rows that hand on to each other. What matters is the chain:
// the first starts from what you have today, each starts where the last one
// ended, and in − out is exactly how far a row moves — checked here by adding
// it up again, not by reading the rows back.

const round2 = (n: number) => Math.round(n * 100) / 100;
const fmt = (n: number) => `€${n.toFixed(2)}`;

// The screenshot's two months: from 232,23 today to 1.223,19.
const periods: PlanPeriod[] = [
  { key: "2026-10", start: new Date(2026, 9, 1), income: 1700, outgoing: 764, balance: 1168.23 },
  { key: "2026-11", start: new Date(2026, 10, 1), income: 1400, outgoing: 1345.04, balance: 1223.19 },
];

beforeAll(async () => {
  await i18n.changeLanguage("en");
});

describe("monthRows", () => {
  it("starts from today's balance and hands each month's end to the next", () => {
    const rows = monthRows(periods, 232.23, (p) => p.key);
    expect(rows.map((r) => [r.from, r.to])).toEqual([
      [232.23, 1168.23],
      [1168.23, 1223.19],
    ]);
    // Second way: in − out moves each row from its start to its end.
    for (const row of rows) expect(round2(row.from + row.income - row.outgoing)).toBe(row.to);
    // And the whole: today plus every month's in − out is where it ends.
    expect(round2(232.23 + 1700 - 764 + 1400 - 1345.04)).toBe(1223.19);
  });

  it("calls a quarter a quarter", () => {
    const [row] = monthRows([{ key: "2027-Q2", start: new Date(2027, 3, 1), income: 4200, outgoing: 3900, balance: 1500 }], 1200, (p) => p.key);
    expect(row.quarter).toBe(true);
  });
});

describe("the rows on screen", () => {
  it("say where each month starts and ends, what came and went, and what it left", () => {
    render(<PlanMonthRows periods={periods} opening={232.23} formatCurrency={fmt} locale="en" />);
    const october = screen.getByRole("region", { name: "October 2026" });
    expect(october).toHaveTextContent("€232.23 → €1168.23");
    expect(october).toHaveTextContent("+€1700.00");
    expect(october).toHaveTextContent("−€764.00");
    expect(within(october).getByText(/Left over this month/)).toHaveTextContent("Left over this month +€936.00");
    expect(1700 - 764).toBe(936);

    const november = screen.getByRole("region", { name: "November 2026" });
    expect(november).toHaveTextContent("€1168.23 → €1223.19");
  });

  it("says plainly when a month spent more than it brought in", () => {
    render(<PlanMonthRows periods={[{ key: "2026-12", start: new Date(2026, 11, 1), income: 1400, outgoing: 1900, balance: 723.19 }]} opening={1223.19} formatCurrency={fmt} locale="en" />);
    expect(screen.getByText(/More went out than came in/)).toHaveTextContent("−€500.00");
  });
});
