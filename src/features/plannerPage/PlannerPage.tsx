import { useState, useMemo } from "react";
import { Container, Row, Col, Card, CardBody, Input, InputGroup, InputGroupText, Spinner } from "reactstrap";
import { startOfMonth, endOfMonth, isWithinInterval, format, addMonths, subMonths } from "date-fns";
import { useTransactions } from "../transactions/hooks/useTransactions";
import { useInvestmentGoals } from "../budget/useInvestments";
import { useCurrencyConverter } from "../../shared/hooks/useCurrencyConverter";
import type { InvestmentGoalWithStats } from "../../shared/types/IndexTypes";

function firestoreToDate(value: any): Date {
  if (!value) return new Date();
  if (value instanceof Date) return value;
  if (value?.seconds) return new Date(value.seconds * 1000);
  return new Date(value);
}

function getSalaryKey(date: Date): string {
  return `planner-salary-${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function getDisabledGoalsKey(date: Date): string {
  return `planner-disabled-${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function loadDisabledGoals(date: Date): Set<string> {
  try {
    const raw = localStorage.getItem(getDisabledGoalsKey(date));
    return raw ? new Set(JSON.parse(raw)) : new Set();
  } catch {
    return new Set();
  }
}

function saveDisabledGoals(date: Date, ids: Set<string>) {
  localStorage.setItem(getDisabledGoalsKey(date), JSON.stringify([...ids]));
}

const isRecurring = (g: InvestmentGoalWithStats) => g.targetPeriod === "monthly" || g.targetPeriod === "yearly";
const isSavingsGoal = (g: InvestmentGoalWithStats) => g.goalType === "targeted" && !isRecurring(g);
const isInvestmentGoal = (g: InvestmentGoalWithStats) => isRecurring(g) || g.goalType === "open_ended";

function getMonthlyNeeded(g: InvestmentGoalWithStats): number {
  if (g.goalType === "open_ended") return 0;
  if (g.status === "ahead") return 0;
  if (g.targetPeriod === "monthly") return g.remaining ?? 0;
  if (g.targetPeriod === "yearly") return (g.yearlyRequired ?? 0) / 12;
  return g.monthlyRequired ?? 0;
}

function Toggle({ enabled, onToggle, size = "md" }: { enabled: boolean; onToggle: () => void; size?: "sm" | "md" }) {
  const w = size === "sm" ? 28 : 32;
  const h = size === "sm" ? 16 : 18;
  const thumb = size === "sm" ? 10 : 12;
  return (
    <div
      onClick={(e) => {
        e.stopPropagation();
        onToggle();
      }}
      style={{
        width: w,
        height: h,
        borderRadius: h / 2,
        background: enabled ? "#22C55E" : "#373a41",
        cursor: "pointer",
        position: "relative",
        transition: "background 0.2s",
        flexShrink: 0,
      }}
    >
      <div
        style={{
          position: "absolute",
          top: (h - thumb) / 2,
          left: enabled ? w - thumb - 2 : 2,
          width: thumb,
          height: thumb,
          borderRadius: "50%",
          background: "#fff",
          transition: "left 0.2s",
          boxShadow: "0 1px 2px rgba(0,0,0,0.2)",
        }}
      />
    </div>
  );
}

export function PlannerPage() {
  const [currentDate, setCurrentDate] = useState(() => new Date());
  const [salaryInput, setSalaryInput] = useState<string>(() => localStorage.getItem(getSalaryKey(new Date())) ?? "");
  const [disabledGoals, setDisabledGoals] = useState<Set<string>>(() => loadDisabledGoals(new Date()));

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
    setDisabledGoals(loadDisabledGoals(next));
  };

  const handleSalaryChange = (v: string) => {
    setSalaryInput(v);
    localStorage.setItem(getSalaryKey(currentDate), v);
  };

  const toggleGoal = (id: string) => {
    setDisabledGoals((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      saveDisabledGoals(currentDate, next);
      return next;
    });
  };

  const monthTransactions = useMemo(() => transactions.filter((tx) => isWithinInterval(firestoreToDate(tx.date), monthRange)), [transactions, monthRange]);

  const totalActualExpenses = useMemo(
    () => monthTransactions.filter((tx) => tx.type === "expense" && !tx.isInvestmentTransaction && !tx.isGoalTransaction).reduce((s, tx) => s + Math.abs(tx.amount), 0),
    [monthTransactions],
  );

  const activeGoals = useMemo(() => goals.filter((g) => g.isActive && !g.isCompleted), [goals]);

  const activeInvestmentGoals = useMemo(
    () =>
      goals
        .filter(
          (g) =>
            isInvestmentGoal(g) && (isRecurring(g) ? g.isActive : g.isActive && !g.isCompleted) && g.status !== "ahead" && g.status !== "on_track" && g.goalType !== "open_ended",
        )
        .sort((a, b) => a.name.localeCompare(b.name)),
    [goals],
  );
  const activeSavingsGoals = useMemo(
    () =>
      activeGoals
        .filter((g) => isSavingsGoal(g) && g.status !== "ahead")
        .sort((a, b) => {
          if (a.deadline && !b.deadline) return -1;
          if (!a.deadline && b.deadline) return 1;
          return 0;
        }),
    [activeGoals],
  );

  const allSavingsEnabled = activeSavingsGoals.length > 0 && activeSavingsGoals.every((g) => !disabledGoals.has(g.id));
  const allInvestmentsEnabled = activeInvestmentGoals.length > 0 && activeInvestmentGoals.every((g) => !disabledGoals.has(g.id));

  const toggleAllSavings = () => {
    setDisabledGoals((prev) => {
      const next = new Set(prev);
      if (allSavingsEnabled) activeSavingsGoals.forEach((g) => next.add(g.id));
      else activeSavingsGoals.forEach((g) => next.delete(g.id));
      saveDisabledGoals(currentDate, next);
      return next;
    });
  };

  const toggleAllInvestments = () => {
    setDisabledGoals((prev) => {
      const next = new Set(prev);
      if (allInvestmentsEnabled) activeInvestmentGoals.forEach((g) => next.add(g.id));
      else activeInvestmentGoals.forEach((g) => next.delete(g.id));
      saveDisabledGoals(currentDate, next);
      return next;
    });
  };

  const totalGoalsNeeded = useMemo(
    () => activeSavingsGoals.filter((g) => !disabledGoals.has(g.id)).reduce((s, g) => s + getMonthlyNeeded(g), 0),
    [activeSavingsGoals, disabledGoals],
  );

  const totalInvestmentsNeeded = useMemo(
    () => activeInvestmentGoals.filter((g) => !disabledGoals.has(g.id)).reduce((s, g) => s + getMonthlyNeeded(g), 0),
    [activeInvestmentGoals, disabledGoals],
  );

  const freeToSpend = salary - totalActualExpenses - totalGoalsNeeded - totalInvestmentsNeeded;
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
    { label: "Income", value: formatCurrency(salary), color: "#22C55E", toggle: null },
    { label: "Expenses", value: formatCurrency(totalActualExpenses), color: "#EF4444", toggle: null },
    {
      label: "Goals needed",
      value: formatCurrency(totalGoalsNeeded),
      color: allSavingsEnabled ? "#F59E0B" : "var(--color-text-secondary)",
      toggle: activeSavingsGoals.length > 0 ? { enabled: allSavingsEnabled, onToggle: toggleAllSavings } : null,
    },
    {
      label: "Investments needed",
      value: formatCurrency(totalInvestmentsNeeded),
      color: allInvestmentsEnabled ? "#818CF8" : "var(--color-text-secondary)",
      toggle: activeInvestmentGoals.length > 0 ? { enabled: allInvestmentsEnabled, onToggle: toggleAllInvestments } : null,
    },
    { label: "Free to spend", value: formatCurrency(Math.max(0, freeToSpend)), color: freeToSpend >= 0 ? "#22C55E" : "#EF4444", toggle: null },
  ];

  const bars = [
    { label: "Expenses", value: totalActualExpenses, color: "#EF4444" },
    { label: "Goals needed", value: totalGoalsNeeded, color: "#F59E0B" },
    { label: "Investments needed", value: totalInvestmentsNeeded, color: "#818CF8" },
    { label: "Free to spend", value: Math.max(0, freeToSpend), color: "#22C55E" },
  ];

  const navBtnStyle: React.CSSProperties = {
    background: "none",
    border: "none",
    borderRadius: 6,
    cursor: "pointer",
    fontSize: 16,
    lineHeight: 1,
    color: "var(--color-text-primary)",
    padding: "3px 10px",
  };

  const GoalList = ({ items, emptyText }: { items: InvestmentGoalWithStats[]; emptyText: string }) => (
    <>
      {items.length === 0 ? (
        <p style={{ fontSize: 12, color: "var(--color-text-secondary)", textAlign: "center", padding: "0.5rem 0", margin: 0 }}>{emptyText}</p>
      ) : (
        items.map((g) => {
          const enabled = !disabledGoals.has(g.id);
          const needed = getMonthlyNeeded(g);
          return (
            <div key={g.id} style={{ padding: "8px 0", borderBottom: "0.5px solid var(--color-border-tertiary)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                <span
                  style={{
                    fontSize: 12,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                    flex: 1,
                    minWidth: 0,
                    color: enabled ? "var(--color-text-primary)" : "var(--color-text-secondary)",
                    textDecoration: enabled ? "none" : "line-through",
                  }}
                >
                  {g.icon} {g.name}
                </span>
                <span style={{ fontSize: 12, fontWeight: 500, flexShrink: 0, color: !enabled ? "var(--color-text-secondary)" : needed === 0 ? "#22C55E" : "#F59E0B" }}>
                  {!enabled ? "Off" : needed === 0 ? "Ahead" : formatCurrency(needed)}
                </span>
                <Toggle enabled={enabled} onToggle={() => toggleGoal(g.id)} size="sm" />
              </div>
              {enabled && (
                <div style={{ display: "flex", gap: 6, marginTop: 3, flexWrap: "wrap" }}>
                  {g.status && (
                    <span style={{ fontSize: 10, color: g.status === "ahead" ? "#22C55E" : g.status === "behind" ? "#EF4444" : "var(--color-text-secondary)" }}>
                      {g.status === "ahead" ? "Ahead" : g.status === "behind" ? "Behind" : "On track"}
                    </span>
                  )}
                  {g.goalType === "targeted" && g.deadline && (
                    <span style={{ fontSize: 10, color: "var(--color-text-secondary)" }}>· deadline {format(firestoreToDate(g.deadline), "dd MMM yyyy")}</span>
                  )}
                  {g.targetPeriod === "monthly" && (
                    <span style={{ fontSize: 10, color: "var(--color-text-secondary)" }}>· monthly target {formatCurrency(g.targetAmount ?? 0)}</span>
                  )}
                  {g.targetPeriod === "yearly" && <span style={{ fontSize: 10, color: "var(--color-text-secondary)" }}>· yearly target {formatCurrency(g.targetAmount ?? 0)}</span>}
                  {g.goalType === "open_ended" && <span style={{ fontSize: 10, color: "var(--color-text-secondary)" }}>· saved {formatCurrency(g.totalSaved)}</span>}
                </div>
              )}
            </div>
          );
        })
      )}
    </>
  );

  return (
    <Container fluid className="py-2">
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, flexWrap: "wrap", gap: 8 }}>
        <div>
          <h5 style={{ fontWeight: 600, margin: 0, color: "var(--color-text-primary)" }}>Monthly Planner</h5>
          <p style={{ fontSize: 12, color: "var(--color-text-secondary)", margin: 0 }}>Plan your spending for the month</p>
        </div>
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
                  setDisabledGoals(loadDisabledGoals(new Date()));
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
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 6 }}>
                  <p style={{ fontSize: 10, color: "var(--color-text-secondary)", fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.06em", margin: 0 }}>{m.label}</p>
                  {m.toggle && <Toggle enabled={m.toggle.enabled} onToggle={m.toggle.onToggle} size="sm" />}
                </div>
                <p style={{ fontSize: 17, fontWeight: 500, color: m.color, margin: 0 }}>{m.value}</p>
              </CardBody>
            </Card>
          </Col>
        ))}
      </Row>

      {/* Bars + Goals + Investments — no h-100 on bars card so it only takes natural height */}
      <Row className="g-3 align-items-start">
        <Col lg={8}>
          <Card className="border-0 shadow-sm">
            <CardBody className="p-3">
              <p style={{ fontWeight: 500, fontSize: 13, margin: "0 0 2px", color: "var(--color-text-primary)" }}>Allocation breakdown</p>
              <p style={{ fontSize: 11, color: "var(--color-text-secondary)", margin: "0 0 16px" }}>How your income should be distributed this month</p>

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
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <Card className="border-0 shadow-sm">
              <CardBody className="p-3">
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 2 }}>
                  <p style={{ fontWeight: 500, fontSize: 13, margin: 0, color: "var(--color-text-primary)" }}>Savings goals</p>
                  {activeSavingsGoals.length > 0 && <Toggle enabled={allSavingsEnabled} onToggle={toggleAllSavings} size="sm" />}
                </div>
                <p style={{ fontSize: 11, color: "var(--color-text-secondary)", margin: "0 0 10px" }}>Adjusted monthly needed</p>
                <GoalList items={activeSavingsGoals} emptyText="No active savings goals." />
              </CardBody>
            </Card>

            <Card className="border-0 shadow-sm">
              <CardBody className="p-3">
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 2 }}>
                  <p style={{ fontWeight: 500, fontSize: 13, margin: 0, color: "var(--color-text-primary)" }}>Investments</p>
                  {activeInvestmentGoals.length > 0 && <Toggle enabled={allInvestmentsEnabled} onToggle={toggleAllInvestments} size="sm" />}
                </div>
                <p style={{ fontSize: 11, color: "var(--color-text-secondary)", margin: "0 0 10px" }}>Adjusted monthly needed</p>
                <GoalList items={activeInvestmentGoals} emptyText="No active investments." />
              </CardBody>
            </Card>
          </div>
        </Col>
      </Row>
    </Container>
  );
}
