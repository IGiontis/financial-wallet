// features/budget/investmentShared.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Shared helpers + components used by BOTH InvestmentsPage and GoalsPage.
//
// File location:  src/features/budget/investmentShared.tsx
//
// InvestmentsPage imports: import { ... } from "./investmentShared"
// GoalsPage imports:       import { ... } from "../budget/investmentShared"
//
// FIXES APPLIED:
//  1. Tracking section: added !isRecurring guard so it doesn't double-render
//     on recurring goals whose goalType is not "targeted".
//  2. Deposit/Withdraw buttons: open-ended goals (goalType === "open_ended")
//     are never treated as completed, so buttons always appear for them.
// ─────────────────────────────────────────────────────────────────────────────

import { useState } from "react";
import {
  Badge,
  Button,
  Card,
  CardBody,
  Col,
  Dropdown,
  DropdownItem,
  DropdownMenu,
  DropdownToggle,
  Modal,
  ModalBody,
  ModalFooter,
  ModalHeader,
  Progress,
  Row,
  Spinner,
} from "reactstrap";
import { FiMoreVertical } from "react-icons/fi";
import type { InvestmentGoalWithStats, InvestmentGoalStatus } from "../../../shared/types/IndexTypes";
import { useContributions } from "../useInvestments";

// ─── Helpers ──────────────────────────────────────────────────────────────────

export const toDate = (value: any): Date | undefined => {
  if (!value) return undefined;
  if (value instanceof Date) return value;
  if (value?.seconds) return new Date(value.seconds * 1000);
  return new Date(value);
};

export const formatDate = (date?: Date) => (date ? new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(date) : "—");

export const statusConfig: Record<InvestmentGoalStatus, { label: string; color: string }> = {
  on_track: { label: "On track", color: "success" },
  behind: { label: "Behind", color: "danger" },
  ahead: { label: "Ahead", color: "info" },
  completed: { label: "Completed", color: "secondary" },
};

export function getGoalTypeLabel(goal: InvestmentGoalWithStats): string {
  if (goal.targetPeriod === "monthly") return "Recurring · Monthly";
  if (goal.targetPeriod === "yearly") return "Recurring · Yearly";
  if (goal.goalType === "targeted") return "Goal";
  return "Tracking";
}

export function getGoalTypeBadgeColor(goal: InvestmentGoalWithStats): string {
  if (goal.targetPeriod === "monthly" || goal.targetPeriod === "yearly") return "primary";
  if (goal.goalType === "targeted") return "warning";
  return "secondary";
}

// ─── GoalCard ─────────────────────────────────────────────────────────────────

export interface GoalCardProps {
  goal: InvestmentGoalWithStats;
  showTypeBadge?: boolean;
  onViewHistory: (goal: InvestmentGoalWithStats) => void;
  onAddDeposit: (goal: InvestmentGoalWithStats) => void;
  onWithdraw: (goal: InvestmentGoalWithStats) => void;
  onDelete: (goal: InvestmentGoalWithStats) => void;
  onEdit: (goal: InvestmentGoalWithStats) => void;
  onTogglePause: (goal: InvestmentGoalWithStats) => void;
  formatCurrency: (n: number) => string;
}

