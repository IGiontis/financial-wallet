import { lazy, Suspense, useMemo, useState, useTransition } from "react";
import { useNavigate } from "react-router-dom";
import { FiBarChart2, FiCalendar, FiCheckSquare, FiGrid, FiTrendingUp } from "react-icons/fi";
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
import CurrentBalanceCard from "../components/CurrentBalanceCard";
import { CashFlowLegend } from "../components/CashFlowLegend";
import { CustomRangeModal } from "../components/CustomRangeModal";
import GoalDetailModal from "../components/GoalDetailModal";
import segmented from "../../../shared/css/Segmented.module.css";
import styles from "./css/OverviewPage.module.css";
import { useBills } from "../../bills/useBills";
import { useDebts } from "../../debts/useDebts";
import { useSalary } from "../../../shared/hooks/useSalary";
import { useOpeningBalance } from "../../../shared/hooks/useOpeningBalance";
import { useLocalStorage } from "../../../shared/hooks/useLocalStorage";
import { currentBalance } from "../../../shared/utils/balance";
import { netWorthSeries } from "../../analytics/netWorthUtils";
import { monthTimeline } from "../../bills/monthTimeline";
import { overdueBills } from "../../bills/billsUtils";
import { nextSalaryDate } from "../../plannerPage/plannerUtils";
import BillMonthTimeline from "../../bills/BillMonthTimeline";
import { attentionItems, goalsProgress, spendingByCategory, untilPayday } from "../overviewTabs";
import { useCategories } from "../../transactions/hooks/useTransactions";
import { categoryLabel } from "../../../shared/utils/categories";
import { AttentionList, MonthInOut, Panel, PaydayVerdict, PositionPanel, SpendingPanel, TileGrid, type OverviewTile } from "../components/OverviewTabs";
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

/**
 * Four ways into the same money, one tab each: what wants doing today, whether
 * the month works, where you stand overall, and a door into every page.
 *
 * Tabs rather than one long page because each answers a different first
 * question, and a newcomer faced with all four at once is exactly the "too much
 * at once" this page was redesigned to stop. The last one chosen is remembered
 * per device, so whoever prefers "Position" lands on it.
 */
type OverviewTab = "all" | "today" | "month" | "flow" | "position";
const TABS: { id: OverviewTab; labelKey: string; icon: typeof FiGrid }[] = [
  { id: "all", labelKey: "overview.tabAll", icon: FiGrid },
  { id: "today", labelKey: "overview.tabToday", icon: FiCheckSquare },
  { id: "month", labelKey: "overview.tabMonth", icon: FiCalendar },
  // The period dashboard the page used to be: any range, its figures and the cash-flow chart.
  { id: "flow", labelKey: "overview.tabFlow", icon: FiBarChart2 },
  { id: "position", labelKey: "overview.tabPosition", icon: FiTrendingUp },
];
// A first visit opens on everything at a glance; after that, on the last tab chosen.
const asTab = (value: unknown): OverviewTab => (TABS.some((tab) => tab.id === value) ? (value as OverviewTab) : "all");

