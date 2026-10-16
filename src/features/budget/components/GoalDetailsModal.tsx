import { Fragment } from "react";
import { Button, Modal, ModalBody, ModalFooter, ModalHeader } from "reactstrap";
import { useTranslation } from "react-i18next";
import { FiClock, FiEdit2, FiMinus, FiPause, FiPlay, FiPlus } from "react-icons/fi";
import type { InvestmentGoalWithStats } from "../../../shared/types/IndexTypes";
import type { GoalCardProps } from "./InvestmentsShared";
import { DeleteButton } from "../../../shared/components/DeleteButton";
import i18n from "../../../i18n";
import { daysSinceContribution, formatDate, getGoalTypeLabel, getStatusConfig, goalHeadline, perWeek, projectedFinish, savingPace, toDate } from "./goalDisplay";
import styles from "./css/GoalDetails.module.css";


// ─── What a goal says about itself ───────────────────────────────────────────
// The same reading the goal card makes (`GoalCard` in InvestmentsShared), for
// the sheet a list row opens — the figures, the line about pace, the colours.

interface GoalSummary {
  /** Solid colour token for rings and borders, and its readable text twin. */
  accent: string;
  accentText: string;
  statusLabel?: string;
  isPaused: boolean;
  isRecurring: boolean;
  /** Reached, and not the kind that starts over: nothing more to put in. */
  isDone: boolean;
  saved: number;
  target: number;
  pct: number;
  hasTarget: boolean;
  /** "Deadline 15 Nov 2026 · 2 months left", or the kind of goal. */
  subtitle: string;
  /** The one line worth reading: where the pace lands, or how this period stands. */
  note?: { text: string; tone?: string };
  /** Three figures for the sheet's foot. */
  figures: { label: string; value: string; tone?: string }[];
}

