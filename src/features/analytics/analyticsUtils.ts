import { getDaysInMonth, startOfDay, startOfMonth, startOfWeek, subMonths } from "date-fns";
import { firestoreToDate } from "../../shared/utils/dates";
import type { Transaction } from "../../shared/types/IndexTypes";

// Everything the Analytics page draws is derived here, from transactions the
// app has already fetched — the whole page costs zero extra Firestore reads.
//
// Money-flow model, identical to the Overview so the two pages can never
// disagree:
//   • A DEPOSIT into a goal/investment is money leaving the spendable pool —
//     it is a transfer, not spending, so it never counts as an expense.
//   • A WITHDRAWAL is money coming back, so it counts as income.
//   • Deposit totals are therefore GROSS, never net: netting them *and*
//     counting withdrawals as income would count the same euro twice.

const isGoalContribution = (tx: Transaction) => !!tx.isGoalTransaction;
const isInvestmentContribution = (tx: Transaction) => !!tx.isInvestmentTransaction && !tx.isGoalTransaction;
const isTransfer = (tx: Transaction) => !!tx.isInvestmentTransaction || !!tx.isGoalTransaction;

/** Real spending — what actually left your pocket for good. */
export const isSpending = (tx: Transaction) => !isTransfer(tx) && tx.type === "expense";

const round2 = (n: number) => Math.round(n * 100) / 100;

const monthKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
const dayKey = (d: Date) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
const addMonth = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth() + n, 1);
const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);

// ─── Range ───────────────────────────────────────────────────────────────────

export type AnalyticsRange = "3m" | "6m" | "12m" | "all";

export const ANALYTICS_RANGES: readonly AnalyticsRange[] = ["3m", "6m", "12m", "all"] as const;

/**
 * Inclusive lower bound for a range, snapped to a month start so charts always
 * show whole months. `null` means "everything on record".
 */
export function rangeStart(range: AnalyticsRange, now: Date = new Date()): Date | null {
  if (range === "all") return null;
  const months = range === "3m" ? 3 : range === "6m" ? 6 : 12;
  return startOfMonth(subMonths(now, months - 1));
}

export function withinRange(transactions: Transaction[], from: Date | null, to: Date = new Date()): Transaction[] {
  const end = startOfDay(to);
  return transactions.filter((tx) => {
    const d = startOfDay(firestoreToDate(tx.date));
    return (!from || d >= startOfDay(from)) && d <= end;
  });
}

// ─── Monthly flows — the base every time series is built on ──────────────────

export interface MonthlyFlow {
  /** "2026-03" */
  key: string;
  start: Date;
  /** Plain income plus anything withdrawn back out of a goal or investment. */
  income: number;
  /** Real spending only — transfers excluded. */
  expenses: number;
  /** Gross deposits into non-goal investments. */
  invested: number;
  /** Gross deposits into targeted goals. */
  goals: number;
  /** income − expenses: what you kept, whether it sits in cash or in a goal. */
  net: number;
}

/**
 * Buckets transactions per calendar month across the whole window.
 *
 * The list is *dense*: a month with no activity still appears with zeroes.
 * Dropping it would splice two distant months together and make a quiet
 * stretch read as a straight line rather than as nothing happening.
 */
export function monthlyFlows(transactions: Transaction[], from: Date | null, to: Date = new Date()): MonthlyFlow[] {
  const rows = transactions.map((tx) => ({ tx, date: firestoreToDate(tx.date) }));
  const last = startOfMonth(to);

  let first = from ? startOfMonth(from) : undefined;
  if (!first) {
    const earliest = rows.reduce<Date | undefined>((min, r) => (!min || r.date < min ? r.date : min), undefined);
    first = earliest ? startOfMonth(earliest) : last;
  }
  if (first > last) first = last;

  const months: MonthlyFlow[] = [];
  for (let cursor = first; cursor <= last; cursor = addMonth(cursor, 1)) {
    months.push({ key: monthKey(cursor), start: cursor, income: 0, expenses: 0, invested: 0, goals: 0, net: 0 });
  }

  const byKey = new Map(months.map((m) => [m.key, m]));

  for (const { tx, date } of rows) {
    const month = byKey.get(monthKey(date));
    if (!month) continue;
    const amount = Math.abs(tx.amount);

    if (isGoalContribution(tx)) {
      if (tx.contributionType === "withdrawal") month.income += amount;
      else month.goals += amount;
    } else if (isInvestmentContribution(tx)) {
      if (tx.contributionType === "withdrawal") month.income += amount;
      else month.invested += amount;
    } else if (tx.type === "income") {
      month.income += amount;
    } else {
      month.expenses += amount;
    }
  }

  for (const m of months) {
    m.income = round2(m.income);
    m.expenses = round2(m.expenses);
    m.invested = round2(m.invested);
    m.goals = round2(m.goals);
    m.net = round2(m.income - m.expenses);
  }

  return months;
}

