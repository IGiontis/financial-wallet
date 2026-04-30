import React, { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useCountUp } from "react-countup";
import { Container, Row, Col, Card, CardBody, Spinner, Progress, Modal, ModalHeader, ModalBody, ModalFooter, Button } from "reactstrap";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from "recharts";
import { startOfMonth, subMonths, startOfYear, endOfYear, endOfMonth, format, isWithinInterval, startOfWeek, endOfWeek, addWeeks } from "date-fns";
import type { Transaction } from "../../../shared/types/IndexTypes";
import { useTransactions } from "../../transactions/hooks/useTransactions";
import { useInvestmentGoals } from "../../budget/useInvestments";
import { useCurrencyConverter } from "../../../shared/hooks/useCurrencyConverter";

type TimePeriod = "current_month" | "last_3_months" | "last_6_months" | "year_to_date" | "this_year" | "custom";

interface CustomRange {
  fromMonth: number;
  fromYear: number;
  toMonth: number;
  toYear: number;
}

interface ChartDataPoint {
  label: string;
  income: number;
  expenses: number;
  investments: number;
  goals: number;
  investmentsNet: number;
  goalsNet: number;
}

interface DashboardMetrics {
  totalIncome: number;
  totalExpenses: number;
  netIncome: number;
  savingsRate: number;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const PERIODS: { value: TimePeriod; label: string }[] = [
  { value: "current_month", label: "This month" },
  { value: "last_3_months", label: "3 months" },
  { value: "last_6_months", label: "6 months" },
  { value: "year_to_date", label: "Year to date" },
  { value: "this_year", label: "This year" },
  { value: "custom", label: "From – To" },
];

function firestoreToDate(value: any): Date {
  if (!value) return new Date();
  if (value instanceof Date) return value;
  if (value?.seconds) return new Date(value.seconds * 1000);
  return new Date(value);
}

const getDateRange = (period: TimePeriod, custom?: CustomRange): { start: Date; end: Date } => {
  const now = new Date();
  if (period === "custom" && custom) {
    const start = startOfMonth(new Date(custom.fromYear, custom.fromMonth, 1));
    const rawEnd = endOfMonth(new Date(custom.toYear, custom.toMonth, 1));
    return { start, end: rawEnd > now ? now : rawEnd };
  }
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
        investments: Math.round(weekTx.filter((t) => t.isInvestmentTransaction && !t.isGoalTransaction && t.contributionType === "deposit").reduce((s, t) => s + t.amount, 0)),
        goals: Math.round(weekTx.filter((t) => t.isGoalTransaction && t.contributionType === "deposit").reduce((s, t) => s + t.amount, 0)),
        investmentsNet: Math.round(
          weekTx.filter((t) => t.isInvestmentTransaction && !t.isGoalTransaction).reduce((s, t) => s + (t.contributionType === "deposit" ? t.amount : -t.amount), 0),
        ),
        goalsNet: Math.round(weekTx.filter((t) => t.isGoalTransaction).reduce((s, t) => s + (t.contributionType === "deposit" ? t.amount : -t.amount), 0)),
      };
    })
    .filter((w) => w.income > 0 || w.expenses > 0 || w.investments > 0 || w.goals > 0);
};

