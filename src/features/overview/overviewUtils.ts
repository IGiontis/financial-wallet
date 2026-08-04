import { startOfMonth, subMonths, startOfYear, endOfYear, endOfMonth, format, isWithinInterval, startOfWeek, endOfWeek, addWeeks } from "date-fns";
import type { Transaction } from "../../shared/types/IndexTypes";
import { firestoreToDate } from "../../shared/utils/dates";

// ─── Types ────────────────────────────────────────────────────────────────────

export type TimePeriod = "current_month" | "last_3_months" | "last_6_months" | "year_to_date" | "this_year" | "custom";

export interface CustomRange {
  fromMonth: number;
  fromYear: number;
  toMonth: number;
  toYear: number;
}

export interface DateRange {
  start: Date;
  end: Date;
}

export interface ChartDataPoint {
  label: string;
  income: number;
  expenses: number;
  investments: number;
  goals: number;
  investmentsNet: number;
  goalsNet: number;
}

export interface DashboardMetrics {
  totalIncome: number;
  totalExpenses: number;
  netIncome: number;
  savingsRate: number;
}

// ─── Period → date range ──────────────────────────────────────────────────────

export const getDateRange = (period: TimePeriod, custom?: CustomRange, now: Date = new Date()): DateRange => {
  if (period === "custom" && custom) {
    const start = startOfMonth(new Date(custom.fromYear, custom.fromMonth, 1));
    const rawEnd = endOfMonth(new Date(custom.toYear, custom.toMonth, 1));
    return { start, end: rawEnd > now ? now : rawEnd };
  }
  switch (period) {
    case "last_3_months":
      return { start: startOfMonth(subMonths(now, 2)), end: now };
    case "last_6_months":
      return { start: startOfMonth(subMonths(now, 5)), end: now };
    case "year_to_date":
      return { start: startOfYear(now), end: now };
    case "this_year":
      return { start: startOfYear(now), end: endOfYear(now) };
    case "current_month":
    default:
      return { start: startOfMonth(now), end: now };
  }
};

export const filterTransactions = (transactions: Transaction[], range: DateRange) =>
  transactions.filter((tx) => isWithinInterval(firestoreToDate(tx.date), { start: range.start, end: range.end }));

// ─── Transaction classification ───────────────────────────────────────────────
// Investment/goal contributions are mirrored as transactions, so plain income
// and expense totals must exclude them to avoid double counting.

const signedContribution = (tx: Transaction) => (tx.contributionType === "deposit" ? tx.amount : -tx.amount);

const isPlainIncome = (tx: Transaction) => tx.type === "income" && !tx.isInvestmentTransaction;
const isPlainExpense = (tx: Transaction) => tx.type === "expense" && !tx.isInvestmentTransaction;
const isInvestmentContribution = (tx: Transaction) => !!tx.isInvestmentTransaction && !tx.isGoalTransaction;
const isGoalContribution = (tx: Transaction) => !!tx.isGoalTransaction;

// ─── Grouping ─────────────────────────────────────────────────────────────────

export const groupByWeek = (transactions: Transaction[], range: DateRange, weekLabel: (n: number) => string = (n) => `Week ${n}`): ChartDataPoint[] => {
  const weeks: { start: Date; end: Date; label: string }[] = [];
  let cursor = startOfWeek(range.start, { weekStartsOn: 1 });
  let weekNum = 1;
  while (cursor <= range.end) {
    const wEnd = endOfWeek(cursor, { weekStartsOn: 1 });
    weeks.push({ start: cursor, end: wEnd < range.end ? wEnd : range.end, label: weekLabel(weekNum) });
    cursor = addWeeks(cursor, 1);
    weekNum++;
  }

  return weeks
    .map((w) => {
      const weekTx = transactions.filter((tx) => {
        const d = firestoreToDate(tx.date);
        return d >= w.start && d <= w.end;
      });
      return {
        label: w.label,
        income: Math.round(weekTx.filter(isPlainIncome).reduce((s, t) => s + t.amount, 0)),
        expenses: Math.round(weekTx.filter(isPlainExpense).reduce((s, t) => s + Math.abs(t.amount), 0)),
        investments: Math.round(weekTx.filter((t) => isInvestmentContribution(t) && t.contributionType === "deposit").reduce((s, t) => s + t.amount, 0)),
        goals: Math.round(weekTx.filter((t) => isGoalContribution(t) && t.contributionType === "deposit").reduce((s, t) => s + t.amount, 0)),
        investmentsNet: Math.round(weekTx.filter(isInvestmentContribution).reduce((s, t) => s + signedContribution(t), 0)),
        goalsNet: Math.round(weekTx.filter(isGoalContribution).reduce((s, t) => s + signedContribution(t), 0)),
      };
    })
    .filter((w) => w.income > 0 || w.expenses > 0 || w.investments > 0 || w.goals > 0);
};

export const groupByMonth = (transactions: Transaction[]): ChartDataPoint[] => {
  const map = new Map<string, Omit<ChartDataPoint, "label"> & { firstDay: Date }>();

  transactions.forEach((tx) => {
    const firstDay = startOfMonth(firestoreToDate(tx.date));
    const key = format(firstDay, "yyyy-MM");
    if (!map.has(key)) map.set(key, { income: 0, expenses: 0, investments: 0, goals: 0, investmentsNet: 0, goalsNet: 0, firstDay });
    const d = map.get(key)!;

    if (isGoalContribution(tx)) {
      if (tx.contributionType === "deposit") d.goals += tx.amount;
      d.goalsNet += signedContribution(tx);
    } else if (tx.isInvestmentTransaction) {
      if (tx.contributionType === "deposit") d.investments += tx.amount;
      d.investmentsNet += signedContribution(tx);
    } else if (tx.type === "income") {
      d.income += tx.amount;
    } else {
      d.expenses += Math.abs(tx.amount);
    }
  });

  return Array.from(map.values())
    .sort((a, b) => a.firstDay.getTime() - b.firstDay.getTime())
    .map((d) => ({
      label: format(d.firstDay, "MMM yy"),
      income: Math.round(d.income),
      expenses: Math.round(d.expenses),
      investments: Math.round(d.investments),
      goals: Math.round(d.goals),
      investmentsNet: Math.round(d.investmentsNet),
      goalsNet: Math.round(d.goalsNet),
    }));
};

// ─── Metrics ──────────────────────────────────────────────────────────────────

export const calculateMetrics = (transactions: Transaction[]): DashboardMetrics => {
  const totalIncome = transactions.filter(isPlainIncome).reduce((s, t) => s + t.amount, 0);
  const totalExpenses = transactions.filter(isPlainExpense).reduce((s, t) => s + Math.abs(t.amount), 0);
  const netIncome = totalIncome - totalExpenses;
  const savingsRate = totalIncome > 0 ? (netIncome / totalIncome) * 100 : 0;
  return { totalIncome, totalExpenses, netIncome, savingsRate };
};

/** Net investment flow (deposits minus withdrawals) for non-goal investments. */
export const sumInvestments = (transactions: Transaction[]) => transactions.filter(isInvestmentContribution).reduce((s, tx) => s + signedContribution(tx), 0);

/** Net savings flow (deposits minus withdrawals) across targeted goals. */
export const sumGoalSavings = (transactions: Transaction[]) => transactions.filter(isGoalContribution).reduce((s, tx) => s + signedContribution(tx), 0);
