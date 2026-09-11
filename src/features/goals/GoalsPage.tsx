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

import { useCallback, useMemo, useState } from "react";
import { Alert, Button, Col, Row } from "reactstrap";
import type { CreateInvestmentContributionDTO, CreateInvestmentGoalDTO, InvestmentGoalWithStats, UpdateInvestmentGoalDTO } from "../../shared/types/IndexTypes";
import { GoalCard, DeleteConfirmModal, HistoryModal } from "../budget/components/InvestmentsShared";
import { GoalStacks } from "../budget/components/GoalStacks";
import { GoalsWorkbench } from "../budget/components/GoalsWorkbench";
import { groupGoals } from "../budget/components/goalGrouping";
import { useLocalStorage } from "../../shared/hooks/useLocalStorage";
import type { GoalView } from "../budget/components/GoalStacks";
import type { GoalGroupBy } from "../budget/components/goalGrouping";
import AddDepositModal from "../budget/AddDepositModal";
import { SkeletonCardGrid, SkeletonStats } from "../../shared/components/Skeletons";
import WithdrawModal from "../budget/WithdrawModal";
import AddNewGoalModal from "../budget/AddNewGoalModal";
import EditGoalModal from "../budget/EditGoalModal";
import { useCurrencyConverter } from "../../shared/hooks/useCurrencyConverter";
import { useTranslation } from "react-i18next";
import { useInvestmentGoals, useCreateGoal, useAddContribution, useDeleteGoal, useUpdateGoal } from "../budget/useInvestments";
import { saveWithoutWaiting } from "../../shared/utils/saveWithoutWaiting";
import { toast } from "react-toastify";
import { PageShell } from "../../shared/components/PageShell";

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

/** A targeted goal has a deadline, so every dimension here means something. */
const GOAL_GROUPINGS: GoalGroupBy[] = ["deadline", "progress", "status", "category"];

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
  const [view, setView] = useLocalStorage<GoalView>("goals:view", "cards");
  const [groupBy, setGroupBy] = useLocalStorage<GoalGroupBy>("goals:groupBy", "deadline");
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

  // Stable, because it is handed to every row on the screen: a new function each
  // render is a new prop for every card, and nothing downstream can be memoised
  // past it.
  const handleTogglePause = useCallback(
    (goal: InvestmentGoalWithStats) => updateGoalMutation.mutate({ goalId: goal.id, data: { isActive: !goal.isActive } }),
    [updateGoalMutation],
  );

  // ── Filtering ─────────────────────────────────────────────────────────────

  const isSearching = search.trim().length > 0;

  // One pass, once per change of what it depends on — rather than two predicates
  // rebuilt every render and a full scan on every keystroke.
  const filtered = useMemo(() => {
    const query = search.toLowerCase().trim();
    return goals.filter((g) => {
      if (!belongsHere(g)) return false;
      // Search reaches across the tabs on purpose: a paused goal you are looking
      // for by name should not be hidden by which tab happens to be open.
      if (isSearching) return g.name.toLowerCase().includes(query) || (g.notes?.toLowerCase().includes(query) ?? false);
      if (filter === "all") return g.isActive && !g.isCompleted;
      if (filter === "paused") return !g.isActive && !g.isCompleted;
      return g.isCompleted;
    });
  }, [goals, isSearching, search, filter]);

  const stacks = useMemo(() => groupGoals(filtered, groupBy), [filtered, groupBy]);

  // Each count used to run two passes over every goal, and the strip asked for
  // three of them on every render — six passes for a number that only changes
  // when the goals do.
  const counts = useMemo(() => {
    const mine = goals.filter(belongsHere);
    return {
      all: mine.filter((g) => g.isActive && !g.isCompleted).length,
      paused: mine.filter((g) => !g.isActive && !g.isCompleted).length,
      completed: mine.filter((g) => g.isCompleted).length,
    } as Record<GoalsFilterTab, number>;
  }, [goals]);

  const tabs = useMemo(
    () => (["all", "paused", "completed"] as GoalsFilterTab[]).map((tab) => ({ id: tab, label: t(TAB_LABEL_KEYS[tab]), count: counts[tab] })),
    [counts, t],
  );


  const emptyLabel = isSearching
    ? t("investments.noResultsFor", { query: search })
    : filter === "all"
      ? t("goals.noActiveYet")
      : filter === "paused"
        ? t("goals.noPausedYet")
        : t("goals.noCompletedYet");

  // A missing strip is worse than a placeholder one: the row would appear a
  // moment later and shove everything under it down the page.
  const summary = isLoading ? <SkeletonStats /> : isError ? undefined : <GoalsSummaryCards goals={goals} formatCurrency={formatCurrency} />;

  return (
    <PageShell>
      <GoalsWorkbench
        title={t("goals.title")}
        subtitle={t("goals.subtitle")}
        action={
          <Button color="primary" onClick={() => setShowNewGoal(true)}>
            <span className="d-none d-sm-inline">+ {t("goals.newGoal")}</span>
            <span className="d-sm-none">+ {t("bills.new")}</span>
          </Button>
        }
        stats={summary}
        tabs={tabs}
        activeTab={filter}
        onTab={(id) => setFilter(id as GoalsFilterTab)}
        search={search}
        onSearch={setSearch}
        searchPlaceholder={t("goals.searchPlaceholder")}
        groupOptions={GOAL_GROUPINGS}
        groupBy={groupBy}
        onGroupBy={setGroupBy}
        view={view}
        onView={setView}
      >
        {isLoading && <SkeletonCardGrid count={6} />}
        {isError && <Alert color="danger">{t("common.failedToLoad")}</Alert>}

        {!isLoading && !isError && (
          <>
            {isSearching && (
              <p style={{ fontSize: 13, color: "var(--color-text-secondary)", marginBottom: "1rem" }}>{t("investments.showingResults", { count: filtered.length })}</p>
            )}

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
            ) : view === "stacks" ? (
              /* The same goals and the same actions, stacked the way the reader
                 asked for — see `goalGrouping`. */
              <GoalStacks
                groups={stacks}
                storageKey={`goals:stack:${groupBy}`}
                formatCurrency={formatCurrency}
                onViewHistory={setHistoryGoal}
                onAddDeposit={setDepositGoal}
                onWithdraw={setWithdrawGoal}
                onDelete={setDeleteGoal}
                onEdit={setEditGoal}
                onTogglePause={handleTogglePause}
              />
            ) : (
              <Row className="g-3">
                {filtered.map((goal) => (
                  <Col xs={12} md={6} xl={4} key={goal.id}>
                    <GoalCard
                      goal={goal}
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
      </GoalsWorkbench>

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
    </PageShell>
  );
}
