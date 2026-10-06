import { lazy, Suspense, useCallback, useMemo, useState, useTransition } from "react";
import { Alert } from "reactstrap";
import { useTranslation } from "react-i18next";
import { Skeleton, SkeletonChartCard, SkeletonPageHeader } from "../../../shared/components/Skeletons";

import { useCategories, useTransactions } from "../../transactions/hooks/useTransactions";
import { useDebts } from "../../debts/useDebts";
import { useBills } from "../../bills/useBills";
import { useWorkspaceSetting } from "../../../shared/hooks/useWorkspaceSetting";
import { PLANNER_KEYS, cleanLines } from "../../plannerPage/plannerInputs";
import type { BudgetLine } from "../../plannerPage/plannerUtils";
import { firestoreToDate } from "../../../shared/utils/dates";
import { useOpeningBalance } from "../../../shared/hooks/useOpeningBalance";
import { TransactionInsights } from "../../transactions/components/TransactionInsights";
import { useCurrencyConverter } from "../../../shared/hooks/useCurrencyConverter";
import { useLocalStorage } from "../../../shared/hooks/useLocalStorage";
import { categoryLabel } from "../../../shared/utils/categories";
import {
  ANALYTICS_RANGES,
  categoryDeltas,
  categorySeries,
  spendingWaterfall,
  WATERFALL_INCOME_ID,
  WATERFALL_LEFTOVER_ID,
  WATERFALL_SAVINGS_ID,
  committedSplit,
  averageSavingsRate,
  categoryTrend,
  cumulativeNet,
  moneyFlow,
  monthPace,
  monthlyFlows,
  rangeStart,
  savingsRateSeries,
  spendingHeatmap,
  withinRange,
  FLOW_DEFICIT_ID,
  FLOW_HUB_ID,
  FLOW_LEFTOVER_ID,
  FLOW_SAVINGS_ID,
  FLOW_WITHDRAWALS_ID,
  OTHER_CATEGORY_ID,
  type AnalyticsRange,
  type FlowNode,
} from "../analyticsUtils";
import { ChartCard } from "../components/ChartCard";
import { Legend } from "../components/Legend";
import { seriesColor, seriesDash, weekdayNames } from "../components/chartTheme";
import { DashboardKpis } from "../components/DashboardKpis";
import { LineKey } from "../components/DashboardKeys";
import type { TrioRow } from "../components/MonthTrioChart";
import MonthNetBars from "../components/MonthNetBars";
import MonthByMonthDetails from "../components/MonthByMonthDetails";
import {
  CommittedDetails,
  FlowDetails,
  IncomeMonthsDetails,
  IncomeSourcesDetails,
  MoneyFlowDetails,
  MoversDetails,
  NetWorthDetails,
  PaceDetails,
  PlanDetails,
  SavingsDetails,
  SparklinesDetails,
  TrendDetails,
  WaterfallDetails,
  WeekdayDetails,
} from "../components/CardDetails";
import LabelledFlowChart from "../components/LabelledFlowChart";
import PlanActualChart, { type PlanActualRow } from "../components/PlanActualChart";
import SavingsGoalChart, { SavingsGoalControl } from "../components/SavingsGoalChart";
import {
  SAVINGS_GOAL_KEY,
  cleanSavingsGoal,
  firstRecordMonth,
  goalMonths,
  hasLastYear,
  lastYearWindow,
  monthLedger,
  periodTotals,
  planByMonth,
  type SavingsGoal,
} from "../dashboardUtils";
import CategoryTrendChart, { type TrendRow, type TrendSeries } from "../components/CategoryTrendChart";
import WeekdayChart from "../components/WeekdayChart";
import MonthPaceChart from "../components/MonthPaceChart";
import TopMoversChart from "../components/TopMoversChart";
import CategorySparklines from "../components/CategorySparklines";
import MonthWaterfall from "../components/MonthWaterfall";
import CommittedSplitChart from "../components/CommittedSplitChart";
import NetWorthChart, { type NetWorthRow } from "../components/NetWorthChart";
import IncomeMonthsChart from "../components/IncomeMonthsChart";
import IncomeSources from "../components/IncomeSources";
import { topPayees } from "../../transactions/transactionInsights";
import { netWorthSeries, repaymentsOutsideCash } from "../netWorthUtils";

// ECharts is a second, heavier engine, loaded only for the three charts recharts
// can't draw. Because ChartCard holds its children back until the card nears the
// viewport, the download happens on the scroll that needs it — never on arrival.
const MoneyFlowSankey = lazy(() => import("../components/MoneyFlowSankey"));

