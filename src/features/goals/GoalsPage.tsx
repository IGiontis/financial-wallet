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
import { Alert, Badge, Button, Col, Container,  Nav, NavItem, NavLink, Row } from "reactstrap";
import type { CreateInvestmentContributionDTO, CreateInvestmentGoalDTO, InvestmentGoalWithStats, UpdateInvestmentGoalDTO } from "../../shared/types/IndexTypes";
import { GoalCard, DeleteConfirmModal, HistoryModal } from "../budget/components/InvestmentsShared";
import AddDepositModal from "../budget/AddDepositModal";
import { SkeletonCardGrid } from "../../shared/components/Skeletons";
import WithdrawModal from "../budget/WithdrawModal";
import AddNewGoalModal from "../budget/AddNewGoalModal";
import EditGoalModal from "../budget/EditGoalModal";
import { useCurrencyConverter } from "../../shared/hooks/useCurrencyConverter";
import { useTranslation } from "react-i18next";
import { SearchInput } from "../../shared/components/SearchInput";
import { useInvestmentGoals, useCreateGoal, useAddContribution, useDeleteGoal, useUpdateGoal } from "../budget/useInvestments";
import { saveWithoutWaiting } from "../../shared/utils/saveWithoutWaiting";

// ─── Types ────────────────────────────────────────────────────────────────────

type GoalsFilterTab = "all" | "paused" | "completed";

const TAB_LABEL_KEYS: Record<GoalsFilterTab, string> = {
  all: "common.active",
  paused: "common.paused",
  completed: "common.completed",
};

// ─── Scope helper ─────────────────────────────────────────────────────────────
// A goal "belongs" to GoalsPage if it is targeted AND not recurring.
// Recurring targeted goals (monthly/yearly) live in InvestmentsPage instead.

const isRecurring = (g: InvestmentGoalWithStats) => g.targetPeriod === "monthly" || g.targetPeriod === "yearly";

const belongsHere = (g: InvestmentGoalWithStats) => g.goalType === "targeted" && !isRecurring(g);

// ─── GoalsSummaryCards ────────────────────────────────────────────────────────

