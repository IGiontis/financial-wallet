import { useMemo } from "react";
import { Modal, ModalHeader, ModalBody, ModalFooter, Button, Row, Col } from "reactstrap";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { FiFlag } from "react-icons/fi";
import type { InvestmentGoalWithStats } from "../../../shared/types/IndexTypes";
import { useContributions } from "../../budget/useInvestments";
import { firestoreToDate } from "../../../shared/utils/dates";
import styles from "./css/GoalDetailModal.module.css";

const isRecurringGoal = (g: Pick<InvestmentGoalWithStats, "targetPeriod">) => g.targetPeriod === "monthly" || g.targetPeriod === "yearly";

/** Read-only fact, e.g. "Remaining — €200". Mirrors BillDetailModal's Fact. */
function Fact({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div className="p-2" style={{ background: "var(--color-background-secondary)", borderRadius: "var(--border-radius-md)" }}>
      <div className="text-uppercase text-body-secondary" style={{ fontSize: 10, fontWeight: 600, letterSpacing: "0.05em" }}>
        {label}
      </div>
      <div className="fw-semibold" style={{ fontSize: 14, color: accent ?? "var(--color-text-primary)" }}>
        {value}
      </div>
    </div>
  );
}

interface GoalDetailModalProps {
  goal: InvestmentGoalWithStats;
  formatCurrency: (n: number) => string;
  onClose: () => void;
}