// ─── 1. Cumulative net position ──────────────────────────────────────────────

export interface CumulativePoint {
  key: string;
  start: Date;
  net: number;
  /** Running total of `net` from the start of the window. */
  cumulative: number;
}

export function cumulativeNet(flows: MonthlyFlow[]): CumulativePoint[] {
  let running = 0;
  return flows.map((f) => {
    running += f.net;
    return { key: f.key, start: f.start, net: f.net, cumulative: round2(running) };
  });
}

// ─── 2. Savings rate ─────────────────────────────────────────────────────────

export interface SavingsPoint {
  key: string;
  start: Date;
  income: number;
  net: number;
  /** Percentage of income kept. `null` for a month with no income at all — a
   *  rate of 0% would be a claim we can't make. */
  rate: number | null;
}

export function savingsRateSeries(flows: MonthlyFlow[]): SavingsPoint[] {
  return flows.map((f) => ({
    key: f.key,
    start: f.start,
    income: f.income,
    net: f.net,
    rate: f.income > 0 ? round2((f.net / f.income) * 100) : null,
  }));
}

/**
 * Weighted by income rather than a mean of the monthly rates, so a month with
 * €50 of income can't swing the average as hard as a month with €2,000.
 */
export function averageSavingsRate(flows: MonthlyFlow[]): number | undefined {
  const income = flows.reduce((s, f) => s + f.income, 0);
  if (income <= 0) return undefined;
  const net = flows.reduce((s, f) => s + f.net, 0);
  return round2((net / income) * 100);
}

// ─── 4. Category mix over time ───────────────────────────────────────────────

export const OTHER_CATEGORY_ID = "__other__";

export interface CategoryTrend {
  /** Stack order, biggest spender first. Ends with `__other__` when folded. */
  categoryIds: string[];
  /** One row per month, with a total per id in `categoryIds` (zero when idle). */
  rows: { key: string; start: Date; totals: Record<string, number> }[];
  /** How many real categories `__other__` stands for. */
  otherCount: number;
}

/**
 * Ranks categories over the *whole* window before splitting per month, so a
 * band keeps the same colour and position in every column — otherwise the
 * stack would reshuffle itself month to month and be unreadable.
 */
export function categoryTrend(transactions: Transaction[], flows: MonthlyFlow[], limit = 5): CategoryTrend {
  const spending = transactions.filter(isSpending);

  const overall = new Map<string, number>();
  for (const tx of spending) overall.set(tx.categoryId, (overall.get(tx.categoryId) ?? 0) + Math.abs(tx.amount));

  const ranked = Array.from(overall.entries()).sort((a, b) => b[1] - a[1]);
  const top = ranked.slice(0, limit).map(([id]) => id);
  const rest = new Set(ranked.slice(limit).map(([id]) => id));
  const categoryIds = rest.size > 0 ? [...top, OTHER_CATEGORY_ID] : top;

  const rows = flows.map((f) => ({
    key: f.key,
    start: f.start,
    totals: Object.fromEntries(categoryIds.map((id) => [id, 0])) as Record<string, number>,
  }));
  const byKey = new Map(rows.map((r) => [r.key, r]));

  for (const tx of spending) {
    const row = byKey.get(monthKey(firestoreToDate(tx.date)));
    if (!row) continue;
    const id = rest.has(tx.categoryId) ? OTHER_CATEGORY_ID : tx.categoryId;
    if (id in row.totals) row.totals[id] += Math.abs(tx.amount);
  }

  for (const row of rows) for (const id of categoryIds) row.totals[id] = round2(row.totals[id]);

  return { categoryIds, rows, otherCount: rest.size };
}

// ─── 5. This month against your own baseline ─────────────────────────────────

