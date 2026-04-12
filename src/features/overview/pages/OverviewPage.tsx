import React, { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useCountUp } from "react-countup";
import { Container, Row, Col, Card, CardBody, Spinner, Progress } from "reactstrap";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from "recharts";
import { startOfMonth, subMonths, startOfYear, endOfYear, format, isWithinInterval, startOfWeek, endOfWeek, addWeeks } from "date-fns";
import type { Transaction } from "../../../shared/types/IndexTypes";
import { useTransactions } from "../../transactions/hooks/useTransactions";
import { useInvestmentGoals } from "../../budget/useInvestments";
import { useCurrencyConverter } from "../../../shared/hooks/useCurrencyConverter";

type TimePeriod = "current_month" | "last_3_months" | "last_6_months" | "year_to_date" | "this_year";

interface ChartDataPoint {
  label: string;
  income: number;
  expenses: number;
  investments: number;
}

interface DashboardMetrics {
  totalIncome: number;
  totalExpenses: number;
  netIncome: number;
  savingsRate: number;
}

function firestoreToDate(value: any): Date {
  if (!value) return new Date();
  if (value instanceof Date) return value;
  if (value?.seconds) return new Date(value.seconds * 1000);
  return new Date(value);
}

const getDateRange = (period: TimePeriod): { start: Date; end: Date } => {
  const now = new Date();
  switch (period) {
    case "current_month":
      return { start: startOfMonth(now), end: now };
    case "last_3_months":
      return { start: startOfMonth(subMonths(now, 2)), end: now };
    case "last_6_months":
      return { start: startOfMonth(subMonths(now, 5)), end: now };
    case "year_to_date":
      return { start: startOfYear(now), end: now };
    case "this_year":
      return { start: startOfYear(now), end: endOfYear(now) };
    default:
      return { start: startOfMonth(now), end: now };
  }
};

const filterTransactions = (transactions: Transaction[], range: { start: Date; end: Date }) =>
  transactions.filter((tx) => isWithinInterval(firestoreToDate(tx.date), { start: range.start, end: range.end }));

const groupByWeek = (transactions: Transaction[], range: { start: Date; end: Date }): ChartDataPoint[] => {
  const weeks: { start: Date; end: Date; label: string }[] = [];
  let cursor = startOfWeek(range.start, { weekStartsOn: 1 });
  let weekNum = 1;
  while (cursor <= range.end) {
    const wEnd = endOfWeek(cursor, { weekStartsOn: 1 });
    weeks.push({ start: cursor, end: wEnd < range.end ? wEnd : range.end, label: `Week ${weekNum}` });
    cursor = addWeeks(cursor, 1);
    weekNum++;
  }
  return weeks
    .map((w) => {
      const weekTx = transactions.filter((tx) => {
        const d = firestoreToDate(tx.date);
        return d >= w.start && d <= w.end;
      });
      return {
        label: w.label,
        income: Math.round(weekTx.filter((t) => t.type === "income" && !t.isInvestmentTransaction).reduce((s, t) => s + t.amount, 0)),
        expenses: Math.round(weekTx.filter((t) => t.type === "expense" && !t.isInvestmentTransaction).reduce((s, t) => s + Math.abs(t.amount), 0)),
        investments: Math.round(weekTx.filter((t) => t.isInvestmentTransaction && t.contributionType === "deposit").reduce((s, t) => s + t.amount, 0)),
      };
    })
    .filter((w) => w.income > 0 || w.expenses > 0 || w.investments > 0);
};