export function GoalCard({ goal, showTypeBadge = false, onViewHistory, onAddDeposit, onWithdraw, onDelete, onEdit, onTogglePause, formatCurrency }: GoalCardProps) {
  const [menuOpen, setMenuOpen] = useState(false);

  const isTargetedGoal = goal.goalType === "targeted";
  const isRecurring = goal.targetPeriod === "monthly" || goal.targetPeriod === "yearly";
  const pct = Math.min(goal.percentageReached ?? 0, 100);
  const st = goal.status ? statusConfig[goal.status] : null;
  const isPaused = !goal.isActive && !goal.isCompleted;

  const progressColor = goal.status === "completed" ? "success" : goal.status === "behind" ? "danger" : goal.status === "ahead" ? "info" : "success";

  // FIX 2: Open-ended tracking goals should never be treated as completed.
  // If isCompleted is incorrectly set to true for an open_ended goal
  // (e.g. because percentageReached hit 100 due to a bad calculation),
  // we ignore it so the deposit/withdraw buttons always remain visible.
const isEffectivelyCompleted = goal.isCompleted && goal.goalType !== "open_ended" && !isRecurring;

  const StatCell = ({ label, value, xs = 6 }: { label: string; value: string | number; xs?: number }) => (
    <Col xs={xs}>
      <div
        style={{
          background: "var(--color-background-secondary)",
          borderRadius: "var(--border-radius-md)",
          padding: "8px 10px",
        }}
      >
        <p style={{ fontSize: 13, fontWeight: 400, color: "#414344", margin: "0 0 2px" }}>{label}</p>
        <p style={{ fontSize: 15, fontWeight: 600, margin: 0, color: "var(--color-text-primary)" }}>{value}</p>
      </div>
    </Col>
  );

  return (
    <Card
      className="mb-3 h-100"
      style={{
        border: "0.5px solid var(--color-border-tertiary)",
        borderRadius: "var(--border-radius-lg)",
        boxShadow: "none",
        opacity: isPaused ? 0.72 : 1,
        transition: "opacity 0.2s",
      }}
    >
      <CardBody style={{ display: "flex", flexDirection: "column", height: "100%" }}>
        {/* Header */}
        <div className="d-flex justify-content-between gap-3 align-items-start mb-3">
          <div className="d-flex align-items-center gap-2" style={{ minWidth: 0 }}>
            <span style={{ fontSize: 24, flexShrink: 0 }}>{goal.icon ?? "💰"}</span>
            <div style={{ minWidth: 0 }}>
              <p
                style={{
                  fontWeight: 600,
                  margin: 0,
                  color: "var(--color-text-primary)",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {goal.name}
              </p>
              <div className="d-flex align-items-center gap-1 flex-wrap">
                <p style={{ fontSize: 11, color: "var(--color-text-secondary)", margin: 0 }}>{getGoalTypeLabel(goal)}</p>
                {showTypeBadge && (
                  <Badge color={getGoalTypeBadgeColor(goal)} style={{ fontSize: 10, padding: "2px 6px" }}>
                    {getGoalTypeLabel(goal).split(" · ")[0]}
                  </Badge>
                )}
              </div>
            </div>
          </div>

          <div className="d-flex align-items-center gap-2" style={{ flexShrink: 0 }}>
            <div className="d-flex flex-column align-items-end gap-1">
              {st && (
                <Badge color={st.color} style={{ fontSize: 11 }}>
                  {st.label}
                </Badge>
              )}
              {isPaused && (
                <Badge color="warning" style={{ fontSize: 11 }}>
                  Paused
                </Badge>
              )}
            </div>
            <Dropdown isOpen={menuOpen} toggle={() => setMenuOpen((o) => !o)}>
              <DropdownToggle
                tag="button"
                style={{
                  background: "transparent",
                  border: "none",
                  padding: "2px 4px",
                  cursor: "pointer",
                  color: "var(--color-text-secondary)",
                  lineHeight: 1,
                }}
              >
                <FiMoreVertical size={16} />
              </DropdownToggle>
              <DropdownMenu end>
                <DropdownItem style={{ fontSize: 13 }} onClick={() => onEdit(goal)} disabled={isEffectivelyCompleted}>
                  Edit
                </DropdownItem>
                <DropdownItem style={{ fontSize: 13 }} onClick={() => onTogglePause(goal)} disabled={isEffectivelyCompleted}>
                  {goal.isActive ? "Pause" : "Resume"}
                </DropdownItem>
                <DropdownItem divider />
                <DropdownItem style={{ fontSize: 13, color: "var(--bs-danger)" }} onClick={() => onDelete(goal)}>
                  Delete
                </DropdownItem>
              </DropdownMenu>
            </Dropdown>
          </div>
        </div>

        {/* Recurring: current period progress */}
        {isRecurring && goal.targetAmount && (
          <>
            <div className="d-flex justify-content-between mb-1">
              <span style={{ fontSize: 13, fontWeight: 600, color: "var(--color-text-primary)" }}>
                {formatCurrency(goal.currentPeriodSaved ?? 0)}
                <span style={{ fontWeight: 400, color: "var(--color-text-secondary)" }}> this {goal.targetPeriod === "monthly" ? "month" : "year"}</span>
              </span>
              <span style={{ fontSize: 13, color: "var(--color-text-secondary)" }}>{formatCurrency(goal.targetAmount)} target</span>
            </div>
            <Progress value={pct} color={progressColor} style={{ height: 8, borderRadius: 4, marginBottom: "0.5rem" }} />
            <p style={{ fontSize: 12, color: "var(--color-text-secondary)", marginBottom: "0.75rem" }}>
              <span style={{ fontWeight: 600, color: "var(--color-text-primary)" }}>{pct.toFixed(1)}%</span> of {goal.targetPeriod === "monthly" ? "monthly" : "yearly"} target
              {(goal.remaining ?? 0) > 0 && (
                <>
                  {" · "}
                  <span style={{ fontWeight: 600, color: "var(--color-text-primary)" }}>{formatCurrency(goal.remaining!)}</span> remaining
                </>
              )}
            </p>
          </>
        )}

        {/* Targeted: deadline progress */}
        {isTargetedGoal && !isRecurring && goal.targetAmount && (
          <>
            <div className="d-flex justify-content-between mb-1">
              <span style={{ fontSize: 13, fontWeight: 600, color: "var(--color-text-primary)" }}>{formatCurrency(goal.totalSaved)}</span>
              <span style={{ fontSize: 13, color: "var(--color-text-secondary)" }}>of {formatCurrency(goal.targetAmount)}</span>
            </div>
            <Progress value={pct} color={progressColor} style={{ height: 8, borderRadius: 4, marginBottom: "0.5rem" }} />
            <p style={{ fontSize: 12, color: "var(--color-text-secondary)", marginBottom: "0.75rem" }}>
              <span style={{ fontWeight: 600, color: "var(--color-text-primary)" }}>{pct.toFixed(1)}%</span> reached
              {(goal.remaining ?? 0) > 0 && (
                <>
                  {" · "}
                  <span style={{ fontWeight: 600, color: "var(--color-text-primary)" }}>{formatCurrency(goal.remaining!)}</span> remaining
                </>
              )}
            </p>
          </>
        )}

        {/* FIX 1: Tracking — only render for non-targeted AND non-recurring goals.
            Previously `!isTargetedGoal` was true for recurring goals whose
            goalType happened not to be "targeted", causing this block to render
            alongside the recurring progress block above. */}
        {!isTargetedGoal && !isRecurring && (
          <div className="mb-3">
            <p style={{ fontSize: 22, fontWeight: 600, margin: 0, color: "var(--color-text-primary)" }}>{formatCurrency(goal.totalSaved)}</p>
            <p
              style={{
                fontSize: 11,
                color: "var(--color-text-secondary)",
                margin: 0,
                textTransform: "uppercase",
                letterSpacing: "0.04em",
              }}
            >
              total saved
            </p>
          </div>
        )}

        {/* Stat mini cards */}
        <Row className="g-2 mb-3">
          {isRecurring && <StatCell label="All-time saved" value={formatCurrency(goal.totalSaved)} />}
          {goal.monthlyRequired !== undefined && !isRecurring && <StatCell label="Monthly needed" value={formatCurrency(goal.monthlyRequired)} />}
          {goal.monthsLeft !== undefined && <StatCell label="Months left" value={goal.monthsLeft} />}
          {goal.deadline && <StatCell label="Deadline" value={formatDate(toDate(goal.deadline))} />}
          <StatCell label="Contributions" value={goal.contributionCount} xs={isRecurring || goal.monthlyRequired !== undefined ? 6 : 12} />
        </Row>

        {goal.notes && <p style={{ fontSize: 12, color: "var(--color-text-secondary)", fontStyle: "italic", marginBottom: "0.75rem" }}>{goal.notes}</p>}

        {/* Action buttons
            FIX 2: Use isEffectivelyCompleted instead of goal.isCompleted so that
            open-ended tracking goals always show deposit/withdraw regardless of
            what the backend returns for isCompleted. */}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: "auto" }}>
          {!isEffectivelyCompleted && (
            <Button size="sm" color="primary" style={{ flex: "1 1 auto", minWidth: 100 }} onClick={() => onAddDeposit(goal)}>
              Add deposit
            </Button>
          )}
          {goal.totalSaved > 0 && !isEffectivelyCompleted && (
            <Button size="sm" color="secondary" outline style={{ flex: "1 1 auto", minWidth: 80 }} onClick={() => onWithdraw(goal)}>
              Withdraw
            </Button>
          )}
          <Button size="sm" color="secondary" outline style={{ flex: "1 1 auto", minWidth: 70 }} onClick={() => onViewHistory(goal)}>
            History
          </Button>
        </div>
      </CardBody>
    </Card>
  );
}