export interface CategoryProfileRow {
  categoryId: string;
  /** Spend in the most recent month of the window. */
  current: number;
  /** Mean monthly spend across every *earlier* month in the window. */
  average: number;
}

/**
 * Needs at least one completed month to compare against — with a single month
 * of data there is no baseline and the chart would just restate itself.
 */
export function categoryProfile(transactions: Transaction[], flows: MonthlyFlow[], limit = 6): CategoryProfileRow[] {
  if (flows.length < 2) return [];

  const currentKey = flows[flows.length - 1].key;
  const priorMonths = flows.length - 1;
  const spending = transactions.filter(isSpending);

  const totals = new Map<string, { current: number; prior: number }>();
  for (const tx of spending) {
    const key = monthKey(firestoreToDate(tx.date));
    const entry = totals.get(tx.categoryId) ?? { current: 0, prior: 0 };
    if (key === currentKey) entry.current += Math.abs(tx.amount);
    else entry.prior += Math.abs(tx.amount);
    totals.set(tx.categoryId, entry);
  }

  return Array.from(totals.entries())
    .map(([categoryId, v]) => ({ categoryId, current: round2(v.current), average: round2(v.prior / priorMonths) }))
    // Ranked by the bigger of the two, so a category that spiked this month
    // makes the cut even if its baseline is small — that's the interesting case.
    .sort((a, b) => Math.max(b.current, b.average) - Math.max(a.current, a.average))
    .slice(0, limit)
    .filter((r) => r.current > 0 || r.average > 0);
}

// ─── 6. Payees ───────────────────────────────────────────────────────────────

export interface PayeeNode {
  name: string;
  value: number;
  count: number;
}

/** Groups spending by description, case-insensitively, keeping the first spelling seen. */
export function payeeBreakdown(transactions: Transaction[], limit = 12): PayeeNode[] {
  const byName = new Map<string, PayeeNode>();

  for (const tx of transactions.filter(isSpending)) {
    const label = tx.description.trim();
    if (!label) continue;
    const key = label.toLowerCase();
    const entry = byName.get(key) ?? { name: label, value: 0, count: 0 };
    entry.value += Math.abs(tx.amount);
    entry.count += 1;
    byName.set(key, entry);
  }

  return Array.from(byName.values())
    .map((p) => ({ ...p, value: round2(p.value) }))
    .sort((a, b) => b.value - a.value)
    .slice(0, limit);
}

// ─── 7. Day-by-day heatmap ───────────────────────────────────────────────────

export interface HeatmapCell {
  date: Date;
  amount: number;
  count: number;
}

export interface HeatmapWeek {
  start: Date;
  /** Seven slots, index 0 = Monday. `null` outside the window. */
  days: (HeatmapCell | null)[];
}

export interface Heatmap {
  weeks: HeatmapWeek[];
  /** Busiest single day — the scale every cell's intensity is measured against. */
  max: number;
  /** Total per weekday across the window, index 0 = Monday. */
  weekdayTotals: number[];
}

export function spendingHeatmap(transactions: Transaction[], from: Date | null, to: Date = new Date()): Heatmap {
  const rows = transactions.filter(isSpending).map((tx) => ({ date: startOfDay(firestoreToDate(tx.date)), amount: Math.abs(tx.amount) }));

  const end = startOfDay(to);
  let start = from ? startOfDay(from) : undefined;
  if (!start) {
    const earliest = rows.reduce<Date | undefined>((min, r) => (!min || r.date < min ? r.date : min), undefined);
    start = earliest ?? end;
  }
  if (start > end) start = end;

  const totals = new Map<string, { amount: number; count: number }>();
  for (const r of rows) {
    if (r.date < start || r.date > end) continue;
    const k = dayKey(r.date);
    const entry = totals.get(k) ?? { amount: 0, count: 0 };
    entry.amount += r.amount;
    entry.count += 1;
    totals.set(k, entry);
  }

  const weeks: HeatmapWeek[] = [];
  const weekdayTotals = [0, 0, 0, 0, 0, 0, 0];
  let max = 0;

  // Start from the Monday on or before the window so every column is a full
  // week and the weekday rows line up.
  for (let cursor = startOfWeek(start, { weekStartsOn: 1 }); cursor <= end; cursor = addDays(cursor, 7)) {
    const days: (HeatmapCell | null)[] = [];
    for (let i = 0; i < 7; i++) {
      const day = addDays(cursor, i);
      if (day < start || day > end) {
        days.push(null);
        continue;
      }
      const entry = totals.get(dayKey(day)) ?? { amount: 0, count: 0 };
      days.push({ date: day, amount: round2(entry.amount), count: entry.count });
      weekdayTotals[i] += entry.amount;
      if (entry.amount > max) max = entry.amount;
    }
    weeks.push({ start: cursor, days });
  }

  return { weeks, max: round2(max), weekdayTotals: weekdayTotals.map(round2) };
}

