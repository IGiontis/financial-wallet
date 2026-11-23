// features/budget/InvestmentsPage.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Recurring + open-ended tracking goals.
// Tabs: Overview · Cards · List, each list with its own search and status menu.
//
// File location: src/features/budget/InvestmentsPage.tsx
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useMemo, useState } from "react";
import { useGoalFlash } from "./components/useGoalFlash";
import { Button, Col, Row } from "reactstrap";
import type { CreateInvestmentContributionDTO, CreateInvestmentGoalDTO, InvestmentGoalWithStats, UpdateInvestmentGoalDTO } from "../../shared/types/IndexTypes";
import { GoalCard, DeleteConfirmModal, HistoryModal } from "./components/InvestmentsShared";
import { GoalStacks } from "./components/GoalStacks";
import { GoalsWorkbench } from "./components/GoalsWorkbench";
import { groupGoals } from "./components/goalGrouping";
import { useLocalStorage } from "../../shared/hooks/useLocalStorage";
import type { GoalGroupBy } from "./components/goalGrouping";
import ContributionWizard from "./ContributionWizard";
import { GoalsOverview, type OverviewTile } from "./components/GoalsOverview";
import { investmentRunning, investmentsSummary, isRecurringGoal, isTrackingGoal, monthlyMoves, nearestToDone, type GoalStatusOption, type PeriodTotals } from "./components/goalOverview";
import AddNewGoalModal from "./AddNewGoalModal";
import EditGoalModal from "./EditGoalModal";
import { useCurrencyConverter } from "../../shared/hooks/useCurrencyConverter";
import { useAllContributions, useInvestmentGoals, useCreateGoal, useAddContribution, useDeleteGoal, useUpdateGoal } from "./useInvestments";
import { useTranslation } from "react-i18next";
import { saveWithoutWaiting } from "../../shared/utils/saveWithoutWaiting";
import { answerOrLetGo } from "../../shared/utils/pendingRecords";
import { toast } from "react-toastify";
import { PageShell } from "../../shared/components/PageShell";
import { noAnswerYet, usePageLoad } from "../../shared/hooks/usePageLoad";
import { usePageAdd } from "../../shared/hooks/usePageAdd";
import { usePendingRecords } from "../../shared/hooks/usePendingRecords";

// ─── Scope ────────────────────────────────────────────────────────────────────

/** Nothing on this screen has a deadline, so that dimension is not offered. */
const INVESTMENT_GROUPINGS: GoalGroupBy[] = ["kind", "progress", "status", "category"];

const belongsHere = (g: InvestmentGoalWithStats) => isRecurringGoal(g) || isTrackingGoal(g);

// ─── InvestmentsPage ──────────────────────────────────────────────────────────