// ─── DeleteConfirmModal ───────────────────────────────────────────────────────

export function DeleteConfirmModal({ goal, isDeleting, onConfirm, onClose }: { goal: InvestmentGoalWithStats; isDeleting: boolean; onConfirm: () => void; onClose: () => void }) {
  return (
    <Modal isOpen toggle={onClose} size="sm">
      <ModalHeader toggle={onClose}>Delete</ModalHeader>
      <ModalBody>
        <p style={{ fontSize: 14, margin: 0 }}>
          Are you sure you want to delete{" "}
          <strong>
            {goal.icon} {goal.name}
          </strong>
          ?
        </p>
        <p style={{ fontSize: 13, color: "var(--color-text-secondary)", marginTop: 8, marginBottom: 0 }}>
          This will permanently delete the goal and all its contribution history. This cannot be undone.
        </p>
      </ModalBody>
      <ModalFooter>
        <Button color="secondary" outline onClick={onClose} disabled={isDeleting}>
          Cancel
        </Button>
        <Button color="danger" onClick={onConfirm} disabled={isDeleting}>
          {isDeleting ? "Deleting..." : "Delete"}
        </Button>
      </ModalFooter>
    </Modal>
  );
}

// ─── HistoryModal ─────────────────────────────────────────────────────────────

