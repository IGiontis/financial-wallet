import { useMemo, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import type { CategoryDelta, CategorySeries, CommittedMonth, FlowLink, FlowNode, MonthPace, WaterfallStep } from "../analyticsUtils";
import type { SavingsGoal } from "../dashboardUtils";
import type { Payee } from "../../transactions/transactionInsights";
import { ChartDetails, DetailsTable, type DetailsColumn } from "./DetailsTable";
import { signedWith, weekdayNames } from "./chartTheme";
import LabelledFlowChart from "./LabelledFlowChart";
import PlanActualChart, { type PlanActualRow } from "./PlanActualChart";
import SavingsGoalChart from "./SavingsGoalChart";
import NetWorthChart, { type NetWorthRow } from "./NetWorthChart";
import TopMoversChart from "./TopMoversChart";
import CategorySparklines from "./CategorySparklines";
import MonthWaterfall from "./MonthWaterfall";
import WeekdayChart from "./WeekdayChart";
import MonthPaceChart from "./MonthPaceChart";
import CommittedSplitChart from "./CommittedSplitChart";
import CategoryTrendChart, { type TrendRow, type TrendSeries } from "./CategoryTrendChart";
import IncomeMonthsChart from "./IncomeMonthsChart";
import IncomeSources from "./IncomeSources";

// The sheet behind each card on the analytics page: the full drawing, the
// words the card leaves out, and the figures as columns. Month tables list the
// newest month first, as the transactions do; the charts read left to right.

type Format = (n: number) => string;

const round2 = (n: number) => Math.round(n * 100) / 100;
const sum = <R,>(rows: R[], pick: (row: R) => number) => round2(rows.reduce((s, row) => s + pick(row), 0));
const newestFirst = <R,>(rows: R[]) => [...rows].reverse();

function usePercent() {
  const { i18n } = useTranslation();
  return useMemo(() => {
    const f = new Intl.NumberFormat(i18n.resolvedLanguage, { maximumFractionDigits: 1 });
    return (n: number | null | undefined) => (n === null || n === undefined || !Number.isFinite(n) ? "—" : `${f.format(n)}%`);
  }, [i18n.resolvedLanguage]);
}

// ── Income and spending ──────────────────────────────────────────────────────

interface FlowRow {
  label: string;
  income: number;
  expenses: number;
  net: number;
}

export function FlowDetails({ data, formatCurrency, legend }: { data: FlowRow[]; formatCurrency: Format; legend: ReactNode }) {
  const { t } = useTranslation();
  const signed = signedWith(formatCurrency);
  const columns: DetailsColumn<FlowRow>[] = [
    { key: "month", label: t("analytics.details.month"), cell: (r) => r.label },
    { key: "income", label: t("analytics.flow.income"), numeric: true, cell: (r) => formatCurrency(r.income), foot: formatCurrency(sum(data, (r) => r.income)) },
    { key: "expenses", label: t("analytics.flow.expenses"), numeric: true, cell: (r) => formatCurrency(r.expenses), foot: formatCurrency(sum(data, (r) => r.expenses)) },
    { key: "net", label: t("analytics.flow.net"), numeric: true, tone: (r) => r.net, cell: (r) => signed(r.net), foot: signed(sum(data, (r) => r.net)) },
  ];
  return (
    <ChartDetails
      note={t("analytics.dashboard.linesHint")}
      chart={<LabelledFlowChart data={data} formatCurrency={formatCurrency} />}
      legend={legend}
      tableTitle={t("analytics.details.table")}
      table={<DetailsTable rows={newestFirst(data)} rowKey={(r) => r.label} columns={columns} footLabel={t("common.total")} />}
    />
  );
}

// ── Plan against actual ──────────────────────────────────────────────────────

export function PlanDetails({ rows, note, legend, formatCurrency }: { rows: PlanActualRow[]; note: string; legend: ReactNode; formatCurrency: Format }) {
  const { t } = useTranslation();
  const signed = signedWith(formatCurrency);
  const hasPlan = rows.some((r) => r.plan !== null);
  const hasLastYear = rows.some((r) => r.lastYear !== null);
  const gap = (r: PlanActualRow) => (r.plan === null ? undefined : round2(r.actual - r.plan));
  const planned = rows.filter((r) => r.plan !== null);
  const columns: DetailsColumn<PlanActualRow>[] = [
    { key: "month", label: t("analytics.details.month"), cell: (r) => r.label },
    { key: "actual", label: t("analytics.dashboard.actual"), numeric: true, cell: (r) => formatCurrency(r.actual), foot: formatCurrency(sum(rows, (r) => r.actual)) },
    ...(hasPlan
      ? [
          { key: "plan", label: t("analytics.dashboard.plan"), numeric: true, cell: (r: PlanActualRow) => (r.plan === null ? "—" : formatCurrency(r.plan)), foot: formatCurrency(sum(planned, (r) => r.plan ?? 0)) },
          {
            key: "gap",
            label: t("analytics.dashboard.difference"),
            numeric: true,
            // Over the plan is the bad direction: red, though the number is positive.
            tone: (r: PlanActualRow) => {
              const g = gap(r);
              return g === undefined ? undefined : -g;
            },
            cell: (r: PlanActualRow) => {
              const g = gap(r);
              return g === undefined ? "—" : signed(g);
            },
            foot: signed(round2(sum(planned, (r) => r.actual) - sum(planned, (r) => r.plan ?? 0))),
          },
        ]
      : []),
    ...(hasLastYear
      ? [{ key: "lastYear", label: t("analytics.dashboard.lastYear"), numeric: true, secondary: true, cell: (r: PlanActualRow) => (r.lastYear === null ? "—" : formatCurrency(r.lastYear)) }]
      : []),
  ];
  return (
    <ChartDetails
      note={note}
      chart={<PlanActualChart data={rows} formatCurrency={formatCurrency} />}
      legend={legend}
      tableTitle={t("analytics.details.table")}
      table={<DetailsTable rows={newestFirst(rows)} rowKey={(r) => r.label} columns={columns} footLabel={t("common.total")} />}
    />
  );
}

// ── Savings rate ─────────────────────────────────────────────────────────────

interface RatePoint {
  label: string;
  rate: number | null;
  income: number;
  net: number;
}

export function SavingsDetails({
  data,
  goal,
  average,
  note,
  legend,
  control,
  formatCurrency,
}: {
  data: RatePoint[];
  goal?: SavingsGoal;
  average?: number;
  note: string;
  legend: ReactNode;
  control: ReactNode;
  formatCurrency: Format;
}) {
  const { t } = useTranslation();
  const percent = usePercent();
  const signed = signedWith(formatCurrency);
  const columns: DetailsColumn<RatePoint>[] = [
    { key: "month", label: t("analytics.details.month"), cell: (r) => r.label },
    { key: "income", label: t("analytics.flow.income"), numeric: true, cell: (r) => formatCurrency(r.income), foot: formatCurrency(sum(data, (r) => r.income)) },
    { key: "kept", label: t("analytics.savingsRate.kept"), numeric: true, tone: (r) => r.net, cell: (r) => signed(r.net), foot: signed(sum(data, (r) => r.net)) },
    {
      key: "rate",
      label: t("analytics.savingsRate.rate"),
      numeric: true,
      // Against the goal when there is one: reaching its floor is the green.
      tone: (r) => (r.rate === null ? undefined : goal ? (r.rate >= goal.min ? 1 : -1) : r.rate),
      cell: (r) => percent(r.rate),
      foot: percent(average),
    },
  ];
  return (
    <ChartDetails
      note={note}
      chart={<SavingsGoalChart data={data} goal={goal} average={average} formatCurrency={formatCurrency} />}
      legend={legend}
      extra={control}
      tableTitle={t("analytics.details.table")}
      table={<DetailsTable rows={newestFirst(data)} rowKey={(r) => r.label} columns={columns} footLabel={t("common.total")} />}
    />
  );
}

// ── Net worth ────────────────────────────────────────────────────────────────

export function NetWorthDetails({ rows, note, legend, formatCurrency }: { rows: NetWorthRow[]; note: string; legend: ReactNode; formatCurrency: Format }) {
  const { t } = useTranslation();
  const columns: DetailsColumn<NetWorthRow>[] = [
    { key: "month", label: t("analytics.details.month"), cell: (r) => r.label },
    { key: "cash", label: t("analytics.netWorth.cash"), numeric: true, cell: (r) => formatCurrency(r.cash) },
    { key: "saved", label: t("analytics.netWorth.saved"), numeric: true, secondary: true, cell: (r) => formatCurrency(r.saved) },
    { key: "owedToMe", label: t("analytics.netWorth.owedToMe"), numeric: true, secondary: true, cell: (r) => formatCurrency(r.owedToMe) },
    { key: "debt", label: t("analytics.netWorth.owedByMe"), numeric: true, cell: (r) => (r.debt === 0 ? formatCurrency(0) : `−${formatCurrency(Math.abs(r.debt))}`) },
    { key: "net", label: t("analytics.netWorth.net"), numeric: true, tone: (r) => r.net, cell: (r) => formatCurrency(r.net) },
  ];
  return (
    <ChartDetails
      note={note}
      chart={<NetWorthChart data={rows} formatCurrency={formatCurrency} />}
      legend={legend}
      tableTitle={t("analytics.details.table")}
      table={<DetailsTable rows={newestFirst(rows)} rowKey={(r) => r.label} columns={columns} />}
    />
  );
}

// ── What changed ─────────────────────────────────────────────────────────────

export function MoversDetails({ rows, nameFor, formatCurrency }: { rows: CategoryDelta[]; nameFor: (id: string) => string; formatCurrency: Format }) {
  const { t } = useTranslation();
  const signed = signedWith(formatCurrency);
  const columns: DetailsColumn<CategoryDelta>[] = [
    { key: "name", label: t("analytics.details.category"), cell: (r) => nameFor(r.categoryId) },
    { key: "before", label: t("analytics.movers.before"), numeric: true, cell: (r) => formatCurrency(r.previous), foot: formatCurrency(sum(rows, (r) => r.previous)) },
    { key: "now", label: t("analytics.movers.now"), numeric: true, cell: (r) => formatCurrency(r.current), foot: formatCurrency(sum(rows, (r) => r.current)) },
    // More spent is the bad direction.
    { key: "change", label: t("analytics.movers.change"), numeric: true, tone: (r) => -r.delta, cell: (r) => signed(r.delta), foot: signed(sum(rows, (r) => r.delta)) },
  ];
  return (
    <ChartDetails
      note={t("analytics.movers.hint")}
      chart={<TopMoversChart rows={rows} nameFor={nameFor} formatCurrency={formatCurrency} limit={12} />}
      tableTitle={t("analytics.details.table")}
      table={<DetailsTable rows={rows} rowKey={(r) => r.categoryId} columns={columns} footLabel={t("common.total")} />}
    />
  );
}

// ── Each category on its own ─────────────────────────────────────────────────

export function SparklinesDetails({ rows, nameFor, formatCurrency }: { rows: CategorySeries[]; nameFor: (id: string) => string; formatCurrency: Format }) {
  const { t } = useTranslation();
  const columns: DetailsColumn<CategorySeries>[] = [
    { key: "name", label: t("analytics.details.category"), cell: (r) => nameFor(r.categoryId) },
    { key: "total", label: t("common.total"), numeric: true, cell: (r) => formatCurrency(r.total), foot: formatCurrency(sum(rows, (r) => r.total)) },
    { key: "last", label: t("analytics.details.lastMonth"), numeric: true, cell: (r) => formatCurrency(r.points[r.points.length - 1] ?? 0) },
    {
      key: "trend",
      label: t("analytics.details.trend"),
      numeric: true,
      // Spending rising is the bad direction; a tenth either way is noise, as on the card.
      tone: (r) => (Math.abs(r.trend) > 0.1 ? -r.trend : undefined),
      cell: (r) => (Math.abs(r.trend) > 0.1 ? `${r.trend > 0 ? "+" : "−"}${Math.round(Math.abs(r.trend) * 100)}%` : "—"),
    },
  ];
  return (
    <ChartDetails
      note={t("analytics.sparklines.hint")}
      extra={<CategorySparklines rows={rows} nameFor={nameFor} formatCurrency={formatCurrency} />}
      tableTitle={t("analytics.details.table")}
      table={<DetailsTable rows={rows} rowKey={(r) => r.categoryId} columns={columns} footLabel={t("common.total")} />}
    />
  );
}

// ── Where the month went ─────────────────────────────────────────────────────

export function WaterfallDetails({ steps, nameFor, formatCurrency }: { steps: WaterfallStep[]; nameFor: (id: string) => string; formatCurrency: Format }) {
  const { t } = useTranslation();
  const percent = usePercent();
  const income = steps.find((s) => s.kind === "income")?.amount ?? 0;
  const columns: DetailsColumn<WaterfallStep>[] = [
    { key: "name", label: t("analytics.details.step"), cell: (r) => nameFor(r.id) },
    {
      key: "amount",
      label: t("analytics.details.amount"),
      numeric: true,
      tone: (r) => (r.kind === "result" ? r.amount : undefined),
      cell: (r) => `${r.kind === "expense" || r.kind === "savings" || r.amount < 0 ? "−" : "+"}${formatCurrency(Math.abs(r.amount))}`,
    },
    { key: "share", label: t("analytics.details.ofIncome"), numeric: true, cell: (r) => (income > 0 ? percent((Math.abs(r.amount) / income) * 100) : "—") },
    { key: "left", label: t("analytics.waterfall.left"), numeric: true, secondary: true, cell: (r) => (r.kind === "expense" || r.kind === "savings" ? formatCurrency(r.balance) : "") },
  ];
  return (
    <ChartDetails
      note={t("analytics.waterfall.hint")}
      extra={<MonthWaterfall steps={steps} nameFor={nameFor} formatCurrency={formatCurrency} />}
      tableTitle={t("analytics.details.table")}
      table={<DetailsTable rows={steps} rowKey={(r) => r.id} columns={columns} />}
    />
  );
}

// ── Day of the week ──────────────────────────────────────────────────────────

export function WeekdayDetails({ totals, locale, formatCurrency }: { totals: number[]; locale: string; formatCurrency: Format }) {
  const { t } = useTranslation();
  const percent = usePercent();
  const names = weekdayNames(locale);
  const all = sum(totals, (n) => n);
  const rows = totals.map((amount, i) => ({ day: names[i], amount }));
  const columns: DetailsColumn<(typeof rows)[number]>[] = [
    { key: "day", label: t("analytics.details.weekday"), cell: (r) => r.day },
    { key: "amount", label: t("analytics.flow.expenses"), numeric: true, cell: (r) => formatCurrency(r.amount), foot: formatCurrency(all) },
    { key: "share", label: t("analytics.weekday.share"), numeric: true, cell: (r) => (all > 0 ? percent((r.amount / all) * 100) : "—") },
  ];
  return (
    <ChartDetails
      note={t("analytics.weekday.hint")}
      chart={<WeekdayChart totals={totals} formatCurrency={formatCurrency} locale={locale} />}
      tableTitle={t("analytics.details.table")}
      table={<DetailsTable rows={rows} rowKey={(r) => r.day} columns={columns} footLabel={t("common.total")} />}
    />
  );
}

// ── The month's pace ─────────────────────────────────────────────────────────

export function PaceDetails({ pace, legend, formatCurrency }: { pace: MonthPace; legend: ReactNode; formatCurrency: Format }) {
  const { t } = useTranslation();
  const signed = signedWith(formatCurrency);
  // The days so far: after today this month has nothing to compare.
  const days = newestFirst(pace.points.filter((p) => p.current !== null));
  const columns: DetailsColumn<(typeof days)[number]>[] = [
    { key: "day", label: t("analytics.details.day"), cell: (r) => r.day },
    { key: "current", label: t("analytics.pace.thisMonth"), numeric: true, cell: (r) => formatCurrency(r.current ?? 0) },
    { key: "previous", label: t("analytics.pace.lastMonth"), numeric: true, cell: (r) => (r.previous === null ? "—" : formatCurrency(r.previous)) },
    {
      key: "gap",
      label: t("analytics.pace.difference"),
      numeric: true,
      tone: (r) => (r.previous === null ? undefined : -((r.current ?? 0) - r.previous)),
      cell: (r) => (r.previous === null ? "—" : signed(round2((r.current ?? 0) - r.previous))),
    },
  ];
  return (
    <ChartDetails
      note={t("analytics.pace.hint")}
      chart={<MonthPaceChart data={pace.points} formatCurrency={formatCurrency} />}
      legend={legend}
      extra={<p className="small text-body-secondary mb-0">{t("analytics.details.lastMonthTotal", { amount: formatCurrency(pace.previousTotal) })}</p>}
      tableTitle={t("analytics.details.table")}
      table={<DetailsTable rows={days} rowKey={(r) => String(r.day)} columns={columns} />}
    />
  );
}

// ── Committed against free ───────────────────────────────────────────────────

export function CommittedDetails({ rows, legend, monthLabel, formatCurrency }: { rows: CommittedMonth[]; legend: ReactNode; monthLabel: (d: Date) => string; formatCurrency: Format }) {
  const { t } = useTranslation();
  const percent = usePercent();
  const committed = sum(rows, (r) => r.committed);
  const free = sum(rows, (r) => r.free);
  const columns: DetailsColumn<CommittedMonth>[] = [
    { key: "month", label: t("analytics.details.month"), cell: (r) => monthLabel(r.start) },
    { key: "committed", label: t("analytics.committed.committed"), numeric: true, cell: (r) => formatCurrency(r.committed), foot: formatCurrency(committed) },
    { key: "free", label: t("analytics.committed.free"), numeric: true, cell: (r) => formatCurrency(r.free), foot: formatCurrency(free) },
    { key: "share", label: t("analytics.committed.share"), numeric: true, cell: (r) => percent(r.share * 100), foot: committed + free > 0 ? percent((committed / (committed + free)) * 100) : "—" },
  ];
  return (
    <ChartDetails
      note={t("analytics.committed.hint")}
      chart={<CommittedSplitChart rows={rows} formatCurrency={formatCurrency} monthLabel={monthLabel} />}
      legend={legend}
      tableTitle={t("analytics.details.table")}
      table={<DetailsTable rows={newestFirst(rows)} rowKey={(r) => r.key} columns={columns} footLabel={t("common.total")} />}
    />
  );
}

// ── Where the money went (the Sankey) ────────────────────────────────────────

export function MoneyFlowDetails({ chart, nodes, links, total, labelFor, formatCurrency }: { chart: ReactNode; nodes: FlowNode[]; links: FlowLink[]; total: number; labelFor: (node: FlowNode) => string; formatCurrency: Format }) {
  const { t } = useTranslation();
  const percent = usePercent();
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const name = (id: string) => {
    const node = byId.get(id);
    return node ? labelFor(node) : id;
  };
  // Biggest first within each side: what came in, then where it went.
  const rows = [...links].sort((a, b) => (byId.get(a.source)?.kind === "hub" ? 1 : 0) - (byId.get(b.source)?.kind === "hub" ? 1 : 0) || b.value - a.value);
  const columns: DetailsColumn<FlowLink>[] = [
    { key: "from", label: t("analytics.details.from"), cell: (r) => name(r.source) },
    { key: "to", label: t("analytics.details.to"), cell: (r) => name(r.target) },
    { key: "amount", label: t("analytics.details.amount"), numeric: true, cell: (r) => formatCurrency(r.value) },
    { key: "share", label: t("analytics.details.share"), numeric: true, secondary: true, cell: (r) => (total > 0 ? percent((r.value / total) * 100) : "—") },
  ];
  return (
    <ChartDetails
      note={t("analytics.moneyFlow.hint")}
      chart={chart}
      tableTitle={t("analytics.details.table")}
      table={<DetailsTable rows={rows} rowKey={(r) => `${r.source}>${r.target}`} columns={columns} />}
    />
  );
}

// ── Categories against each other ────────────────────────────────────────────

export function TrendDetails({ data, series, legend, formatCurrency }: { data: TrendRow[]; series: TrendSeries[]; legend: ReactNode; formatCurrency: Format }) {
  const { t } = useTranslation();
  // A category per row, a month per column: the lines of the chart, read across.
  const rows = series.map((s) => ({ ...s, total: sum(data, (row) => Number(row[s.id]) || 0) }));
  const columns: DetailsColumn<(typeof rows)[number]>[] = [
    { key: "name", label: t("analytics.details.category"), cell: (r) => r.name },
    ...data.map((row) => ({
      key: String(row.label),
      label: String(row.label),
      numeric: true,
      cell: (r: (typeof rows)[number]) => formatCurrency(Number(row[r.id]) || 0),
      foot: formatCurrency(sum(series, (s) => Number(row[s.id]) || 0)),
    })),
    { key: "total", label: t("common.total"), numeric: true, cell: (r) => formatCurrency(r.total), foot: formatCurrency(sum(rows, (r) => r.total)) },
  ];
  return (
    <ChartDetails
      note={t("analytics.categoryTrend.hint")}
      chart={<CategoryTrendChart data={data} series={series} formatCurrency={formatCurrency} totalLabel={t("common.total")} />}
      legend={legend}
      tableTitle={t("analytics.details.table")}
      table={<DetailsTable rows={rows} rowKey={(r) => r.id} columns={columns} footLabel={t("common.total")} />}
    />
  );
}

// ── How steady the income is ─────────────────────────────────────────────────

export function IncomeMonthsDetails({
  data,
  average,
  note,
  legend,
  formatCurrency,
}: {
  data: { label: string; income: number; running?: boolean }[];
  /** Per finished month; undefined while the only month is the running one. */
  average?: number;
  note: string;
  legend: ReactNode;
  formatCurrency: Format;
}) {
  const { t } = useTranslation();
  const signed = signedWith(formatCurrency);
  // The month under way is not set against the average it is not part of.
  const gap = (r: (typeof data)[number]) => (average === undefined || r.running ? undefined : round2(r.income - average));
  const columns: DetailsColumn<(typeof data)[number]>[] = [
    { key: "month", label: t("analytics.details.month"), cell: (r) => (r.running ? `${r.label} · ${t("analytics.ledger.running")}` : r.label) },
    { key: "income", label: t("analytics.flow.income"), numeric: true, cell: (r) => formatCurrency(r.income), foot: average === undefined ? "—" : formatCurrency(average) },
    {
      key: "gap",
      label: t("analytics.income.vsAverage"),
      numeric: true,
      tone: gap,
      cell: (r) => {
        const g = gap(r);
        return g === undefined ? "—" : signed(g);
      },
    },
  ];
  return (
    <ChartDetails
      note={
        <>
          {note} {t("analytics.income.averageFinished")}
        </>
      }
      chart={<IncomeMonthsChart data={data} average={average} formatCurrency={formatCurrency} />}
      legend={legend}
      tableTitle={t("analytics.details.table")}
      table={<DetailsTable rows={newestFirst(data)} rowKey={(r) => r.label} columns={columns} footLabel={t("analytics.income.average")} />}
    />
  );
}

// ── Where the income comes from ──────────────────────────────────────────────

export function IncomeSourcesDetails({ rows, total, formatCurrency }: { rows: Payee[]; total: number; formatCurrency: Format }) {
  const { t } = useTranslation();
  const percent = usePercent();
  const columns: DetailsColumn<Payee>[] = [
    { key: "name", label: t("analytics.details.source"), cell: (r) => r.name },
    { key: "count", label: t("analytics.details.count"), numeric: true, cell: (r) => r.count, foot: rows.reduce((s, r) => s + r.count, 0) },
    { key: "amount", label: t("analytics.details.amount"), numeric: true, cell: (r) => formatCurrency(r.amount), foot: formatCurrency(sum(rows, (r) => r.amount)) },
    { key: "share", label: t("analytics.details.share"), numeric: true, cell: (r) => (total > 0 ? percent((r.amount / total) * 100) : "—") },
  ];
  return (
    <ChartDetails
      note={t("analytics.income.sourcesHint")}
      extra={<IncomeSources rows={rows} total={total} formatCurrency={formatCurrency} />}
      tableTitle={t("analytics.details.table")}
      table={<DetailsTable rows={rows} rowKey={(r) => r.name} columns={columns} footLabel={t("common.total")} />}
    />
  );
}
