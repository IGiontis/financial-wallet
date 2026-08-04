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
  /** Headline income — plain income plus anything withdrawn back out. */
  totalIncome: number;
  /** Income excluding withdrawals. Used for "money left" so a withdrawal isn't
   *  counted twice (once here, once as a negative net investment). */
  plainIncome: number;
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
//
// Money flow model:
//   • A DEPOSIT into a goal/investment is money leaving the spendable pool.
//   • A WITHDRAWAL is money coming back into it, so it counts as INCOME.
// Because withdrawals are counted as income, the investment/goal totals must be
// GROSS deposits (not net), otherwise a withdrawal would be counted twice.

const signedContribution = (tx: Transaction) => (tx.contributionType === "deposit" ? tx.amount : -tx.amount);

const isPlainIncome = (tx: Transaction) => tx.type === "income" && !tx.isInvestmentTransaction;
const isPlainExpense = (tx: Transaction) => tx.type === "expense" && !tx.isInvestmentTransaction;
const isInvestmentContribution = (tx: Transaction) => !!tx.isInvestmentTransaction && !tx.isGoalTransaction;
const isGoalContribution = (tx: Transaction) => !!tx.isGoalTransaction;

/** Any withdrawal out of a goal or investment — treated as income. */
const isWithdrawal = (tx: Transaction) => !!tx.isInvestmentTransaction && tx.contributionType === "withdrawal";

const isDeposit = (tx: Transaction) => tx.contributionType === "deposit";

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
        // Withdrawals are income, so they land in the income bar.
        income: Math.round(weekTx.filter((t) => isPlainIncome(t) || isWithdrawal(t)).reduce((s, t) => s + t.amount, 0)),
        expenses: Math.round(weekTx.filter(isPlainExpense).reduce((s, t) => s + Math.abs(t.amount), 0)),
        investments: Math.round(weekTx.filter((t) => isInvestmentContribution(t) && isDeposit(t)).reduce((s, t) => s + t.amount, 0)),
        goals: Math.round(weekTx.filter((t) => isGoalContribution(t) && isDeposit(t)).reduce((s, t) => s + t.amount, 0)),
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
      if (isDeposit(tx)) d.goals += tx.amount;
      else d.income += tx.amount; // withdrawal → income
      d.goalsNet += signedContribution(tx);
    } else if (tx.isInvestmentTransaction) {
      if (isDeposit(tx)) d.investments += tx.amount;
      else d.income += tx.amount; // withdrawal → income
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
  const plainIncome = transactions.filter(isPlainIncome).reduce((s, t) => s + t.amount, 0);
  // Withdrawing from a goal/investment puts money back in your pocket → income.
  const withdrawn = transactions.filter(isWithdrawal).reduce((s, t) => s + t.amount, 0);

  const totalIncome = plainIncome + withdrawn;
  const totalExpenses = transactions.filter(isPlainExpense).reduce((s, t) => s + Math.abs(t.amount), 0);
  const netIncome = totalIncome - totalExpenses;
  const savingsRate = totalIncome > 0 ? (netIncome / totalIncome) * 100 : 0;

  return { totalIncome, plainIncome, totalExpenses, netIncome, savingsRate };
};

/**
 * NET amount tied up in non-goal investments this period (deposits − withdrawals).
 * Goes negative when you take out more than you put in, so totalling across
 * months shows how much is actually invested.
 */
export const sumInvestments = (transactions: Transaction[]) => transactions.filter(isInvestmentContribution).reduce((s, tx) => s + signedContribution(tx), 0);

/** NET amount tied up in targeted goals this period (deposits − withdrawals). */
export const sumGoalSavings = (transactions: Transaction[]) => transactions.filter(isGoalContribution).reduce((s, tx) => s + signedContribution(tx), 0);

/** Total pulled back out of goals and investments — surfaced as income. */
export const sumWithdrawals = (transactions: Transaction[]) => transactions.filter(isWithdrawal).reduce((s, tx) => s + tx.amount, 0);

/**
 * Spendable money left over.
 *
 * Uses PLAIN income (not the headline figure) together with NET investment and
 * goal flows. A withdrawal already lifts this by showing up as a negative net
 * flow, so including it in income here would count it twice.
 */
export const calculateMoneyLeft = (transactions: Transaction[]): number => {
  const { plainIncome, totalExpenses } = calculateMetrics(transactions);
  return plainIncome - totalExpenses - sumInvestments(transactions) - sumGoalSavings(transactions);
};