// ─── 8. This month's pace against last month's ───────────────────────────────

export interface PacePoint {
  day: number;
  /** Running total so far this month. `null` after today. */
  current: number | null;
  previous: number | null;
}

export interface MonthPace {
  points: PacePoint[];
  /** Spent so far this month. */
  currentTotal: number;
  /** What last month had reached by this same day — the like-for-like figure. */
  previousToDate: number;
  /** Last month's full-month total. */
  previousTotal: number;
}

export function monthPace(transactions: Transaction[], now: Date = new Date()): MonthPace {
  const spending = transactions.filter(isSpending);
  const currentStart = startOfMonth(now);
  const previousStart = subMonths(currentStart, 1);
  const today = now.getDate();

  const runningTotals = (start: Date): number[] => {
    const perDay = new Array<number>(getDaysInMonth(start)).fill(0);
    for (const tx of spending) {
      const d = firestoreToDate(tx.date);
      if (d.getFullYear() === start.getFullYear() && d.getMonth() === start.getMonth()) perDay[d.getDate() - 1] += Math.abs(tx.amount);
    }
    let run = 0;
    return perDay.map((v) => round2((run += v)));
  };

  const current = runningTotals(currentStart);
  const previous = runningTotals(previousStart);
  const length = Math.max(current.length, previous.length);

  const points: PacePoint[] = [];
  for (let i = 0; i < length; i++) {
    points.push({
      day: i + 1,
      // The line has to stop at today — carrying a flat running total to the end
      // of the month would read as "spent nothing since", not "hasn't happened yet".
      current: i < current.length && i + 1 <= today ? current[i] : null,
      previous: i < previous.length ? previous[i] : null,
    });
  }

  return {
    points,
    currentTotal: current[Math.min(today, current.length) - 1] ?? 0,
    previousToDate: previous[Math.min(today, previous.length) - 1] ?? 0,
    previousTotal: previous[previous.length - 1] ?? 0,
  };
}

// ─── 9. Transaction size distribution ────────────────────────────────────────

export interface HistogramBin {
  min: number;
  /** `null` on the final open-ended bin. */
  max: number | null;
  count: number;
  amount: number;
}

/** Default edges chosen for everyday euro amounts — a coffee through to rent. */
export const HISTOGRAM_EDGES = [10, 25, 50, 100, 250, 500] as const;

export function amountHistogram(transactions: Transaction[], edges: readonly number[] = HISTOGRAM_EDGES): HistogramBin[] {
  const bins: HistogramBin[] = edges.map((max, i) => ({ min: i === 0 ? 0 : edges[i - 1], max, count: 0, amount: 0 }));
  bins.push({ min: edges[edges.length - 1], max: null, count: 0, amount: 0 });

  for (const tx of transactions.filter(isSpending)) {
    const amount = Math.abs(tx.amount);
    // Edges are upper-exclusive, so €25.00 lands in "25–50", not "10–25".
    const index = edges.findIndex((edge) => amount < edge);
    const bin = bins[index === -1 ? bins.length - 1 : index];
    bin.count += 1;
    bin.amount += amount;
  }

  for (const bin of bins) bin.amount = round2(bin.amount);
  return bins;
}

// ─── 11. Money flow ──────────────────────────────────────────────────────────

export const FLOW_HUB_ID = "hub";
export const FLOW_SAVINGS_ID = "savings";
export const FLOW_LEFTOVER_ID = "leftover";
export const FLOW_DEFICIT_ID = "deficit";
export const FLOW_WITHDRAWALS_ID = "withdrawals";

