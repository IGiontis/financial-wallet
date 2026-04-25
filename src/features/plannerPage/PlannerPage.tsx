import { useState, useMemo } from "react";
import { Container, Row, Col, Card, CardBody, Input, InputGroup, InputGroupText, Spinner } from "reactstrap";
import { startOfMonth, endOfMonth, isWithinInterval, format, addMonths, subMonths } from "date-fns";
import { useTransactions } from "../transactions/hooks/useTransactions";
import { useInvestmentGoals } from "../budget/useInvestments";
import { useCurrencyConverter } from "../../shared/hooks/useCurrencyConverter";

function firestoreToDate(value: any): Date {
  if (!value) return new Date();
  if (value instanceof Date) return value;
  if (value?.seconds) return new Date(value.seconds * 1000);
  return new Date(value);
}

function getSalaryKey(date: Date): string {
  return `planner-salary-${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

const navBtn: React.CSSProperties = {
  background: "none",
  border: "0.5px solid var(--color-border-tertiary)",
  borderRadius: 8,
  cursor: "pointer",
  fontSize: 18,
  lineHeight: 1,
  color: "var(--color-text-secondary)",
  padding: "4px 10px",
};

export function PlannerPage() {
  const [currentDate, setCurrentDate] = useState(() => new Date());
  const [salaryInput, setSalaryInput] = useState<string>(() => localStorage.getItem(getSalaryKey(new Date())) ?? "");

  const monthRange = useMemo(() => ({ start: startOfMonth(currentDate), end: endOfMonth(currentDate) }), [currentDate]);
  const monthLabel = format(currentDate, "MMMM yyyy");
  const isToday = format(currentDate, "yyyy-MM") === format(new Date(), "yyyy-MM");

  const salary = parseFloat(salaryInput) || 0;

  const { data: transactions = [], isLoading: txLoading } = useTransactions();
  const { data: goals = [], isLoading: goalLoading } = useInvestmentGoals();
  const { format: formatCurrency } = useCurrencyConverter();

  const handleMonthChange = (dir: "prev" | "next") => {
    const next = dir === "prev" ? subMonths(currentDate, 1) : addMonths(currentDate, 1);
    setCurrentDate(next);
    setSalaryInput(localStorage.getItem(getSalaryKey(next)) ?? "");
  };

  const handleSalaryChange = (v: string) => {
    setSalaryInput(v);
    localStorage.setItem(getSalaryKey(currentDate), v);
  };

  const monthTransactions = useMemo(() => transactions.filter((tx) => isWithinInterval(firestoreToDate(tx.date), monthRange)), [transactions, monthRange]);

  const totalActualExpenses = useMemo(
    () => monthTransactions.filter((tx) => tx.type === "expense" && !tx.isInvestmentTransaction && !tx.isGoalTransaction).reduce((s, tx) => s + Math.abs(tx.amount), 0),
    [monthTransactions],
  );

  const totalInvestmentDeposits = useMemo(
    () => monthTransactions.filter((tx) => tx.isInvestmentTransaction && !tx.isGoalTransaction && tx.contributionType === "deposit").reduce((s, tx) => s + tx.amount, 0),
    [monthTransactions],
  );

  // All active non-completed goals
  const activeGoals = useMemo(
    () =>
      goals
        .filter((g) => !g.isCompleted && g.isActive)
        .sort((a, b) => {
          if (a.goalType === "targeted" && b.goalType !== "targeted") return -1;
          if (a.goalType !== "targeted" && b.goalType === "targeted") return 1;
          if (a.deadline && !b.deadline) return -1;
          if (!a.deadline && b.deadline) return 1;
          return 0;
        }),
    [goals],
  );

  // Total monthly needed across all active targeted goals
  const totalMonthlyGoalsNeeded = useMemo(() => activeGoals.filter((g) => g.goalType === "targeted").reduce((s, g) => s + (g.monthlyRequired ?? 0), 0), [activeGoals]);

  // Free to spend = salary - expenses - what goals need - investments
  const freeToSpend = salary - totalActualExpenses - totalMonthlyGoalsNeeded - totalInvestmentDeposits;

  const pct = (v: number) => (salary > 0 ? Math.min(100, Math.round((v / salary) * 100)) : 0);

  const isLoading = txLoading || goalLoading;

  if (isLoading) {
    return (
      <div className="d-flex justify-content-center align-items-center" style={{ minHeight: 300 }}>
        <Spinner color="primary" />
      </div>
    );
  }

  const bars = [
    { label: "Expenses", value: totalActualExpenses, color: "#EF4444" },
    { label: "Goal savings needed", value: totalMonthlyGoalsNeeded, color: "#F59E0B" },
    { label: "Investments", value: totalInvestmentDeposits, color: "#818CF8" },
    { label: "Free to spend", value: Math.max(0, freeToSpend), color: "#22C55E" },
  ];

  const metricCards = [
    { label: "Expected income", value: formatCurrency(salary), color: "#22C55E" },
    { label: "Expenses so far", value: formatCurrency(totalActualExpenses), color: "#EF4444" },
    { label: "Goals needed", value: formatCurrency(totalMonthlyGoalsNeeded), color: "#F59E0B" },
    { label: "Invested", value: formatCurrency(totalInvestmentDeposits), color: "#818CF8" },
    { label: "Free to spend", value: formatCurrency(Math.max(0, freeToSpend)), color: freeToSpend >= 0 ? "#22C55E" : "#EF4444" },
  ];

  return (
    <Container fluid className="py-2">
      {/* Header */}
      <div className="d-flex justify-content-between align-items-start mb-4 flex-wrap gap-3">
        <div>
          <h5 style={{ fontWeight: 600, margin: 0, color: "var(--color-text-primary)" }}>Monthly Planner</h5>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 4 }}>
            <button style={navBtn} onClick={() => handleMonthChange("prev")}>
              &lsaquo;
            </button>
            <span style={{ fontSize: 13, color: "var(--color-text-secondary)", minWidth: 110, textAlign: "center" }}>{monthLabel}</span>
            <button style={navBtn} onClick={() => handleMonthChange("next")}>
              &rsaquo;
            </button>
            {!isToday && (
              <button
                onClick={() => {
                  setCurrentDate(new Date());
                  setSalaryInput(localStorage.getItem(getSalaryKey(new Date())) ?? "");
                }}
                style={{ ...navBtn, fontSize: 12, padding: "4px 8px" }}
              >
                Today
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Salary input */}
      <Card className="border-0 shadow-sm mb-3">
        <CardBody className="py-3">
          <Row className="align-items-center g-2">
            <Col md={4}>
              <p style={{ fontSize: 13, fontWeight: 500, margin: "0 0 2px", color: "var(--color-text-primary)" }}>Expected income this month</p>
              <p style={{ fontSize: 12, color: "var(--color-text-secondary)", margin: 0 }}>Salary, bonuses, or any extra income</p>
            </Col>
            <Col md={3}>
              <InputGroup size="sm">
                <InputGroupText>€</InputGroupText>
                <Input type="number" placeholder="e.g. 3200" value={salaryInput} onChange={(e) => handleSalaryChange(e.target.value)} min={0} />
              </InputGroup>
            </Col>
          </Row>
        </CardBody>
      </Card>

      {/* Metric cards */}
      <Row className="g-3 mb-3">
        {metricCards.map((m) => (
          <Col xs={6} lg key={m.label}>
            <Card className="text-center border-0 shadow-sm">
              <CardBody>
                <div style={{ background: "var(--color-background-secondary)", borderRadius: "var(--border-radius-md)", padding: "10px" }}>
                  <p style={{ fontSize: 11, color: "var(--color-text-secondary)", fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>
                    {m.label}
                  </p>
                  <p style={{ fontSize: 18, fontWeight: 500, color: m.color, margin: 0 }}>{m.value}</p>
                </div>
              </CardBody>
            </Card>
          </Col>
        ))}
      </Row>

      <Row className="g-3">
        {/* Allocation bars */}
        <Col lg={8}>
          <Card className="border-0 shadow-sm h-100">
            <CardBody>
              <p style={{ fontWeight: 500, fontSize: 14, margin: "0 0 4px" }}>Allocation breakdown</p>
              <p style={{ fontSize: 12, color: "var(--color-text-secondary)", margin: "0 0 1.25rem" }}>How your income should be distributed this month</p>

              {salary === 0 ? (
                <div style={{ textAlign: "center", padding: "2rem 0", color: "var(--color-text-secondary)", fontSize: 13 }}>
                  Enter your expected income above to see the breakdown.
                </div>
              ) : (
                bars.map((item) => (
                  <div key={item.label} style={{ marginBottom: 18 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5 }}>
                      <span style={{ fontSize: 13, color: "var(--color-text-primary)" }}>{item.label}</span>
                      <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                        <span style={{ fontSize: 13, fontWeight: 500, color: "var(--color-text-primary)" }}>{formatCurrency(item.value)}</span>
                        <span style={{ fontSize: 11, color: "var(--color-text-secondary)", minWidth: 32, textAlign: "right" }}>{pct(item.value)}%</span>
                      </div>
                    </div>
                    <div style={{ height: 8, background: "var(--color-background-secondary)", borderRadius: 4, overflow: "hidden" }}>
                      <div style={{ width: `${pct(item.value)}%`, height: "100%", background: item.color, borderRadius: 4, transition: "width 0.4s ease" }} />
                    </div>
                  </div>
                ))
              )}
            </CardBody>
          </Card>
        </Col>

        {/* Right column */}
        <Col lg={4}>
          <div style={{ display: "flex", flexDirection: "column", gap: 12, height: "100%" }}>
            {/* Active goals */}
            <Card className="border-0 shadow-sm" style={{ flex: 1, minHeight: 0 }}>
              <CardBody style={{ overflowY: "auto" }}>
                <p style={{ fontWeight: 500, fontSize: 14, margin: "0 0 4px" }}>Active goals</p>
                <p style={{ fontSize: 12, color: "var(--color-text-secondary)", margin: "0 0 1rem" }}>Monthly amount needed per goal</p>
                {activeGoals.length === 0 ? (
                  <p style={{ fontSize: 13, color: "var(--color-text-secondary)", textAlign: "center", padding: "1rem 0", margin: 0 }}>No active goals.</p>
                ) : (
                  activeGoals.map((g) => {
                    const needed = g.goalType === "targeted" ? (g.monthlyRequired ?? 0) : null;
                    return (
                      <div key={g.id} style={{ padding: "8px 0", borderBottom: "0.5px solid var(--color-border-tertiary)" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                          <span style={{ fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "60%" }}>
                            {g.icon} {g.name}
                          </span>
                          <span style={{ fontSize: 13, fontWeight: 500, color: "#F59E0B", flexShrink: 0 }}>{needed != null ? formatCurrency(needed) : "—"}</span>
                        </div>
                        {g.goalType === "open_ended" && (
                          <span style={{ fontSize: 10, color: "var(--color-text-secondary)", marginTop: 2, display: "block" }}>
                            Open-ended · total saved {formatCurrency(g.totalSaved)}
                          </span>
                        )}
                        {g.goalType === "targeted" && g.deadline && (
                          <span style={{ fontSize: 10, color: "var(--color-text-secondary)", marginTop: 2, display: "block" }}>
                            Deadline {format(firestoreToDate(g.deadline), "dd MMM yyyy")}
                          </span>
                        )}
                      </div>
                    );
                  })
                )}
              </CardBody>
            </Card>

            {/* Free to spend callout */}
            <Card className="border-0 shadow-sm" style={{ background: freeToSpend >= 0 ? "rgba(34,197,94,0.07)" : "rgba(239,68,68,0.07)" }}>
              <CardBody>
                <p style={{ fontSize: 13, color: "var(--color-text-secondary)", margin: "0 0 4px" }}>{freeToSpend >= 0 ? "You can still spend" : "You are over budget by"}</p>
                <p style={{ fontSize: 28, fontWeight: 500, color: freeToSpend >= 0 ? "#22C55E" : "#EF4444", margin: 0 }}>{formatCurrency(Math.abs(freeToSpend))}</p>
                {freeToSpend < 0 && <p style={{ fontSize: 12, color: "#EF4444", margin: "4px 0 0" }}>Consider reducing expenses or adjusting your goals.</p>}
              </CardBody>
            </Card>
          </div>
        </Col>
      </Row>
    </Container>
  );
}
