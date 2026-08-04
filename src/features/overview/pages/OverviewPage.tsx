import { useMemo, useState, useTransition } from "react";
import { Container, Row, Col, Card, CardBody, Spinner, Progress, Alert } from "reactstrap";
import { useTranslation } from "react-i18next";
import { useTransactions } from "../../transactions/hooks/useTransactions";
import { useInvestmentGoals } from "../../budget/useInvestments";
import { useCurrencyConverter } from "../../../shared/hooks/useCurrencyConverter";
import { firestoreToDate } from "../../../shared/utils/dates";
import { calculateMetrics, filterTransactions, getDateRange, groupByMonth, groupByWeek, sumGoalSavings, sumInvestments, type CustomRange, type TimePeriod } from "../overviewUtils";
import { MetricCard } from "../components/MetricCard";
import { CashFlowChart, CashFlowLegend } from "../components/CashFlowChart";
import { CustomRangeModal } from "../components/CustomRangeModal";
import segmented from "../../../shared/css/Segmented.module.css";

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
    () => (isSingleMonth ? groupByWeek(filtered, dateRange, (n) => `${t("common.week", { defaultValue: "Week" })} ${n}`) : groupByMonth(filtered)),
    [filtered, isSingleMonth, dateRange, t],
  );

  const metrics = useMemo(() => calculateMetrics(filtered), [filtered]);
  const totalInvestments = useMemo(() => sumInvestments(filtered), [filtered]);
  const goalSavings = useMemo(() => sumGoalSavings(filtered), [filtered]);
  const moneyLeft = metrics.totalIncome - metrics.totalExpenses - totalInvestments - goalSavings;

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
      <div className="d-flex justify-content-center align-items-center" style={{ minHeight: 300 }}>
        <Spinner color="primary" />
      </div>
    );
  }

  if (txError) {
    return (
      <Container fluid className="py-4">
        <Alert color="danger" className="small">
          {t("common.failedToLoad")}
        </Alert>
      </Container>
    );
  }

  const metricCards = [
    { key: "income", label: t("overview.totalIncome"), value: metrics.totalIncome, color: "var(--color-income)" },
    { key: "expenses", label: t("overview.totalExpenses"), value: metrics.totalExpenses, color: "var(--color-expense)" },
    { key: "net", label: t("overview.netIncome"), value: metrics.netIncome, color: metrics.netIncome >= 0 ? "var(--color-income)" : "var(--color-expense)" },
    { key: "invested", label: t("overview.invested"), value: totalInvestments, color: "var(--color-invest)" },
    { key: "goals", label: t("overview.goalSavings"), value: goalSavings, color: "var(--color-goal)" },
    { key: "left", label: t("overview.moneyLeft"), value: moneyLeft, color: moneyLeft >= 0 ? "var(--color-income)" : "var(--color-expense)" },
  ];

  return (
    <Container fluid className="py-2">
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

      {/* Metric cards */}
      <Row className="g-3 mb-4" style={{ opacity: isPending ? 0.5 : 1, transition: "opacity 0.2s" }}>
        {metricCards.map((c) => (
          <Col xs={6} md={4} xl={2} key={c.key}>
            <MetricCard label={c.label} value={c.value} color={c.color} formatFn={formatCurrency} />
          </Col>
        ))}
      </Row>

      {/* Chart + goals */}
      <Row className="g-3" style={{ opacity: isPending ? 0.5 : 1, transition: "opacity 0.2s" }}>
        <Col xs={12} lg={8}>
          <Card className="h-100">
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
                <>
                  {/* Compact axis on phones, full currency labels from sm up */}
                  <div className="d-sm-none">
                    <CashFlowChart data={chartData} formatCurrency={formatCurrency} compact />
                  </div>
                  <div className="d-none d-sm-block">
                    <CashFlowChart data={chartData} formatCurrency={formatCurrency} />
                  </div>
                </>
              )}
            </CardBody>
          </Card>
        </Col>

        <Col xs={12} lg={4}>
          <Card className="h-100">
            <CardBody className="p-3 p-sm-4">
              <p className="fw-medium mb-1" style={{ fontSize: 14 }}>
                {t("overview.activeGoals")}
              </p>
              <p className="small text-body-secondary mb-3">{t("overview.goalsAtAGlance")}</p>

              {goalLoading ? (
                <div className="d-flex justify-content-center align-items-center" style={{ height: 200 }}>
                  <Spinner size="sm" color="secondary" />
                </div>
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
                        className="p-3"
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
        </Col>
      </Row>
    </Container>
  );
};
