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
import { useGoalFlash } from "../budget/components/useGoalFlash";
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
import { answerOrLetGo } from "../../shared/utils/pendingRecords";
import { toast } from "react-toastify";
import { PageShell } from "../../shared/components/PageShell";
import { noAnswerYet, usePageLoad } from "../../shared/hooks/usePageLoad";
import { isSavingsGoal } from "../budget/goalKinds";
import { debtKeys } from "../debts/useDebts";
import { CoveredRepaidError } from "../budget/useInvestments";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../../shared/hooks/useAuth";
import { usePageAdd } from "../../shared/hooks/usePageAdd";
import { AddButton } from "../../shared/components/AddButton";
import { usePendingRecords } from "../../shared/hooks/usePendingRecords";

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

  const goalsQuery = useInvestmentGoals();
  const { data: goals = [] } = goalsQuery;
  // The skeleton for a few seconds at most, then the page — see `usePageLoad`.
  const load = usePageLoad(noAnswerYet(goalsQuery));
  // The list `useInvestmentGoals` has just read for the goals' stats — no second read.
  const { data: contributions = [] } = useAllContributions();
  const { format: formatCurrency } = useCurrencyConverter();

  const createGoalMutation = useCreateGoal();
  const updateGoalMutation = useUpdateGoal();
  const addContribution = useAddContribution();
  const deleteGoalMutation = useDeleteGoal();
  const closeGoalMutation = useCloseGoal();
  // Records with an online-only action on its way (`answerOrLetGo`).
  const pending = usePendingRecords();

  // ── Handlers ──────────────────────────────────────────────────────────────

  // Each dialog closes on its optimistic row rather than on the server's
  // answer — see `saveWithoutWaiting`. A rejection arrives as a toast instead.
  const handleDeposit = (data: CreateInvestmentContributionDTO): Promise<void> =>
    saveWithoutWaiting(addContribution, { data, goalName: depositGoal?.name ?? "", isGoalTransaction: true }, () => toast.error(t("goals.depositFailed")), [["investmentGoals", data.goalId]]);

  const handleWithdraw = (data: CreateInvestmentContributionDTO): Promise<void> =>
    saveWithoutWaiting(addContribution, { data, goalName: withdrawGoal?.name ?? "", isGoalTransaction: true }, () => toast.error(t("goals.withdrawFailed")), [["investmentGoals", data.goalId]]);

  const handleCreateGoal = (data: CreateInvestmentGoalDTO, isActive: boolean): Promise<void> =>
    saveWithoutWaiting(createGoalMutation, { data, isActive }, () => toast.error(t("goals.createFailed")));

  const handleEditGoal = (goalId: string, data: UpdateInvestmentGoalDTO): Promise<void> =>
    saveWithoutWaiting(updateGoalMutation, { goalId, data }, () => toast.error(t("goals.updateFailed")), [["investmentGoals", goalId]]);

  // Given up on: the goal and every record of it go, so money handed to
  // someone comes back to the card it left. Done: it is closed instead — the
  // closing records and the deletion in one batch, its history kept. Either
  // way, loans someone took on for it that are owed no more go in the same
  // write (`ending.erase`, see `CoveredErase`); the rest stay in «Χρέη».
  const queryClient = useQueryClient();
  const { currentUser } = useAuth();

  // Online only: waits for the answer and reports it honestly — 7 s at most
  // (`answerOrLetGo`). The dialog stays up and locked meanwhile
  // (`GoalDeleteModal`), closes on success with the toast, and on a failure
  // stays with nothing removed. Past 7 s it lets go, the goal stays disabled
  // wherever it shows, and the toast comes when the answer does. A second
  // press is never a second delete — `useOnceMutation`.
  const handleDeleteGoal = (ending: GoalEnding) => {
    if (!deleteGoal) return;
    const goal = deleteGoal;
    const erase = ending.erase ?? [];
    const closing = !!ending.close;
    return answerOrLetGo(
      () =>
        ending.close
          ? closeGoalMutation.mutateAsync({ goalId: goal.id, records: ending.close, erase })
          : deleteGoalMutation.mutateAsync(erase.length > 0 ? { goalId: goal.id, erase } : goal.id),
      {
        records: [["investmentGoals", goal.id]],
        close: () => setDeleteGoal((open) => (open?.id === goal.id ? null : open)),
        succeeded: () => {
          const done = closing
            ? t("goalDelete.doneSpent", { amount: formatCurrency(ownSaved(goal)), name: goal.name })
            : ownSaved(goal) > 0
              ? t("goalDelete.doneDropped", { amount: formatCurrency(ownSaved(goal)) })
              : t("toasts.goalDeleted", { name: goal.name });
          // What became of each loan, said in the same toast.
          const said = [done];
          if (ending.erasedNames?.length) said.push(t("goalDelete.doneErased", { who: ending.erasedNames.join(", ") }));
          if (ending.keptNames?.length) said.push(t("goalDelete.doneKept", { who: ending.keptNames.join(", ") }));
          toast.success(said.join(" · "));
        },
        failed: (error) => {
          if (error instanceof CoveredRepaidError) {
            // Repaid on another device since the dialog read it: read the debts again, so it asks afresh.
            void queryClient.invalidateQueries({ queryKey: debtKeys.all(currentUser?.uid ?? "") });
            toast.error(t("goalDelete.repaidMeanwhile"));
            return;
          }
          toast.error(t("goals.deleteFailed"));
        },
      },
    );
  };

  // Stable, because it is handed to every row on the screen: a new function each
  // render is a new prop for every card, and nothing downstream can be memoised
  // past it.
  // An edit: on screen and said at once, never waiting for the server; a
  // refusal puts it back and says so (`saveWithoutWaiting`).
  const handleTogglePause = useCallback(
    (goal: InvestmentGoalWithStats) => {
      toast.success(t(goal.isActive ? "toasts.goalPaused" : "toasts.goalResumed", { name: goal.name }));
      return saveWithoutWaiting(updateGoalMutation, { goalId: goal.id, data: { isActive: !goal.isActive } }, () => toast.error(t("goals.updateFailed")), [["investmentGoals", goal.id]]);
    },
    [updateGoalMutation, t],
  );

  // ── The tabs ──────────────────────────────────────────────────────────────

  const mine = useMemo(() => goals.filter(belongsHere), [goals]);
  // The card or row of a goal just saved, or money just moved in or out of, lights once its dialog has gone.
  const goalFlash = useGoalFlash(useMemo(() => mine.map((g) => g.id), [mine]));

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
        action={<AddButton label={t("goals.newGoal")} onClick={() => setShowNewGoal(true)} />}
        goals={mine}
        load={load}
        statuses={statuses}
        overview={
          <GoalsOverview
            loading={load === "loading"}
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
        renderCards={(shown, status) => (
          <Row className="g-3">
            {shown.map((goal) => (
              <Col xs={12} md={6} xl={4} key={goal.id}>
                <GoalCard
                  flashed={goalFlash}
                  goal={goal}
                  formatCurrency={formatCurrency}
                  onViewHistory={setHistoryGoal}
                  onAddDeposit={setDepositGoal}
                  onWithdraw={setWithdrawGoal}
                  onDelete={setDeleteGoal}
                  onEdit={setEditGoal}
                  onTogglePause={handleTogglePause}
                  pausedView={status === "paused"}
                />
              </Col>
            ))}
          </Row>
        )}
        renderList={(shown) => (
          /* The same goals and the same actions, stacked the way the reader
             asked for — see `goalGrouping`. */
          <GoalStacks
            flashed={goalFlash}
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
      {editGoal && <EditGoalModal goal={editGoal} isOpen onClose={() => setEditGoal(null)} onSubmit={handleEditGoal} onDelete={() => { setDeleteGoal(editGoal); setEditGoal(null); }} />}
      {deleteGoal && <GoalDeleteModal goal={deleteGoal} isDeleting={pending.busy("investmentGoals", deleteGoal.id)} onConfirm={handleDeleteGoal} onClose={() => setDeleteGoal(null)} />}
      {/*
        defaultGoalType="targeted":
          - Hides the goal type selector (always targeted)
          - Shows only the deadline picker (no monthly/yearly period options)
      */}
      <AddNewGoalModal isOpen={showNewGoal} onClose={() => setShowNewGoal(false)} onSubmit={handleCreateGoal} defaultGoalType="targeted" />
    </PageShell>
  );
}
