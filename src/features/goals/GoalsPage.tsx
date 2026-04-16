// features/goals/GoalsPage.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Targeted savings goals (specific amount + custom deadline).
// Tabs: Active · Paused · Completed
//
// File location: src/features/goals/GoalsPage.tsx
//
// All logic files (hooks, modals, shared components) live in features/budget/
// and are imported via "../budget/..."
// ─────────────────────────────────────────────────────────────────────────────

import { useState } from "react";
import { Alert, Badge, Button, Col, Container, Input, Nav, NavItem, NavLink, Row, Spinner } from "reactstrap";
import type { CreateInvestmentContributionDTO, CreateInvestmentGoalDTO, InvestmentGoalWithStats, UpdateInvestmentGoalDTO } from "../../shared/types/IndexTypes";
import { GoalCard, DeleteConfirmModal, HistoryModal } from "../budget/components/InvestmentsShared";
import AddDepositModal from "../budget/AddDepositModal";
import WithdrawModal from "../budget/WithdrawModal";
import AddNewGoalModal from "../budget/AddNewGoalModal";
import EditGoalModal from "../budget/EditGoalModal";
import { useCurrencyConverter } from "../../shared/hooks/useCurrencyConverter";
import { useInvestmentGoals, useCreateGoal, useAddContribution, useDeleteGoal, useUpdateGoal } from "../budget/useInvestments";

// ─── Types ────────────────────────────────────────────────────────────────────

type GoalsFilterTab = "all" | "paused" | "completed";

const TAB_LABELS: Record<GoalsFilterTab, string> = {
  all: "Active",
  paused: "Paused",
  completed: "Completed",
};

// ─── Scope helper ─────────────────────────────────────────────────────────────
// A goal "belongs" to GoalsPage if it is targeted AND not recurring.
// Recurring targeted goals (monthly/yearly) live in InvestmentsPage instead.

const isRecurring = (g: InvestmentGoalWithStats) => g.targetPeriod === "monthly" || g.targetPeriod === "yearly";

const belongsHere = (g: InvestmentGoalWithStats) => g.goalType === "targeted" && !isRecurring(g);

// ─── GoalsSummaryCards ────────────────────────────────────────────────────────

function GoalsSummaryCards({ goals, formatCurrency }: { goals: InvestmentGoalWithStats[]; formatCurrency: (n: number) => string }) {
  const mine = goals.filter(belongsHere);
  const active = mine.filter((g) => g.isActive && !g.isCompleted);
  const paused = mine.filter((g) => !g.isActive && !g.isCompleted);
  const completed = mine.filter((g) => g.isCompleted);
  const onTrack = active.filter((g) => g.status === "on_track" || g.status === "ahead").length;
  const onTrackRatio = active.length > 0 ? onTrack / active.length : 1;
  const remainingTotal = active.reduce((s, g) => s + (g.remaining ?? 0), 0);
  const monthlyNeeded = active.reduce((s, g) => s + (g.monthlyRequired ?? 0), 0);

  const cards = [
    { label: "Active goals", value: String(active.length), sub: "currently running", accent: "#6366F1", icon: "🎯" },
    {
      label: "On track",
      value: `${onTrack} / ${active.length}`,
      sub: "targeted goals",
      accent: onTrackRatio === 1 ? "#10B981" : onTrackRatio >= 0.5 ? "#F59E0B" : "#EF4444",
      icon: onTrackRatio === 1 ? "✅" : onTrackRatio >= 0.5 ? "⚠️" : "❌",
    },
    { label: "Remaining", value: formatCurrency(remainingTotal), sub: "to reach all goals", accent: "#F59E0B", icon: "💰" },
    { label: "Monthly needed", value: formatCurrency(monthlyNeeded), sub: "across all goals", accent: "#3B82F6", icon: "📅" },
    { label: "Paused", value: String(paused.length), sub: paused.length === 1 ? "goal paused" : "goals paused", accent: "#9CA3AF", icon: "⏸️" },
    { label: "Completed", value: String(completed.length), sub: completed.length === 1 ? "goal reached" : "goals reached", accent: "#8B5CF6", icon: "🏆" },
  ];

  return (
    <Row className="g-3 mb-4">
      {cards.map((c) => (
        <Col xs={6} md={4} xl={2} className="d-flex" key={c.label}>
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
            <p style={{ fontSize: 20, fontWeight: 600, margin: 0, color: c.accent, lineHeight: 1.2 }}>{c.value}</p>
            <p style={{ fontSize: 11, color: "var(--color-text-secondary)", margin: 0 }}>{c.sub} </p>
          </div>
        </Col>
      ))}
    </Row>
  );
}

// ─── GoalsPage ────────────────────────────────────────────────────────────────