export interface FlowNode {
  /** Unique across the whole diagram — see the prefixing note below. */
  id: string;
  kind: "income" | "hub" | "expense" | "savings" | "leftover";
  /** Set when the node stands for a real category, for labelling. */
  categoryId?: string;
  value: number;
}

export interface FlowLink {
  source: string;
  target: string;
  value: number;
}

export interface MoneyFlow {
  nodes: FlowNode[];
  links: FlowLink[];
  /** Everything that came in, including any drawn from reserves. */
  total: number;
  otherCount: number;
}

/**
 * Every euro that came in, and where it ended up: sources → one hub → spending
 * categories, savings and whatever was left.
 *
 * Node ids are prefixed by side (`in:` / `out:`). A category used for both
 * income and spending would otherwise appear once, giving the diagram a cycle
 * — which a Sankey cannot lay out.
 *
 * When more went out than came in, the shortfall enters as its own source
 * rather than a negative "left over": the diagram has to balance, and "this
 * much came out of reserves" is the honest reading.
 */
export function moneyFlow(transactions: Transaction[], limit = 6): MoneyFlow | undefined {
  const incomeByCategory = new Map<string, number>();
  const spendByCategory = new Map<string, number>();
  let withdrawals = 0;
  let invested = 0;
  let goals = 0;

  for (const tx of transactions) {
    const amount = Math.abs(tx.amount);
    if (isTransfer(tx)) {
      if (tx.contributionType === "withdrawal") withdrawals += amount;
      else if (isGoalContribution(tx)) goals += amount;
      else invested += amount;
    } else if (tx.type === "income") {
      incomeByCategory.set(tx.categoryId, (incomeByCategory.get(tx.categoryId) ?? 0) + amount);
    } else {
      spendByCategory.set(tx.categoryId, (spendByCategory.get(tx.categoryId) ?? 0) + amount);
    }
  }

  const rankedSpend = Array.from(spendByCategory.entries()).sort((a, b) => b[1] - a[1]);
  const topSpend = rankedSpend.slice(0, limit);
  const foldedSpend = rankedSpend.slice(limit);
  const otherSpend = foldedSpend.reduce((s, [, v]) => s + v, 0);

  const totalSpend = rankedSpend.reduce((s, [, v]) => s + v, 0);
  const savings = invested + goals;
  const earned = Array.from(incomeByCategory.values()).reduce((s, v) => s + v, 0) + withdrawals;
  const balance = earned - totalSpend - savings;

  if (earned === 0 && totalSpend === 0 && savings === 0) return undefined;

  const deficit = balance < 0 ? -balance : 0;
  const leftover = balance > 0 ? balance : 0;
  const total = earned + deficit;

  const nodes: FlowNode[] = [{ id: FLOW_HUB_ID, kind: "hub", value: round2(total) }];
  const links: FlowLink[] = [];

  const addSource = (id: string, value: number, categoryId?: string) => {
    if (value <= 0) return;
    nodes.push({ id, kind: "income", categoryId, value: round2(value) });
    links.push({ source: id, target: FLOW_HUB_ID, value: round2(value) });
  };

  for (const [categoryId, value] of Array.from(incomeByCategory.entries()).sort((a, b) => b[1] - a[1])) {
    addSource(`in:${categoryId}`, value, categoryId);
  }
  addSource(FLOW_WITHDRAWALS_ID, withdrawals);
  addSource(FLOW_DEFICIT_ID, deficit);

  const addSink = (id: string, kind: FlowNode["kind"], value: number, categoryId?: string) => {
    if (value <= 0) return;
    nodes.push({ id, kind, categoryId, value: round2(value) });
    links.push({ source: FLOW_HUB_ID, target: id, value: round2(value) });
  };

  for (const [categoryId, value] of topSpend) addSink(`out:${categoryId}`, "expense", value, categoryId);
  addSink(`out:${OTHER_CATEGORY_ID}`, "expense", otherSpend, OTHER_CATEGORY_ID);
  addSink(FLOW_SAVINGS_ID, "savings", savings);
  addSink(FLOW_LEFTOVER_ID, "leftover", leftover);

  return { nodes, links, total: round2(total), otherCount: foldedSpend.length };
}

// ─── 12. Category → payee hierarchy ──────────────────────────────────────────

export interface PayeeLeaf {
  name: string;
  value: number;
  count: number;
}