export const OverviewPage = () => {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const locale = i18n.resolvedLanguage ?? "en";
  // One clock reading for the visit, so nothing memoised on it recomputes each render.
  const [now] = useState(() => new Date());
  const [storedTab, setTab] = useLocalStorage<OverviewTab>("overview-tab", "all");
  const tab = asTab(storedTab);

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
  const { data: bills = [] } = useBills();
  const { data: debts = [] } = useDebts();
  const { opening } = useOpeningBalance();
  const { salary } = useSalary(now);

  const balance = useMemo(() => currentBalance(transactions, opening), [transactions, opening]);

  // ── Today ──
  const attention = useMemo(() => attentionItems(bills, debts, now), [bills, debts, now]);
  const monthTransactions = useMemo(() => filterTransactions(transactions, getDateRange("current_month", appliedRange, now)), [transactions, appliedRange, now]);
  const thisMonth = useMemo(() => calculateMetrics(monthTransactions), [monthTransactions]);
  const investedThisMonth = useMemo(() => sumInvestments(monthTransactions), [monthTransactions]);

  // ── Where it went ── named the way every other screen names a category.
  const { data: categories = [] } = useCategories();
  const spending = useMemo(() => {
    const { total, parts } = spendingByCategory(monthTransactions);
    return {
      total,
      parts: parts.map((part) => {
        const category = part.categoryId ? categories.find((c) => c.id === part.categoryId) : undefined;
        return { label: part.categoryId ? `${category?.icon ?? ""} ${categoryLabel(category?.name, t) || "—"}`.trim() : t("overview.everythingElse"), amount: part.amount };
      }),
    };
  }, [monthTransactions, categories, t]);

  // ── The month ──
  // Pay day as the planner and the bills timeline know it; without one, the
  // month's last day stands in and the verdict says so.
  const payday = useMemo(() => (salary ? nextSalaryDate(salary.dayOfMonth, now) : new Date(now.getFullYear(), now.getMonth() + 1, 0)), [salary, now]);
  const beforePayday = useMemo(() => untilPayday(balance, bills, payday), [balance, bills, payday]);
  const timeline = useMemo(
    () => monthTimeline(bills, now, salary ? { amount: salary.amount, dayOfMonth: salary.dayOfMonth, label: t("bills.timelineIncome") } : undefined),
    [bills, now, salary, t],
  );

  // ── Position ── the same series Analytics draws, over the last six months.
  const position = useMemo(() => netWorthSeries(transactions, debts, opening, new Date(now.getFullYear(), now.getMonth() - 5, 1), now), [transactions, debts, opening, now]);

  // ── Everything ──
  const late = useMemo(() => overdueBills(bills, now), [bills, now]);
  const lastPosition = position[position.length - 1];

  const minYear = useMemo(() => {
    const fallback = now.getFullYear() - 3;
    if (!transactions.length) return fallback;
    return Math.min(fallback, ...transactions.map((tx) => firestoreToDate(tx.date).getFullYear()));
  }, [transactions, now]);

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

  const goalsGlance = (
        <Card className="mb-0">
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
  );

  const goalProgress = goalsProgress(goals);

  const tiles: OverviewTile[] = [
    late.bills.length > 0
      ? { to: "/bills", label: t("nav.bills"), value: t("overview.tileLate", { count: late.bills.length }), sub: formatCurrency(late.total), tone: "var(--color-expense-text)" }
      : { to: "/bills", label: t("nav.bills"), value: t("overview.allClearShort"), sub: t("overview.tileNothingLate"), tone: "var(--color-income-text)" },
    { to: "/planner", label: t("nav.planner"), value: formatCurrency(beforePayday.left), sub: t(salary ? "overview.tilePayday" : "overview.tileMonthEnd"), tone: beforePayday.left >= 0 ? undefined : "var(--color-expense-text)" },
    { to: "/transactions", label: t("nav.transactions"), value: formatCurrency(thisMonth.totalExpenses), sub: t("overview.soFarThisMonth") },
    { to: "/debts", label: t("nav.debts"), value: formatCurrency(lastPosition?.owedByMe ?? 0), sub: t("overview.tileOwed"), tone: (lastPosition?.owedByMe ?? 0) > 0 ? "var(--color-expense-text)" : undefined },
    goalProgress.target > 0
      ? { to: "/goals", label: t("nav.goals"), value: `${goalProgress.percent}%`, sub: t("overview.tileGoalsOf", { saved: formatCurrency(goalProgress.saved), target: formatCurrency(goalProgress.target) }), tone: "var(--color-goal)" }
      : { to: "/goals", label: t("nav.goals"), value: formatCurrency(lastPosition?.saved ?? 0), sub: t("overview.tileSaved"), tone: "var(--color-invest)" },
    { to: "/analytics", label: t("nav.analytics"), value: formatCurrency(lastPosition?.net ?? balance), sub: t("overview.netPosition") },
    { to: "/allocation", label: t("nav.allocation"), value: formatCurrency(thisMonth.totalIncome), sub: t("overview.tileToAllocate") },
    { to: "/investments", label: t("nav.investments"), value: `${investedThisMonth >= 0 ? "+" : "−"}${formatCurrency(Math.abs(investedThisMonth))}`, sub: t("overview.tileInvestedMonth"), tone: "var(--color-invest)" },
  ];

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
      <div className="mb-3">
        <h1 className="h5 fw-semibold text-body-emphasis mb-0">{t("overview.title")}</h1>
        <p className="small text-body-secondary mb-0">{t("overview.subtitle")}</p>
      </div>

      {/* The one figure every tab starts from, above them all. */}
      <CurrentBalanceCard transactions={transactions} formatCurrency={formatCurrency} className="mb-3" />

      {/* Labelled and full width, so on a phone each is a real target. */}
      <div className={`${segmented.group} ${segmented.even} ${styles.tabBar} mb-3`} role="tablist" aria-label={t("overview.title")}>
        {TABS.map(({ id, labelKey, icon: Icon }) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={tab === id}
            className={`${segmented.item} ${tab === id ? segmented.active : ""} ${styles.tabButton}`}
            onClick={() => setTab(id)}
          >
            <Icon size={15} aria-hidden />
            <span>{t(labelKey)}</span>
          </button>
        ))}
      </div>

      {tab === "today" && (
        <div className={styles.stack} role="tabpanel">
          <AttentionList items={attention} formatCurrency={formatCurrency} />
          <MonthInOut
            income={thisMonth.totalIncome}
            expenses={thisMonth.totalExpenses}
            formatCurrency={formatCurrency}
            sub={salary ? t("overview.paydayOn", { date: new Intl.DateTimeFormat(locale, { day: "numeric", month: "short" }).format(payday) }) : undefined}
          />
          <SpendingPanel parts={spending.parts} total={spending.total} formatCurrency={formatCurrency} />
          {goalsGlance}
        </div>
      )}

      {tab === "position" && (
        <div className={styles.stack} role="tabpanel">
          <PositionPanel series={position} formatCurrency={formatCurrency} locale={locale} />
          <MonthInOut income={thisMonth.totalIncome} expenses={thisMonth.totalExpenses} formatCurrency={formatCurrency} />
          <SpendingPanel parts={spending.parts} total={spending.total} formatCurrency={formatCurrency} />
        </div>
      )}

      {tab === "all" && (
        <div className={styles.allStack} role="tabpanel">
          {attention.length > 0 && <AttentionList items={attention} formatCurrency={formatCurrency} />}
          <TileGrid tiles={tiles} />
          <SpendingPanel parts={spending.parts} total={spending.total} formatCurrency={formatCurrency} />
        </div>
      )}

      {tab === "month" && (
      <div className={styles.stack} role="tabpanel">
        <PaydayVerdict left={beforePayday.left} owed={beforePayday.owed} count={beforePayday.count} payday={payday} known={!!salary} formatCurrency={formatCurrency} locale={locale} />
        <MonthInOut income={thisMonth.totalIncome} expenses={thisMonth.totalExpenses} formatCurrency={formatCurrency} />
        <SpendingPanel parts={spending.parts} total={spending.total} formatCurrency={formatCurrency} />

        {/* The month in order, last: the figures above answer "how is it
            going", this is the detail for whoever wants the dates. */}
        {bills.length > 0 && (
          <Panel>
            <BillMonthTimeline timeline={timeline} now={now} formatCurrency={formatCurrency} locale={locale} onOpenBill={() => navigate("/bills")} />
          </Panel>
        )}
      </div>
      )}

      {tab === "flow" && (
      <div role="tabpanel">
      <div className="d-flex justify-content-end mb-3">
        <div className={`${segmented.group} ${styles.periodPicker}`}>
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

      </div>
      </div>
      )}
    </PageShell>
  );
};
