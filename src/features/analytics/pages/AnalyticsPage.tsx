import { lazy, Suspense, useCallback, useMemo, useState, useTransition } from "react";
import { Alert } from "reactstrap";
import { useTranslation } from "react-i18next";
import { Skeleton, SkeletonChartCard, SkeletonPageHeader } from "../../../shared/components/Skeletons";

import { useCategories, useTransactions } from "../../transactions/hooks/useTransactions";
import { TransactionInsights } from "../../transactions/components/TransactionInsights";
import { useCurrencyConverter } from "../../../shared/hooks/useCurrencyConverter";
import { useLocalStorage } from "../../../shared/hooks/useLocalStorage";
import { categoryLabel } from "../../../shared/utils/categories";
import {
  ANALYTICS_RANGES,
  categorySeries,
  spendingWaterfall,
  WATERFALL_INCOME_ID,
  WATERFALL_LEFTOVER_ID,
  WATERFALL_SAVINGS_ID,
  moneyFlow,
  monthPace,
  monthlyFlows,
  rangeStart,
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
import { weekdayNames } from "../components/chartTheme";
import { DashboardKpis } from "../components/DashboardKpis";
import {
  IncomeMonthsDetails,
  IncomeSourcesDetails,
  MoneyFlowDetails,
  PaceDetails,
  SparklinesDetails,
  WaterfallDetails,
  WeekdayDetails,
} from "../components/CardDetails";
import {
  firstRecordMonth,
  hasLastYear,
  lastYearWindow,
  monthLedger,
  periodTotals,
} from "../dashboardUtils";
import WeekdayChart from "../components/WeekdayChart";
import MonthPaceChart from "../components/MonthPaceChart";
import CategorySparklines from "../components/CategorySparklines";
import MonthWaterfall from "../components/MonthWaterfall";
import IncomeMonthsChart from "../components/IncomeMonthsChart";
import IncomeSources from "../components/IncomeSources";
import { TwoWayCard } from "../components/TwoWayCard";
import { topPayees } from "../../transactions/transactionInsights";

// ECharts is a second, heavier engine, loaded only for the three charts recharts
// can't draw. Because ChartCard holds its children back until the card nears the
// viewport, the download happens on the scroll that needs it — never on arrival.
const MoneyFlowSankey = lazy(() => import("../components/MoneyFlowSankey"));

import segmented from "../../../shared/css/Segmented.module.css";
import styles from "../components/css/Analytics.module.css";
import { PageShell } from "../../../shared/components/PageShell";
import { findCategory } from "../../../shared/utils/categories";

// What a card shows before its sheet is opened: the few that matter.
const CARD_ROWS = 6;

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
  const { format: formatCurrency } = useCurrencyConverter();

  const monthFmt = useMemo(() => new Intl.DateTimeFormat(lang, { month: "short", year: "2-digit" }), [lang]);

  // ── Base data ──────────────────────────────────────────────────────────────

  const from = useMemo(() => rangeStart(range, now), [range, now]);
  const scoped = useMemo(() => withinRange(transactions, from, now), [transactions, from, now]);
  const flows = useMemo(() => monthlyFlows(scoped, from, now), [scoped, from, now]);

  const nameFor = useCallback(
    (categoryId: string) => {
      const category = findCategory(categories, categoryId);
      return category ? categoryLabel(category.name, t) : t("analytics.unknownCategory");
    },
    [categories, t],
  );

  // ── Months, spending and income ────────────────────────────────────────────

  const ledger = useMemo(() => monthLedger(flows, now), [flows, now]);
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
  const incomeMonths = useMemo(() => ledger.rows.map((row) => ({ label: monthFmt.format(row.start), income: row.income, running: row.running })), [ledger, monthFmt]);
  const incomeTotal = useMemo(() => flows.reduce((sum, flow) => sum + flow.income, 0), [flows]);
  // Per finished month, the same figure as the month-by-month sheet: the
  // month under way, a few days old, would drag it down with income still to
  // come. Undefined while the only month on screen is the running one.
  const incomeAverage = ledger.average?.income;

  // How lumpy it is: the average gap from the average, as a share of it. A
  // salary sits near zero; work invoiced in bursts runs high.
  const incomeSpread = useMemo(() => {
    const finished = ledger.rows.filter((row) => !row.running);
    if (finished.length < 2 || incomeAverage === undefined || incomeAverage <= 0) return undefined;
    const spread = finished.reduce((sum, row) => sum + Math.abs(row.income - incomeAverage), 0) / finished.length;
    return Math.round((spread / incomeAverage) * 100);
  }, [ledger, incomeAverage]);
  const paceGap = pace.currentTotal - pace.previousToDate;


  // ── Render ─────────────────────────────────────────────────────────────────

  // Failed, the page keeps its skeleton while it is tried again; the bar over
  // every page says so (`LoadErrorBar`).
  if (isLoading || isError) {
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

  const noData = t("analytics.noData");

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

          {/* ── One category, both ways ── */}
          <h2 className={styles.sectionTitle}>{t("analytics.groups.oneCategory")}</h2>

          <div className={styles.grid}>
            <TwoWayCard transactions={transactions} categories={categories} from={from} now={now} range={range} nameFor={nameFor} formatCurrency={formatCurrency} />
          </div>

          {/* ── Where the money goes ── */}
          <h2 className={styles.sectionTitle}>{t("analytics.groups.where")}</h2>

          <div className={styles.grid}>
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

          </div>

          {/* ── Your income ── */}
          {incomeTotal > 0 && (
            <>
              <h2 className={styles.sectionTitle}>{t("analytics.groups.income")}</h2>

              <div className={styles.grid}>
                <ChartCard
                  title={t("analytics.income.stabilityTitle")}
                  hint={t("analytics.income.stabilityHint")}
                  value={incomeAverage === undefined ? "—" : formatCurrency(incomeAverage)}
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