const groupByMonth = (transactions: Transaction[]): ChartDataPoint[] => {
  const map = new Map<string, { income: number; expenses: number; investments: number; goals: number; investmentsNet: number; goalsNet: number; firstDay: Date }>();
  transactions.forEach((tx) => {
    const firstDay = startOfMonth(firestoreToDate(tx.date));
    const key = format(firstDay, "yyyy-MM");
    if (!map.has(key)) map.set(key, { income: 0, expenses: 0, investments: 0, goals: 0, investmentsNet: 0, goalsNet: 0, firstDay });
    const d = map.get(key)!;
    if (tx.isGoalTransaction) {
      if (tx.contributionType === "deposit") d.goals += tx.amount;
      d.goalsNet += tx.contributionType === "deposit" ? tx.amount : -tx.amount;
    } else if (tx.isInvestmentTransaction) {
      if (tx.contributionType === "deposit") d.investments += tx.amount;
      d.investmentsNet += tx.contributionType === "deposit" ? tx.amount : -tx.amount;
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
      goals: Math.round(d.goals),
      investmentsNet: Math.round(d.investmentsNet),
      goalsNet: Math.round(d.goalsNet),
    }));
};

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
    const goals = payload.find((p: any) => p.dataKey === "goals")?.value ?? 0;
    const investmentsNet: number = payload[0]?.payload?.investmentsNet ?? investments;
    const goalsNet: number = payload[0]?.payload?.goalsNet ?? goals;
    const moneyLeft = income - expenses - investmentsNet - goalsNet;
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
        {goals > 0 && (
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
            <span style={{ fontSize: 13, color: "rgba(255,255,255,0.7)", display: "flex", alignItems: "center", gap: 7 }}>
              <span style={{ width: 8, height: 8, borderRadius: 2, background: "#F59E0B", display: "inline-block" }} />
              Goals
            </span>
            <span style={{ fontSize: 13, fontWeight: 600, color: "#F59E0B" }}>{formatCurrency(goals)}</span>
          </div>
        )}
        <div style={{ borderTop: "1px solid rgba(255,255,255,0.1)", paddingTop: 8, display: "flex", justifyContent: "space-between" }}>
          <span style={{ fontSize: 13, color: "rgba(255,255,255,0.7)" }}>Money left</span>
          <span style={{ fontSize: 13, fontWeight: 700, color: moneyLeft >= 0 ? "#22C55E" : "#F87171" }}>
            {moneyLeft >= 0 ? "+" : ""}
            {formatCurrency(moneyLeft)}
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

// ── Month grid picker ─────────────────────────────────────────────────────────

