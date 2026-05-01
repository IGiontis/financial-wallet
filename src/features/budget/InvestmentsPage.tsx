// features/budget/InvestmentsPage.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Recurring + open-ended tracking goals.
// Tabs: All · Recurring · Tracking · Paused · Completed
//
// File location: src/features/budget/InvestmentsPage.tsx
// ─────────────────────────────────────────────────────────────────────────────

import { useState } from "react";
import { Alert, Badge, Button, Col, Container, Input, Nav, NavItem, NavLink, Row, Spinner } from "reactstrap";
import type { CreateInvestmentContributionDTO, CreateInvestmentGoalDTO, InvestmentGoalWithStats, UpdateInvestmentGoalDTO } from "../../shared/types/IndexTypes";
import { GoalCard, DeleteConfirmModal, HistoryModal } from "./components/InvestmentsShared";
import AddDepositModal from "./AddDepositModal";
import WithdrawModal from "./WithdrawModal";
import AddNewGoalModal from "./AddNewGoalModal";
import EditGoalModal from "./EditGoalModal";
import { useCurrencyConverter } from "../../shared/hooks/useCurrencyConverter";
import { useInvestmentGoals, useCreateGoal, useAddContribution, useDeleteGoal, useUpdateGoal } from "./useInvestments";

// ─── Types ────────────────────────────────────────────────────────────────────

type InvestmentsFilterTab = "all" | "recurring" | "tracking" | "paused";

const TAB_LABELS: Record<InvestmentsFilterTab, string> = {
  all: "All",
  recurring: "Recurring",
  tracking: "Tracking",
  paused: "Paused",
};

// ─── Scope helpers ────────────────────────────────────────────────────────────

const isRecurring = (g: InvestmentGoalWithStats) => g.targetPeriod === "monthly" || g.targetPeriod === "yearly";
const isTracking = (g: InvestmentGoalWithStats) => g.goalType === "open_ended";
const belongsHere = (g: InvestmentGoalWithStats) => isRecurring(g) || isTracking(g);

const effectivelyActive = (g: InvestmentGoalWithStats) => (isRecurring(g) ? g.isActive : g.isActive && !g.isCompleted);

// ─── InvestmentsSummaryCards ──────────────────────────────────────────────────

