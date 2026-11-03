// features/goals/GoalsPage.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Targeted savings goals (specific amount + custom deadline).
// Tabs: Overview · Cards · List, each list with its own search and status menu.
//
// File location: src/features/goals/GoalsPage.tsx
//
// All logic files (hooks, modals, shared components) live in features/budget/
// and are imported via "../budget/..."
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useMemo, useState } from "react";
import { Button, Col, Row } from "reactstrap";
import type { CreateInvestmentContributionDTO, CreateInvestmentGoalDTO, InvestmentGoalWithStats, UpdateInvestmentGoalDTO } from "../../shared/types/IndexTypes";
import { GoalCard, HistoryModal } from "../budget/components/InvestmentsShared";
import { GoalDeleteModal, type GoalEnding } from "../budget/components/GoalDeleteModal";
import { ownSaved } from "../budget/goalHolding";
import { GoalStacks } from "../budget/components/GoalStacks";
import { GoalsWorkbench } from "../budget/components/GoalsWorkbench";
import { groupGoals } from "../budget/components/goalGrouping";
import { useLocalStorage } from "../../shared/hooks/useLocalStorage";
import type { GoalGroupBy } from "../budget/components/goalGrouping";
import ContributionWizard from "../budget/ContributionWizard";
import { GoalsOverview, type OverviewTile } from "../budget/components/GoalsOverview";
import { goalsSummary, monthlyMoves, nearestToDone, type GoalStatusOption } from "../budget/components/goalOverview";
import AddNewGoalModal from "../budget/AddNewGoalModal";
import EditGoalModal from "../budget/EditGoalModal";
import { useCurrencyConverter } from "../../shared/hooks/useCurrencyConverter";
import { useTranslation } from "react-i18next";
import { useAllContributions, useInvestmentGoals, useCreateGoal, useAddContribution, useCloseGoal, useDeleteGoal, useUpdateGoal } from "../budget/useInvestments";
import { saveWithoutWaiting } from "../../shared/utils/saveWithoutWaiting";
import { toast } from "react-toastify";
import { PageShell } from "../../shared/components/PageShell";
import { isSavingsGoal } from "../budget/goalKinds";
import { useCancelCoveredDebts } from "../debts/useDebts";
import { usePageAdd } from "../../shared/hooks/usePageAdd";

// ─── Scope ────────────────────────────────────────────────────────────────────
// A goal "belongs" to GoalsPage if it is targeted AND not recurring.
// Recurring targeted goals (monthly/yearly) live in InvestmentsPage instead.

/** A targeted goal has a deadline, so every dimension here means something. */
const GOAL_GROUPINGS: GoalGroupBy[] = ["deadline", "progress", "status", "category"];

const belongsHere = isSavingsGoal;
const running = (g: InvestmentGoalWithStats) => g.isActive && !g.isCompleted;

// ─── GoalsPage ────────────────────────────────────────────────────────────────