export default function InvestmentsPage() {
  const { t } = useTranslation();
  const [groupBy, setGroupBy] = useLocalStorage<GoalGroupBy>("investments:groupBy", "kind");
  const [historyGoal, setHistoryGoal] = useState<InvestmentGoalWithStats | null>(null);
  const [depositGoal, setDepositGoal] = useState<InvestmentGoalWithStats | null>(null);
  const [withdrawGoal, setWithdrawGoal] = useState<InvestmentGoalWithStats | null>(null);
  const [showNewGoal, setShowNewGoal] = useState(false);
  // The floating «+» adds an investment here.
  usePageAdd(t("investments.newInvestment"), () => setShowNewGoal(true));
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
  // Records with an online-only action on its way (`answerOrLetGo`).
  const pending = usePendingRecords();

  // Each dialog closes on its optimistic row rather than on the server's
  // answer — see `saveWithoutWaiting`. A rejection arrives as a toast instead.
  const handleDeposit = (data: CreateInvestmentContributionDTO): Promise<void> =>
    saveWithoutWaiting(addContribution, { data, goalName: depositGoal?.name ?? "", isGoalTransaction: false }, () => toast.error(t("goals.depositFailed")), [["investmentGoals", data.goalId]]);

  const handleWithdraw = (data: CreateInvestmentContributionDTO): Promise<void> =>
    saveWithoutWaiting(addContribution, { data, goalName: withdrawGoal?.name ?? "", isGoalTransaction: false }, () => toast.error(t("goals.withdrawFailed")), [["investmentGoals", data.goalId]]);

  const handleCreateGoal = (data: CreateInvestmentGoalDTO, isActive: boolean): Promise<void> =>
    saveWithoutWaiting(createGoalMutation, { data, isActive }, () => toast.error(t("goals.createFailed")));

  const handleEditGoal = (goalId: string, data: UpdateInvestmentGoalDTO): Promise<void> =>
    saveWithoutWaiting(updateGoalMutation, { goalId, data }, () => toast.error(t("goals.updateFailed")), [["investmentGoals", goalId]]);

  // Online only: waits for the answer, 7 s at most (`answerOrLetGo`) — see `GoalsPage`.
  const handleDeleteGoal = () => {
    if (!deleteGoal) return;
    const goal = deleteGoal;
    return answerOrLetGo(() => deleteGoalMutation.mutateAsync(goal.id), {
      records: [["investmentGoals", goal.id]],
      close: () => setDeleteGoal((open) => (open?.id === goal.id ? null : open)),
      succeeded: () => toast.success(t("toasts.goalDeleted", { name: goal.name })),
      failed: () => toast.error(t("goals.deleteFailed")),
    });
  };

  // Stable, because it is handed to every row on the screen: a new function each
  // render is a new prop for every card, and nothing downstream can be memoised
  // past it.
  // An edit: on screen and said at once, never waiting for the server (`saveWithoutWaiting`).
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

  // «Όλα ▾»: everything on the screen first, then running, by kind, and paused.
  const statuses = useMemo<GoalStatusOption[]>(
    () => [
      { id: "all", label: t("common.all"), test: () => true },
      { id: "active", label: t("common.active"), test: investmentRunning },
      { id: "recurring", label: t("investments.recurring"), test: (g) => isRecurringGoal(g) && g.isActive },
      { id: "tracking", label: t("investments.tracking"), test: (g) => isTrackingGoal(g) && g.isActive && !g.isCompleted },
      { id: "paused", label: t("common.paused"), test: (g) => !g.isActive },
    ],
    [t],
  );

  const summary = useMemo(() => investmentsSummary(mine), [mine]);
  const near = useMemo(() => nearestToDone(mine, (g) => isRecurringGoal(g) && investmentRunning(g)), [mine]);
  const moves = useMemo(() => monthlyMoves(contributions, new Set(mine.map((g) => g.id))), [contributions, mine]);

  // The figures the screen's boxes always showed — see `investmentsSummary`.
  const periodValue = (period: PeriodTotals) =>
    period.count === 0 ? "—" : period.due === 0 ? t("investments.allCovered") : `${formatCurrency(period.paid)} / ${formatCurrency(period.due)}`;
  const tiles: OverviewTile[] = [
    { label: t("investments.totalSaved"), value: formatCurrency(summary.totalSaved), sub: t("investments.allTimeAcross"), tone: "income", icon: "📈" },
    {
      label: t("investments.monthlyTarget"),
      value: periodValue(summary.monthly),
      sub: summary.monthly.due === 0 && summary.monthly.count > 0 ? t("investments.creditCoversMonth") : t("investments.paidThisMonth"),
      tone: "brand",
      icon: "📅",
    },
    {
      label: t("investments.recurring"),
      value: String(summary.recurring),
      sub: summary.recurring === 1 ? t("investments.activeGoal") : t("investments.activeGoals"),
      tone: "invest",
      icon: "🔁",
    },
    {
      label: t("investments.yearlyTarget"),
      value: periodValue(summary.yearly),
      sub: summary.yearly.due === 0 && summary.yearly.count > 0 ? t("investments.creditCoversYear") : t("investments.paidThisYear"),
      tone: "goal",
      icon: "📆",
    },
  ];
  // One box for where the recurring ones stand together, and none when level.
  if (summary.net < 0) {
    tiles.push({ label: t("investments.behind"), value: formatCurrency(Math.abs(summary.net)), sub: t("investments.goalsInArrears", { count: summary.behindCount }), tone: "expense", icon: "⚠️" });
  } else if (summary.net > 0) {
    tiles.push({ label: t("investments.ahead"), value: formatCurrency(summary.net), sub: t("investments.netAcrossGoals", { count: summary.recurring }), tone: "income", icon: "🚀" });
  }

  const newButton = (
    <Button color="primary" onClick={() => setShowNewGoal(true)}>
      <span className="d-none d-sm-inline">+ {t("investments.newInvestment")}</span>
      <span className="d-sm-none">+ {t("bills.new")}</span>
    </Button>
  );

  return (
    <PageShell>
      <GoalsWorkbench
        screen="investments"
        title={t("investments.title")}
        subtitle={t("investments.subtitle")}
        addLabel={t("investments.newInvestment")}
        onAdd={() => setShowNewGoal(true)}
        goals={mine}
        load={load}
        statuses={statuses}
        overview={
          <GoalsOverview
            loading={load === "loading"}
            tiles={tiles}
            nearTitle={t("investments.nearTitle")}
            nearEmpty={t("investments.nearEmpty")}
            near={near}
            moves={moves}
            chartTone="invest"
            formatCurrency={formatCurrency}
          />
        }
        searchPlaceholder={t("investments.searchPlaceholder")}
        groupOptions={INVESTMENT_GROUPINGS}
        groupBy={groupBy}
        onGroupBy={setGroupBy}
        renderCards={(shown, status) => (
          <Row className="g-3">
            {shown.map((goal) => (
              <Col xs={12} md={6} xl={3} key={goal.id}>
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
          /* Nothing here has a deadline, so "kind" is the natural stack —
             the rest are the reader's to pick. See `goalGrouping`. */
          <GoalStacks
            flashed={goalFlash}
            groups={groupGoals(shown, groupBy)}
            storageKey={`investments:stack:${groupBy}`}
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
              📈
            </p>
            <p className="fw-medium">{t("investments.noneYet")}</p>
            <p className="small">{t("investments.startTrackingHint")}</p>
            {newButton}
          </div>
        }
      />

      {historyGoal && <HistoryModal goal={historyGoal} onClose={() => setHistoryGoal(null)} formatCurrency={formatCurrency} />}
      {depositGoal && <ContributionWizard goal={depositGoal} kind="deposit" isGoal={false} onClose={() => setDepositGoal(null)} onSubmit={handleDeposit} />}
      {withdrawGoal && <ContributionWizard goal={withdrawGoal} kind="withdrawal" isGoal={false} onClose={() => setWithdrawGoal(null)} onSubmit={handleWithdraw} />}
      {editGoal && <EditGoalModal goal={editGoal} isOpen onClose={() => setEditGoal(null)} onSubmit={handleEditGoal} onDelete={() => { setDeleteGoal(editGoal); setEditGoal(null); }} />}
      {deleteGoal && <DeleteConfirmModal goal={deleteGoal} isDeleting={pending.busy("investmentGoals", deleteGoal.id)} onConfirm={handleDeleteGoal} onClose={() => setDeleteGoal(null)} />}
      <AddNewGoalModal isOpen={showNewGoal} onClose={() => setShowNewGoal(false)} onSubmit={handleCreateGoal} defaultGoalType="recurring" />
    </PageShell>
  );
}