function goalSummary(goal: InvestmentGoalWithStats, formatCurrency: (n: number) => string, now: Date = new Date()): GoalSummary {
  const t = i18n.t.bind(i18n);
  const isTargetedGoal = goal.goalType === "targeted";
  const isRecurring = goal.targetPeriod === "monthly" || goal.targetPeriod === "yearly";
  const isYearly = goal.targetPeriod === "yearly";
  const isPaused = !goal.isActive && !goal.isCompleted;
  const isDone = goal.isCompleted && goal.goalType !== "open_ended" && !isRecurring;

  const arrears = goal.arrears ?? 0;
  const missedMonths = goal.missedMonths ?? 0;
  const periodSurplus = goal.periodSurplus ?? 0;
  const periodCredit = goal.periodCredit ?? 0;
  const targetAmount = goal.targetAmount ?? 0;
  const currentPeriodSaved = goal.currentPeriodSaved ?? 0;
  const remaining = goal.remaining ?? 0;
  const totalDue = Math.max(targetAmount - periodCredit, 0) + arrears;

  // Gated on status, the single source of truth: raw arrears and surplus can
  // both be non-zero at once, and reading them alone shows contradictions.
  const hasDebt = arrears > 0 && goal.status === "behind";
  const isAhead = periodSurplus > 0 && goal.status === "ahead";
  const isCreditCovered = periodCredit > 0 && !hasDebt && goal.status !== "behind" && remaining === 0 && currentPeriodSaved === 0;
  const isWithdrawalDebt = !hasDebt && !isCreditCovered && !isAhead && goal.status === "behind" && remaining > 0;

  const projection = projectedFinish(goal, now);
  const pace = savingPace(goal, now);
  const quietDays = daysSinceContribution(goal, now);
  const monthYear = (date: Date) => new Intl.DateTimeFormat(i18n.resolvedLanguage ?? "en", { month: "short", year: "numeric" }).format(date);

  const note = ((): GoalSummary["note"] => {
    if (isRecurring) {
      if (hasDebt) return { text: `${formatCurrency(Math.max(totalDue - currentPeriodSaved, 0))} ${t("goals.stillOwed")}`, tone: "var(--color-expense-text)" };
      if (isCreditCovered) return { text: `${t("goals.coveredByCarryover")} · ${formatCurrency(periodCredit)}`, tone: "var(--color-income-text)" };
      if (isAhead) return { text: `${formatCurrency(periodSurplus)} ${t("goals.surplus").toLowerCase()}`, tone: "var(--color-income-text)" };
      if (isWithdrawalDebt) return { text: `${formatCurrency(remaining)} ${t("goals.stillOwed")}`, tone: "var(--color-expense-text)" };
      return undefined;
    }
    if (isDone) return undefined;
    if (projection) {
      const when = t("goals.finishesIn", { month: monthYear(projection.date) });
      if (projection.monthsLate) return { text: `${when} · ${t("goals.monthsPastDeadline", { count: projection.monthsLate })}`, tone: "var(--color-expense-text)" };
      if (projection.monthsEarly) return { text: `${when} · ${t("goals.monthsToSpare", { count: projection.monthsEarly })}`, tone: "var(--color-income-text)" };
      return { text: when };
    }
    // Nothing in the pot yet: no rate to project from, and guessing one would be inventing a date.
    if (isTargetedGoal && remaining > 0 && !pace) {
      return goal.monthlyRequired ? { text: t("goals.startWith", { amount: formatCurrency(perWeek(goal.monthlyRequired)) }) } : { text: t("goals.noPaceYet") };
    }
    return undefined;
  })();

  const lastMoveValue = quietDays === undefined ? t("goals.neverShort") : t("goals.daysShort", { count: quietDays });
  const figures: GoalSummary["figures"] = isRecurring
    ? hasDebt
      ? [
          { label: t(isYearly ? "goals.yearsBehindCount" : "goals.monthsBehindCount", { count: missedMonths }), value: String(missedMonths), tone: "var(--color-expense-text)" },
          { label: t("goals.stillOwed"), value: formatCurrency(remaining), tone: "var(--color-expense-text)" },
          { label: t(isYearly ? "goals.thisYearShort" : "goals.thisMonthShort"), value: formatCurrency(currentPeriodSaved) },
        ]
      : [
          { label: t(isYearly ? "goals.thisYearShort" : "goals.thisMonthShort"), value: formatCurrency(currentPeriodSaved) },
          { label: t("goals.targetLabel").toLowerCase(), value: formatCurrency(targetAmount) },
          { label: t("goals.allTime"), value: formatCurrency(goal.totalSaved) },
        ]
    : isTargetedGoal
      ? goal.monthlyRequired !== undefined
        ? pace
          ? [
              { label: t("goals.aMonth"), value: formatCurrency(goal.monthlyRequired) },
              { label: t("goals.yourPace"), value: formatCurrency(pace), tone: pace < goal.monthlyRequired ? "var(--color-expense-text)" : "var(--color-income-text)" },
              { label: t("goals.lastMove"), value: lastMoveValue },
            ]
          : [
              { label: t("goals.aMonth"), value: formatCurrency(goal.monthlyRequired) },
              { label: t("goals.aWeek"), value: formatCurrency(perWeek(goal.monthlyRequired)) },
              { label: t("goals.monthsLeftShort", { count: goal.monthsLeft ?? 0 }), value: String(goal.monthsLeft ?? 0) },
            ]
        : [
            { label: t("goals.remaining"), value: formatCurrency(remaining) },
            { label: t("goals.yourPace"), value: pace ? formatCurrency(pace) : "—" },
            { label: t("goals.lastMove"), value: lastMoveValue },
          ]
      : [
          { label: t("goals.deposited").toLowerCase(), value: formatCurrency(goal.totalDeposited) },
          { label: t("goals.withdrawn").toLowerCase(), value: formatCurrency(goal.totalWithdrawn) },
          { label: t("goals.averagePerMonth"), value: pace ? formatCurrency(pace) : "—" },
        ];

  const deadline = toDate(goal.deadline);
  const subtitle = [
    isRecurring || !deadline ? getGoalTypeLabel(goal) : t("goals.deadlineOn", { date: formatDate(deadline) }),
    !isRecurring && goal.monthsLeft !== undefined && goal.monthsLeft > 0 ? t("goals.monthsLeftCount", { count: goal.monthsLeft }) : undefined,
  ]
    .filter(Boolean)
    .join(" · ");

  // Two tokens for one colour: the solid one draws, the `-text` one is the
  // readable version of it (green on white is 3.1:1 as text, fine as a stroke).
  const accent =
    goal.status === "behind" ? "--color-expense" : goal.status === "ahead" || goal.status === "completed" ? "--color-income" : isRecurring ? "--bs-primary" : "--color-goal";
  const accentText = accent === "--bs-primary" ? "--color-link" : `${accent}-text`;

  // The same figures the list rows print, from the same function.
  const { saved, target, pct } = goalHeadline(goal);
  const hasTarget = (isRecurring && targetAmount > 0) || (isTargetedGoal && !!goal.targetAmount);

  return {
    accent,
    accentText,
    statusLabel: goal.status ? getStatusConfig(goal.status).label : undefined,
    isPaused,
    isRecurring,
    isDone,
    saved,
    target,
    pct,
    hasTarget,
    subtitle,
    note,
    figures,
  };
}

// ─── Pieces ──────────────────────────────────────────────────────────────────

function StatusChip({ summary }: { summary: GoalSummary }) {
  const { t } = useTranslation();
  if (summary.isPaused) return <span className={`${styles.chip} ${styles.chipPaused}`}>{t("common.paused")}</span>;
  if (!summary.statusLabel) return null;
  return (
    <span className={styles.chip} style={{ color: `var(${summary.accentText})`, borderColor: `color-mix(in srgb, var(${summary.accent}) 40%, transparent)` }}>
      {summary.statusLabel}
    </span>
  );
}