const groupByMonth = (transactions: Transaction[]): ChartDataPoint[] => {
  const map = new Map<string, { income: number; expenses: number; investments: number; firstDay: Date }>();
  transactions.forEach((tx) => {
    const firstDay = startOfMonth(firestoreToDate(tx.date));
    const key = format(firstDay, "yyyy-MM");
    if (!map.has(key)) map.set(key, { income: 0, expenses: 0, investments: 0, firstDay });
    const d = map.get(key)!;
    if (tx.isInvestmentTransaction) {
      // Only count deposits as investment inflow — withdrawals cancel out
      if (tx.contributionType === "deposit") d.investments += tx.amount;
    } else if (tx.type === "income") {
      d.income += tx.amount;
    } else {
      d.expenses += Math.abs(tx.amount);
    }
  });
  return Array.from(map.values())
    .sort((a, b) => a.firstDay.getTime() - b.firstDay.getTime())
    .map((d) => ({
      label: format(d.firstDay, "MMM yy"),
      income: Math.round(d.income),
      expenses: Math.round(d.expenses),
      investments: Math.round(d.investments),
    }));
};

// Investment transactions excluded from income/expense metrics
const calculateMetrics = (transactions: Transaction[]): DashboardMetrics => {
  const totalIncome = transactions.filter((t) => t.type === "income" && !t.isInvestmentTransaction).reduce((s, t) => s + t.amount, 0);

  const totalExpenses = transactions.filter((t) => t.type === "expense" && !t.isInvestmentTransaction).reduce((s, t) => s + Math.abs(t.amount), 0);

  const netIncome = totalIncome - totalExpenses;
  const savingsRate = totalIncome > 0 ? (netIncome / totalIncome) * 100 : 0;

  return { totalIncome, totalExpenses, netIncome, savingsRate };
};

