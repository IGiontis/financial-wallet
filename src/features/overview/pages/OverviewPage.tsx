import React, { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useCountUp } from "react-countup";
import { Container, Row, Col, Card, CardBody, Spinner, Progress } from "reactstrap";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { startOfMonth, subMonths, startOfYear, format, isWithinInterval } from "date-fns";
import type { Transaction } from "../../../shared/types/IndexTypes";
import { useTransactions } from "../../transactions/hooks/useTransactions";
import { useInvestmentGoals } from "../../budget/useInvestments";
import { useCurrencyConverter } from "../../../shared/hooks/useCurrencyConverter";

// ============================================================================
// TYPES
// ============================================================================

type TimePeriod = "current_month" | "last_3_months" | "last_6_months" | "year_to_date" | "last_12_months";

interface ChartDataPoint {
  month: string;
  income: number;
  expenses: number;
}

interface DashboardMetrics {
  totalIncome: number;
  totalExpenses: number;
  netIncome: number;
  savingsRate: number;
}

// ============================================================================
// HELPERS
// ============================================================================

function firestoreToDate(value: any): Date {
  if (!value) return new Date();
  if (value instanceof Date) return value;
  if (value?.seconds) return new Date(value.seconds * 1000);
  return new Date(value);
}

const getDateRange = (period: TimePeriod): { start: Date; end: Date } => {
  const now = new Date();
  let start: Date;
  switch (period) {
    case "current_month":  start = startOfMonth(now);               break;
    case "last_3_months":  start = startOfMonth(subMonths(now, 2)); break;
    case "last_6_months":  start = startOfMonth(subMonths(now, 5)); break;
    case "year_to_date":   start = startOfYear(now);                break;
    case "last_12_months": start = startOfMonth(subMonths(now, 11));break;
    default:               start = startOfMonth(now);
  }
  return { start, end: now };
};

const filterTransactions = (transactions: Transaction[], range: { start: Date; end: Date }) =>
  transactions.filter((tx) =>
    isWithinInterval(firestoreToDate(tx.date), { start: range.start, end: range.end })
  );

const groupByMonth = (transactions: Transaction[]): ChartDataPoint[] => {
  const map = new Map<string, { income: number; expenses: number; firstDay: Date }>();
  transactions.forEach((tx) => {
    const firstDay = startOfMonth(firestoreToDate(tx.date));
    const key      = format(firstDay, "yyyy-MM");
    if (!map.has(key)) map.set(key, { income: 0, expenses: 0, firstDay });
    const d = map.get(key)!;
    if (tx.type === "income") d.income   += tx.amount;
    else                      d.expenses += Math.abs(tx.amount);
  });
  return Array.from(map.values())
    .sort((a, b) => a.firstDay.getTime() - b.firstDay.getTime())
    .map((d) => ({
      month:    format(d.firstDay, "MMM yy"),
      income:   Math.round(d.income),
      expenses: Math.round(d.expenses),
    }));
};

const calculateMetrics = (transactions: Transaction[]): DashboardMetrics => {
  const totalIncome   = transactions.filter((t) => t.type === "income") .reduce((s, t) => s + t.amount, 0);
  const totalExpenses = transactions.filter((t) => t.type === "expense").reduce((s, t) => s + Math.abs(t.amount), 0);
  const netIncome     = totalIncome - totalExpenses;
  const savingsRate   = totalIncome > 0 ? (netIncome / totalIncome) * 100 : 0;
  return { totalIncome, totalExpenses, netIncome, savingsRate };
};

// ============================================================================
// CUSTOM TOOLTIP — needs formatCurrency so it's now a factory function
// ============================================================================