function ProgressRing({ pct, accent }: { pct: number; accent: string }) {
  const size = 92;
  const stroke = 9;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const filled = Math.max(0, Math.min(pct, 100)) / 100;
  return (
    <div className={styles.ring} style={{ width: size, height: size }}>
      <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }} aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke={`color-mix(in srgb, var(${accent}) 20%, transparent)`} strokeWidth={stroke} />
        {filled > 0 && (
          <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke={`var(${accent})`} strokeWidth={stroke} strokeLinecap="round" strokeDasharray={`${circumference * filled} ${circumference}`} />
        )}
      </svg>
      <span className={styles.ringCentre}>{Math.round(pct)}%</span>
    </div>
  );
}

// ─── The sheet behind a list row ─────────────────────────────────────────────

/**
 * Everything about one goal, and everything that can be done to it — what a
 * list row opens. The row itself says little (the name, how far, how much);
 * this is where the rest went, along with every action but the "+".
 *
 * The figures the card leaves out, the line about pace, the notes; then the
 * two things done most — put money in, take it out — as the sheet's main
 * buttons, and the rest beneath. Delete sits alone at the far left of the
 * foot, away from everything else.
 *
 * It stays open under whatever it opens (the deposit wizard, the history),
 * and reads the goal it is handed — so after a deposit it already shows the
 * new figure when the wizard closes.
 */
export function GoalDetailsModal({ goal, formatCurrency, onViewHistory, onAddDeposit, onWithdraw, onDelete, onEdit, onTogglePause, onClose }: GoalCardProps & { onClose: () => void }) {
  const { t } = useTranslation();
  const summary = goalSummary(goal, formatCurrency);

  return (
    <Modal isOpen toggle={onClose} centered scrollable>
      <ModalHeader toggle={onClose}>
        <span className="d-flex align-items-center gap-2">
          <span aria-hidden>{goal.icon ?? "🎯"}</span>
          <span style={{ fontSize: 15 }}>{goal.name}</span>
        </span>
      </ModalHeader>
      <ModalBody>
        <div className="d-flex align-items-center justify-content-between gap-2 mb-3">
          <span className="small text-body-secondary">{summary.subtitle}</span>
          <StatusChip summary={summary} />
        </div>

        <div className={styles.hero}>
          {summary.hasTarget && <ProgressRing pct={summary.pct} accent={summary.accent} />}
          <div style={{ minWidth: 0 }}>
            <div className={styles.heroAmount}>{formatCurrency(summary.saved)}</div>
            <div className={styles.heroSub}>
              {summary.hasTarget
                ? [t("goals.ofTarget", { amount: formatCurrency(summary.target) }), !summary.isRecurring && (goal.remaining ?? 0) > 0 ? t("goals.leftToGo", { amount: formatCurrency(goal.remaining ?? 0) }) : undefined]
                    .filter(Boolean)
                    .join(" · ")
                : t("investments.totalSaved")}
            </div>
            {summary.note && (
              <div className={styles.heroNote} style={{ color: summary.note.tone }}>
                {summary.note.text}
              </div>
            )}
          </div>
        </div>

        <div className={styles.figures}>
          {summary.figures.map((figure, index) => (
            <Fragment key={figure.label}>
              {index > 0 && <span className={styles.figureRule} />}
              <div className={styles.figure}>
                <div className={styles.figureValue} style={{ color: figure.tone }}>
                  {figure.value}
                </div>
                <div className={styles.figureLabel}>{figure.label}</div>
              </div>
            </Fragment>
          ))}
        </div>

        {goal.notes && <p className={styles.notes}>{goal.notes}</p>}

        {!summary.isDone && (
          <div className={styles.mainActions}>
            <Button color="primary" onClick={() => onAddDeposit(goal)}>
              {/* One word: «Προσθήκη κατάθεσης» wrapped beside «Ανάληψη» on a phone. */}
              <FiPlus size={15} aria-hidden /> {t("goals.addShort")}
            </Button>
            {goal.totalSaved > 0 && (
              <Button color="secondary" outline onClick={() => onWithdraw(goal)}>
                <FiMinus size={15} aria-hidden /> {t("investments.withdraw")}
              </Button>
            )}
          </div>
        )}

        <div className={styles.moreActions}>
          <Button color="secondary" outline size="sm" onClick={() => onViewHistory(goal)}>
            <FiClock size={14} aria-hidden /> {t("goals.history")}
          </Button>
          {!summary.isDone && (
            <>
              <Button color="secondary" outline size="sm" onClick={() => onEdit(goal)}>
                <FiEdit2 size={14} aria-hidden /> {t("common.edit")}
              </Button>
              <Button color="secondary" outline size="sm" onClick={() => onTogglePause(goal)}>
                {goal.isActive ? <FiPause size={14} aria-hidden /> : <FiPlay size={14} aria-hidden />} {t(goal.isActive ? "goals.pause" : "goals.resume")}
              </Button>
            </>
          )}
        </div>
      </ModalBody>
      <ModalFooter className="justify-content-between">
        <DeleteButton
          opensConfirm
          onClick={() => {
            onClose();
            onDelete(goal);
          }}
        />
        <Button color="secondary" outline onClick={onClose}>
          {t("common.close")}
        </Button>
      </ModalFooter>
    </Modal>
  );
}
