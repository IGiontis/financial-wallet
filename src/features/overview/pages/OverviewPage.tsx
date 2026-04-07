import React, { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useCountUp } from "react-countup";
import { Container, Row, Col, Card, CardBody, CardTitle, Spinner } from "reactstrap";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";
import { startOfMonth, subMonths, startOfYear, format, isWithinInterval } from "date-fns";
import { type Transaction } from "../../../shared/types/IndexTypes";
import { mockTransactions } from "./mockDataOverview";

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
// HELPER FUNCTIONS (unchanged)
// ============================================================================

const getDateRange = (period: TimePeriod): { start: Date; end: Date } => {
  const now = new Date();
  let start: Date;
  switch (period) {
    case "current_month":
      start = startOfMonth(now);
      break;
    case "last_3_months":
      start = startOfMonth(subMonths(now, 2));
      break;
    case "last_6_months":
      start = startOfMonth(subMonths(now, 5));
      break;
    case "year_to_date":
      start = startOfYear(now);
      break;
    case "last_12_months":
      start = startOfMonth(subMonths(now, 11));
      break;
    default:
      start = startOfMonth(now);
  }
  return { start, end: now };
};

const filterTransactionsByDateRange = (transactions: Transaction[], dateRange: { start: Date; end: Date }): Transaction[] => {
  return transactions.filter((tx) => isWithinInterval(new Date(tx.date), { start: dateRange.start, end: dateRange.end }));
};

const groupTransactionsByMonth = (transactions: Transaction[]): ChartDataPoint[] => {
  const monthlyData = new Map<string, { income: number; expenses: number; firstDay: Date }>();
  transactions.forEach((tx) => {
    const firstDayOfMonth = startOfMonth(new Date(tx.date));
    const monthKey = format(firstDayOfMonth, "yyyy-MM");
    if (!monthlyData.has(monthKey)) {
      monthlyData.set(monthKey, { income: 0, expenses: 0, firstDay: firstDayOfMonth });
    }
    const data = monthlyData.get(monthKey)!;
    if (tx.type === "income") data.income += tx.amount;
    else data.expenses += Math.abs(tx.amount);
  });
  return Array.from(monthlyData.entries())
    .map(([_, data]) => ({
      month: format(data.firstDay, "dd/MM/yyyy"),
      income: data.income,
      expenses: data.expenses,
    }))
    .sort((a, b) => {
      const [dayA, monthA, yearA] = a.month.split("/").map(Number);
      const [dayB, monthB, yearB] = b.month.split("/").map(Number);
      return new Date(yearA, monthA - 1, dayA).getTime() - new Date(yearB, monthB - 1, dayB).getTime();
    });
};

const calculateMetrics = (transactions: Transaction[]): DashboardMetrics => {
  const totalIncome = transactions.filter((tx) => tx.type === "income").reduce((sum, tx) => sum + tx.amount, 0);
  const totalExpenses = transactions.filter((tx) => tx.type === "expense").reduce((sum, tx) => sum + Math.abs(tx.amount), 0);
  const netIncome = totalIncome - totalExpenses;
  const savingsRate = totalIncome > 0 ? (netIncome / totalIncome) * 100 : 0;
  return { totalIncome, totalExpenses, netIncome, savingsRate };
};

// ============================================================================
// HELPERS - defined OUTSIDE the component so they are stable references
// ============================================================================

const formatCurrency = (value: number): string =>
  new Intl.NumberFormat("de-DE", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);

/**
 * FIX 1: CustomTooltip moved OUTSIDE OverviewPage.
 * Recharts compares tooltip by reference. Defining it inside the component
 * creates a new component type on every render, causing chart flickers.
 */