function InvestmentsSummaryCards({ goals, formatCurrency }: { goals: InvestmentGoalWithStats[]; formatCurrency: (n: number) => string }) {
  const mine = goals.filter(belongsHere);
  const active = mine.filter(effectivelyActive);

  const totalSaved = mine.reduce((s, g) => s + g.totalSaved, 0);

  // ── Monthly effective totals ───────────────────────────────────────────────
  const activeMonthly = mine.filter((g) => g.targetPeriod === "monthly" && effectivelyActive(g));

  const monthlyTotalDue = activeMonthly.reduce((s, g) => {
    const credit = g.periodCredit ?? 0;
    const arrears = g.arrears ?? 0;
    return s + Math.max((g.targetAmount ?? 0) - credit, 0) + arrears;
  }, 0);
  const monthlyTotalRemaining = activeMonthly.reduce((s, g) => s + (g.remaining ?? 0), 0);
  const monthlyEffectivePaid = Math.max(monthlyTotalDue - monthlyTotalRemaining, 0);

  // ── Yearly effective totals ────────────────────────────────────────────────
  const activeYearly = mine.filter((g) => g.targetPeriod === "yearly" && effectivelyActive(g));

  const yearlyTotalDue = activeYearly.reduce((s, g) => {
    const credit = g.periodCredit ?? 0;
    const arrears = g.arrears ?? 0;
    return s + Math.max((g.targetAmount ?? 0) - credit, 0) + arrears;
  }, 0);
  const yearlyTotalRemaining = activeYearly.reduce((s, g) => s + (g.remaining ?? 0), 0);
  const yearlyEffectivePaid = Math.max(yearlyTotalDue - yearlyTotalRemaining, 0);

  // ── Behind / ahead aggregates ─────────────────────────────────────────────
  const recurringActive = active.filter(isRecurring);

  const behindGoals = recurringActive.filter((g) => g.status === "behind");
  const aheadGoals = recurringActive.filter((g) => g.status === "ahead");
  const totalBehind = behindGoals.reduce((s, g) => s + (g.remaining ?? 0), 0);
  const totalAheadBuffer = aheadGoals.reduce((s, g) => s + (g.periodSurplus ?? 0), 0);
  const netPosition = totalAheadBuffer - totalBehind;

  const recurringCount = recurringActive.length;

  // ── Labels ─────────────────────────────────────────────────────────────────
  const monthlyLabel = activeMonthly.length === 0 ? "—" : monthlyTotalDue === 0 ? "All covered ✓" : `${formatCurrency(monthlyEffectivePaid)} / ${formatCurrency(monthlyTotalDue)}`;

  const yearlyLabel = activeYearly.length === 0 ? "—" : yearlyTotalDue === 0 ? "All covered ✓" : `${formatCurrency(yearlyEffectivePaid)} / ${formatCurrency(yearlyTotalDue)}`;

  // ── Card definitions ───────────────────────────────────────────────────────
  type SummaryCard = { label: string; value: string; sub: string; accent: string; icon: string; small: boolean };

  const cards: SummaryCard[] = [
    {
      label: "Total saved",
      value: formatCurrency(totalSaved),
      sub: "all-time across all",
      accent: "#10B981",
      icon: "📈",
      small: false,
    },
    {
      label: "Monthly target",
      value: monthlyLabel,
      sub: monthlyTotalDue === 0 && activeMonthly.length > 0 ? "credit covers this month" : "paid this month",
      accent: monthlyTotalDue === 0 && activeMonthly.length > 0 ? "#059669" : "#3B82F6",
      icon: "📅",
      small: monthlyTotalDue > 0,
    },
    {
      label: "Recurring",
      value: String(recurringCount),
      sub: recurringCount === 1 ? "active goal" : "active goals",
      accent: "#6366F1",
      icon: "🔁",
      small: false,
    },
    {
      label: "Yearly target",
      value: yearlyLabel,
      sub: yearlyTotalDue === 0 && activeYearly.length > 0 ? "credit covers this year" : "paid this year",
      accent: yearlyTotalDue === 0 && activeYearly.length > 0 ? "#059669" : "#F59E0B",
      icon: "📆",
      small: yearlyTotalDue > 0,
    },
  ];

  // Show a single net status card.
  // Net = (surplus across ahead goals) - (remaining across behind goals).
  // Positive → net ahead. Negative → net behind. Zero → show nothing.
  if (netPosition < 0) {
    cards.push({
      label: "Behind",
      value: formatCurrency(Math.abs(netPosition)),
      sub: `${behindGoals.length} goal${behindGoals.length !== 1 ? "s" : ""} in arrears`,
      accent: "#EF4444",
      icon: "⚠️",
      small: true,
    });
  } else if (netPosition > 0) {
    cards.push({
      label: "Ahead",
      value: formatCurrency(netPosition),
      sub: `net across ${recurringActive.length} goal${recurringActive.length !== 1 ? "s" : ""}`,
      accent: "#059669",
      icon: "🚀",
      small: true,
    });
  }

  return (
    <Row className="g-3 mb-4">
      {cards.map((c) => (
        <Col xs={6} md={4} xl={2} key={c.label} className="d-flex">
          <div
            style={{
              width: "100%",
              borderRadius: 12,
              background: "#ffffff",
              border: "0.5px solid var(--color-border-tertiary)",
              borderTop: `3px solid ${c.accent}`,
              padding: "14px 16px",
              display: "flex",
              flexDirection: "column",
              gap: 4,
            }}
          >
            <div className="d-flex align-items-center justify-content-between mb-1">
              <p style={{ fontSize: 11, color: "var(--color-text-secondary)", margin: 0, textTransform: "uppercase", letterSpacing: "0.05em", fontWeight: 600 }}>{c.label}</p>
              <span style={{ fontSize: 14 }}>{c.icon}</span>
            </div>
            <p style={{ fontSize: c.small ? 14 : 20, fontWeight: 600, margin: 0, color: c.accent, lineHeight: 1.3, wordBreak: "break-word" }}>{c.value}</p>
            <p style={{ fontSize: 11, color: "var(--color-text-secondary)", margin: 0 }}>{c.sub}</p>
          </div>
        </Col>
      ))}
    </Row>
  );
}