export interface CategoryBranch {
  categoryId: string;
  value: number;
  children: PayeeLeaf[];
}

/**
 * Two levels: the biggest spending categories, each broken down into the
 * payees inside it. Both levels fold their tail into an "other" entry so a
 * long tail can't shatter the ring into unreadable slivers.
 */
export function categoryPayeeTree(transactions: Transaction[], categoryLimit = 6, payeeLimit = 5): CategoryBranch[] {
  const spending = transactions.filter(isSpending);

  const byCategory = new Map<string, Map<string, PayeeLeaf>>();
  const categoryTotals = new Map<string, number>();

  for (const tx of spending) {
    const amount = Math.abs(tx.amount);
    categoryTotals.set(tx.categoryId, (categoryTotals.get(tx.categoryId) ?? 0) + amount);

    const payees = byCategory.get(tx.categoryId) ?? new Map<string, PayeeLeaf>();
    const label = tx.description.trim() || "—";
    const key = label.toLowerCase();
    const leaf = payees.get(key) ?? { name: label, value: 0, count: 0 };
    leaf.value += amount;
    leaf.count += 1;
    payees.set(key, leaf);
    byCategory.set(tx.categoryId, payees);
  }

  return Array.from(categoryTotals.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, categoryLimit)
    .map(([categoryId, value]) => {
      const ranked = Array.from(byCategory.get(categoryId)?.values() ?? []).sort((a, b) => b.value - a.value);
      const head = ranked.slice(0, payeeLimit).map((p) => ({ ...p, value: round2(p.value) }));
      const tail = ranked.slice(payeeLimit);

      if (tail.length > 0) {
        head.push({
          name: OTHER_CATEGORY_ID,
          value: round2(tail.reduce((s, p) => s + p.value, 0)),
          count: tail.reduce((s, p) => s + p.count, 0),
        });
      }

      return { categoryId, value: round2(value), children: head };
    });
}

// ─── 13. Spread of payment sizes per category ────────────────────────────────

export interface DistributionRow {
  categoryId: string;
  /** Whisker ends — the most extreme values still within 1.5×IQR. */
  low: number;
  q1: number;
  median: number;
  q3: number;
  high: number;
  count: number;
  /** Everything past the whiskers: the one-off unusually large payments. */
  outliers: number[];
}

/** Linear interpolation between order statistics — the same method ECharts uses. */
function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const index = (sorted.length - 1) * p;
  const low = Math.floor(index);
  const high = Math.ceil(index);
  return low === high ? sorted[low] : sorted[low] + (sorted[high] - sorted[low]) * (index - low);
}

/**
 * Tukey five-number summary per category, so a category's *typical* payment can
 * be read separately from its occasional big one — something a bar of totals
 * flattens away completely.
 *
 * Categories with fewer than `minSamples` payments are dropped: quartiles drawn
 * from two or three numbers describe nothing.
 */
export function categoryDistribution(transactions: Transaction[], limit = 6, minSamples = 5): DistributionRow[] {
  const byCategory = new Map<string, number[]>();

  for (const tx of transactions.filter(isSpending)) {
    const amounts = byCategory.get(tx.categoryId) ?? [];
    amounts.push(Math.abs(tx.amount));
    byCategory.set(tx.categoryId, amounts);
  }

  return Array.from(byCategory.entries())
    .filter(([, amounts]) => amounts.length >= minSamples)
    .sort((a, b) => b[1].reduce((s, v) => s + v, 0) - a[1].reduce((s, v) => s + v, 0))
    .slice(0, limit)
    .map(([categoryId, raw]) => {
      const sorted = [...raw].sort((a, b) => a - b);
      const q1 = percentile(sorted, 0.25);
      const median = percentile(sorted, 0.5);
      const q3 = percentile(sorted, 0.75);
      const fence = 1.5 * (q3 - q1);

      const inside = sorted.filter((v) => v >= q1 - fence && v <= q3 + fence);
      const outliers = sorted.filter((v) => v < q1 - fence || v > q3 + fence);

      return {
        categoryId,
        low: round2(inside[0] ?? sorted[0]),
        q1: round2(q1),
        median: round2(median),
        q3: round2(q3),
        high: round2(inside[inside.length - 1] ?? sorted[sorted.length - 1]),
        count: sorted.length,
        outliers: outliers.map(round2),
      };
    });
}