function makeTooltip(formatCurrency: (n: number) => string) {
  return function CustomTooltip({ active, payload, label }: any) {
    if (!active || !payload?.length) return null;
    const income   = payload.find((p: any) => p.dataKey === "income")?.value   ?? 0;
    const expenses = payload.find((p: any) => p.dataKey === "expenses")?.value ?? 0;
    const net      = income - expenses;
    return (
      <div style={{ background: "var(--color-background-primary)", border: "0.5px solid var(--color-border-tertiary)", borderRadius: 10, padding: "12px 14px", minWidth: 170, boxShadow: "0 4px 16px rgba(0,0,0,0.08)" }}>
        <p style={{ fontSize: 11, fontWeight: 500, color: "var(--color-text-secondary)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8 }}>{label}</p>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
          <span style={{ fontSize: 13, color: "var(--color-text-secondary)", display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#10B981", display: "inline-block" }} />Income
          </span>
          <span style={{ fontSize: 13, fontWeight: 600, color: "#10B981" }}>{formatCurrency(income)}</span>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
          <span style={{ fontSize: 13, color: "var(--color-text-secondary)", display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#EF4444", display: "inline-block" }} />Expenses
          </span>
          <span style={{ fontSize: 13, fontWeight: 600, color: "#EF4444" }}>{formatCurrency(expenses)}</span>
        </div>
        <div style={{ borderTop: "0.5px solid var(--color-border-tertiary)", paddingTop: 8, display: "flex", justifyContent: "space-between" }}>
          <span style={{ fontSize: 13, color: "var(--color-text-secondary)" }}>Net</span>
          <span style={{ fontSize: 13, fontWeight: 700, color: net >= 0 ? "#10B981" : "#EF4444" }}>{formatCurrency(net)}</span>
        </div>
      </div>
    );
  };
}

// ============================================================================
// METRIC CARD
// ============================================================================

function MetricCard({ label, value, color, isPercentage = false, formatFn }: {
  label: string; value: number; color: string; isPercentage?: boolean;
  formatFn?: (n: number) => string;
}) {
  const spanRef = useRef<HTMLSpanElement>(null) as React.RefObject<HTMLElement>;
  const { update } = useCountUp({
    ref: spanRef, end: value, duration: 1.5,
    decimals: isPercentage ? 1 : 0, separator: ",",
    prefix: isPercentage ? "" : "",
    suffix: isPercentage ? "%" : "",
  });

  useEffect(() => { update(value); }, [value, update]);

  // For currency cards, show formatted value directly since countUp doesn't know the currency symbol
  const displayValue = !isPercentage && formatFn ? formatFn(value) : undefined;

  return (
    <div style={{ background: "var(--color-background-secondary)", borderRadius: "var(--border-radius-md)", padding: "1rem" }}>
      <p style={{ fontSize: 12, color: "var(--color-text-secondary)", fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>{label}</p>
      {displayValue
        ? <p style={{ fontSize: 22, fontWeight: 500, color, margin: 0 }}>{displayValue}</p>
        : <span ref={spanRef} style={{ fontSize: 22, fontWeight: 500, color }} />
      }
    </div>
  );
}

// ============================================================================
// PERIOD TABS
// ============================================================================

const PERIODS: { value: TimePeriod; label: string }[] = [
  { value: "current_month",  label: "This month"   },
  { value: "last_3_months",  label: "3 months"     },
  { value: "last_6_months",  label: "6 months"     },
  { value: "year_to_date",   label: "Year to date" },
  { value: "last_12_months", label: "12 months"    },
];

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export const OverviewPage: React.FC = () => {
  const [selectedPeriod, setSelectedPeriod] = useState<TimePeriod>("last_6_months");
  const [isPending, startTransition]        = useTransition();

  const { data: transactions = [], isLoading: txLoading,  isError: txError  } = useTransactions();
  const { data: goals        = [], isLoading: goalLoading                     } = useInvestmentGoals();
  const { format: formatCurrency } = useCurrencyConverter();

  // Tooltip component created once per render with current formatCurrency
  const CustomTooltip = useMemo(() => makeTooltip(formatCurrency), [formatCurrency]);

  const handlePeriodChange = (period: TimePeriod) => {
    startTransition(() => setSelectedPeriod(period));
  };

  const dateRange   = useMemo(() => getDateRange(selectedPeriod),                [selectedPeriod]);
  const filtered    = useMemo(() => filterTransactions(transactions, dateRange),  [transactions, dateRange]);
  const chartData   = useMemo(() => groupByMonth(filtered),                       [filtered]);
  const metrics     = useMemo(() => calculateMetrics(filtered),                   [filtered]);
  const activeGoals = useMemo(() => goals.filter((g) => !g.isCompleted).slice(0, 4), [goals]);

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
        <p style={{ color: "var(--bs-danger)", fontSize: 14 }}>Failed to load overview. Please refresh.</p>
      </Container>
    );
  }

  return (
    <Container fluid className="py-2">
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="d-flex justify-content-between align-items-start mb-4 flex-wrap gap-3">
        <div>
          <h5 style={{ fontWeight: 600, margin: 0, color: "var(--color-text-primary)" }}>Financial Overview</h5>
          <p style={{ fontSize: 13, color: "var(--color-text-secondary)", margin: 0 }}>
            Track your income, expenses and savings goals
          </p>
        </div>

        <div style={{ display: "flex", gap: 4, background: "var(--color-background-secondary)", borderRadius: 10, padding: 4 }}>
          {PERIODS.map((p) => (
            <button
              key={p.value}
              onClick={() => handlePeriodChange(p.value)}
              disabled={isPending}
              style={{
                background: selectedPeriod === p.value ? "var(--color-background-primary)" : "transparent",
                border: "none", borderRadius: 7, padding: "6px 12px", fontSize: 12,
                fontWeight: selectedPeriod === p.value ? 600 : 400,
                color: selectedPeriod === p.value ? "var(--color-text-primary)" : "var(--color-text-secondary)",
                cursor: "pointer",
                boxShadow: selectedPeriod === p.value ? "0 1px 4px rgba(0,0,0,0.08)" : "none",
                transition: "all 0.15s ease", whiteSpace: "nowrap",
              }}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Metric cards ───────────────────────────────────────────────────── */}
      <Row className="g-3 mb-4" style={{ opacity: isPending ? 0.5 : 1, transition: "opacity 0.2s" }}>
        <Col xs={6} lg={3}>
          <MetricCard label="Total income"   value={metrics.totalIncome}   color="#10B981" formatFn={formatCurrency} />
        </Col>
        <Col xs={6} lg={3}>
          <MetricCard label="Total expenses" value={metrics.totalExpenses} color="#EF4444" formatFn={formatCurrency} />
        </Col>
        <Col xs={6} lg={3}>
          <MetricCard label="Net income" value={metrics.netIncome}
            color={metrics.netIncome >= 0 ? "#10B981" : "#EF4444"} formatFn={formatCurrency} />
        </Col>
        <Col xs={6} lg={3}>
          <MetricCard label="Savings rate" value={metrics.savingsRate} color="#3B82F6" isPercentage />
        </Col>
      </Row>

      {/* ── Chart + Goals ──────────────────────────────────────────────────── */}
      <Row className="g-3" style={{ opacity: isPending ? 0.5 : 1, transition: "opacity 0.2s" }}>
        <Col xs={12} lg={8}>
          <Card style={{ border: "0.5px solid var(--color-border-tertiary)", borderRadius: "var(--border-radius-lg)", boxShadow: "none", height: "100%" }}>
            <CardBody style={{ padding: "1.25rem" }}>
              <div className="d-flex justify-content-between align-items-center mb-3">
                <div>
                  <p style={{ fontWeight: 500, fontSize: 14, margin: 0 }}>Cash flow</p>
                  <p style={{ fontSize: 12, color: "var(--color-text-secondary)", margin: 0 }}>Income vs expenses</p>
                </div>
                <div className="d-flex gap-3">
                  {[{ color: "#10B981", label: "Income" }, { color: "#EF4444", label: "Expenses" }].map((l) => (
                    <span key={l.label} style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 12, color: "var(--color-text-secondary)" }}>
                      <span style={{ width: 16, height: 2, background: l.color, display: "inline-block", borderRadius: 1 }} />
                      {l.label}
                    </span>
                  ))}
                </div>
              </div>

              {chartData.length === 0 ? (
                <div style={{ height: 280, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--color-text-secondary)", fontSize: 14 }}>
                  No transactions found for this period.
                </div>
              ) : (
                <ResponsiveContainer width="100%" height={280} debounce={200}>
                  <LineChart data={chartData} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border-tertiary)" vertical={false} />
                    <XAxis dataKey="month" tick={{ fontSize: 11, fill: "var(--color-text-secondary)" }} axisLine={false} tickLine={false} dy={6} />
                    <YAxis
                      tickFormatter={(v) => formatCurrency(v)}
                      tick={{ fontSize: 11, fill: "var(--color-text-secondary)" }}
                      axisLine={false} tickLine={false} width={56}
                    />
                    <Tooltip content={<CustomTooltip />} cursor={{ stroke: "var(--color-border-secondary)", strokeWidth: 1 }} />
                    <Line type="monotone" dataKey="income"   stroke="#10B981" strokeWidth={2} dot={false} activeDot={{ r: 4, strokeWidth: 0, fill: "#10B981" }} />
                    <Line type="monotone" dataKey="expenses" stroke="#EF4444" strokeWidth={2} dot={false} activeDot={{ r: 4, strokeWidth: 0, fill: "#EF4444" }} />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </CardBody>
          </Card>
        </Col>

        <Col xs={12} lg={4}>
          <Card style={{ border: "0.5px solid var(--color-border-tertiary)", borderRadius: "var(--border-radius-lg)", boxShadow: "none", height: "100%" }}>
            <CardBody style={{ padding: "1.25rem" }}>
              <p style={{ fontWeight: 500, fontSize: 14, margin: "0 0 4px" }}>Active goals</p>
              <p style={{ fontSize: 12, color: "var(--color-text-secondary)", margin: "0 0 1rem" }}>Savings goals at a glance</p>

              {goalLoading ? (
                <div className="d-flex justify-content-center align-items-center" style={{ height: 200 }}>
                  <Spinner size="sm" color="secondary" />
                </div>
              ) : activeGoals.length === 0 ? (
                <div style={{ height: 200, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--color-text-secondary)", fontSize: 13, textAlign: "center" }}>
                  No active goals yet.<br />Create one in the Investments page.
                </div>
              ) : (
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                  {activeGoals.map((goal) => {
                    const isTargeted    = goal.goalType === "targeted";
                    const pct           = Math.min(goal.percentageReached ?? 0, 100);
                    const color         = goal.color ?? "#3B82F6";
                    const progressColor = goal.status === "behind" ? "danger" : goal.status === "ahead" ? "info" : "primary";
                    return (
                      <div key={goal.id} style={{ background: "var(--color-background-secondary)", borderRadius: "var(--border-radius-md)", padding: "12px", borderLeft: `3px solid ${color}` }}>
                        <div className="d-flex align-items-center gap-2 mb-2">
                          <span style={{ fontSize: 16 }}>{goal.icon ?? "💰"}</span>
                          <p style={{ fontWeight: 500, fontSize: 13, margin: 0, color: "var(--color-text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {goal.name}
                          </p>
                        </div>
                        {isTargeted && goal.targetAmount ? (
                          <>
                            <Progress value={pct} color={progressColor} style={{ height: 4, borderRadius: 2, marginBottom: 5 }} />
                            <div className="d-flex justify-content-between">
                              <span style={{ fontSize: 11, color: "var(--color-text-secondary)" }}>{formatCurrency(goal.totalSaved)}</span>
                              <span style={{ fontSize: 11, fontWeight: 500, color: "var(--color-text-secondary)" }}>{pct.toFixed(0)}%</span>
                            </div>
                          </>
                        ) : (
                          <p style={{ fontSize: 14, fontWeight: 500, margin: 0, color: "var(--color-text-primary)" }}>
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