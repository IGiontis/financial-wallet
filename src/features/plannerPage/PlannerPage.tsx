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

  const totalMonthlyGoalsNeeded = useMemo(() => activeGoals.filter((g) => g.goalType === "targeted").reduce((s, g) => s + (g.monthlyRequired ?? 0), 0), [activeGoals]);

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

  const metricCards = [
    { label: "Income", value: formatCurrency(salary), color: "#22C55E" },
    { label: "Expenses", value: formatCurrency(totalActualExpenses), color: "#EF4444" },
    { label: "Goals needed", value: formatCurrency(totalMonthlyGoalsNeeded), color: "#F59E0B" },
    { label: "Invested", value: formatCurrency(totalInvestmentDeposits), color: "#818CF8" },
    { label: "Free to spend", value: formatCurrency(Math.max(0, freeToSpend)), color: freeToSpend >= 0 ? "#22C55E" : "#EF4444" },
  ];

  const bars = [
    { label: "Expenses", value: totalActualExpenses, color: "#EF4444" },
    { label: "Goals needed", value: totalMonthlyGoalsNeeded, color: "#F59E0B" },
    { label: "Investments", value: totalInvestmentDeposits, color: "#818CF8" },
    { label: "Free to spend", value: Math.max(0, freeToSpend), color: "#22C55E" },
  ];

  const navBtnStyle: React.CSSProperties = {
    background: "var(--color-background-primary)",
    border: "0.5px solid var(--color-border-secondary)",
    borderRadius: 6,
    cursor: "pointer",
    fontSize: 16,
    lineHeight: 1,
    color: "var(--color-text-primary)",
    padding: "3px 10px",
    boxShadow: "0 1px 2px rgba(0,0,0,0.06)",
  };

  return (
    <Container fluid className="py-2">
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, flexWrap: "wrap", gap: 8 }}>
        <div>
          <h5 style={{ fontWeight: 600, margin: 0, color: "var(--color-text-primary)" }}>Monthly Planner</h5>
          <p style={{ fontSize: 12, color: "var(--color-text-secondary)", margin: 0 }}>Plan your spending for the month</p>
        </div>

        {/* Month picker — styled as a pill */}
        <Card className="border-0 shadow-sm" style={{ display: "inline-flex" }}>
          <CardBody className="py-2 px-2" style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <button style={navBtnStyle} onClick={() => handleMonthChange("prev")}>
              &lsaquo;
            </button>
            <span style={{ fontSize: 13, fontWeight: 500, color: "var(--color-text-primary)", minWidth: 100, textAlign: "center" }}>{monthLabel}</span>
            <button style={navBtnStyle} onClick={() => handleMonthChange("next")}>
              &rsaquo;
            </button>
            {!isToday && (
              <button
                onClick={() => {
                  setCurrentDate(new Date());
                  setSalaryInput(localStorage.getItem(getSalaryKey(new Date())) ?? "");
                }}
                style={{ ...navBtnStyle, fontSize: 11, padding: "3px 8px", marginLeft: 2 }}
              >
                Today
              </button>
            )}
          </CardBody>
        </Card>
      </div>

      {/* Salary input */}
      <Card className="border-0 shadow-sm mb-3">
        <CardBody className="py-3 px-3">
          <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            <div style={{ flex: 1, minWidth: 160 }}>
              <p style={{ fontSize: 13, fontWeight: 500, margin: "0 0 1px", color: "var(--color-text-primary)" }}>Expected income this month</p>
              <p style={{ fontSize: 11, color: "var(--color-text-secondary)", margin: 0 }}>Salary, bonuses, or any extra income</p>
            </div>
            <div style={{ width: 160, flexShrink: 0 }}>
              <InputGroup size="sm">
                <InputGroupText>€</InputGroupText>
                <Input type="number" placeholder="e.g. 3200" value={salaryInput} onChange={(e) => handleSalaryChange(e.target.value)} min={0} />
              </InputGroup>
            </div>
          </div>
        </CardBody>
      </Card>

      {/* Metric cards */}
      <Row className="g-2 mb-3">
        {metricCards.map((m) => (
          <Col xs={6} sm={4} md key={m.label}>
            <Card className="border-0 shadow-sm h-100">
              <CardBody className="p-3">
                <p style={{ fontSize: 10, color: "var(--color-text-secondary)", fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.06em", margin: "0 0 6px" }}>
                  {m.label}
                </p>
                <p style={{ fontSize: 17, fontWeight: 500, color: m.color, margin: 0 }}>{m.value}</p>
              </CardBody>
            </Card>
          </Col>
        ))}
      </Row>

      {/* Bars + Goals */}
      <Row className="g-3">
        <Col lg={8}>
          <Card className="border-0 shadow-sm h-100">
            <CardBody className="p-3">
              <p style={{ fontWeight: 500, fontSize: 13, margin: "0 0 2px", color: "var(--color-text-primary)" }}>Allocation breakdown</p>
              <p style={{ fontSize: 11, color: "var(--color-text-secondary)", margin: "0 0 16px" }}>How your income is distributed this month</p>

              {salary === 0 ? (
                <div style={{ textAlign: "center", padding: "2rem 0", color: "var(--color-text-secondary)", fontSize: 13 }}>
                  Enter your expected income above to see the breakdown.
                </div>
              ) : (
                <>
                  {bars.map((item) => (
                    <div key={item.label} style={{ marginBottom: 14 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                        <span style={{ fontSize: 12, color: "var(--color-text-primary)" }}>{item.label}</span>
                        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                          <span style={{ fontSize: 12, fontWeight: 500, color: "var(--color-text-primary)" }}>{formatCurrency(item.value)}</span>
                          <span style={{ fontSize: 10, color: "var(--color-text-secondary)", minWidth: 28, textAlign: "right" }}>{pct(item.value)}%</span>
                        </div>
                      </div>
                      <div style={{ height: 6, background: "var(--color-background-secondary)", borderRadius: 3, overflow: "hidden" }}>
                        <div style={{ width: `${pct(item.value)}%`, height: "100%", background: item.color, borderRadius: 3, transition: "width 0.4s ease" }} />
                      </div>
                    </div>
                  ))}

                  <div
                    style={{
                      marginTop: 16,
                      padding: "10px 14px",
                      background: freeToSpend >= 0 ? "rgba(34,197,94,0.07)" : "rgba(239,68,68,0.07)",
                      border: `0.5px solid ${freeToSpend >= 0 ? "rgba(34,197,94,0.2)" : "rgba(239,68,68,0.2)"}`,
                      borderRadius: "var(--border-radius-md)",
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                    }}
                  >
                    <p style={{ fontSize: 12, color: "var(--color-text-secondary)", margin: 0 }}>{freeToSpend >= 0 ? "You can still spend" : "You are over budget by"}</p>
                    <div style={{ textAlign: "right" }}>
                      <p style={{ fontSize: 20, fontWeight: 500, color: freeToSpend >= 0 ? "#22C55E" : "#EF4444", margin: 0 }}>{formatCurrency(Math.abs(freeToSpend))}</p>
                      {freeToSpend < 0 && <p style={{ fontSize: 11, color: "#EF4444", margin: "2px 0 0" }}>Consider reducing expenses or adjusting your goals.</p>}
                    </div>
                  </div>
                </>
              )}
            </CardBody>
          </Card>
        </Col>

        <Col lg={4}>
          <Card className="border-0 shadow-sm h-100">
            <CardBody className="p-3" style={{ overflowY: "auto" }}>
              <p style={{ fontWeight: 500, fontSize: 13, margin: "0 0 2px", color: "var(--color-text-primary)" }}>Active goals</p>
              <p style={{ fontSize: 11, color: "var(--color-text-secondary)", margin: "0 0 14px" }}>Monthly amount needed per goal</p>

              {activeGoals.length === 0 ? (
                <p style={{ fontSize: 13, color: "var(--color-text-secondary)", textAlign: "center", padding: "1rem 0", margin: 0 }}>No active goals.</p>
              ) : (
                activeGoals.map((g) => {
                  const needed = g.goalType === "targeted" ? (g.monthlyRequired ?? 0) : null;
                  return (
                    <div key={g.id} style={{ padding: "7px 0", borderBottom: "0.5px solid var(--color-border-tertiary)" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <span style={{ fontSize: 12, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "65%" }}>
                          {g.icon} {g.name}
                        </span>
                        <span style={{ fontSize: 12, fontWeight: 500, color: "#F59E0B", flexShrink: 0 }}>{needed != null ? formatCurrency(needed) : "—"}</span>
                      </div>
                      {g.goalType === "open_ended" && (
                        <span style={{ fontSize: 10, color: "var(--color-text-secondary)", marginTop: 1, display: "block" }}>
                          Open-ended · saved {formatCurrency(g.totalSaved)}
                        </span>
                      )}
                      {g.goalType === "targeted" && g.deadline && (
                        <span style={{ fontSize: 10, color: "var(--color-text-secondary)", marginTop: 1, display: "block" }}>
                          Deadline {format(firestoreToDate(g.deadline), "dd MMM yyyy")}
                        </span>
                      )}
                    </div>
                  );
                })
              )}
            </CardBody>
          </Card>
        </Col>
      </Row>
    </Container>
  );
}
