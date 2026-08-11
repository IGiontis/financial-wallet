import { lazy, Suspense, useCallback, useMemo, useState, useTransition } from "react";
import { Alert, Container, Spinner } from "reactstrap";
import { useTranslation } from "react-i18next";

import { useCategories, useTransactions } from "../../transactions/hooks/useTransactions";
import { useCurrencyConverter } from "../../../shared/hooks/useCurrencyConverter";
import { useLocalStorage } from "../../../shared/hooks/useLocalStorage";
import { categoryLabel } from "../../../shared/utils/categories";
import {
  ANALYTICS_RANGES,
  amountHistogram,
  averageSavingsRate,
  categoryPayeeTree,
  categoryProfile,
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
import { seriesColor, weekdayNames } from "../components/chartTheme";
import NetPositionChart from "../components/NetPositionChart";
import SavingsRateChart from "../components/SavingsRateChart";
import IncomeExpenseChart from "../components/IncomeExpenseChart";
import CategoryTrendChart, { type TrendRow } from "../components/CategoryTrendChart";
import CategoryRadarChart from "../components/CategoryRadarChart";
import SpendingHeatmap from "../components/SpendingHeatmap";
import WeekdayChart from "../components/WeekdayChart";
import MonthPaceChart from "../components/MonthPaceChart";
import AmountHistogram from "../components/AmountHistogram";

// ECharts is a second, heavier engine, loaded only for the three charts recharts
// can't draw. Because ChartCard holds its children back until the card nears the
// viewport, the download happens on the scroll that needs it — never on arrival.
const MoneyFlowSankey = lazy(() => import("../components/MoneyFlowSankey"));
const CategorySunburst = lazy(() => import("../components/CategorySunburst"));

import segmented from "../../../shared/css/Segmented.module.css";
import styles from "../components/css/Analytics.module.css";

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

  const trend = useMemo(() => categoryTrend(scoped, flows), [scoped, flows]);

  const trendSeries = useMemo(
    () =>
      trend.categoryIds.map((id, i) => ({
        id,
        name: id === OTHER_CATEGORY_ID ? t("analytics.categoryTrend.other", { count: trend.otherCount }) : nameFor(id),
        color: seriesColor(i),
      })),
    [trend, nameFor, t],
  );

  const trendData = useMemo<TrendRow[]>(() => trend.rows.map((r) => ({ label: monthFmt.format(r.start), ...r.totals })), [trend, monthFmt]);

  const profile = useMemo(
    () => categoryProfile(scoped, flows).map((r) => ({ name: nameFor(r.categoryId), current: r.current, average: r.average })),
    [scoped, flows, nameFor],
  );

  const tree = useMemo(() => categoryPayeeTree(scoped), [scoped]);
  const treeTotal = useMemo(() => tree.reduce((s, b) => s + b.value, 0), [tree]);

  // ── Habits & pace ──────────────────────────────────────────────────────────

  const heat = useMemo(() => spendingHeatmap(scoped, from, now), [scoped, from, now]);

  const busiestWeekday = useMemo(() => {
    const max = Math.max(...heat.weekdayTotals);
    return max > 0 ? weekdayNames(lang)[heat.weekdayTotals.indexOf(max)] : undefined;
  }, [heat, lang]);

  // Deliberately unscoped: this card is always "this month against last month",
  // whatever window the rest of the page is showing.
  const pace = useMemo(() => monthPace(transactions, now), [transactions, now]);
  const paceGap = pace.currentTotal - pace.previousToDate;

  const histogram = useMemo(() => {
    const bins = amountHistogram(scoped);
    const total = bins.reduce((s, b) => s + b.amount, 0);
    return bins.map((b, i) => ({
      label: b.max === null ? `${b.min}+` : i === 0 ? `<${b.max}` : `${b.min}–${b.max}`,
      count: b.count,
      amount: b.amount,
      share: total > 0 ? (b.amount / total) * 100 : 0,
    }));
  }, [scoped]);
  const paymentCount = useMemo(() => histogram.reduce((s, b) => s + b.count, 0), [histogram]);

  // ── Render ─────────────────────────────────────────────────────────────────

  if (isLoading) {
    return (
      <div className="d-flex justify-content-center align-items-center" style={{ minHeight: 300 }}>
        <Spinner color="primary" />
      </div>
    );
  }

  if (isError) {
    return (
      <Container fluid className="py-4">
        <Alert color="danger" className="small">
          {t("common.failedToLoad")}
        </Alert>
      </Container>
    );
  }

  const noData = t("analytics.noData");

  return (
    <Container fluid className="py-2">
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

            <ChartCard
              wide
              tall
              title={t("analytics.moneyFlow.title")}
              hint={t("analytics.moneyFlow.hint")}
              value={sankey ? formatCurrency(sankey.total) : undefined}
              valueTone="income"
              empty={sankey ? undefined : noData}
            >
              <Suspense fallback={null}>
                <MoneyFlowSankey nodes={sankey?.nodes ?? []} links={sankey?.links ?? []} labelFor={flowLabel} formatCurrency={formatCurrency} ariaLabel={t("analytics.moneyFlow.title")} />
              </Suspense>
            </ChartCard>
          </div>

          {/* ── Where the money goes ── */}
          <h2 className={styles.sectionTitle}>{t("analytics.groups.where")}</h2>

          <div className={styles.grid}>
            <ChartCard
              wide
              tall
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

            <ChartCard
              tall
              title={t("analytics.profile.title")}
              hint={t("analytics.profile.hint")}
              empty={profile.length === 0 ? t("analytics.profile.needsTwoMonths") : undefined}
              footer={
                <Legend
                  items={[
                    { color: "var(--bs-primary)", label: t("analytics.profile.current") },
                    { color: "var(--color-text-secondary)", label: t("analytics.profile.average") },
                  ]}
                />
              }
            >
              <CategoryRadarChart data={profile} formatCurrency={formatCurrency} />
            </ChartCard>

            <ChartCard
              tall
              title={t("analytics.sunburst.title")}
              hint={t("analytics.sunburst.hint")}
              value={formatCurrency(treeTotal)}
              valueTone="expense"
              empty={tree.length === 0 ? noData : undefined}
            >
              <Suspense fallback={null}>
                <CategorySunburst branches={tree} labelFor={nameFor} otherLabel={t("analytics.sunburst.otherPayees")} formatCurrency={formatCurrency} ariaLabel={t("analytics.sunburst.title")} />
              </Suspense>
            </ChartCard>
          </div>

          {/* ── Habits & pace ── */}
          <h2 className={styles.sectionTitle}>{t("analytics.groups.habits")}</h2>

          <div className={styles.grid}>
            <ChartCard title={t("analytics.heatmap.title")} hint={t("analytics.heatmap.hint")}>
              <SpendingHeatmap heatmap={heat} formatCurrency={formatCurrency} locale={lang} />
            </ChartCard>

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
              title={t("analytics.histogram.title")}
              hint={t("analytics.histogram.hint")}
              value={String(paymentCount)}
              empty={paymentCount === 0 ? noData : undefined}
            >
              <AmountHistogram data={histogram} formatCurrency={formatCurrency} />
            </ChartCard>
          </div>
        </div>
      )}
    </Container>
  );
}