export default function GoalsPage() {
  const [filter, setFilter] = useState<GoalsFilterTab>("all");
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

  // ── Handlers ──────────────────────────────────────────────────────────────

  const handleDeposit = (data: CreateInvestmentContributionDTO): Promise<void> =>
    new Promise((resolve, reject) =>
      addContribution.mutate({ data, goalName: depositGoal?.name ?? "", isGoalTransaction: true }, { onSuccess: () => resolve(), onError: (err) => reject(err) }),
    );

  const handleWithdraw = (data: CreateInvestmentContributionDTO): Promise<void> =>
    new Promise((resolve, reject) =>
      addContribution.mutate({ data, goalName: withdrawGoal?.name ?? "", isGoalTransaction: true }, { onSuccess: () => resolve(), onError: (err) => reject(err) }),
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

  // ── Filtering ─────────────────────────────────────────────────────────────

  const isSearching = search.trim().length > 0;

  const filterByTab = (g: InvestmentGoalWithStats): boolean => {
    if (!belongsHere(g)) return false;
    if (filter === "all") return g.isActive && !g.isCompleted;
    if (filter === "paused") return !g.isActive && !g.isCompleted;
    if (filter === "completed") return g.isCompleted;
    return false;
  };

  // Search scoped to targeted goals only — will not surface recurring/tracking
  const filterBySearch = (g: InvestmentGoalWithStats): boolean => {
    if (!belongsHere(g)) return false;
    const q = search.toLowerCase().trim();
    return g.name.toLowerCase().includes(q) || (g.notes?.toLowerCase().includes(q) ?? false);
  };

  const filtered = isSearching ? goals.filter(filterBySearch) : goals.filter(filterByTab);

  const tabCount = (tab: GoalsFilterTab): number => {
    const mine = goals.filter(belongsHere);
    if (tab === "all") return mine.filter((g) => g.isActive && !g.isCompleted).length;
    if (tab === "paused") return mine.filter((g) => !g.isActive && !g.isCompleted).length;
    if (tab === "completed") return mine.filter((g) => g.isCompleted).length;
    return 0;
  };

  const emptyLabel = isSearching ? `No results for "${search}"` : filter === "all" ? "No active goals yet" : `No ${TAB_LABELS[filter].toLowerCase()} goals yet`;

  return (
    <Container fluid className="py-4">
      {/* Header */}
      <div className="d-flex justify-content-between align-items-center mb-4 flex-wrap gap-2">
        <div>
          <h5 style={{ fontWeight: 500, margin: 0, color: "var(--color-text-primary)" }}>Goals</h5>
          <p style={{ fontSize: 13, color: "var(--color-text-secondary)", margin: 0 }}>Save toward specific targets with deadlines</p>
        </div>
        <Button color="primary" onClick={() => setShowNewGoal(true)}>
          <span className="d-none d-sm-inline">+ New goal</span>
          <span className="d-sm-none">+ New</span>
        </Button>
      </div>

      {isLoading && (
        <div className="text-center py-5">
          <Spinner color="primary" />
        </div>
      )}
      {isError && <Alert color="danger">Failed to load goals. Please refresh the page.</Alert>}

      {!isLoading && !isError && (
        <>
          <GoalsSummaryCards goals={goals} formatCurrency={formatCurrency} />

          {/* Mobile search */}
          <div className="d-md-none mb-2">
            <div style={{ position: "relative" }}>
              <Input
                placeholder="Search goals..."
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

          {/* Tabs + desktop search */}
          <div style={{ overflowX: "auto", marginBottom: "1.5rem", msOverflowStyle: "none", scrollbarWidth: "none" }}>
            <div className="d-flex align-items-center" style={{ borderBottom: "1px solid var(--color-border-tertiary)", minWidth: "max-content" }}>
              {!isSearching && (
                <Nav style={{ border: "none", flexWrap: "nowrap", flex: 1 }}>
                  {(["all", "paused", "completed"] as GoalsFilterTab[]).map((tab) => {
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
                    placeholder="Search goals..."
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

          {/* Grid */}
          {filtered.length === 0 ? (
            <div style={{ textAlign: "center", padding: "4rem 0", color: "var(--color-text-secondary)" }}>
              <p style={{ fontSize: 40 }}>{filter === "paused" ? "⏸️" : "🎯"}</p>
              <p style={{ fontWeight: 500 }}>{emptyLabel}</p>
              {!isSearching && filter !== "paused" && (
                <>
                  <p style={{ fontSize: 14 }}>Create your first savings goal to start tracking toward a target.</p>
                  <Button color="primary" onClick={() => setShowNewGoal(true)}>
                    <span className="d-none d-sm-inline">+ New goal</span>
                    <span className="d-sm-none">+ New</span>
                  </Button>
                </>
              )}
            </div>
          ) : (
            <Row className="g-3">
              {filtered.map((goal) => (
                <Col xs={12} md={6} xl={4} key={goal.id}>
                  <GoalCard
                    goal={goal}
                    showTypeBadge={false}
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

      {/* Modals */}
      {historyGoal && <HistoryModal goal={historyGoal} onClose={() => setHistoryGoal(null)} formatCurrency={formatCurrency} />}
      {depositGoal && <AddDepositModal goal={depositGoal} isOpen onClose={() => setDepositGoal(null)} onSubmit={handleDeposit} />}
      {withdrawGoal && <WithdrawModal goal={withdrawGoal} isOpen onClose={() => setWithdrawGoal(null)} onSubmit={handleWithdraw} />}
      {editGoal && <EditGoalModal goal={editGoal} isOpen onClose={() => setEditGoal(null)} onSubmit={handleEditGoal} />}
      {deleteGoal && <DeleteConfirmModal goal={deleteGoal} isDeleting={deleteGoalMutation.isPending} onConfirm={handleDeleteGoal} onClose={() => setDeleteGoal(null)} />}
      {/*
        defaultGoalType="targeted":
          - Hides the goal type selector (always targeted)
          - Shows only the deadline picker (no monthly/yearly period options)
      */}
      <AddNewGoalModal isOpen={showNewGoal} onClose={() => setShowNewGoal(false)} onSubmit={handleCreateGoal} defaultGoalType="targeted" />
    </Container>
  );
}