function GoalsSummaryCards({ goals, formatCurrency }: { goals: InvestmentGoalWithStats[]; formatCurrency: (n: number) => string }) {
  const { t } = useTranslation();
  const mine = goals.filter(belongsHere);
  const active = mine.filter((g) => g.isActive && !g.isCompleted);
  const paused = mine.filter((g) => !g.isActive && !g.isCompleted);
  const completed = mine.filter((g) => g.isCompleted);
  const onTrack = active.filter((g) => g.status === "on_track" || g.status === "ahead").length;
  const onTrackRatio = active.length > 0 ? onTrack / active.length : 1;
  const remainingTotal = active.reduce((s, g) => s + (g.remaining ?? 0), 0);
  const monthlyNeeded = active.reduce((s, g) => s + (g.monthlyRequired ?? 0), 0);

  const cards = [
    { label: t("goals.activeGoals"), value: String(active.length), sub: t("goals.currentlyRunning"), accent: "var(--color-invest)", icon: "🎯" },
    {
      label: t("goals.onTrack"),
      value: `${onTrack} / ${active.length}`,
      sub: t("goals.targetedGoals"),
      accent: onTrackRatio === 1 ? "#10B981" : onTrackRatio >= 0.5 ? "#F59E0B" : "#EF4444",
      icon: onTrackRatio === 1 ? "✅" : onTrackRatio >= 0.5 ? "⚠️" : "❌",
    },
    { label: t("goals.remainingLabel"), value: formatCurrency(remainingTotal), sub: t("goals.toReachAll"), accent: "var(--color-goal)", icon: "💰" },
    { label: t("goals.monthlyNeeded"), value: formatCurrency(monthlyNeeded), sub: t("goals.acrossAllGoals"), accent: "var(--bs-primary)", icon: "📅" },
    { label: t("common.paused"), value: String(paused.length), sub: paused.length === 1 ? t("goals.goalPaused") : t("goals.goalsPaused"), accent: "#9CA3AF", icon: "⏸️" },
    { label: t("common.completed"), value: String(completed.length), sub: completed.length === 1 ? t("goals.goalReached") : t("goals.goalsReached"), accent: "#8B5CF6", icon: "🏆" },
  ];

  return (
    <Row className="g-3 mb-4">
      {cards.map((c) => (
        <Col xs={6} md={4} xl={2} className="d-flex" key={c.label}>
          <div
            style={{
              width: "100%",
              borderRadius: 12,
              background: "var(--color-surface)",
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
  const { t } = useTranslation();
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

  // Each dialog closes on its optimistic row rather than on the server's
  // answer — see `saveWithoutWaiting`. A rejection arrives as a toast instead.
  const handleDeposit = (data: CreateInvestmentContributionDTO): Promise<void> =>
    saveWithoutWaiting(addContribution, { data, goalName: depositGoal?.name ?? "", isGoalTransaction: true }, () => toast.error(t("goals.depositFailed")));

  const handleWithdraw = (data: CreateInvestmentContributionDTO): Promise<void> =>
    saveWithoutWaiting(addContribution, { data, goalName: withdrawGoal?.name ?? "", isGoalTransaction: true }, () => toast.error(t("goals.withdrawFailed")));

  const handleCreateGoal = (data: CreateInvestmentGoalDTO, isActive: boolean): Promise<void> =>
    saveWithoutWaiting(createGoalMutation, { data, isActive }, () => toast.error(t("goals.createFailed")));

  const handleEditGoal = (goalId: string, data: UpdateInvestmentGoalDTO): Promise<void> =>
    saveWithoutWaiting(updateGoalMutation, { goalId, data }, () => toast.error(t("goals.updateFailed")));

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

  const emptyLabel = isSearching
    ? t("investments.noResultsFor", { query: search })
    : filter === "all"
      ? t("goals.noActiveYet")
      : filter === "paused"
        ? t("goals.noPausedYet")
        : t("goals.noCompletedYet");

  return (
    <Container fluid className="py-4">
      {/* Header */}
      <div className="d-flex justify-content-between align-items-center mb-4 flex-wrap gap-2">
        <div>
          <h1 className="h5 fw-semibold text-body-emphasis mb-0">{t("goals.title")}</h1>
          <p className="small text-body-secondary mb-0">{t("goals.subtitle")}</p>
        </div>
        <Button color="primary" onClick={() => setShowNewGoal(true)}>
          <span className="d-none d-sm-inline">+ {t("goals.newGoal")}</span>
          <span className="d-sm-none">+ {t("bills.new")}</span>
        </Button>
      </div>

      {isLoading && <SkeletonCardGrid count={6} />}
      {isError && <Alert color="danger">{t("common.failedToLoad")}</Alert>}

      {!isLoading && !isError && (
        <>
          <GoalsSummaryCards goals={goals} formatCurrency={formatCurrency} />

          {/* Mobile search */}
          <div className="d-md-none mb-2">
            <SearchInput value={search} onChange={setSearch} placeholder={t("goals.searchPlaceholder")} block />
          </div>

          {isSearching && (
            <p style={{ fontSize: 13, color: "var(--color-text-secondary)", marginBottom: "1rem" }}>
              {t("investments.showingResults", { count: filtered.length })}
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
                          {t(TAB_LABEL_KEYS[tab])}
                          <Badge pill color={tab === "paused" ? "warning" : "primary"} style={{ fontWeight: 500, fontSize: 11, padding: "4px 8px" }}>
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
                <SearchInput value={search} onChange={setSearch} placeholder={t("goals.searchPlaceholder")} size="sm" />
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
                  <p style={{ fontSize: 14 }}>{t("goals.createFirstHint")}</p>
                  <Button color="primary" onClick={() => setShowNewGoal(true)}>
                    <span className="d-none d-sm-inline">+ {t("goals.newGoal")}</span>
                    <span className="d-sm-none">+ {t("bills.new")}</span>
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