// ─── InvestmentsPage ──────────────────────────────────────────────────────────

export default function InvestmentsPage() {
  const [filter, setFilter] = useState<InvestmentsFilterTab>("all");
  const [search, setSearch] = useState("");
  const [historyGoal, setHistoryGoal] = useState<InvestmentGoalWithStats | null>(null);
  const [depositGoal, setDepositGoal] = useState<InvestmentGoalWithStats | null>(null);
  const [withdrawGoal, setWithdrawGoal] = useState<InvestmentGoalWithStats | null>(null);
  const [showNewGoal, setShowNewGoal] = useState(false);
  const [deleteGoal, setDeleteGoal] = useState<InvestmentGoalWithStats | null>(null);
  const [editGoal, setEditGoal] = useState<InvestmentGoalWithStats | null>(null);

  const { data: goals = [], isLoading, isError } = useInvestmentGoals();
  const { format: formatCurrency } = useCurrencyConverter();

  const createGoalMutation = useCreateGoal();
  const updateGoalMutation = useUpdateGoal();
  const addContribution = useAddContribution();
  const deleteGoalMutation = useDeleteGoal();

  const handleDeposit = (data: CreateInvestmentContributionDTO): Promise<void> =>
    new Promise((resolve, reject) =>
      addContribution.mutate({ data, goalName: depositGoal?.name ?? "", isGoalTransaction: false }, { onSuccess: () => resolve(), onError: (err) => reject(err) }),
    );

  const handleWithdraw = (data: CreateInvestmentContributionDTO): Promise<void> =>
    new Promise((resolve, reject) =>
      addContribution.mutate({ data, goalName: withdrawGoal?.name ?? "", isGoalTransaction: false }, { onSuccess: () => resolve(), onError: (err) => reject(err) }),
    );

  const handleCreateGoal = (data: CreateInvestmentGoalDTO, isActive: boolean): Promise<void> =>
    new Promise((resolve, reject) => createGoalMutation.mutate({ data, isActive }, { onSuccess: () => resolve(), onError: (err) => reject(err) }));

  const handleEditGoal = (goalId: string, data: UpdateInvestmentGoalDTO): Promise<void> =>
    new Promise((resolve, reject) => updateGoalMutation.mutate({ goalId, data }, { onSuccess: () => resolve(), onError: (err) => reject(err) }));

  const handleDeleteGoal = () => {
    if (!deleteGoal) return;
    deleteGoalMutation.mutate(deleteGoal.id, { onSuccess: () => setDeleteGoal(null) });
  };

  const handleTogglePause = (goal: InvestmentGoalWithStats) => updateGoalMutation.mutate({ goalId: goal.id, data: { isActive: !goal.isActive } });

  const isSearching = search.trim().length > 0;

  const filterByTab = (g: InvestmentGoalWithStats): boolean => {
    if (!belongsHere(g)) return false;
    if (filter === "all") return effectivelyActive(g);
    if (filter === "recurring") return isRecurring(g) && g.isActive;
    if (filter === "tracking") return isTracking(g) && g.isActive && !g.isCompleted;
    if (filter === "paused") return !g.isActive;
    return false;
  };

  const filterBySearch = (g: InvestmentGoalWithStats): boolean => {
    if (!belongsHere(g)) return false;
    const q = search.toLowerCase().trim();
    return g.name.toLowerCase().includes(q) || (g.notes?.toLowerCase().includes(q) ?? false);
  };

  const filtered = isSearching ? goals.filter(filterBySearch) : goals.filter(filterByTab);

  const tabCount = (tab: InvestmentsFilterTab): number => {
    const mine = goals.filter(belongsHere);
    if (tab === "all") return mine.filter(effectivelyActive).length;
    if (tab === "recurring") return mine.filter((g) => isRecurring(g) && g.isActive).length;
    if (tab === "tracking") return mine.filter((g) => isTracking(g) && g.isActive && !g.isCompleted).length;
    if (tab === "paused") return mine.filter((g) => !g.isActive).length;
    return 0;
  };

  const emptyLabel = isSearching ? `No results for "${search}"` : `No ${TAB_LABELS[filter].toLowerCase()} investments yet`;

  return (
    <Container fluid className="py-4">
      <div className="d-flex justify-content-between align-items-center mb-4 gap-2">
        <div style={{ minWidth: 0 }}>
          <h5 style={{ fontWeight: 500, margin: 0, color: "var(--color-text-primary)" }}>Investments</h5>
          <p style={{ fontSize: 13, color: "var(--color-text-secondary)", margin: 0 }}>Recurring contributions and open-ended tracking</p>
        </div>
        <Button color="primary" onClick={() => setShowNewGoal(true)} style={{ flexShrink: 0 }}>
          <span className="d-none d-sm-inline">+ New investment</span>
          <span className="d-sm-none">+ New</span>
        </Button>
      </div>

      {isLoading && (
        <div className="text-center py-5">
          <Spinner color="primary" />
        </div>
      )}
      {isError && <Alert color="danger">Failed to load investments. Please refresh the page.</Alert>}

      {!isLoading && !isError && (
        <>
          <InvestmentsSummaryCards goals={goals} formatCurrency={formatCurrency} />

          <div className="d-md-none mb-2">
            <div style={{ position: "relative" }}>
              <Input
                placeholder="Search investments..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                style={{ fontSize: 13, border: "1px solid var(--color-border-primary)", paddingRight: search ? "2.5rem" : "1rem" }}
              />
              {search && (
                <button
                  onClick={() => setSearch("")}
                  style={{
                    position: "absolute",
                    right: 10,
                    top: "50%",
                    transform: "translateY(-50%)",
                    background: "transparent",
                    border: "none",
                    cursor: "pointer",
                    color: "var(--color-text-secondary)",
                    fontSize: 18,
                    lineHeight: 1,
                    padding: "0 4px",
                  }}
                >
                  ×
                </button>
              )}
            </div>
          </div>

          {isSearching && (
            <p style={{ fontSize: 13, color: "var(--color-text-secondary)", marginBottom: "1rem" }}>
              Showing {filtered.length} result{filtered.length !== 1 ? "s" : ""}
            </p>
          )}

          <div style={{ overflowX: "auto", marginBottom: "1.5rem", msOverflowStyle: "none", scrollbarWidth: "none" }}>
            <div className="d-flex align-items-center" style={{ borderBottom: "1px solid var(--color-border-tertiary)", minWidth: "max-content" }}>
              {!isSearching && (
                <Nav style={{ border: "none", flexWrap: "nowrap", flex: 1 }}>
                  {(["all", "recurring", "tracking", "paused"] as InvestmentsFilterTab[]).map((tab) => {
                    const isActive = filter === tab;
                    return (
                      <NavItem key={tab}>
                        <NavLink
                          onClick={() => setFilter(tab)}
                          className={`d-flex align-items-center gap-2 ${isActive ? "active" : ""}`}
                          style={{
                            cursor: "pointer",
                            border: "none",
                            borderBottom: isActive ? "2px solid var(--bs-primary)" : "2px solid transparent",
                            color: isActive ? "var(--color-text-primary)" : "var(--color-text-secondary)",
                            fontWeight: isActive ? 600 : 400,
                            padding: "10px 16px",
                            background: "transparent",
                          }}
                        >
                          {TAB_LABELS[tab]}
                          <Badge pill style={{ color: "#e0f0ff", backgroundColor: tab === "paused" ? "#F59E0B" : "#0d6efd", fontWeight: 500, fontSize: 11, padding: "4px 8px" }}>
                            {tabCount(tab)}
                          </Badge>
                        </NavLink>
                      </NavItem>
                    );
                  })}
                </Nav>
              )}
              <div
                className="d-none d-md-flex align-items-center justify-content-end"
                style={{ flex: isSearching ? 1 : "none", paddingBottom: 6, paddingLeft: isSearching ? 0 : 16 }}
              >
                <div style={{ position: "relative", width: 220 }}>
                  <Input
                    placeholder="Search investments..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    style={{ fontSize: 13, border: "1px solid var(--color-border-primary)", paddingRight: search ? "2.5rem" : "1rem", height: 32 }}
                  />
                  {search && (
                    <button
                      onClick={() => setSearch("")}
                      style={{
                        position: "absolute",
                        right: 10,
                        top: "50%",
                        transform: "translateY(-50%)",
                        background: "transparent",
                        border: "none",
                        cursor: "pointer",
                        color: "var(--color-text-secondary)",
                        fontSize: 18,
                        lineHeight: 1,
                        padding: "0 4px",
                      }}
                    >
                      ×
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>

          {filtered.length === 0 ? (
            <div style={{ textAlign: "center", padding: "4rem 0", color: "var(--color-text-secondary)" }}>
              <p style={{ fontSize: 40 }}>{filter === "paused" ? "⏸️" : "📈"}</p>
              <p style={{ fontWeight: 500 }}>{emptyLabel}</p>
              {!isSearching && filter !== "paused" && (
                <>
                  <p style={{ fontSize: 14 }}>Start tracking a recurring investment or open-ended savings goal.</p>
                  <Button color="primary" onClick={() => setShowNewGoal(true)}>
                    + New investment
                  </Button>
                </>
              )}
            </div>
          ) : (
            <Row className="g-3">
              {filtered.map((goal) => (
                <Col xs={12} md={6} xl={3} key={goal.id}>
                  <GoalCard
                    goal={goal}
                    showTypeBadge={isSearching}
                    formatCurrency={formatCurrency}
                    onViewHistory={setHistoryGoal}
                    onAddDeposit={setDepositGoal}
                    onWithdraw={setWithdrawGoal}
                    onDelete={setDeleteGoal}
                    onEdit={setEditGoal}
                    onTogglePause={handleTogglePause}
                  />
                </Col>
              ))}
            </Row>
          )}
        </>
      )}

      {historyGoal && <HistoryModal goal={historyGoal} onClose={() => setHistoryGoal(null)} formatCurrency={formatCurrency} />}
      {depositGoal && <AddDepositModal goal={depositGoal} isOpen onClose={() => setDepositGoal(null)} onSubmit={handleDeposit} />}
      {withdrawGoal && <WithdrawModal goal={withdrawGoal} isOpen onClose={() => setWithdrawGoal(null)} onSubmit={handleWithdraw} />}
      {editGoal && <EditGoalModal goal={editGoal} isOpen onClose={() => setEditGoal(null)} onSubmit={handleEditGoal} />}
      {deleteGoal && <DeleteConfirmModal goal={deleteGoal} isDeleting={deleteGoalMutation.isPending} onConfirm={handleDeleteGoal} onClose={() => setDeleteGoal(null)} />}
      <AddNewGoalModal isOpen={showNewGoal} onClose={() => setShowNewGoal(false)} onSubmit={handleCreateGoal} defaultGoalType="recurring" />
    </Container>
  );
}
