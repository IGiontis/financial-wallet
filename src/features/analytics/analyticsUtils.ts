import { getDaysInMonth, startOfDay, startOfMonth, startOfWeek, subMonths } from "date-fns";
import { firestoreToDate } from "../../shared/utils/dates";
import { isGoalContribution, isInvestmentContribution, isSpending, isTransfer } from "../../shared/utils/moneyModel";
import type { Transaction } from "../../shared/types/IndexTypes";

// Everything the Analytics page draws is derived here, from transactions the
// app has already fetched — the whole page costs zero extra Firestore reads.
//
// What counts as money in and money out lives in shared/utils/moneyModel, so
// every screen that reports a total agrees by construction.

export { isSpending };

const round2 = (n: number) => Math.round(n * 100) / 100;

const monthKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
const dayKey = (d: Date) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
const addMonth = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth() + n, 1);
const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
/** Same day-of-month `n` months away, clamped so the 31st never rolls over. */
const shiftMonths = (d: Date, n: number) => {
  const target = new Date(d.getFullYear(), d.getMonth() + n, 1);
  return new Date(target.getFullYear(), target.getMonth(), Math.min(d.getDate(), getDaysInMonth(target)), d.getHours(), d.getMinutes(), d.getSeconds(), d.getMilliseconds());
};

// ─── Range ───────────────────────────────────────────────────────────────────

export type AnalyticsRange = "1m" | "3m" | "6m" | "12m" | "all";

export const ANALYTICS_RANGES: readonly AnalyticsRange[] = ["1m", "3m", "6m", "12m", "all"] as const;

/**
 * Inclusive lower bound for a range, snapped to a month start so charts always
 * show whole months. `null` means "everything on record".
 */
export function rangeStart(range: AnalyticsRange, now: Date = new Date()): Date | null {
  if (range === "all") return null;
  const months = range === "1m" ? 1 : range === "3m" ? 3 : range === "6m" ? 6 : 12;
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

// ─── Cumulative net position ──────────────────────────────────────────────

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

// ─── Savings rate ─────────────────────────────────────────────────────────

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

// ─── Category mix over time ───────────────────────────────────────────────

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

// ─── Day-by-day heatmap ───────────────────────────────────────────────────

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

// ─── This month's pace against last month's ───────────────────────────────

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

// ─── Money flow ──────────────────────────────────────────────────────────

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

// ─── What changed ────────────────────────────────────────────────────────────
// The one question a spending chart is usually being asked. Everything else on
// the page describes a state; this names a cause, which is what makes it worth
// looking at twice.

export interface CategoryDelta {
  categoryId: string;
  current: number;
  previous: number;
  /** current − previous. Positive means you spent more this time. */
  delta: number;
}

/**
 * Every category's spend in `[from, to]` against the window of equal length
 * immediately before it.
 *
 * Comparing like-for-like windows rather than fixed months is what lets the one
 * function serve every range: three months against the previous three answers
 * the same question as this month against last.
 *
 * Sorted by the size of the change, not by the size of the category — a €40
 * habit that doubled is more worth knowing about than rent staying rent.
 */
export function categoryDeltas(transactions: Transaction[], from: Date | null, to: Date = new Date()): CategoryDelta[] {
  // "All time" has nothing before it to compare against.
  if (!from) return [];

  // Shifted by whole months, not by elapsed milliseconds: a range is a number
  // of months, and sliding it back by its own duration in days would leave the
  // earlier window straddling month boundaries and silently drop days.
  //
  // Both ends move, so a window that stops today is compared against the same
  // stretch of the earlier months. Measuring twenty days against a full one
  // would report every category as falling.
  const months = (to.getFullYear() * 12 + to.getMonth()) - (from.getFullYear() * 12 + from.getMonth()) + 1;
  const previousFrom = shiftMonths(from, -months);
  const previousTo = shiftMonths(to, -months);

  const sum = (rows: Transaction[]) => {
    const totals = new Map<string, number>();
    for (const tx of rows.filter(isSpending)) totals.set(tx.categoryId, round2((totals.get(tx.categoryId) ?? 0) + Math.abs(tx.amount)));
    return totals;
  };

  const current = sum(withinRange(transactions, from, to));
  const previous = sum(withinRange(transactions, previousFrom, previousTo));

  const rows = Array.from(new Set([...current.keys(), ...previous.keys()]))
    .map((categoryId) => {
      const now = current.get(categoryId) ?? 0;
      const before = previous.get(categoryId) ?? 0;
      return { categoryId, current: now, previous: before, delta: round2(now - before) };
    })
    .filter((row) => row.delta !== 0)
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));

  // Nothing at all in the earlier window is not "everything went up" — it is
  // no comparison, and reporting each category's whole total as a rise would
  // be the most misleading thing on the page.
  return rows.every((row) => row.previous === 0) ? [] : rows;
}

// ─── Small multiples ─────────────────────────────────────────────────────────

export interface CategorySeries {
  categoryId: string;
  total: number;
  /** One figure per month of `flows`, in the same order. */
  points: number[];
  /** Last month against the mean of the ones before it, as a share. */
  trend: number;
}

/**
 * A short series per category, for drawing side by side.
 *
 * A dozen tiny charts sharing an axis are read far faster than one chart with a
 * dozen overlapping lines, and far more honestly than a radar — which asks the
 * eye to compare the areas of irregular polygons, something it cannot do.
 */
