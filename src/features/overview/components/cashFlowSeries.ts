// Series definition shared by the chart and its legend. Kept in its own module
// (free of recharts imports) so the legend can render immediately while the
// chart itself is still being lazily fetched.

export const SERIES = [
  { key: "income", token: "--color-income", labelKey: "overview.income" },
  { key: "expenses", token: "--color-expense", labelKey: "overview.expenses" },
  { key: "investments", token: "--color-invest", labelKey: "overview.invested" },
  { key: "goals", token: "--color-goal", labelKey: "overview.goals" },
] as const;

export const cssVar = (name: string) => `var(${name})`;
