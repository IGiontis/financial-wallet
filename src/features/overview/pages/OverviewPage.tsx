import { lazy, Suspense, useMemo, useState, useTransition } from "react";
import { Row, Col, Card, CardBody, Progress, Alert } from "reactstrap";
import { useTranslation } from "react-i18next";
import { Skeleton, SkeletonCard, SkeletonChartCard, SkeletonHeading, SkeletonPageHeader, SkeletonRows, SkeletonStats } from "../../../shared/components/Skeletons";
import { useTransactions } from "../../transactions/hooks/useTransactions";
import { useInvestmentGoals } from "../../budget/useInvestments";
import { useCurrencyConverter } from "../../../shared/hooks/useCurrencyConverter";
import { firestoreToDate } from "../../../shared/utils/dates";
import type { InvestmentGoalWithStats } from "../../../shared/types/IndexTypes";
import {
  calculateMetrics,
  calculateMoneyLeft,
  filterTransactions,
  getDateRange,
  groupByMonth,
  groupByWeek,
  sumGoalSavings,
  sumInvestments,
  type CustomRange,
  type TimePeriod,
} from "../overviewUtils";
import { Sparkline } from "../components/Sparkline";
import CurrentBalanceCard from "../components/CurrentBalanceCard";
import { CashFlowLegend } from "../components/CashFlowLegend";
import { CustomRangeModal } from "../components/CustomRangeModal";
import GoalDetailModal from "../components/GoalDetailModal";
import segmented from "../../../shared/css/Segmented.module.css";
import styles from "./css/OverviewPage.module.css";
import { PageShell } from "../../../shared/components/PageShell";

// recharts is by far the heaviest thing on this page. Loading it separately lets
// the metric cards and goal list paint first instead of waiting on the chart.
const CashFlowChart = lazy(() => import("../components/CashFlowChart"));

/** Same height as the chart, so nothing jumps when it finishes loading. */
function ChartSkeleton() {
  return <Skeleton height={280} style={{ borderRadius: "var(--border-radius-md)" }} />;
}

const PERIODS: { value: TimePeriod; labelKey: string }[] = [
  { value: "current_month", labelKey: "overview.periods.currentMonth" },
  { value: "last_3_months", labelKey: "overview.periods.last3Months" },
  { value: "last_6_months", labelKey: "overview.periods.last6Months" },
  { value: "year_to_date", labelKey: "overview.periods.yearToDate" },
  { value: "this_year", labelKey: "overview.periods.thisYear" },
  { value: "custom", labelKey: "overview.periods.custom" },
];