import segmented from "../../../shared/css/Segmented.module.css";
import styles from "../components/css/Analytics.module.css";
import { PageShell } from "../../../shared/components/PageShell";

// What a card shows before its sheet is opened: the few that matter.
const CARD_ROWS = 6;
const CARD_SERIES = 3;

export function AnalyticsPage() {
  const { t, i18n } = useTranslation();
  const lang = i18n.resolvedLanguage ?? "en";

  const [range, setRange] = useLocalStorage<AnalyticsRange>("analytics-range", "6m");
  const [isPending, startTransition] = useTransition();

  // One clock reading for the whole visit. A fresh `new Date()` each render
  // would be a new value every time and invalidate every memo below.
  const [now] = useState(() => new Date());

  const { data: transactions = [], isLoading, isError } = useTransactions();
  const { data: categories = [] } = useCategories();
  const { data: debts = [] } = useDebts();
  const { anchors } = useOpeningBalance();
  const { format: formatCurrency } = useCurrencyConverter();

  const monthFmt = useMemo(() => new Intl.DateTimeFormat(lang, { month: "short", year: "2-digit" }), [lang]);

  // ── Base data ──────────────────────────────────────────────────────────────

  const from = useMemo(() => rangeStart(range, now), [range, now]);
  const scoped = useMemo(() => withinRange(transactions, from, now), [transactions, from, now]);
  const flows = useMemo(() => monthlyFlows(scoped, from, now), [scoped, from, now]);

  const nameFor = useCallback(
    (categoryId: string) => {
      const category = categories.find((c) => c.id === categoryId);
      return category ? categoryLabel(category.name, t) : t("analytics.unknownCategory");
    },
    [categories, t],
  );

  // ── Flow & saving ──────────────────────────────────────────────────────────

  const netData = useMemo(() => cumulativeNet(flows).map((p) => ({ label: monthFmt.format(p.start), cumulative: p.cumulative, net: p.net })), [flows, monthFmt]);

  const savingsData = useMemo(
    () => savingsRateSeries(flows).map((p) => ({ label: monthFmt.format(p.start), rate: p.rate, income: p.income, net: p.net })),
    [flows, monthFmt],
  );
  const avgRate = useMemo(() => averageSavingsRate(flows), [flows]);

  const flowData = useMemo(() => flows.map((f) => ({ label: monthFmt.format(f.start), income: f.income, expenses: f.expenses, net: f.net })), [flows, monthFmt]);
  const flowLegend = (
    <Legend
      items={[
        { color: "var(--chart-income)", label: t("analytics.flow.income") },
        { color: "var(--chart-expense)", label: t("analytics.flow.expenses") },
      ]}
    />
  );
  const trioRows = useMemo<TrioRow[]>(() => flowData.map((row, i) => ({ ...row, cumulative: netData[i]?.cumulative ?? 0 })), [flowData, netData]);
  const ledger = useMemo(() => monthLedger(flows, now), [flows, now]);
  const netBars = useMemo(() => ledger.rows.map((row) => ({ label: monthFmt.format(row.start), net: row.net, running: row.running })), [ledger, monthFmt]);
  const totalExpenses = useMemo(() => flows.reduce((s, f) => s + f.expenses, 0), [flows]);

  const sankey = useMemo(() => moneyFlow(scoped), [scoped]);

  // ── At a glance ────────────────────────────────────────────────────────────
  //
  // The dashboard at the top: four totals with last year beside them, and the
  // months drawn four ways. All of it from the same `flows` as the charts
  // below, so a total up here is the same number as the line it sums.

  const totals = useMemo(() => periodTotals(flows), [flows]);

  // Last year's same stretch — only when the records reach back to its first
  // month, or every figure would read as a rise from nothing.
  const firstMonth = useMemo(() => firstRecordMonth(transactions), [transactions]);
  const yearBefore = useMemo(() => lastYearWindow(from, now), [from, now]);
  const comparable = hasLastYear(yearBefore, firstMonth);
  const lastYearFlows = useMemo(
    () => (yearBefore ? monthlyFlows(withinRange(transactions, yearBefore.from, yearBefore.to), yearBefore.from, yearBefore.to) : []),
    [transactions, yearBefore],
  );
  const lastYearTotals = useMemo(() => (comparable ? periodTotals(lastYearFlows) : undefined), [comparable, lastYearFlows]);

  const kpiMonths = useMemo(() => flows.map((f) => ({ income: f.income, expenses: f.expenses, net: f.net, rate: f.income > 0 ? (f.net / f.income) * 100 : null })), [flows]);

  // The plan: bills plus the Planner's expense lines, as they stand today. The
  // bills are the query the menu's badge already holds, so no new read.
  const { data: bills = [] } = useBills();
  const [storedLines] = useWorkspaceSetting<BudgetLine[]>(PLANNER_KEYS.lines, []);
  const planLines = useMemo(() => cleanLines(storedLines), [storedLines]);
  const plan = useMemo(() => planByMonth(bills, planLines, flows.map((f) => f.start), now), [bills, planLines, flows, now]);
  const hasPlan = plan.some((month) => month.amount > 0);

  const planRows = useMemo<PlanActualRow[]>(
    () =>
      flows.map((f, i) => {
        const before = lastYearFlows[i];
        // A month before the records begin is "not using the app yet", not zero.
        const known = !!before && !!firstMonth && before.start.getTime() >= firstMonth.getTime();
        return { label: monthFmt.format(f.start), actual: f.expenses, plan: hasPlan ? plan[i].amount : null, lastYear: known ? before.expenses : null };
      }),
    [flows, lastYearFlows, firstMonth, hasPlan, plan, monthFmt],
  );
  const showLastYearLine = planRows.some((row) => row.lastYear !== null);
  const planCardRows = useMemo(() => planRows.map((row) => ({ ...row, lastYear: null })), [planRows]);
  const planGap = hasPlan ? Math.round((totals.expenses - plan.reduce((sum, month) => sum + month.amount, 0)) * 100) / 100 : undefined;

  const [storedGoal, setStoredGoal] = useWorkspaceSetting<SavingsGoal | null>(SAVINGS_GOAL_KEY, null);
  const goal = useMemo(() => cleanSavingsGoal(storedGoal), [storedGoal]);

  // ── What you are worth ─────────────────────────────────────────────────────
  //
  // The one part of the page that is not about a period. Every chart around it
  // measures what moved; this measures what there is, which needed the debts
  // and the goals the page had never once looked at.
  // The range picker's "all" has no start date, but a series still needs a
  // first month — the earliest thing on record, whichever ledger it is in.
  const positionFrom = useMemo(() => {
    if (from) return from;
    const times = [...transactions.map((tx) => firestoreToDate(tx.date).getTime()), ...debts.map((debt) => firestoreToDate(debt.date).getTime())];
    return times.length > 0 ? new Date(Math.min(...times)) : now;
  }, [from, transactions, debts, now]);

  const position = useMemo(() => netWorthSeries(transactions, debts, anchors, positionFrom, now), [transactions, debts, anchors, positionFrom, now]);

  const positionData = useMemo<NetWorthRow[]>(
    () => position.map((point) => ({ label: monthFmt.format(point.start), cash: point.cash, saved: point.saved, owedToMe: point.owedToMe, debt: -point.owedByMe, net: point.net })),
    [position, monthFmt],
  );

  const netWorth = position.length > 0 ? position[position.length - 1].net : 0;
  const netWorthMove = position.length > 1 ? netWorth - position[0].net : undefined;

  // Whether the line above can be believed. A repayment is its own record, not
  // spending, so one entered without the matching expense lowers what is owed
  // without lowering the cash — and the position climbs for no reason.
  const repayments = useMemo(() => repaymentsOutsideCash(debts, transactions), [debts, transactions]);
  const repaymentWarning = repayments.unmatched > 0 && repayments.unmatched >= repayments.matched;

  // The warning outranks the movement: a figure that may be wrong should not be
  // captioned with how pleasingly it has grown.
  const netWorthHint = (() => {
    if (repaymentWarning) return t("analytics.netWorth.repaymentWarning");
    if (netWorthMove === undefined || Math.abs(netWorthMove) < 1) return t("analytics.netWorth.hint");
    return t(netWorthMove > 0 ? "analytics.netWorth.moveUp" : "analytics.netWorth.moveDown", {
      amount: formatCurrency(Math.abs(netWorthMove)),
      since: monthFmt.format(position[0].start),
    });
  })();

  const flowLabel = useCallback(
    (node: FlowNode) => {
      if (node.categoryId === OTHER_CATEGORY_ID) return t("analytics.categoryTrend.other", { count: sankey?.otherCount ?? 0 });
      if (node.categoryId) return nameFor(node.categoryId);
      switch (node.id) {
        case FLOW_HUB_ID:
          return t("analytics.moneyFlow.hub");
        case FLOW_SAVINGS_ID:
          return t("analytics.moneyFlow.savings");
        case FLOW_LEFTOVER_ID:
          return t("analytics.moneyFlow.leftover");
        case FLOW_DEFICIT_ID:
          return t("analytics.moneyFlow.deficit");
        case FLOW_WITHDRAWALS_ID:
          return t("analytics.moneyFlow.withdrawals");
        default:
          return node.id;
      }
    },
    [nameFor, t, sankey?.otherCount],
  );

  // ── Where the money goes ───────────────────────────────────────────────────

  const trend = useMemo(() => categoryTrend(scoped, flows, Number.MAX_SAFE_INTEGER), [scoped, flows]);

  const trendSeries = useMemo(
    () =>
      trend.categoryIds.map((id, i) => ({
        id,
        name: id === OTHER_CATEGORY_ID ? t("analytics.categoryTrend.other", { count: trend.otherCount }) : nameFor(id),
        color: seriesColor(i),
        dash: seriesDash(i),
      })),
    [trend, nameFor, t],
  );

  const trendLegend = (items: TrendSeries[]) => (
    <div className={styles.legend}>
      {items.map((s) => (
        <span key={s.id} className={styles.legendItem}>
          <span className={styles.swatch} style={{ background: s.color }} />
          <span className="text-truncate">{s.name}</span>
        </span>
      ))}
    </div>
  );

  const trendData = useMemo<TrendRow[]>(() => trend.rows.map((r) => ({ label: monthFmt.format(r.start), ...r.totals })), [trend, monthFmt]);


  const movers = useMemo(() => categoryDeltas(transactions, from, now), [transactions, from, now]);
  const series = useMemo(() => categorySeries(scoped, flows, 12, now), [scoped, flows, now]);
  const waterfall = useMemo(() => spendingWaterfall(scoped), [scoped]);

  // The waterfall's steps are not all categories: two of them are the income it
  // starts from and the money left at the end. Running those through the
  // category lookup got each of them called "Uncategorised", alongside the one
  // step that genuinely was.
  const waterfallLabel = useCallback(
    (id: string) => {
      if (id === WATERFALL_INCOME_ID) return t("analytics.flow.income");
      // "Left over" is the wrong word for a negative remainder: nothing was
      // left, the month ran past what came in.
      if (id === WATERFALL_LEFTOVER_ID) return t(waterfall[waterfall.length - 1]?.balance < 0 ? "analytics.waterfall.shortBy" : "analytics.waterfall.leftover");
      if (id === OTHER_CATEGORY_ID) return t("analytics.waterfall.otherCategories");
      // The Sankey's own words for the same money, so the two charts agree on it.
      if (id === WATERFALL_SAVINGS_ID) return t("analytics.moneyFlow.savings");
      return nameFor(id);
    },
    [nameFor, t, waterfall],
  );

  const committed = useMemo(() => committedSplit(scoped, flows), [scoped, flows]);

  // The charts are only half the answer to "so what do I do": each of these
  // says the conclusion in words, above the picture that backs it up.
  const moversHeadline = useMemo(() => {
    const top = movers[0];
    if (!top) return undefined;
    return `${top.delta > 0 ? "+" : "−"}${formatCurrency(Math.abs(top.delta))} ${nameFor(top.categoryId)}`;
  }, [movers, formatCurrency, nameFor]);

  const committedHeadline = useMemo(() => {
    const last = committed[committed.length - 1];
    return last && last.share > 0 ? t("analytics.committed.headline", { percent: Math.round(last.share * 100) }) : undefined;
  }, [committed, t]);

  // ── Habits & pace ──────────────────────────────────────────────────────────

  const heat = useMemo(() => spendingHeatmap(scoped, from, now), [scoped, from, now]);

  const busiestWeekday = useMemo(() => {
    const max = Math.max(...heat.weekdayTotals);
    return max > 0 ? weekdayNames(lang)[heat.weekdayTotals.indexOf(max)] : undefined;
  }, [heat, lang]);

  // Deliberately unscoped: this card is always "this month against last month",
  // whatever window the rest of the page is showing.
  const pace = useMemo(() => monthPace(transactions, now), [transactions, now]);

  // ── The income half ────────────────────────────────────────────────────────
  //
  // This used to be a toggle on the panel at the top of the page, where it had
  // to answer the same five questions asked of spending. Income does not have
  // five answers: for most people it has one source and arrives on the same day.
  // The two questions it does answer — where it comes from, and whether it can
  // be relied on — are these.
  const incomeSources = useMemo(() => topPayees(scoped, "income"), [scoped]);
  const incomeMonths = useMemo(() => flows.map((flow) => ({ label: monthFmt.format(flow.start), income: flow.income })), [flows, monthFmt]);
  const incomeTotal = useMemo(() => flows.reduce((sum, flow) => sum + flow.income, 0), [flows]);
  const incomeAverage = flows.length > 0 ? incomeTotal / flows.length : 0;

  // How lumpy it is: the average gap from the average, as a share of it. A
  // salary sits near zero; work invoiced in bursts runs high.
  const incomeSpread = useMemo(() => {
    if (flows.length < 2 || incomeAverage <= 0) return undefined;
    const spread = flows.reduce((sum, flow) => sum + Math.abs(flow.income - incomeAverage), 0) / flows.length;
    return Math.round((spread / incomeAverage) * 100);
  }, [flows, incomeAverage]);
  const paceGap = pace.currentTotal - pace.previousToDate;


  // ── Render ─────────────────────────────────────────────────────────────────

  if (isLoading) {
    return (
      <PageShell>
        <SkeletonPageHeader />
        <div className="row g-3">
          {Array.from({ length: 6 }, (_, i) => (
            <div key={i} className="col-12 col-xl-6">
              <SkeletonChartCard height={200} />
            </div>
          ))}
        </div>
      </PageShell>
    );
  }

  if (isError) {
    return (
      <PageShell>
        <Alert color="danger" className="small">
          {t("common.failedToLoad")}
        </Alert>
      </PageShell>
    );
  }

  const noData = t("analytics.noData");
  const reached = goal ? goalMonths(savingsData.map((p) => p.rate), goal) : undefined;

  return (
    <PageShell>
      <div className="d-flex justify-content-between align-items-start mb-4 flex-wrap gap-3">
        <div>
          <h1 className="h5 fw-semibold text-body-emphasis mb-0">{t("analytics.title")}</h1>
          <p className="small text-body-secondary mb-0">{t("analytics.subtitle")}</p>
        </div>

        <div className={segmented.group}>
          {ANALYTICS_RANGES.map((r) => (
            <button key={r} type="button" disabled={isPending} onClick={() => startTransition(() => setRange(r))} className={`${segmented.item} ${range === r ? segmented.active : ""}`}>
              {t(`analytics.range.${r}`)}
            </button>
          ))}
        </div>
      </div>

      {transactions.length === 0 ? (
        <Alert color="secondary" className="small mb-0">
          {t("analytics.nothingYet")}
        </Alert>
      ) : (
        <div style={{ opacity: isPending ? 0.5 : 1, transition: "opacity 0.2s" }}>
          {/* ── At a glance ── */}
          <h2 className={styles.sectionTitle}>{t("analytics.dashboard.group")}</h2>

          <DashboardKpis
            current={totals}
            lastYear={lastYearTotals}
            months={kpiMonths}
            rangeLabel={t(`analytics.range.${range}`)}
            formatCurrency={formatCurrency}
            locale={lang}
          />

          <div className={`${styles.grid} mb-4`}>
            {/* A glance — what each month kept — and everything else one tap
                away: the three charts, and every month as a row. */}
            <ChartCard
              tall
              title={t("analytics.dashboard.trioTitle")}
              hint={t("analytics.dashboard.trioHint")}
              value={`${totals.net > 0 ? "+" : totals.net < 0 ? "−" : ""}${formatCurrency(Math.abs(totals.net))}`}
              valueTone={totals.net > 0 ? "income" : totals.net < 0 ? "expense" : "neutral"}
              empty={flows.length === 0 ? noData : undefined}
              details={{ content: <MonthByMonthDetails ledger={ledger} trio={trioRows} formatCurrency={formatCurrency} monthLabel={(d) => monthFmt.format(d)} /> }}
            >
              <MonthNetBars data={netBars} />
            </ChartCard>

            <ChartCard tall title={t("analytics.flow.title")} hint={t("analytics.flow.short")} details={{ content: <FlowDetails data={flowData} formatCurrency={formatCurrency} legend={flowLegend} /> }}>
              <LabelledFlowChart data={flowData} formatCurrency={formatCurrency} compact />
            </ChartCard>

            <ChartCard
              tall
              title={t("analytics.dashboard.planTitle")}
              // The gap is the figure; the words for it go under the title, so a
              // long phrase does not squeeze the title into a column.
              hint={t(planGap === undefined ? "analytics.dashboard.noPlanShort" : planGap > 0 ? "analytics.dashboard.overPlanShort" : planGap < 0 ? "analytics.dashboard.underPlanShort" : "analytics.dashboard.onPlanShort")}
              value={planGap === undefined ? undefined : `${planGap > 0 ? "+" : planGap < 0 ? "−" : ""}${formatCurrency(Math.abs(planGap))}`}
              valueTone={planGap === undefined || planGap === 0 ? "neutral" : planGap > 0 ? "expense" : "income"}
              details={{
                content: (
                  <PlanDetails
                    rows={planRows}
                    note={planGap === undefined ? t("analytics.dashboard.noPlan") : t(planGap > 0 ? "analytics.dashboard.overPlan" : planGap < 0 ? "analytics.dashboard.underPlan" : "analytics.dashboard.onPlan")}
                    legend={
                      <LineKey
                        items={[
                          { color: "var(--chart-expense)", label: t("analytics.dashboard.actual") },
                          ...(hasPlan ? [{ color: "var(--chart-expense)", label: t("analytics.dashboard.plan"), dash: "6 4", opacity: 0.8 }] : []),
                          ...(showLastYearLine ? [{ color: "var(--chart-expense)", label: t("analytics.dashboard.lastYear"), dash: "1.5 4", opacity: 0.5 }] : []),
                        ]}
                      />
                    }
                    formatCurrency={formatCurrency}
                  />
                ),
              }}
            >
              {/* The card draws what was spent against the plan; last year waits in the sheet. */}
              <PlanActualChart data={planCardRows} formatCurrency={formatCurrency} compact />
            </ChartCard>

            <ChartCard
              tall
              title={t("analytics.savingsRate.title")}
              hint={goal && reached ? t("analytics.dashboard.goalHint", { reached: reached.reached, count: reached.counted, min: goal.min }) : t("analytics.savingsRate.hint")}
              value={avgRate === undefined ? "—" : `${Math.round(avgRate)}%`}
              valueTone={avgRate !== undefined && avgRate < 0 ? "expense" : "income"}
              empty={avgRate === undefined ? noData : undefined}
              details={{
                content: (
                  <SavingsDetails
                    data={savingsData}
                    goal={goal}
                    average={avgRate}
                    note={t("analytics.savingsRate.hint")}
                    legend={
                      <Legend
                        items={[
                          { color: "var(--chart-net)", label: t("analytics.dashboard.monthRate") },
                          ...(goal ? [{ color: "color-mix(in srgb, var(--chart-income) 35%, transparent)", label: t("analytics.dashboard.goalBand") }] : []),
                        ]}
                      />
                    }
                    control={<SavingsGoalControl goal={goal} onSave={(next) => setStoredGoal(next ?? null)} />}
                    formatCurrency={formatCurrency}
                  />
                ),
              }}
            >
              <SavingsGoalChart data={savingsData} goal={goal} average={avgRate} formatCurrency={formatCurrency} compact />
            </ChartCard>
          </div>

          {/* Moved off the Transactions screen, which had become a table
              wearing a dashboard. The figures belong with the other charts,
              and the range picker above already scopes them. */}
          <TransactionInsights
            transactions={scoped}
            allTransactions={transactions}
            categories={categories}
            formatCurrency={formatCurrency}
            fromDate={from}
            toDate={now}
          />

          {/* ── Where you stand ── */}
          {positionData.length > 0 && (
            <>
              <h2 className={styles.sectionTitle}>{t("analytics.groups.position")}</h2>

              <div className={styles.grid}>
                <ChartCard
                  wide
                  tall
                  title={t("analytics.netWorth.title")}
                  hint={netWorthHint}
                  value={formatCurrency(netWorth)}
                  valueTone={netWorth >= 0 ? "income" : "expense"}
                  details={{
                    content: (
                      <NetWorthDetails
                        rows={positionData}
                        note={repaymentWarning ? netWorthHint : t("analytics.netWorth.hint")}
                        legend={
                          <Legend
                            items={[
                              { color: "var(--color-income)", label: t("analytics.netWorth.cash") },
                              { color: "var(--color-invest)", label: t("analytics.netWorth.saved") },
                              { color: "var(--color-goal)", label: t("analytics.netWorth.owedToMe") },
                              { color: "var(--color-expense)", label: t("analytics.netWorth.owedByMe") },
                            ]}
                          />
                        }
                        formatCurrency={formatCurrency}
                      />
                    ),
                  }}
                >
                  <NetWorthChart data={positionData} formatCurrency={formatCurrency} compact />
                </ChartCard>
              </div>
            </>
          )}

          {/* ── Where the money goes ── */}
          <h2 className={styles.sectionTitle}>{t("analytics.groups.where")}</h2>

          <div className={styles.grid}>
            <ChartCard
              tall
              title={t("analytics.movers.title")}
              hint={t("analytics.movers.short")}
              value={moversHeadline}
              valueTone={movers[0] && movers[0].delta > 0 ? "expense" : "income"}
              empty={movers.length === 0 ? t("analytics.movers.needsHistory") : undefined}
              details={{ content: <MoversDetails rows={movers} nameFor={nameFor} formatCurrency={formatCurrency} /> }}
            >
              <TopMoversChart rows={movers} nameFor={nameFor} formatCurrency={formatCurrency} limit={5} />
            </ChartCard>

            {/* `auto`, not `tall`: this one draws a row per category rather
                than a plot that stretches, so its height is however many
                categories there are. Held to a fixed box it scrolled inside
                itself — a list you have to scroll to see is a list you do not
                read. */}
            <ChartCard
              auto
              title={t("analytics.sparklines.title")}
              hint={t("analytics.sparklines.short")}
              empty={series.length === 0 ? noData : undefined}
              details={{ content: <SparklinesDetails rows={series} nameFor={nameFor} formatCurrency={formatCurrency} /> }}
            >
              <CategorySparklines rows={series.slice(0, CARD_ROWS)} nameFor={nameFor} formatCurrency={formatCurrency} />
            </ChartCard>

            <ChartCard
              auto
              title={t("analytics.waterfall.title")}
              hint={t("analytics.waterfall.short")}
              value={formatCurrency(waterfall.length > 0 ? waterfall[waterfall.length - 1].balance : 0)}
              valueTone={waterfall.length > 0 && waterfall[waterfall.length - 1].balance < 0 ? "expense" : "income"}
              empty={waterfall.length <= 2 ? noData : undefined}
              details={{ content: <WaterfallDetails steps={waterfall} nameFor={waterfallLabel} formatCurrency={formatCurrency} /> }}
            >
              <MonthWaterfall steps={waterfall} nameFor={waterfallLabel} formatCurrency={formatCurrency} compact />
            </ChartCard>
          </div>

          {/* ── Habits & pace ── */}
          <h2 className={styles.sectionTitle}>{t("analytics.groups.habits")}</h2>

          <div className={styles.grid}>
            <ChartCard
              title={t("analytics.weekday.title")}
              hint={t("analytics.weekday.hint")}
              value={busiestWeekday ?? "—"}
              empty={busiestWeekday ? undefined : noData}
              details={{ content: <WeekdayDetails totals={heat.weekdayTotals} locale={lang} formatCurrency={formatCurrency} /> }}
            >
              <WeekdayChart totals={heat.weekdayTotals} formatCurrency={formatCurrency} locale={lang} />
            </ChartCard>

            <ChartCard
              title={t("analytics.pace.title")}
              hint={t("analytics.pace.short")}
              // Spending more than last month is the bad direction, so the sign
              // and the colour have to agree with that, not with the arithmetic.
              value={`${paceGap >= 0 ? "+" : "−"}${formatCurrency(Math.abs(paceGap))}`}
              valueTone={paceGap > 0 ? "expense" : "income"}
              details={{
                content: (
                  <PaceDetails
                    pace={pace}
                    legend={
                      <Legend
                        items={[
                          { color: "var(--color-expense)", label: t("analytics.pace.thisMonth") },
                          { color: "var(--color-text-secondary)", label: t("analytics.pace.lastMonth") },
                        ]}
                      />
                    }
                    formatCurrency={formatCurrency}
                  />
                ),
              }}
            >
              <MonthPaceChart data={pace.points} formatCurrency={formatCurrency} compact />
            </ChartCard>

            <ChartCard
              title={t("analytics.committed.title")}
              hint={t("analytics.committed.short")}
              value={committedHeadline}
              empty={committed.length === 0 ? noData : undefined}
              details={{
                content: (
                  <CommittedDetails
                    rows={committed}
                    legend={
                      <Legend
                        items={[
                          { color: "var(--color-goal)", label: t("analytics.committed.committed") },
                          { color: "var(--color-expense)", label: t("analytics.committed.free") },
                        ]}
                      />
                    }
                    monthLabel={(d) => monthFmt.format(d)}
                    formatCurrency={formatCurrency}
                  />
                ),
              }}
            >
              <CommittedSplitChart rows={committed} formatCurrency={formatCurrency} monthLabel={(d) => monthFmt.format(d)} />
            </ChartCard>
          </div>

          {/* ── Flow & saving ── */}
          <h2 className={styles.sectionTitle}>{t("analytics.groups.flow")}</h2>

          <div className={styles.grid}>
            {/* The running net position, the savings rate and income against
                spending moved up into the dashboard; what stays here is where
                the money went. */}
            {/* The ribbons crowd as categories pile up, and on a phone the card is
                far too small to follow one through — the card's own magnify
                button opens the same drawing at the size it needs. */}
            <ChartCard
              wide
              tall
              title={t("analytics.moneyFlow.title")}
              hint={t("analytics.moneyFlow.hint")}
              value={sankey ? formatCurrency(sankey.total) : undefined}
              valueTone="income"
              empty={sankey ? undefined : noData}
              details={
                sankey && {
                  content: (
                    <MoneyFlowDetails
                      chart={
                        <Suspense fallback={<Skeleton height="100%" />}>
                          <MoneyFlowSankey nodes={sankey.nodes} links={sankey.links} labelFor={flowLabel} formatCurrency={formatCurrency} ariaLabel={t("analytics.moneyFlow.title")} />
                        </Suspense>
                      }
                      nodes={sankey.nodes}
                      links={sankey.links}
                      total={sankey.total}
                      labelFor={flowLabel}
                      formatCurrency={formatCurrency}
                    />
                  ),
                }
              }
            >
              {/* The card reserves its own height, so a blank one just looks
                  broken until the chart chunk lands. */}
              <Suspense fallback={<Skeleton height="100%" />}>
                <MoneyFlowSankey nodes={sankey?.nodes ?? []} links={sankey?.links ?? []} labelFor={flowLabel} formatCurrency={formatCurrency} ariaLabel={t("analytics.moneyFlow.title")} />
              </Suspense>
            </ChartCard>

            <ChartCard
              wide
              tall
              title={t("analytics.categoryTrend.title")}
              hint={t("analytics.categoryTrend.short", { count: Math.min(CARD_SERIES, trendSeries.length) })}
              value={formatCurrency(totalExpenses)}
              valueTone="expense"
              empty={trendSeries.length === 0 ? noData : undefined}
              footer={trendLegend(trendSeries.slice(0, CARD_SERIES))}
              details={{ content: <TrendDetails data={trendData} series={trendSeries} legend={trendLegend(trendSeries)} formatCurrency={formatCurrency} /> }}
            >
              {/* The biggest few on the card; every category waits in the sheet. */}
              <CategoryTrendChart data={trendData} series={trendSeries.slice(0, CARD_SERIES)} formatCurrency={formatCurrency} totalLabel={t("common.total")} compact />
            </ChartCard>
          </div>

          {/* ── Your income ── */}
          {incomeTotal > 0 && (
            <>
              <h2 className={styles.sectionTitle}>{t("analytics.groups.income")}</h2>

              <div className={styles.grid}>
                <ChartCard
                  title={t("analytics.income.stabilityTitle")}
                  hint={t("analytics.income.stabilityHint")}
                  value={formatCurrency(incomeAverage)}
                  valueTone="income"
                  empty={incomeMonths.length === 0 ? noData : undefined}
                  details={{
                    content: (
                      <IncomeMonthsDetails
                        data={incomeMonths}
                        average={incomeAverage}
                        note={incomeSpread === undefined ? t("analytics.income.stabilityHint") : t("analytics.income.spread", { percent: incomeSpread })}
                        legend={<Legend items={[{ color: "var(--color-text-primary)", label: t("analytics.income.average") }]} />}
                        formatCurrency={formatCurrency}
                      />
                    ),
                  }}
                >
                  <IncomeMonthsChart data={incomeMonths} average={incomeAverage} formatCurrency={formatCurrency} compact />
                </ChartCard>

                <ChartCard
                  auto
                  title={t("analytics.income.sourcesTitle")}
                  hint={t("analytics.income.sourcesShort")}
                  value={formatCurrency(incomeTotal)}
                  valueTone="income"
                  empty={incomeSources.length === 0 ? t("analytics.income.noNames") : undefined}
                  details={{ content: <IncomeSourcesDetails rows={incomeSources} total={incomeTotal} formatCurrency={formatCurrency} /> }}
                >
                  <IncomeSources rows={incomeSources.slice(0, 3)} total={incomeTotal} formatCurrency={formatCurrency} />
                </ChartCard>
              </div>
            </>
          )}
        </div>
      )}
    </PageShell>
  );
}