export function HistoryModal({ goal, onClose, formatCurrency }: { goal: InvestmentGoalWithStats; onClose: () => void; formatCurrency: (n: number) => string }) {
  const { data: contributions = [], isLoading } = useContributions(goal.id);

  return (
    <Modal isOpen toggle={onClose} size="md">
      <ModalHeader toggle={onClose}>
        {goal.icon} {goal.name} — History
      </ModalHeader>
      <ModalBody>
        {/* Summary */}
        <div className="d-flex gap-2 mb-3">
          {[
            { label: "Deposited", value: goal.totalDeposited, color: "#10B981" },
            { label: "Withdrawn", value: goal.totalWithdrawn, color: "#EF4444" },
            { label: "Net saved", value: goal.totalSaved, color: "var(--color-text-primary)" },
          ].map((s) => (
            <div
              key={s.label}
              style={{
                flex: 1,
                background: "var(--color-background-secondary)",
                borderRadius: "var(--border-radius-md)",
                padding: "10px 8px",
                textAlign: "center",
              }}
            >
              <p
                style={{
                  fontSize: 11,
                  color: "var(--color-text-secondary)",
                  margin: "0 0 4px",
                  textTransform: "uppercase",
                  letterSpacing: "0.05em",
                }}
              >
                {s.label}
              </p>
              <p style={{ fontSize: 14, fontWeight: 600, margin: 0, color: s.color }}>{formatCurrency(s.value)}</p>
            </div>
          ))}
        </div>

        {/* Contributions */}
        {isLoading ? (
          <div className="text-center py-4">
            <Spinner size="sm" />
          </div>
        ) : contributions.length === 0 ? (
          <p style={{ color: "var(--color-text-secondary)", textAlign: "center", padding: "2rem 0" }}>No contribution history yet.</p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {contributions.map((c) => (
              <div
                key={c.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  padding: "10px 12px",
                  background: "var(--color-background-secondary)",
                  borderRadius: "var(--border-radius-md)",
                  borderLeft: `3px solid ${c.contributionType === "deposit" ? "#10B981" : "#EF4444"}`,
                }}
              >
                {/* Left: date + badge + note */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="d-flex align-items-center gap-2 mb-1">
                    <span style={{ fontSize: 12, color: "var(--color-text-secondary)", whiteSpace: "nowrap" }}>{formatDate(toDate(c.date))}</span>
                    <Badge color={c.contributionType === "deposit" ? "success" : "danger"} style={{ fontSize: 10 }}>
                      {c.contributionType}
                    </Badge>
                  </div>
                  {c.notes && (
                    <p
                      title={c.notes}
                      style={{
                        fontSize: 11,
                        color: "var(--color-text-secondary)",
                        margin: 0,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                        maxWidth: 220,
                      }}
                    >
                      {c.notes}
                    </p>
                  )}
                </div>

                {/* Right: amount */}
                <span
                  style={{
                    fontSize: 14,
                    fontWeight: 600,
                    color: c.contributionType === "deposit" ? "#10B981" : "#EF4444",
                    flexShrink: 0,
                  }}
                >
                  {c.contributionType === "withdrawal" ? "−" : "+"}
                  {formatCurrency(c.amount)}
                </span>
              </div>
            ))}
          </div>
        )}
      </ModalBody>
      <ModalFooter>
        <Button color="secondary" outline onClick={onClose}>
          Close
        </Button>
      </ModalFooter>
    </Modal>
  );
}