function MonthGrid({
  label,
  selectedYear,
  onSelectMonth,
  onSelectYear,
  minYear,
  maxYear,
  maxMonth,
  rangeStart,
  rangeEnd,
}: {
  label: string;
  selectedMonth: number;
  selectedYear: number;
  onSelectMonth: (m: number) => void;
  onSelectYear: (y: number) => void;
  minYear: number;
  maxYear: number;
  maxMonth: number;
  rangeStart: { month: number; year: number };
  rangeEnd: { month: number; year: number };
}) {
  const isDisabled = (m: number) => selectedYear === maxYear && m > maxMonth;

  const isInRange = (m: number) => {
    const startMs = new Date(rangeStart.year, rangeStart.month, 1).getTime();
    const endMs = new Date(rangeEnd.year, rangeEnd.month, 1).getTime();
    const cellMs = new Date(selectedYear, m, 1).getTime();
    return cellMs > startMs && cellMs < endMs;
  };

  const isRangeEdge = (m: number) => (selectedYear === rangeStart.year && m === rangeStart.month) || (selectedYear === rangeEnd.year && m === rangeEnd.month);

  const navBtnStyle = (disabled: boolean): React.CSSProperties => ({
    width: 28,
    height: 28,
    borderRadius: "var(--border-radius-md)",
    border: "0.5px solid var(--color-border-tertiary)",
    background: "var(--color-background-secondary)",
    color: "var(--color-text-primary)",
    fontSize: 15,
    cursor: disabled ? "not-allowed" : "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    opacity: disabled ? 0.35 : 1,
    flexShrink: 0,
  });

  return (
    <div style={{ flex: "1 1 180px", minWidth: 0 }}>
      <p style={{ fontSize: 11, fontWeight: 600, color: "var(--color-text-secondary)", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 10 }}>{label}</p>

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
        <button onClick={() => onSelectYear(Math.max(minYear, selectedYear - 1))} disabled={selectedYear <= minYear} style={navBtnStyle(selectedYear <= minYear)}>
          ‹
        </button>
        <span style={{ fontSize: 14, fontWeight: 500, color: "var(--color-text-primary)" }}>{selectedYear}</span>
        <button onClick={() => onSelectYear(Math.min(maxYear, selectedYear + 1))} disabled={selectedYear >= maxYear} style={navBtnStyle(selectedYear >= maxYear)}>
          ›
        </button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 4 }}>
        {MONTHS.map((m, i) => {
          const edge = isRangeEdge(i);
          const inRange = isInRange(i);
          const disabled = isDisabled(i);
          return (
            <button
              key={i}
              onClick={() => !disabled && onSelectMonth(i)}
              disabled={disabled}
              style={{
                padding: "7px 0",
                textAlign: "center",
                fontSize: 12,
                borderRadius: "var(--border-radius-md)",
                border: "0.5px solid transparent",
                background: edge ? "#378ADD" : inRange ? "#B5D4F4" : "var(--color-background-secondary)",
                color: edge ? "#ffffff" : inRange ? "#0C447C" : "var(--color-text-secondary)",
                fontWeight: edge ? 500 : 400,
                cursor: disabled ? "not-allowed" : "pointer",
                opacity: disabled ? 0.35 : 1,
                transition: "background 0.1s",
              }}
            >
              {m}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ── Custom range modal ────────────────────────────────────────────────────────

interface CustomRangeModalProps {
  isOpen: boolean;
  onClose: () => void;
  onApply: (range: CustomRange) => void;
  initialRange: CustomRange;
  minYear: number;
}

function CustomRangeModal({ isOpen, onClose, onApply, initialRange, minYear }: CustomRangeModalProps) {
  const now = new Date();
  const maxYear = now.getFullYear();
  const maxMonth = now.getMonth();

  const [draft, setDraft] = useState<CustomRange>(initialRange);

  useEffect(() => {
    if (isOpen) setDraft(initialRange);
  }, [isOpen]);

  const clamp = (month: number, year: number) => (year === maxYear && month > maxMonth ? maxMonth : month);

  const updateFrom = (month: number, year: number) => {
    setDraft((prev) => {
      const fm = clamp(month, year);
      const next = { ...prev, fromMonth: fm, fromYear: year };
      if (new Date(year, fm, 1).getTime() > new Date(next.toYear, next.toMonth, 1).getTime()) {
        next.toMonth = fm;
        next.toYear = year;
      }
      return next;
    });
  };

  const updateTo = (month: number, year: number) => {
    setDraft((prev) => {
      const tm = clamp(month, year);
      const next = { ...prev, toMonth: tm, toYear: year };
      if (new Date(year, tm, 1).getTime() < new Date(next.fromYear, next.fromMonth, 1).getTime()) {
        next.fromMonth = tm;
        next.fromYear = year;
      }
      return next;
    });
  };

  const fromLabel = `${MONTHS[draft.fromMonth]} ${draft.fromYear}`;
  const toLabel = `${MONTHS[draft.toMonth]} ${draft.toYear}`;
  const isSame = draft.fromMonth === draft.toMonth && draft.fromYear === draft.toYear;
  const monthCount = (draft.toYear - draft.fromYear) * 12 + (draft.toMonth - draft.fromMonth) + 1;

  return (
    <Modal isOpen={isOpen} toggle={onClose} centered>
      <ModalHeader toggle={onClose} style={{ fontSize: 14, fontWeight: 600, borderBottom: "0.5px solid var(--color-border-tertiary)", padding: "0.875rem 1.25rem" }}>
        Custom date range
      </ModalHeader>

      <ModalBody style={{ padding: "1.25rem" }}>
        <div style={{ display: "flex", gap: 20, flexWrap: "wrap" }}>
          <MonthGrid
            label="From"
            selectedMonth={draft.fromMonth}
            selectedYear={draft.fromYear}
            onSelectMonth={(m) => updateFrom(m, draft.fromYear)}
            onSelectYear={(y) => updateFrom(draft.fromMonth, y)}
            minYear={minYear}
            maxYear={maxYear}
            maxMonth={maxMonth}
            rangeStart={{ month: draft.fromMonth, year: draft.fromYear }}
            rangeEnd={{ month: draft.toMonth, year: draft.toYear }}
          />

          {/* Divider */}
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", flex: "0 0 auto" }}>
            <div style={{ width: "0.5px", flex: 1, background: "var(--color-border-tertiary)", minHeight: 8 }} />
            <span style={{ fontSize: 11, color: "var(--color-text-secondary)", padding: "6px 0" }}>to</span>
            <div style={{ width: "0.5px", flex: 1, background: "var(--color-border-tertiary)", minHeight: 8 }} />
          </div>

          <MonthGrid
            label="To"
            selectedMonth={draft.toMonth}
            selectedYear={draft.toYear}
            onSelectMonth={(m) => updateTo(m, draft.toYear)}
            onSelectYear={(y) => updateTo(draft.toMonth, y)}
            minYear={minYear}
            maxYear={maxYear}
            maxMonth={maxMonth}
            rangeStart={{ month: draft.fromMonth, year: draft.fromYear }}
            rangeEnd={{ month: draft.toMonth, year: draft.toYear }}
          />
        </div>

        {/* Summary */}
        <div
          style={{
            marginTop: 16,
            background: "var(--color-background-secondary)",
            borderRadius: "var(--border-radius-md)",
            padding: "10px 14px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 6,
            flexWrap: "wrap",
          }}
        >
          <span style={{ fontSize: 13, fontWeight: 500, color: "#378ADD" }}>{fromLabel}</span>
          {!isSame && (
            <>
              <span style={{ fontSize: 12, color: "var(--color-text-secondary)" }}>→</span>
              <span style={{ fontSize: 13, fontWeight: 500, color: "#378ADD" }}>{toLabel}</span>
              <span style={{ fontSize: 11, color: "var(--color-text-secondary)", marginLeft: 4 }}>
                ({monthCount} {monthCount === 1 ? "month" : "months"})
              </span>
            </>
          )}
        </div>
      </ModalBody>

      <ModalFooter style={{ borderTop: "0.5px solid var(--color-border-tertiary)", padding: "0.75rem 1.25rem", gap: 8 }}>
        <Button color="secondary" outline size="sm" onClick={onClose} style={{ fontSize: 13 }}>
          Cancel
        </Button>
        <Button
          color="primary"
          size="sm"
          onClick={() => {
            onApply(draft);
            onClose();
          }}
          style={{ fontSize: 13 }}
        >
          Apply
        </Button>
      </ModalFooter>
    </Modal>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export const OverviewPage: React.FC = () => {
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
  }, [transactions]);

  const CustomTooltip = useMemo(() => makeTooltip(formatCurrency), [formatCurrency]);

  const handlePeriodChange = (period: TimePeriod) => {
    if (period === "custom") {
      setModalOpen(true);
      return;
    }
    startTransition(() => setSelectedPeriod(period));
  };

  const handleApplyCustomRange = (range: CustomRange) => {
    setAppliedRange(range);
    startTransition(() => setSelectedPeriod("custom"));
  };

  const customLabel = useMemo(() => {
    if (selectedPeriod !== "custom") return "From – To";
    const from = `${MONTHS[appliedRange.fromMonth]} ${appliedRange.fromYear}`;
    const to = `${MONTHS[appliedRange.toMonth]} ${appliedRange.toYear}`;
    return from === to ? from : `${from} – ${to}`;
  }, [selectedPeriod, appliedRange]);

  const dateRange = useMemo(() => getDateRange(selectedPeriod, appliedRange), [selectedPeriod, appliedRange]);
  const filtered = useMemo(() => filterTransactions(transactions, dateRange), [transactions, dateRange]);

  const isSingleMonth =
    selectedPeriod === "current_month" || (selectedPeriod === "custom" && appliedRange.fromMonth === appliedRange.toMonth && appliedRange.fromYear === appliedRange.toYear);

  const chartData = useMemo(() => {
    if (isSingleMonth) return groupByWeek(filtered, dateRange);
    return groupByMonth(filtered);
  }, [filtered, isSingleMonth, dateRange]);

  const metrics = useMemo(() => calculateMetrics(filtered), [filtered]);

  const totalInvestments = useMemo(
    () => filtered.filter((tx) => tx.isInvestmentTransaction && !tx.isGoalTransaction).reduce((s, tx) => s + (tx.contributionType === "deposit" ? tx.amount : -tx.amount), 0),
    [filtered],
  );

  const goalSavings = useMemo(
    () => filtered.filter((tx) => tx.isGoalTransaction).reduce((s, tx) => s + (tx.contributionType === "deposit" ? tx.amount : -tx.amount), 0),
    [filtered],
  );

  const moneyLeft = useMemo(
    () => metrics.totalIncome - metrics.totalExpenses - totalInvestments - goalSavings,
    [metrics.totalIncome, metrics.totalExpenses, totalInvestments, goalSavings],
  );

  const activeGoals = useMemo(
    () =>
      goals
        .filter((g) => !g.isCompleted && g.isActive)
        .sort((a, b) => {
          if (!a.deadline && !b.deadline) return 0;
          if (!a.deadline) return 1;
          if (!b.deadline) return -1;
          return new Date(a.deadline).getTime() - new Date(b.deadline).getTime();
        })
        .slice(0, 6),
    [goals],
  );

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
      <CustomRangeModal isOpen={modalOpen} onClose={() => setModalOpen(false)} onApply={handleApplyCustomRange} initialRange={appliedRange} minYear={minYear} />

      {/* Header */}
      <div className="d-flex justify-content-between align-items-start mb-4 flex-wrap gap-3">
        <div>
          <h5 style={{ fontWeight: 600, margin: 0, color: "var(--color-text-primary)" }}>Financial Overview</h5>
          <p style={{ fontSize: 13, color: "var(--color-text-secondary)", margin: 0 }}>Track your income, expenses and investments</p>
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 4, background: "var(--color-background-secondary)", borderRadius: 10, padding: 4 }}>
          {PERIODS.map((p) => {
            const isActive = selectedPeriod === p.value;
            const label = p.value === "custom" ? customLabel : p.label;
            return (
              <button
                key={p.value}
                onClick={() => handlePeriodChange(p.value)}
                disabled={isPending}
                style={{
                  background: isActive ? "#ffffff" : "transparent",
                  border: isActive ? "0.5px solid rgba(0,0,0,0.10)" : "0.5px solid transparent",
                  borderRadius: 7,
                  padding: "6px 12px",
                  fontSize: 12,
                  fontWeight: isActive ? 600 : 400,
                  color: isActive ? "var(--color-text-primary)" : "var(--color-text-secondary)",
                  cursor: "pointer",
                  boxShadow: isActive ? "0 1px 3px rgba(0,0,0,0.12), 0 1px 2px rgba(0,0,0,0.08)" : "none",
                  transition: "all 0.15s ease",
                  whiteSpace: "nowrap",
                  maxWidth: 160,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
              >
                {label}
              </button>
            );
          })}
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
          <MetricCard label="Invested" value={totalInvestments} color="#818CF8" formatFn={formatCurrency} />
        </Col>
        <Col xs={6} lg>
          <MetricCard label="Goal savings" value={goalSavings} color="#F59E0B" formatFn={formatCurrency} />
        </Col>
        <Col xs={6} lg>
          <MetricCard label="Money left" value={moneyLeft} color={moneyLeft >= 0 ? "#22C55E" : "#EF4444"} formatFn={formatCurrency} />
        </Col>
      </Row>

      {/* Chart + Goals */}
      <Row className="g-3" style={{ opacity: isPending ? 0.5 : 1, transition: "opacity 0.2s" }}>
        <Col xs={12} lg={8}>
          <Card style={{ border: "0.5px solid var(--color-border-tertiary)", borderRadius: "var(--border-radius-lg)", boxShadow: "none", height: "100%" }}>
            <CardBody style={{ padding: "1.25rem" }}>
              <div className="d-flex justify-content-between align-items-center mb-3 flex-wrap gap-2">
                <div>
                  <p style={{ fontWeight: 500, fontSize: 14, margin: 0 }}>Cash flow</p>
                  <p style={{ fontSize: 12, color: "var(--color-text-secondary)", margin: 0 }}>{isSingleMonth ? "Weekly breakdown" : "Monthly breakdown"}</p>
                </div>
                <div className="d-flex gap-3 flex-wrap">
                  {[
                    { color: "#22C55E", label: "Income" },
                    { color: "#F87171", label: "Expenses" },
                    { color: "#818CF8", label: "Invested" },
                    { color: "#F59E0B", label: "Goals" },
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
                    <Bar dataKey="income" name="Income" maxBarSize={28} shape={<RoundedBar />}>
                      {chartData.map((_, i) => (
                        <Cell key={i} fill="#22C55E" fillOpacity={0.85} />
                      ))}
                    </Bar>
                    <Bar dataKey="expenses" name="Expenses" maxBarSize={28} shape={<RoundedBar />}>
                      {chartData.map((_, i) => (
                        <Cell key={i} fill="#F87171" fillOpacity={0.85} />
                      ))}
                    </Bar>
                    <Bar dataKey="investments" name="Invested" maxBarSize={28} shape={<RoundedBar />}>
                      {chartData.map((_, i) => (
                        <Cell key={i} fill="#818CF8" fillOpacity={0.85} />
                      ))}
                    </Bar>
                    <Bar dataKey="goals" name="Goals" maxBarSize={28} shape={<RoundedBar />}>
                      {chartData.map((_, i) => (
                        <Cell key={i} fill="#F59E0B" fillOpacity={0.85} />
                      ))}
                    </Bar>
                  </BarChart>
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
                <div
                  style={{ height: 200, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--color-text-secondary)", fontSize: 13, textAlign: "center" }}
                >
                  No active goals yet.
                  <br />
                  Create one in the Goals or Investments page.
                </div>
              ) : (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: 10 }}>
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