export const OverviewPage = () => {
  const { t, i18n } = useTranslation();
  const now = new Date();

  const [selectedPeriod, setSelectedPeriod] = useState<TimePeriod>("current_month");
  const [isPending, startTransition] = useTransition();
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedGoal, setSelectedGoal] = useState<InvestmentGoalWithStats | null>(null);
  const [appliedRange, setAppliedRange] = useState<CustomRange>({
    fromMonth: now.getMonth(),
    fromYear: now.getFullYear(),
    toMonth: now.getMonth(),
    toYear: now.getFullYear(),
  });

  const { data: transactions = [], isLoading: txLoading, isError: txError } = useTransactions();
  const { data: goals = [], isLoading: goalLoading } = useInvestmentGoals();
  const { format: formatCurrency } = useCurrencyConverter();

  const minYear = useMemo(() => {
    const fallback = now.getFullYear() - 3;
    if (!transactions.length) return fallback;
    return Math.min(fallback, ...transactions.map((tx) => firestoreToDate(tx.date).getFullYear()));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [transactions]);

  const dateRange = useMemo(() => getDateRange(selectedPeriod, appliedRange), [selectedPeriod, appliedRange]);
  const filtered = useMemo(() => filterTransactions(transactions, dateRange), [transactions, dateRange]);

  const isSingleMonth =
    selectedPeriod === "current_month" || (selectedPeriod === "custom" && appliedRange.fromMonth === appliedRange.toMonth && appliedRange.fromYear === appliedRange.toYear);

  const chartData = useMemo(
    () =>
      isSingleMonth
        ? groupByWeek(filtered, dateRange, (n) => `${t("common.week", { defaultValue: "Week" })} ${n}`)
        : groupByMonth(filtered, (d) => new Intl.DateTimeFormat(i18n.resolvedLanguage ?? "en", { month: "short", year: "2-digit" }).format(d)),
    [filtered, isSingleMonth, dateRange, t, i18n.resolvedLanguage],
  );

  // What the period added up to as it went. The figure above it is today's
  // balance and ignores the period entirely — this is the shape of the period
  // itself, which is a different claim and is labelled as one.
  const runningNet = useMemo(() => {
    let total = 0;
    return chartData.map((point) => {
      total += point.income - point.expenses;
      return Math.round(total * 100) / 100;
    });
  }, [chartData]);

  const metrics = useMemo(() => calculateMetrics(filtered), [filtered]);
  // Net flows — negative when more was withdrawn than deposited, so totals
  // across months show how much is actually tied up.
  const totalInvestments = useMemo(() => sumInvestments(filtered), [filtered]);
  const goalSavings = useMemo(() => sumGoalSavings(filtered), [filtered]);
  const moneyLeft = useMemo(() => calculateMoneyLeft(filtered), [filtered]);

  const activeGoals = useMemo(
    () =>
      goals
        .filter((g) => !g.isCompleted && g.isActive)
        .sort((a, b) => {
          if (!a.deadline && !b.deadline) return 0;
          if (!a.deadline) return 1;
          if (!b.deadline) return -1;
          return firestoreToDate(a.deadline).getTime() - firestoreToDate(b.deadline).getTime();
        })
        .slice(0, 6),
    [goals],
  );

  // Keep an open detail modal in sync if the goal's stats change underneath it
  // (e.g. a deposit logged from another tab) instead of freezing a stale snapshot.
  const liveSelectedGoal = selectedGoal ? (goals.find((g) => g.id === selectedGoal.id) ?? null) : null;

  const customLabel = useMemo(() => {
    if (selectedPeriod !== "custom") return t("overview.periods.custom");
    const fmt = new Intl.DateTimeFormat(i18n.resolvedLanguage ?? "en", { month: "short", year: "numeric" });
    const from = fmt.format(new Date(appliedRange.fromYear, appliedRange.fromMonth, 1));
    const to = fmt.format(new Date(appliedRange.toYear, appliedRange.toMonth, 1));
    return from === to ? from : `${from} – ${to}`;
  }, [selectedPeriod, appliedRange, i18n.resolvedLanguage, t]);

  const handlePeriodChange = (period: TimePeriod) => {
    if (period === "custom") {
      setModalOpen(true);
      return;
    }
    startTransition(() => setSelectedPeriod(period));
  };

  if (txLoading) {
    return (
      <PageShell>
        <SkeletonPageHeader />
        <SkeletonStats />
        <Row className="g-3">
          <Col xs={12} lg={8}>
            <SkeletonChartCard height={260} />
          </Col>
          <Col xs={12} lg={4}>
            <SkeletonCard>
              <SkeletonHeading />
              <SkeletonRows count={4} />
            </SkeletonCard>
          </Col>
        </Row>
      </PageShell>
    );
  }

  if (txError) {
    return (
      <PageShell>
        <Alert color="danger" className="small">
          {t("common.failedToLoad")}
        </Alert>
      </PageShell>
    );
  }


  return (
    <PageShell>
      <CustomRangeModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        onApply={(range) => {
          setAppliedRange(range);
          startTransition(() => setSelectedPeriod("custom"));
        }}
        initialRange={appliedRange}
        minYear={minYear}
      />

      {liveSelectedGoal && <GoalDetailModal goal={liveSelectedGoal} formatCurrency={formatCurrency} onClose={() => setSelectedGoal(null)} />}

      {/* Header */}
      <div className="d-flex justify-content-between align-items-start mb-4 flex-wrap gap-3">
        <div>
          <h1 className="h5 fw-semibold text-body-emphasis mb-0">{t("overview.title")}</h1>
          <p className="small text-body-secondary mb-0">{t("overview.subtitle")}</p>
        </div>

        <div className={segmented.group}>
          {PERIODS.map((p) => (
            <button
              key={p.value}
              type="button"
              onClick={() => handlePeriodChange(p.value)}
              disabled={isPending}
              className={`${segmented.item} ${selectedPeriod === p.value ? segmented.active : ""}`}
            >
              {p.value === "custom" ? customLabel : t(p.labelKey)}
            </button>
          ))}
        </div>
      </div>

      {/* ── The month, as unequal tiles ──
          Six identical cards gave the balance, the month's income and the money
          left over the same weight, so the page stressed nothing. The figure
          that answers "am I all right" now takes four times the area of the
          ones that qualify it, and the rest fall in behind it. */}
      <div className={styles.bento} style={{ opacity: isPending ? 0.5 : 1, transition: "opacity 0.2s" }}>
        <CurrentBalanceCard
          transactions={transactions}
          formatCurrency={formatCurrency}
          className={`${styles.balance} mb-0`}
          bodyClassName={styles.balanceBody}
          figureClassName={styles.figure}
        >
          {runningNet.length > 1 && (
            <Sparkline
              className={styles.spark}
              values={runningNet}
              tone={runningNet[runningNet.length - 1] >= 0 ? "var(--color-income)" : "var(--color-expense)"}
              label={t("overview.runningNet")}
            />
          )}
        </CurrentBalanceCard>

        <Card className="mb-0">
          <CardBody className={styles.stat}>
            <span className={styles.statLabel}>{t("overview.totalIncome")}</span>
            <span className={styles.statValue} style={{ color: "var(--color-income)" }}>
              {formatCurrency(metrics.totalIncome)}
            </span>
          </CardBody>
        </Card>

        <Card className="mb-0">
          <CardBody className={styles.stat}>
            <span className={styles.statLabel}>{t("overview.totalExpenses")}</span>
            <span className={styles.statValue} style={{ color: "var(--color-expense)" }}>
              {formatCurrency(metrics.totalExpenses)}
            </span>
          </CardBody>
        </Card>

        <Card className={`${styles.wide} mb-0`}>
          <CardBody className={styles.stat}>
            <span className={styles.statLabel}>{t("overview.netIncome")}</span>
            <span className={styles.statValue} style={{ color: metrics.netIncome >= 0 ? "var(--color-income)" : "var(--color-expense)" }}>
              {formatCurrency(metrics.netIncome)}
            </span>
            {/* The same two figures again as one rule: "net" is a subtraction,
                and a subtraction is easier to believe when you can see it. */}
            {metrics.totalIncome + metrics.totalExpenses > 0 && (
              <span className={styles.split} aria-hidden>
                <span style={{ width: `${(metrics.totalExpenses / (metrics.totalIncome + metrics.totalExpenses)) * 100}%`, background: "var(--color-expense)" }} />
                <span style={{ width: `${(metrics.totalIncome / (metrics.totalIncome + metrics.totalExpenses)) * 100}%`, background: "var(--color-income)" }} />
              </span>
            )}
          </CardBody>
        </Card>

        <Card className="mb-0">
          <CardBody className={styles.stat}>
            <span className={styles.statLabel}>{t("overview.invested")}</span>
            <span className={styles.statValue} style={{ color: "var(--color-invest)" }}>
              {formatCurrency(totalInvestments)}
            </span>
          </CardBody>
        </Card>

        <Card className="mb-0">
          <CardBody className={styles.stat}>
            <span className={styles.statLabel}>{t("overview.goalSavings")}</span>
            <span className={styles.statValue} style={{ color: "var(--color-goal)" }}>
              {formatCurrency(goalSavings)}
            </span>
          </CardBody>
        </Card>

        <Card className={`${styles.wide} mb-0`}>
          <CardBody className={styles.stat}>
            <span className={styles.statLabel}>{t("overview.moneyLeft")}</span>
            <span className={styles.statValue} style={{ color: moneyLeft >= 0 ? "var(--color-income)" : "var(--color-expense)" }}>
              {formatCurrency(moneyLeft)}
            </span>
          </CardBody>
        </Card>

        <Card className={`${styles.full} mb-0`}>
            <CardBody className="p-3 p-sm-4">
              <div className="d-flex justify-content-between align-items-center mb-3 flex-wrap gap-2">
                <div>
                  <p className="fw-medium mb-0" style={{ fontSize: 14 }}>
                    {t("overview.cashFlow")}
                  </p>
                  <p className="small text-body-secondary mb-0">{isSingleMonth ? t("overview.weeklyBreakdown") : t("overview.monthlyBreakdown")}</p>
                </div>
                <CashFlowLegend />
              </div>

              {chartData.length === 0 ? (
                <div className="d-flex align-items-center justify-content-center text-body-secondary" style={{ height: 280, fontSize: 14 }}>
                  {t("overview.noTransactionsPeriod")}
                </div>
              ) : (
                <Suspense fallback={<ChartSkeleton />}>
                  {/* Compact axis on phones, full currency labels from sm up */}
                  <div className="d-sm-none">
                    <CashFlowChart data={chartData} formatCurrency={formatCurrency} compact />
                  </div>
                  <div className="d-none d-sm-block">
                    <CashFlowChart data={chartData} formatCurrency={formatCurrency} />
                  </div>
                </Suspense>
              )}
            </CardBody>
          </Card>

        <Card className={`${styles.full} mb-0`}>
            <CardBody className="p-3 p-sm-4">
              <p className="fw-medium mb-1" style={{ fontSize: 14 }}>
                {t("overview.activeGoals")}
              </p>
              <p className="small text-body-secondary mb-3">{t("overview.goalsAtAGlance")}</p>

              {goalLoading ? (
                <SkeletonRows count={3} icon={false} />
              ) : activeGoals.length === 0 ? (
                <div className="d-flex flex-column align-items-center justify-content-center text-center text-body-secondary" style={{ height: 200, fontSize: 13 }}>
                  <span>{t("overview.noGoalsYet")}</span>
                  <span>{t("overview.createOneIn")}</span>
                </div>
              ) : (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: 10 }}>
                  {activeGoals.map((goal) => {
                    const isTargeted = goal.goalType === "targeted";
                    const pct = Math.min(goal.percentageReached ?? 0, 100);
                    const progressColor = goal.status === "behind" ? "danger" : goal.status === "ahead" ? "info" : "primary";
                    return (
                      <div
                        key={goal.id}
                        className={`p-3 ${styles.goalCard}`}
                        role="button"
                        tabIndex={0}
                        onClick={() => setSelectedGoal(goal)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            setSelectedGoal(goal);
                          }
                        }}
                        style={{
                          background: "var(--color-background-secondary)",
                          borderRadius: "var(--border-radius-md)",
                          borderLeft: `3px solid ${goal.color ?? "var(--bs-primary)"}`,
                          minWidth: 0,
                        }}
                      >
                        <div className="d-flex align-items-center gap-2 mb-2" style={{ minWidth: 0 }}>
                          <span className="flex-shrink-0" style={{ fontSize: 16 }}>
                            {goal.icon ?? "💰"}
                          </span>
                          <p className="fw-medium text-truncate text-body-emphasis mb-0" style={{ fontSize: 13, minWidth: 0 }}>
                            {goal.name}
                          </p>
                        </div>

                        {isTargeted && goal.targetAmount ? (
                          <>
                            <Progress value={pct} color={progressColor} style={{ height: 4, borderRadius: 2, marginBottom: 5 }} />
                            <div className="d-flex justify-content-between text-body-secondary" style={{ fontSize: 11 }}>
                              <span>{formatCurrency(goal.totalSaved)}</span>
                              <span className="fw-medium">{pct.toFixed(0)}%</span>
                            </div>
                          </>
                        ) : (
                          <p className="fw-medium text-body-emphasis mb-0" style={{ fontSize: 14 }}>
                            {formatCurrency(goal.totalSaved)}
                          </p>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </CardBody>
        </Card>
      </div>
    </PageShell>
  );
};