export function categorySeries(transactions: Transaction[], flows: MonthlyFlow[], limit = 12, now: Date = new Date()): CategorySeries[] {
  const index = new Map(flows.map((flow, i) => [flow.key, i]));
  const byCategory = new Map<string, number[]>();

  for (const tx of transactions.filter(isSpending)) {
    const at = index.get(monthKey(firestoreToDate(tx.date)));
    if (at === undefined) continue;

    const points = byCategory.get(tx.categoryId) ?? Array.from({ length: flows.length }, () => 0);
    points[at] = round2(points[at] + Math.abs(tx.amount));
    byCategory.set(tx.categoryId, points);
  }

  // The month in progress is only part spent, so comparing it against whole
  // ones reports every category as collapsing. The line still draws it — the
  // shape is honest — but the percentage is read off the last month that
  // actually finished.
  const currentKey = monthKey(now);
  const complete = flows.length > 0 && flows[flows.length - 1].key === currentKey ? flows.length - 1 : flows.length;

  return Array.from(byCategory, ([categoryId, points]) => {
    const total = round2(points.reduce((sum, n) => sum + n, 0));
    const settled = points.slice(0, complete);
    const last = settled[settled.length - 1] ?? 0;
    const earlier = settled.slice(0, -1);
    const baseline = earlier.length > 0 ? earlier.reduce((sum, n) => sum + n, 0) / earlier.length : 0;

    return { categoryId, total, points, trend: baseline > 0 ? round2((last - baseline) / baseline) : 0 };
  })
    .sort((a, b) => b.total - a.total)
    .slice(0, limit);
}

// ─── Waterfall ───────────────────────────────────────────────────────────────

/**
 * The two steps that are not categories.
 *
 * Exported because the page has to label them, and a bare "income" written on
 * both sides is exactly how they ended up being fed to the category lookup and
 * coming back as "Uncategorised".
 */
export const WATERFALL_INCOME_ID = "income";
export const WATERFALL_LEFTOVER_ID = "leftover";

export interface WaterfallStep {
  id: string;
  /** Signed: income is positive, each cost negative. */
  amount: number;
  /** Running total after this step. */
  balance: number;
  kind: "income" | "expense" | "result";
}

/**
 * Income, then each large category taken off it in turn, then what survived.
 *
 * The same figures the Sankey carries, but on a shared baseline — so "which of
 * these is bigger" is answered by comparing two heights rather than the widths
 * of two curved ribbons.
 */
export function spendingWaterfall(transactions: Transaction[], limit = 6): WaterfallStep[] {
  const income = round2(transactions.filter((tx) => !isTransfer(tx) && tx.type === "income").reduce((sum, tx) => sum + Math.abs(tx.amount), 0));

  const totals = new Map<string, number>();
  for (const tx of transactions.filter(isSpending)) totals.set(tx.categoryId, round2((totals.get(tx.categoryId) ?? 0) + Math.abs(tx.amount)));

  const ranked = Array.from(totals, ([categoryId, amount]) => ({ categoryId, amount })).sort((a, b) => b.amount - a.amount);
  const top = ranked.slice(0, limit);
  const rest = round2(ranked.slice(limit).reduce((sum, row) => sum + row.amount, 0));

  const steps: WaterfallStep[] = [];
  let balance = income;
  steps.push({ id: WATERFALL_INCOME_ID, amount: income, balance, kind: "income" });

  for (const row of top) {
    balance = round2(balance - row.amount);
    steps.push({ id: row.categoryId, amount: -row.amount, balance, kind: "expense" });
  }
  if (rest > 0) {
    balance = round2(balance - rest);
    steps.push({ id: OTHER_CATEGORY_ID, amount: -rest, balance, kind: "expense" });
  }

  steps.push({ id: WATERFALL_LEFTOVER_ID, amount: balance, balance, kind: "result" });
  return steps;
}

// ─── Committed against free ──────────────────────────────────────────────────

export interface CommittedMonth {
  key: string;
  start: Date;
  /** Bills and money put into goals — decided before the month began. */
  committed: number;
  /** Everything else you spent. */
  free: number;
  /** Share of the month's outgoings that was already spoken for. */
  share: number;
}

/**
 * How much of each month was already spoken for before it started.
 *
 * A total tells you what you spent; this tells you how much of it you could
 * have done anything about — which is the figure that decides whether the
 * answer to overspending is "cut back" or "renegotiate something".
 */
export function committedSplit(transactions: Transaction[], flows: MonthlyFlow[]): CommittedMonth[] {
  const index = new Map(flows.map((flow, i) => [flow.key, i]));
  const rows = flows.map((flow) => ({ key: flow.key, start: flow.start, committed: 0, free: 0, share: 0 }));

  for (const tx of transactions) {
    const at = index.get(monthKey(firestoreToDate(tx.date)));
    if (at === undefined) continue;

    // Bills are committed by contract, goal deposits by intention. Both are
    // decided ahead of the month rather than inside it.
    if (isGoalContribution(tx) && tx.contributionType !== "withdrawal") rows[at].committed += Math.abs(tx.amount);
    else if (isSpending(tx)) {
      if (tx.billId) rows[at].committed += Math.abs(tx.amount);
      else rows[at].free += Math.abs(tx.amount);
    }
  }

  return rows.map((row) => {
    const committed = round2(row.committed);
    const free = round2(row.free);
    const total = committed + free;
    return { ...row, committed, free, share: total > 0 ? round2(committed / total) : 0 };
  });
}