export default function GoalDetailModal({ goal, formatCurrency, onClose }: GoalDetailModalProps) {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const { data: contributions = [] } = useContributions(goal.id);

  const dateFmt = useMemo(() => new Intl.DateTimeFormat(i18n.resolvedLanguage ?? "en", { day: "2-digit", month: "short", year: "numeric" }), [i18n.resolvedLanguage]);

  const recurring = isRecurringGoal(goal);
  const oneTime = goal.goalType === "targeted" && !recurring;
  const hasDeadline = oneTime && !!goal.deadline && !!goal.targetAmount;

  // Timeline math — only meaningful for a one-time targeted goal with a deadline.
  const timeline = useMemo(() => {
    if (!hasDeadline) return null;

    const created = firestoreToDate(goal.createdAt);
    const deadline = firestoreToDate(goal.deadline);
    const now = new Date();
    const pct = Math.min(Math.max(goal.percentageReached ?? 0, 0), 100);
    const remaining = goal.remaining ?? Math.max((goal.targetAmount ?? 0) - goal.totalSaved, 0);

    // Average monthly pace so far, to project a finish date.
    const monthsSinceStart = Math.max((now.getFullYear() - created.getFullYear()) * 12 + (now.getMonth() - created.getMonth()), 1);
    const avgMonthly = goal.totalSaved / monthsSinceStart;

    let projectedDate: Date | undefined;
    if (avgMonthly > 0 && remaining > 0) {
      const monthsToGo = remaining / avgMonthly;
      projectedDate = new Date(now.getFullYear(), now.getMonth() + Math.ceil(monthsToGo), now.getDate());
    }

    return { created, deadline, pct, projectedDate, remaining };
  }, [hasDeadline, goal]);

  const statusColor =
    goal.status === "behind" ? "var(--color-expense)" : goal.status === "ahead" ? "var(--color-income)" : goal.status === "completed" ? "var(--color-income)" : "var(--bs-primary)";
  const statusLabel = goal.status === "behind" ? t("goals.behind") : goal.status === "ahead" ? t("goals.ahead") : goal.status === "completed" ? t("common.completed") : t("goals.onTrack");

  const recentContributions = useMemo(
    () => [...contributions].sort((a, b) => firestoreToDate(b.date).getTime() - firestoreToDate(a.date).getTime()).slice(0, 6),
    [contributions],
  );

  const manageTo = oneTime ? "/goals" : "/investments";

  return (
    <Modal isOpen toggle={onClose} centered size="md" scrollable>
      <ModalHeader toggle={onClose}>
        <span className="d-flex align-items-center gap-2">
          <span aria-hidden>{goal.icon ?? "💰"}</span>
          {goal.name}
        </span>
      </ModalHeader>

      <ModalBody>
        {goal.status && (
          <span className="fw-medium d-inline-block mb-3" style={{ fontSize: 12, color: statusColor }}>
            {statusLabel}
          </span>
        )}

        {hasDeadline && timeline ? (
          <>
            <div className={styles.timelineTrack}>
              <div className={styles.timelineFill} style={{ width: `${timeline.pct}%`, background: statusColor }} />
              <div className={styles.timelineMarker} style={{ left: `${timeline.pct}%`, background: statusColor }}>
                <FiFlag size={11} />
              </div>
            </div>
            <div className="d-flex justify-content-between text-body-secondary mb-3" style={{ fontSize: 11 }}>
              <span>{t("overview.goalStartedOn", { date: dateFmt.format(timeline.created) })}</span>
              <span>{t("overview.goalDeadlineOn", { date: dateFmt.format(timeline.deadline) })}</span>
            </div>

            <p className="mb-1" style={{ fontSize: 14 }}>
              <strong>{formatCurrency(goal.totalSaved)}</strong>{" "}
              <span className="text-body-secondary">{t("overview.goalOfTarget", { target: formatCurrency(goal.targetAmount ?? 0) })}</span>
            </p>
            <p className="mb-3" style={{ fontSize: 12.5, color: statusColor }}>
              {goal.status === "completed" || timeline.remaining <= 0
                ? t("overview.goalCompletedMsg")
                : timeline.projectedDate
                  ? t(timeline.projectedDate <= timeline.deadline ? "overview.goalProjectionEarly" : "overview.goalProjectionLate", { date: dateFmt.format(timeline.projectedDate) })
                  : t("overview.goalProjectionNone")}
            </p>
          </>
        ) : recurring ? (
          <>
            <Row className="g-2 mb-3">
              <Col xs={6}>
                <Fact
                  label={t(goal.targetPeriod === "yearly" ? "overview.thisPeriodYearly" : "overview.thisPeriodMonthly")}
                  value={formatCurrency(goal.currentPeriodSaved ?? 0)}
                />
              </Col>
              <Col xs={6}>
                <Fact label={t("goals.monthlyNeeded")} value={formatCurrency(goal.monthlyRequired ?? goal.yearlyRequired ?? 0)} />
              </Col>
              {!!goal.arrears && (
                <Col xs={6}>
                  <Fact label={t("goals.remainingLabel")} value={formatCurrency(goal.arrears)} accent="var(--color-expense)" />
                </Col>
              )}
              {!!goal.periodSurplus && (
                <Col xs={6}>
                  <Fact label={t("goals.onTrack")} value={formatCurrency(goal.periodSurplus)} accent="var(--color-income)" />
                </Col>
              )}
            </Row>
            <p className="text-body-secondary mb-3" style={{ fontSize: 12.5 }}>
              {t("overview.goalTotalSavedOverall", { amount: formatCurrency(goal.totalSaved) })}
            </p>
          </>
        ) : (
          <>
            <p className="fw-semibold mb-1" style={{ fontSize: 22 }}>
              {formatCurrency(goal.totalSaved)}
            </p>
            <p className="text-body-secondary mb-3" style={{ fontSize: 12.5 }}>
              {t("overview.goalOpenEndedHint")}
            </p>
          </>
        )}

        <div className="text-uppercase text-body-secondary mb-2" style={{ fontSize: 10, fontWeight: 600, letterSpacing: "0.06em" }}>
          {t("overview.recentActivity")}
        </div>

        {recentContributions.length === 0 ? (
          <p className="text-body-secondary mb-0" style={{ fontSize: 13 }}>
            {t("overview.noContributionsYet")}
          </p>
        ) : (
          <div className="d-flex flex-column gap-1">
            {recentContributions.map((c) => (
              <div
                key={c.id}
                className="d-flex align-items-center justify-content-between px-2 py-2"
                style={{ borderRadius: "var(--border-radius-sm)", background: "var(--color-background-secondary)", fontSize: 13 }}
              >
                <span className="text-body-secondary">{dateFmt.format(firestoreToDate(c.date))}</span>
                <span className="fw-semibold" style={{ color: c.contributionType === "withdrawal" ? "var(--color-expense)" : "var(--color-income)" }}>
                  {c.contributionType === "withdrawal" ? "−" : "+"}
                  {formatCurrency(c.amount)}
                </span>
              </div>
            ))}
          </div>
        )}
      </ModalBody>

      <ModalFooter className="d-flex justify-content-between">
        <Button color="secondary" outline onClick={onClose}>
          {t("common.close")}
        </Button>
        <Button
          color="primary"
          onClick={() => {
            onClose();
            navigate(manageTo);
          }}
        >
          {t("overview.manageGoal")}
        </Button>
      </ModalFooter>
    </Modal>
  );
}