export default function GoalsPage() {
  const { t } = useTranslation();
  const [groupBy, setGroupBy] = useLocalStorage<GoalGroupBy>("goals:groupBy", "deadline");
  const [historyGoal, setHistoryGoal] = useState<InvestmentGoalWithStats | null>(null);
  const [depositGoal, setDepositGoal] = useState<InvestmentGoalWithStats | null>(null);
  const [withdrawGoal, setWithdrawGoal] = useState<InvestmentGoalWithStats | null>(null);
  const [showNewGoal, setShowNewGoal] = useState(false);
  // The floating «+» adds a goal here.
  usePageAdd(t("goals.newGoal"), () => setShowNewGoal(true));
  const [deleteGoal, setDeleteGoal] = useState<InvestmentGoalWithStats | null>(null);
  const [editGoal, setEditGoal] = useState<InvestmentGoalWithStats | null>(null);

  const { data: goals = [], isLoading, isError } = useInvestmentGoals();
  // The list `useInvestmentGoals` has just read for the goals' stats — no second read.
  const { data: contributions = [] } = useAllContributions();
  const { format: formatCurrency } = useCurrencyConverter();

  const createGoalMutation = useCreateGoal();
  const updateGoalMutation = useUpdateGoal();
  const addContribution = useAddContribution();
  const deleteGoalMutation = useDeleteGoal();
  const closeGoalMutation = useCloseGoal();

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

  // Given up on: the goal and every record of it go, so money handed to
  // someone comes back to the card it left. Done: it is closed instead — the
  // closing records and the deletion in one batch, its history kept.
  const cancelCovered = useCancelCoveredDebts();

  const handleDeleteGoal = async (ending: GoalEnding) => {
    if (!deleteGoal) return;
    const goal = deleteGoal;
    const failed = () => toast.error(t("goals.deleteFailed"));
    // Called off with the goal: the debts to whoever paid it and their expenses, before it goes.
    if (ending.refunded?.length) {
      try {
        await cancelCovered.mutateAsync(ending.refunded);
      } catch {
        return;
      }
    }
    if (ending.close) {
      closeGoalMutation.mutate(
        { goalId: goal.id, records: ending.close },
        {
          onSuccess: () => {
            setDeleteGoal(null);
            toast.success(t("goalDelete.doneSpent", { amount: formatCurrency(ownSaved(goal)), name: goal.name }));
          },
          onError: failed,
        },
      );
      return;
    }
    deleteGoalMutation.mutate(goal.id, {
      onSuccess: () => {
        setDeleteGoal(null);
        if (ownSaved(goal) > 0) toast.success(t("goalDelete.doneDropped", { amount: formatCurrency(ownSaved(goal)) }));
      },
      onError: failed,
    });
  };

  // Stable, because it is handed to every row on the screen: a new function each
  // render is a new prop for every card, and nothing downstream can be memoised
  // past it.
  const handleTogglePause = useCallback(
    (goal: InvestmentGoalWithStats) => updateGoalMutation.mutate({ goalId: goal.id, data: { isActive: !goal.isActive } }),
    [updateGoalMutation],
  );

  // ── The tabs ──────────────────────────────────────────────────────────────

  const mine = useMemo(() => goals.filter(belongsHere), [goals]);

  // «Όλοι ▾»: every goal on the screen first, then each status on its own.
  const statuses = useMemo<GoalStatusOption[]>(
    () => [
      { id: "all", label: t("goals.statusAll"), test: () => true },
      { id: "active", label: t("goals.statusRunning"), test: running },
      { id: "paused", label: t("common.paused"), test: (g) => !g.isActive && !g.isCompleted },
      { id: "completed", label: t("goals.statusCompleted"), test: (g) => g.isCompleted },
    ],
    [t],
  );

  const summary = useMemo(() => goalsSummary(mine), [mine]);
  const near = useMemo(() => nearestToDone(mine, running), [mine]);
  const moves = useMemo(() => monthlyMoves(contributions, new Set(mine.map((g) => g.id))), [contributions, mine]);

  const tiles: OverviewTile[] = [
    { label: t("goals.ovSaved"), value: formatCurrency(summary.saved), sub: t("goals.ovSavedSub", { count: summary.active }), tone: "income", icon: "💰" },
    { label: t("goals.ovLeft"), value: formatCurrency(summary.remaining), sub: t("goals.toReachAll"), tone: "goal", icon: "⏳" },
    { label: t("goals.ovActive"), value: String(summary.active), sub: t("goals.ovOnTrack", { count: summary.onTrack }), tone: "invest", icon: "🎯" },
    { label: t("goals.ovMonth"), value: formatCurrency(summary.monthly), sub: t("goals.acrossAllGoals"), tone: "brand", icon: "📅" },
  ];

  const newGoalButton = (
    <Button color="primary" onClick={() => setShowNewGoal(true)}>
      <span className="d-none d-sm-inline">+ {t("goals.newGoal")}</span>
      <span className="d-sm-none">+ {t("bills.new")}</span>
    </Button>
  );

  return (
    <PageShell>
      <GoalsWorkbench
        screen="goals"
        title={t("goals.title")}
        subtitle={t("goals.subtitle")}
        action={newGoalButton}
        goals={mine}
        isLoading={isLoading}
        isError={isError}
        statuses={statuses}
        overview={
          <GoalsOverview
            loading={isLoading}
            tiles={tiles}
            nearTitle={t("goals.nearTitle")}
            nearEmpty={t("goals.nearEmpty")}
            near={near}
            moves={moves}
            chartTone="goal"
            formatCurrency={formatCurrency}
          />
        }
        searchPlaceholder={t("goals.searchPlaceholder")}
        groupOptions={GOAL_GROUPINGS}
        groupBy={groupBy}
        onGroupBy={setGroupBy}
        renderCards={(shown) => (
          <Row className="g-3">
            {shown.map((goal) => (
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
        renderList={(shown) => (
          /* The same goals and the same actions, stacked the way the reader
             asked for — see `goalGrouping`. */
          <GoalStacks
            groups={groupGoals(shown, groupBy)}
            storageKey={`goals:stack:${groupBy}`}
            formatCurrency={formatCurrency}
            onViewHistory={setHistoryGoal}
            onAddDeposit={setDepositGoal}
            onWithdraw={setWithdrawGoal}
            onDelete={setDeleteGoal}
            onEdit={setEditGoal}
            onTogglePause={handleTogglePause}
          />
        )}
        empty={
          <div className="text-center py-5 text-body-secondary">
            <p className="fs-1 mb-2" aria-hidden>
              🎯
            </p>
            <p className="fw-medium">{t("goals.noActiveYet")}</p>
            <p className="small">{t("goals.createFirstHint")}</p>
            {newGoalButton}
          </div>
        }
      />

      {/* Modals */}
      {historyGoal && <HistoryModal goal={historyGoal} onClose={() => setHistoryGoal(null)} formatCurrency={formatCurrency} />}
      {depositGoal && <ContributionWizard goal={depositGoal} kind="deposit" isGoal={true} onClose={() => setDepositGoal(null)} onSubmit={handleDeposit} />}
      {withdrawGoal && <ContributionWizard goal={withdrawGoal} kind="withdrawal" isGoal={true} onClose={() => setWithdrawGoal(null)} onSubmit={handleWithdraw} />}
      {editGoal && <EditGoalModal goal={editGoal} isOpen onClose={() => setEditGoal(null)} onSubmit={handleEditGoal} />}
      {deleteGoal && <GoalDeleteModal goal={deleteGoal} isDeleting={deleteGoalMutation.isPending || closeGoalMutation.isPending} onConfirm={handleDeleteGoal} onClose={() => setDeleteGoal(null)} />}
      {/*
        defaultGoalType="targeted":
          - Hides the goal type selector (always targeted)
          - Shows only the deadline picker (no monthly/yearly period options)
      */}
      <AddNewGoalModal isOpen={showNewGoal} onClose={() => setShowNewGoal(false)} onSubmit={handleCreateGoal} defaultGoalType="targeted" />
    </PageShell>
  );
}