const CustomTooltip = ({ active, payload }: any) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-dark text-white px-3 py-2 rounded" style={{ fontSize: "14px" }}>
        <p className="mb-1 fw-bold">{payload[0].payload.month}</p>
        {payload.map((entry: any, index: number) => (
          <p key={index} className="mb-0" style={{ color: entry.color }}>
            {entry.name}: {formatCurrency(entry.value)}
          </p>
        ))}
      </div>
    );
  }
  return null;
};

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export const OverviewPage: React.FC = () => {
  const [selectedPeriod, setSelectedPeriod] = useState<TimePeriod>("last_12_months");
  const [isPending, startTransition] = useTransition();

  const handlePeriodChange = (period: TimePeriod) => {
    startTransition(() => setSelectedPeriod(period));
  };

  const dateRange = useMemo(() => getDateRange(selectedPeriod), [selectedPeriod]);
  const filteredTransactions = useMemo(() => filterTransactionsByDateRange(mockTransactions, dateRange), [dateRange]);
  const chartData = useMemo(() => groupTransactionsByMonth(filteredTransactions), [filteredTransactions]);
  const metrics = useMemo(() => calculateMetrics(filteredTransactions), [filteredTransactions]);

  return (
    <Container fluid className="py-2">
      {/* Header */}
      <Row className="mb-4">
        <Col md={8}>
          <h2 className="mb-1">Financial Overview</h2>
          <p className="text-muted mb-0">Track your income and expenses over time</p>
        </Col>
        <Col md={4} className="d-flex align-items-center justify-content-md-end">
          <div className="d-flex align-items-center w-100">
            <select className="form-select" value={selectedPeriod} onChange={(e) => handlePeriodChange(e.target.value as TimePeriod)} disabled={isPending}>
              <option value="current_month">Current Month</option>
              <option value="last_3_months">Last 3 Months</option>
              <option value="last_6_months">Last 6 Months</option>
              <option value="year_to_date">Year to Date</option>
              <option value="last_12_months">Last 12 Months</option>
            </select>
            {isPending && <Spinner size="sm" className="ms-2" color="primary" />}
          </div>
        </Col>
      </Row>

      {/* Summary Cards */}
      <Row className="mb-4" style={{ opacity: isPending ? 0.6 : 1, transition: "opacity 0.2s" }}>
        <Col lg={3} md={6} className="mb-3">
          <Card className="h-100">
            <CardBody>
              <p className="text-muted mb-2" style={{ fontSize: "14px" }}>
                Total Income
              </p>
              <h3 className="mb-0 text-success">
                <AnimatedCurrency value={metrics.totalIncome} />
              </h3>
            </CardBody>
          </Card>
        </Col>
        <Col lg={3} md={6} className="mb-3">
          <Card className="h-100">
            <CardBody>
              <p className="text-muted mb-2" style={{ fontSize: "14px" }}>
                Total Expenses
              </p>
              <h3 className="mb-0 text-danger">
                <AnimatedCurrency value={metrics.totalExpenses} />
              </h3>
            </CardBody>
          </Card>
        </Col>
        <Col lg={3} md={6} className="mb-3">
          <Card className="h-100">
            <CardBody>
              <p className="text-muted mb-2" style={{ fontSize: "14px" }}>
                Net Income
              </p>
              <h3 className={`mb-0 ${metrics.netIncome >= 0 ? "text-success" : "text-danger"}`}>
                <AnimatedCurrency value={metrics.netIncome} />
              </h3>
            </CardBody>
          </Card>
        </Col>
        <Col lg={3} md={6} className="mb-3">
          <Card className="h-100">
            <CardBody>
              <p className="text-muted mb-2" style={{ fontSize: "14px" }}>
                Savings Rate
              </p>
              <h3 className="mb-0">
                <AnimatedPercentage value={metrics.savingsRate} />
              </h3>
            </CardBody>
          </Card>
        </Col>
      </Row>

      {/* Cash Flow Chart */}
      <Row style={{ opacity: isPending ? 0.6 : 1, transition: "opacity 0.2s" }}>
        <Col xs={12}>
          <Card>
            <CardBody>
              <CardTitle tag="h5" className="mb-3">
                Cash Flow - Income vs Expenses
              </CardTitle>

              {chartData.length > 0 ? (
                <ResponsiveContainer width="100%" height={400} debounce={300}>
                  <BarChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                    <XAxis dataKey="month" stroke="#6b7280" />
                    <YAxis stroke="#6b7280" tickFormatter={formatCurrency} />
                    <Tooltip content={<CustomTooltip />} />
                    <Legend />
                    <Bar dataKey="income" fill="#10b981" name="Income" radius={[8, 8, 0, 0]} />
                    <Bar dataKey="expenses" fill="#ef4444" name="Expenses" radius={[8, 8, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="text-center text-muted py-5">
                  <p>No transactions found for the selected period</p>
                </div>
              )}
            </CardBody>
          </Card>
        </Col>
      </Row>
    </Container>
  );
};

// ============================================================================
// ANIMATED SUB-COMPONENTS (unchanged logic, kept outside OverviewPage)
// ============================================================================

const AnimatedCurrency = ({ value }: { value: number }) => {
  const spanRef = useRef<HTMLSpanElement>(null) as React.RefObject<HTMLElement>;
  const { update } = useCountUp({
    ref: spanRef,
    end: value,
    duration: 2,
    decimals: 2,
    decimal: ".",
    separator: ",",
    prefix: "€",
  });
  useEffect(() => {
    update(value);
  }, [value, update]);
  return <span ref={spanRef} />;
};

const AnimatedPercentage = ({ value }: { value: number }) => {
  const spanRef = useRef<HTMLSpanElement>(null) as React.RefObject<HTMLElement>;
  const { update } = useCountUp({
    ref: spanRef,
    end: value,
    duration: 2,
    decimals: 1,
    suffix: "%",
  });
  useEffect(() => {
    update(value);
  }, [value, update]);
  return <span ref={spanRef} />;
};