function makeTooltip(formatCurrency: (n: number) => string) {
  return function CustomTooltip({ active, payload, label }: any) {
    if (!active || !payload?.length) return null;
    const income = payload.find((p: any) => p.dataKey === "income")?.value ?? 0;
    const expenses = payload.find((p: any) => p.dataKey === "expenses")?.value ?? 0;
    const investments = payload.find((p: any) => p.dataKey === "investments")?.value ?? 0;
    const net = income - expenses;
    return (
      <div style={{ background: "#1e1e2e", border: "none", borderRadius: 10, padding: "12px 16px", minWidth: 180, boxShadow: "0 8px 24px rgba(0,0,0,0.25)" }}>
        <p style={{ fontSize: 11, fontWeight: 600, color: "rgba(255,255,255,0.5)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 10 }}>{label}</p>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
          <span style={{ fontSize: 13, color: "rgba(255,255,255,0.7)", display: "flex", alignItems: "center", gap: 7 }}>
            <span style={{ width: 8, height: 8, borderRadius: 2, background: "#22C55E", display: "inline-block" }} />
            Income
          </span>
          <span style={{ fontSize: 13, fontWeight: 600, color: "#22C55E" }}>{formatCurrency(income)}</span>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
          <span style={{ fontSize: 13, color: "rgba(255,255,255,0.7)", display: "flex", alignItems: "center", gap: 7 }}>
            <span style={{ width: 8, height: 8, borderRadius: 2, background: "#F87171", display: "inline-block" }} />
            Expenses
          </span>
          <span style={{ fontSize: 13, fontWeight: 600, color: "#F87171" }}>{formatCurrency(expenses)}</span>
        </div>
        {investments > 0 && (
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
            <span style={{ fontSize: 13, color: "rgba(255,255,255,0.7)", display: "flex", alignItems: "center", gap: 7 }}>
              <span style={{ width: 8, height: 8, borderRadius: 2, background: "#818CF8", display: "inline-block" }} />
              Invested
            </span>
            <span style={{ fontSize: 13, fontWeight: 600, color: "#818CF8" }}>{formatCurrency(investments)}</span>
          </div>
        )}
        <div style={{ borderTop: "1px solid rgba(255,255,255,0.1)", paddingTop: 8, display: "flex", justifyContent: "space-between" }}>
          <span style={{ fontSize: 13, color: "rgba(255,255,255,0.7)" }}>Net</span>
          <span style={{ fontSize: 13, fontWeight: 700, color: net >= 0 ? "#22C55E" : "#F87171" }}>
            {net >= 0 ? "+" : ""}
            {formatCurrency(net)}
          </span>
        </div>
      </div>
    );
  };
}

function RoundedBar(props: any) {
  const { x, y, width, height, fill } = props;
  if (!height || height <= 0) return null;
  const radius = Math.min(5, width / 2);
  return (
    <path
      d={`M${x + radius},${y} h${width - 2 * radius} a${radius},${radius} 0 0 1 ${radius},${radius} v${height - radius} h${-width} v${-(height - radius)} a${radius},${radius} 0 0 1 ${radius},${-radius}z`}
      fill={fill}
    />
  );
}

function MetricCard({
  label,
  value,
  color,
  isPercentage = false,
  formatFn,
}: {
  label: string;
  value: number;
  color: string;
  isPercentage?: boolean;
  formatFn?: (n: number) => string;
}) {
  const spanRef = useRef<HTMLSpanElement>(null) as React.RefObject<HTMLElement>;
  const { update } = useCountUp({ ref: spanRef, end: value, duration: 1.5, decimals: isPercentage ? 1 : 0, separator: ",", prefix: "", suffix: isPercentage ? "%" : "" });
  useEffect(() => {
    update(value);
  }, [value, update]);
  const displayValue = !isPercentage && formatFn ? formatFn(value) : undefined;
  return (
    <Card className="text-center">
      <CardBody>
        <div style={{ background: "var(--color-background-secondary)", borderRadius: "var(--border-radius-md)" }}>
          <p style={{ fontSize: 12, color: "var(--color-text-secondary)", fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>{label}</p>
          {displayValue ? (
            <p style={{ fontSize: 22, fontWeight: 500, color, margin: 0 }}>{displayValue}</p>
          ) : (
            <span ref={spanRef} style={{ fontSize: 22, fontWeight: 500, color }} />
          )}
        </div>
      </CardBody>
    </Card>
  );
}

const PERIODS: { value: TimePeriod; label: string }[] = [
  { value: "current_month", label: "This month" },
  { value: "last_3_months", label: "3 months" },
  { value: "last_6_months", label: "6 months" },
  { value: "year_to_date", label: "Year to date" },
  { value: "this_year", label: "This year" },
];

export const OverviewPage: React.FC = () => {
  const [selectedPeriod, setSelectedPeriod] = useState<TimePeriod>("last_6_months");
  const [isPending, startTransition] = useTransition();

  const { data: transactions = [], isLoading: txLoading, isError: txError } = useTransactions();
  const { data: goals = [], isLoading: goalLoading } = useInvestmentGoals();
  const { format: formatCurrency } = useCurrencyConverter();

  const CustomTooltip = useMemo(() => makeTooltip(formatCurrency), [formatCurrency]);
  const handlePeriodChange = (period: TimePeriod) => {
    startTransition(() => setSelectedPeriod(period));
  };

  const dateRange = useMemo(() => getDateRange(selectedPeriod), [selectedPeriod]);
  const filtered = useMemo(() => filterTransactions(transactions, dateRange), [transactions, dateRange]);
  const chartData = useMemo(() => {
    if (selectedPeriod === "current_month") return groupByWeek(filtered, dateRange);
    return groupByMonth(filtered);
  }, [filtered, selectedPeriod, dateRange]);

  const metrics = useMemo(() => calculateMetrics(filtered), [filtered]);

  // Only recurring goals (monthly / yearly) count as "invested"
  // Deadline/targeted goals are earmarked savings, not true investments
  const totalInvestments = useMemo(() => goals.filter((g) => g.targetPeriod === "monthly" || g.targetPeriod === "yearly").reduce((s, g) => s + (g.totalSaved ?? 0), 0), [goals]);

  // Deadline/targeted goal deposits for the selected period
  const goalSavings = useMemo(() => {
    const deadlineGoalIds = new Set(goals.filter((g) => g.goalType === "targeted" && g.targetPeriod !== "monthly" && g.targetPeriod !== "yearly").map((g) => g.id));
    return filtered
      .filter((tx) => tx.isInvestmentTransaction && tx.contributionType === "deposit" && tx.goalId && deadlineGoalIds.has(tx.goalId))
      .reduce((s, tx) => s + tx.amount, 0);
  }, [filtered, goals]);

  const moneyLeft = useMemo(() => {
    return metrics.totalIncome - metrics.totalExpenses - goalSavings;
  }, [metrics.totalIncome, metrics.totalExpenses, goalSavings]);

  const activeGoals = useMemo(() => goals.filter((g) => !g.isCompleted).slice(0, 6), [goals]);

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
      {/* Header */}
      <div className="d-flex justify-content-between align-items-start mb-4 flex-wrap gap-3">
        <div>
          <h5 style={{ fontWeight: 600, margin: 0, color: "var(--color-text-primary)" }}>Financial Overview</h5>
          <p style={{ fontSize: 13, color: "var(--color-text-secondary)", margin: 0 }}>Track your income, expenses and investments</p>
        </div>

        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: 4,
            background: "var(--color-background-secondary)",
            borderRadius: 10,
            padding: 4,
          }}
        >
          {PERIODS.map((p) => (
            <button
              key={p.value}
              onClick={() => handlePeriodChange(p.value)}
              disabled={isPending}
              style={{
                background: selectedPeriod === p.value ? "#ffffff" : "transparent",
                border: selectedPeriod === p.value ? "0.5px solid rgba(0,0,0,0.10)" : "0.5px solid transparent",
                borderRadius: 7,
                padding: "6px 12px",
                fontSize: 12,
                fontWeight: selectedPeriod === p.value ? 600 : 400,
                color: selectedPeriod === p.value ? "var(--color-text-primary)" : "var(--color-text-secondary)",
                cursor: "pointer",
                boxShadow: selectedPeriod === p.value ? "0 1px 3px rgba(0,0,0,0.12), 0 1px 2px rgba(0,0,0,0.08)" : "none",
                transition: "all 0.15s ease",
                whiteSpace: "nowrap",
              }}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* Metric cards */}
      <Row className="g-3 mb-4" style={{ opacity: isPending ? 0.5 : 1, transition: "opacity 0.2s" }}>
        <Col xs={6} lg>
          <MetricCard label="Total income" value={metrics.totalIncome} color="#22C55E" formatFn={formatCurrency} />
        </Col>
        <Col xs={6} lg>
          <MetricCard label="Total expenses" value={metrics.totalExpenses} color="#EF4444" formatFn={formatCurrency} />
        </Col>
        <Col xs={6} lg>
          <MetricCard label="Net income" value={metrics.netIncome} color={metrics.netIncome >= 0 ? "#22C55E" : "#EF4444"} formatFn={formatCurrency} />
        </Col>
        <Col xs={6} lg>
          {/* Only recurring (monthly/yearly) goals — deadline goals are earmarked savings, not investments */}
          <MetricCard label="Invested" value={totalInvestments} color="#818CF8" formatFn={formatCurrency} />
        </Col>
        <Col xs={6} lg>
          <MetricCard label="Goal Savings" value={goalSavings} color="#F59E0B" formatFn={formatCurrency} />
        </Col>

        <Col xs={6} lg>
          <MetricCard label="Money left" value={moneyLeft} color={moneyLeft >= 0 ? "#22C55E" : "#EF4444"} formatFn={formatCurrency} />
        </Col>
      </Row>

      {/* Chart + Goal cards */}
      <Row className="g-3" style={{ opacity: isPending ? 0.5 : 1, transition: "opacity 0.2s" }}>
        <Col xs={12} lg={8}>
          <Card style={{ border: "0.5px solid var(--color-border-tertiary)", borderRadius: "var(--border-radius-lg)", boxShadow: "none", height: "100%" }}>
            <CardBody style={{ padding: "1.25rem" }}>
              <div className="d-flex justify-content-between align-items-center mb-3 flex-wrap gap-2">
                <div>
                  <p style={{ fontWeight: 500, fontSize: 14, margin: 0 }}>Cash flow</p>
                  <p style={{ fontSize: 12, color: "var(--color-text-secondary)", margin: 0 }}>{selectedPeriod === "current_month" ? "Weekly breakdown" : "Monthly breakdown"}</p>
                </div>
                <div className="d-flex gap-3">
                  {[
                    { color: "#22C55E", label: "Income" },
                    { color: "#F87171", label: "Expenses" },
                    { color: "#818CF8", label: "Invested" },
                  ].map((l) => (
                    <span key={l.label} style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 12, color: "var(--color-text-secondary)" }}>
                      <span style={{ width: 10, height: 10, borderRadius: 2, background: l.color, display: "inline-block" }} />
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
                  <BarChart data={chartData} margin={{ top: 5, right: 10, left: 0, bottom: 0 }} barGap={3} barCategoryGap="30%">
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border-tertiary)" vertical={false} />
                    <XAxis dataKey="label" tick={{ fontSize: 11, fill: "var(--color-text-secondary)" }} axisLine={false} tickLine={false} dy={6} />
                    <YAxis tickFormatter={(v) => formatCurrency(v)} tick={{ fontSize: 11, fill: "var(--color-text-secondary)" }} axisLine={false} tickLine={false} width={60} />
                    <Tooltip content={<CustomTooltip />} cursor={{ fill: "rgba(128,128,128,0.06)", radius: 4 }} />
                    <Bar dataKey="income" name="Income" maxBarSize={32} shape={<RoundedBar />}>
                      {chartData.map((_, i) => (
                        <Cell key={i} fill="#22C55E" fillOpacity={0.85} />
                      ))}
                    </Bar>
                    <Bar dataKey="expenses" name="Expenses" maxBarSize={32} shape={<RoundedBar />}>
                      {chartData.map((_, i) => (
                        <Cell key={i} fill="#F87171" fillOpacity={0.85} />
                      ))}
                    </Bar>
                    <Bar dataKey="investments" name="Invested" maxBarSize={32} shape={<RoundedBar />}>
                      {chartData.map((_, i) => (
                        <Cell key={i} fill="#818CF8" fillOpacity={0.85} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
            </CardBody>
          </Card>
        </Col>

        {/* Goal cards */}
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
                <div
                  style={{ height: 200, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--color-text-secondary)", fontSize: 13, textAlign: "center" }}
                >
                  No active goals yet.
                  <br />
                  Create one in the Investments page.
                </div>
              ) : (
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))",
                    gap: 10,
                  }}
                >
                  {activeGoals.map((goal) => {
                    const isTargeted = goal.goalType === "targeted";
                    const pct = Math.min(goal.percentageReached ?? 0, 100);
                    const color = goal.color ?? "#3B82F6";
                    const progressColor = goal.status === "behind" ? "danger" : goal.status === "ahead" ? "info" : "primary";

                    return (
                      <div
                        key={goal.id}
                        style={{
                          background: "var(--color-background-secondary)",
                          borderRadius: "var(--border-radius-md)",
                          padding: "12px",
                          borderLeft: `3px solid ${color}`,
                          minWidth: 0,
                        }}
                      >
                        <div className="d-flex align-items-center gap-2 mb-2" style={{ minWidth: 0 }}>
                          <span style={{ fontSize: 16, flexShrink: 0 }}>{goal.icon ?? "💰"}</span>
                          <p
                            style={{
                              fontWeight: 500,
                              fontSize: 13,
                              margin: 0,
                              color: "var(--color-text-primary)",
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              whiteSpace: "nowrap",
                              minWidth: 0,
                            }}
                          >
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
                          <p style={{ fontSize: 14, fontWeight: 500, margin: 0, color: "var(--color-text-primary)" }}>{formatCurrency(goal.totalSaved)}</p>
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
