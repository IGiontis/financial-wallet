import { describe, it, expect } from "vitest";
import type { MonthlyFlow } from "./analyticsUtils";
import { monthLedger, periodTotals } from "./dashboardUtils";

// May to October 2026, read on 6 October: five finished months and one running.
const INCOME = [1800, 1750, 1500, 1820, 1890, 0];
const EXPENSES = [1420, 1330, 1580, 1290, 1650, 100];
const flows: MonthlyFlow[] = INCOME.map((income, i) => ({
  key: `2026-${String(5 + i).padStart(2, "0")}`,
  start: new Date(2026, 4 + i, 1),
  income,
  expenses: EXPENSES[i],
  invested: 0,
  goals: 0,
  net: income - EXPENSES[i],
}));
const NOW = new Date(2026, 9, 6, 12);

describe("the month-by-month ledger", () => {
  const ledger = monthLedger(flows, NOW);

  it("keeps each month's own figures, and only October is running", () => {
    expect(ledger.rows.map((r) => r.net)).toEqual([380, 420, -80, 530, 240, -100]);
    expect(ledger.rows.map((r) => r.running)).toEqual([false, false, false, false, false, true]);
  });

  it("runs the net up month by month, ending on the period's net", () => {
    expect(ledger.rows.map((r) => r.cumulative)).toEqual([380, 800, 720, 1250, 1490, 1390]);
    // A second way: the total of the months, as the tiles show it.
    expect(ledger.rows.at(-1)!.cumulative).toBe(periodTotals(flows).net);
    expect(ledger.total.net).toBe(1390);
  });

  it("gives each month its rate, and none to a month with no income", () => {
    // 380 / 1.800 = 21,11%; −80 / 1.500 = −5,33%.
    expect(ledger.rows[0].rate).toBe(21.11);
    expect(ledger.rows[2].rate).toBe(-5.33);
    expect(ledger.rows[5].rate).toBeUndefined();
  });

  it("averages the finished months only", () => {
    // 1.800 + 1.750 + 1.500 + 1.820 + 1.890 = 8.760 over 5 = 1.752.
    expect(ledger.average).toEqual({ income: 1752, expenses: 1454, net: 298, months: 5 });
    // And the averages still add up: 1.752 − 1.454 = 298.
    expect(ledger.average!.income - ledger.average!.expenses).toBe(ledger.average!.net);
  });

  it("names the best and worst finished month, not the running one", () => {
    expect(ledger.best).toBe("2026-08");
    // October kept −100, but it is not over: July's −80 is the worst.
    expect(ledger.worst).toBe("2026-07");
    expect(ledger.positive).toEqual({ count: 4, of: 5 });
  });

  it("totals every month, the running one included", () => {
    expect(ledger.total.income).toBe(8760);
    expect(ledger.total.expenses).toBe(7370);
  });
});

describe("a short or flat period", () => {
  it("names no best or worst with a single finished month", () => {
    const ledger = monthLedger(flows.slice(4), NOW);
    expect(ledger.best).toBeUndefined();
    expect(ledger.worst).toBeUndefined();
    expect(ledger.average?.months).toBe(1);
  });

  it("names no best or worst when every month kept the same", () => {
    const same = flows.slice(0, 3).map((f) => ({ ...f, income: 1000, expenses: 800, net: 200 }));
    expect(monthLedger(same, NOW).best).toBeUndefined();
  });

  it("has no average while the only month is the running one", () => {
    const ledger = monthLedger(flows.slice(5), NOW);
    expect(ledger.average).toBeUndefined();
    expect(ledger.positive).toEqual({ count: 0, of: 0 });
  });

  it("rounds the running net to the cent", () => {
    const cents = [0.1, 0.2, 0.3].map((net, i) => ({ ...flows[i], income: net, expenses: 0, net }));
    expect(monthLedger(cents, NOW).rows.map((r) => r.cumulative)).toEqual([0.1, 0.3, 0.6]);
  });
});
