import type { PlanPeriod } from "./plannerUtils";

export interface MonthRow {
  key: string;
  /** The month — or a quarter, from eighteen months up — named in full. */
  name: string;
  quarter: boolean;
  from: number;
  income: number;
  outgoing: number;
  to: number;
}

/**
 * The periods as rows that start where the one before ended: the opening
 * balance, then each period's own end. Exported for the test that holds the
 * chain together — each row's `from` + in − out is its `to`.
 */
export function monthRows(periods: PlanPeriod[], opening: number, name: (period: PlanPeriod) => string): MonthRow[] {
  let from = opening;
  return periods.map((period) => {
    const row = { key: period.key, name: name(period), quarter: period.key.includes("Q"), from, income: period.income, outgoing: period.outgoing, to: period.balance };
    from = period.balance;
    return row;
  });
}
