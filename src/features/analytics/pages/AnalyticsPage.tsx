import { lazy, Suspense, useCallback, useMemo, useState, useTransition } from "react";
import { Alert } from "reactstrap";
import { useTranslation } from "react-i18next";
import { Skeleton, SkeletonChartCard, SkeletonPageHeader } from "../../../shared/components/Skeletons";

import { useCategories, useTransactions } from "../../transactions/hooks/useTransactions";
import { useDebts } from "../../debts/useDebts";
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
import NetPositionChart from "../components/NetPositionChart";
import SavingsRateChart from "../components/SavingsRateChart";
import IncomeExpenseChart from "../components/IncomeExpenseChart";
import CategoryTrendChart, { type TrendRow } from "../components/CategoryTrendChart";
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
  const { opening } = useOpeningBalance();
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
  const netTotal = netData.length > 0 ? netData[netData.length - 1].cumulative : 0;

  const savingsData = useMemo(
    () => savingsRateSeries(flows).map((p) => ({ label: monthFmt.format(p.start), rate: p.rate, income: p.income, net: p.net })),
    [flows, monthFmt],
  );
  const avgRate = useMemo(() => averageSavingsRate(flows), [flows]);

  const flowData = useMemo(() => flows.map((f) => ({ label: monthFmt.format(f.start), income: f.income, expenses: f.expenses, net: f.net })), [flows, monthFmt]);
  const totalExpenses = useMemo(() => flows.reduce((s, f) => s + f.expenses, 0), [flows]);

  const sankey = useMemo(() => moneyFlow(scoped), [scoped]);

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

  const position = useMemo(() => netWorthSeries(transactions, debts, opening, positionFrom, now), [transactions, debts, opening, positionFrom, now]);

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
                  footer={
                    <Legend
                      items={[
                        { color: "var(--color-income)", label: t("analytics.netWorth.cash") },
                        { color: "var(--color-invest)", label: t("analytics.netWorth.saved") },
                        { color: "var(--color-goal)", label: t("analytics.netWorth.owedToMe") },
                        { color: "var(--color-expense)", label: t("analytics.netWorth.owedByMe") },
                      ]}
                    />
                  }
                >
                  <NetWorthChart data={positionData} formatCurrency={formatCurrency} />
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
              hint={t("analytics.movers.hint")}
              value={moversHeadline}
              valueTone={movers[0] && movers[0].delta > 0 ? "expense" : "income"}
              empty={movers.length === 0 ? t("analytics.movers.needsHistory") : undefined}
            >
              <TopMoversChart rows={movers} nameFor={nameFor} formatCurrency={formatCurrency} />
            </ChartCard>

            {/* `auto`, not `tall`: this one draws a row per category rather
                than a plot that stretches, so its height is however many
                categories there are. Held to a fixed box it scrolled inside
                itself — a list you have to scroll to see is a list you do not
                read. */}
            <ChartCard
              auto
              title={t("analytics.sparklines.title")}
              hint={t("analytics.sparklines.hint")}
              empty={series.length === 0 ? noData : undefined}
            >
              <CategorySparklines rows={series} nameFor={nameFor} formatCurrency={formatCurrency} />
            </ChartCard>

            <ChartCard
              auto
              title={t("analytics.waterfall.title")}
              hint={t("analytics.waterfall.hint")}
              value={formatCurrency(waterfall.length > 0 ? waterfall[waterfall.length - 1].balance : 0)}
              valueTone={waterfall.length > 0 && waterfall[waterfall.length - 1].balance < 0 ? "expense" : "income"}
              empty={waterfall.length <= 2 ? noData : undefined}
            >
              <MonthWaterfall steps={waterfall} nameFor={waterfallLabel} formatCurrency={formatCurrency} />
            </ChartCard>
          </div>

          {/* ── Habits & pace ── */}
          <h2 className={styles.sectionTitle}>{t("analytics.groups.habits")}</h2>

          <div className={styles.grid}>
            <ChartCard title={t("analytics.weekday.title")} hint={t("analytics.weekday.hint")} value={busiestWeekday ?? "—"} empty={busiestWeekday ? undefined : noData}>
              <WeekdayChart totals={heat.weekdayTotals} formatCurrency={formatCurrency} locale={lang} />
            </ChartCard>

            <ChartCard
              title={t("analytics.pace.title")}
              hint={t("analytics.pace.hint")}
              // Spending more than last month is the bad direction, so the sign
              // and the colour have to agree with that, not with the arithmetic.
              value={`${paceGap >= 0 ? "+" : "−"}${formatCurrency(Math.abs(paceGap))}`}
              valueTone={paceGap > 0 ? "expense" : "income"}
              footer={
                <Legend
                  items={[
                    { color: "var(--color-expense)", label: t("analytics.pace.thisMonth") },
                    { color: "var(--color-text-secondary)", label: t("analytics.pace.lastMonth") },
                  ]}
                />
              }
            >
              <MonthPaceChart data={pace.points} formatCurrency={formatCurrency} />
            </ChartCard>

            <ChartCard
              title={t("analytics.committed.title")}
              hint={t("analytics.committed.hint")}
              value={committedHeadline}
              empty={committed.length === 0 ? noData : undefined}
              footer={
                <Legend
                  items={[
                    { color: "var(--color-goal)", label: t("analytics.committed.committed") },
                    { color: "var(--color-expense)", label: t("analytics.committed.free") },
                  ]}
                />
              }
            >
              <CommittedSplitChart rows={committed} formatCurrency={formatCurrency} monthLabel={(d) => monthFmt.format(d)} />
            </ChartCard>
          </div>

          {/* ── Flow & saving ── */}
          <h2 className={styles.sectionTitle}>{t("analytics.groups.flow")}</h2>

          <div className={styles.grid}>
            <ChartCard
              wide
              tall
              title={t("analytics.netPosition.title")}
              hint={t("analytics.netPosition.hint")}
              value={formatCurrency(netTotal)}
              valueTone={netTotal >= 0 ? "income" : "expense"}
            >
              <NetPositionChart data={netData} formatCurrency={formatCurrency} />
            </ChartCard>

            <ChartCard
              title={t("analytics.savingsRate.title")}
              hint={t("analytics.savingsRate.hint")}
              value={avgRate === undefined ? "—" : `${Math.round(avgRate)}%`}
              valueTone={avgRate !== undefined && avgRate < 0 ? "expense" : "income"}
              empty={avgRate === undefined ? noData : undefined}
            >
              <SavingsRateChart data={savingsData} average={avgRate} formatCurrency={formatCurrency} />
            </ChartCard>

            <ChartCard
              title={t("analytics.flow.title")}
              hint={t("analytics.flow.hint")}
              footer={
                <Legend
                  items={[
                    { color: "var(--color-income)", label: t("analytics.flow.income") },
                    { color: "var(--color-expense)", label: t("analytics.flow.expenses") },
                    { color: "var(--color-text-primary)", label: t("analytics.flow.net") },
                  ]}
                />
              }
            >
              <IncomeExpenseChart data={flowData} formatCurrency={formatCurrency} />
            </ChartCard>

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
            >
              {/* The card reserves its own height, so a blank one just looks
                  broken until the chart chunk lands. */}
              <Suspense fallback={<Skeleton height="100%" />}>
                <MoneyFlowSankey nodes={sankey?.nodes ?? []} links={sankey?.links ?? []} labelFor={flowLabel} formatCurrency={formatCurrency} ariaLabel={t("analytics.moneyFlow.title")} />
              </Suspense>
            </ChartCard>

            <ChartCard
              wide
              xtall
              title={t("analytics.categoryTrend.title")}
              hint={t("analytics.categoryTrend.hint")}
              value={formatCurrency(totalExpenses)}
              valueTone="expense"
              empty={trendSeries.length === 0 ? noData : undefined}
              footer={
                <div className={styles.legend}>
                  {trendSeries.map((s) => (
                    <span key={s.id} className={styles.legendItem}>
                      <span className={styles.swatch} style={{ background: s.color }} />
                      <span className="text-truncate">{s.name}</span>
                    </span>
                  ))}
                </div>
              }
            >
              <CategoryTrendChart data={trendData} series={trendSeries} formatCurrency={formatCurrency} totalLabel={t("common.total")} />
            </ChartCard>
          </div>

          {/* ── Your income ── */}
          {incomeTotal > 0 && (
            <>
              <h2 className={styles.sectionTitle}>{t("analytics.groups.income")}</h2>

              <div className={styles.grid}>
                <ChartCard
                  title={t("analytics.income.stabilityTitle")}
                  hint={incomeSpread === undefined ? t("analytics.income.stabilityHint") : t("analytics.income.spread", { percent: incomeSpread })}
                  value={formatCurrency(incomeAverage)}
                  valueTone="income"
                  footer={<Legend items={[{ color: "var(--color-text-primary)", label: t("analytics.income.average") }]} />}
                  empty={incomeMonths.length === 0 ? noData : undefined}
                >
                  <IncomeMonthsChart data={incomeMonths} average={incomeAverage} formatCurrency={formatCurrency} />
                </ChartCard>

                <ChartCard
                  auto
                  zoomable={false}
                  title={t("analytics.income.sourcesTitle")}
                  hint={t("analytics.income.sourcesHint")}
                  value={formatCurrency(incomeTotal)}
                  valueTone="income"
                  empty={incomeSources.length === 0 ? t("analytics.income.noNames") : undefined}
                >
                  <IncomeSources rows={incomeSources} total={incomeTotal} formatCurrency={formatCurrency} />
                </ChartCard>
              </div>
            </>
          )}
        </div>
      )}
    </PageShell>
  );
}
