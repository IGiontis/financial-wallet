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
//  3. HistoryModal: fixed max-height, tabbed filter, compact rows, scroll shadow.
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
import type { InvestmentGoalWithStats, InvestmentGoalStatus, InvestmentContribution } from "../../../shared/types/IndexTypes";
import { useContributions } from "../useInvestments";

// ─── Helpers ──────────────────────────────────────────────────────────────────

export const toDate = (value: any): Date | undefined => {
  if (!value) return undefined;
  if (value instanceof Date) return value;
  if (value?.seconds) return new Date(value.seconds * 1000);
  return new Date(value);
};

export const formatDate = (date?: Date) =>
  date
    ? new Intl.DateTimeFormat("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      }).format(date)
    : "—";

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

  // FIX 2: Open-ended and recurring goals should never be treated as completed.
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

        {/* FIX 1: Tracking — only for non-targeted AND non-recurring goals */}
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

        {goal.notes && (
          <p
            style={{
              fontSize: 12,
              color: "var(--color-text-secondary)",
              fontStyle: "italic",
              marginBottom: "0.75rem",
            }}
          >
            {goal.notes}
          </p>
        )}

        {/* Action buttons */}
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
// Tabbed (All · Deposits · Withdrawals), fixed-height scrollable list,
// compact single-line rows, scroll shadow cue, transaction count footer.
// ─────────────────────────────────────────────────────────────────────────────

type HistoryTab = "all" | "deposits" | "withdrawals";

const HISTORY_TAB_LABELS: Record<HistoryTab, string> = {
  all: "All",
  deposits: "Deposits",
  withdrawals: "Withdrawals",
};

function HistorySummaryBar({
  totalDeposited,
  totalWithdrawn,
  totalSaved,
  formatCurrency,
}: {
  totalDeposited: number;
  totalWithdrawn: number;
  totalSaved: number;
  formatCurrency: (n: number) => string;
}) {
  const cells = [
    { label: "Deposited", value: formatCurrency(totalDeposited), color: "#10B981" },
    { label: "Withdrawn", value: formatCurrency(totalWithdrawn), color: "#EF4444" },
    { label: "Net saved", value: formatCurrency(totalSaved), color: "var(--color-text-primary)" },
  ];

  return (
    <div style={{ display: "flex", borderBottom: "0.5px solid var(--color-border-tertiary)" }}>
      {cells.map((c, i) => (
        <div
          key={c.label}
          style={{
            flex: 1,
            textAlign: "center",
            padding: "10px 8px",
            borderLeft: i > 0 ? "0.5px solid var(--color-border-tertiary)" : "none",
          }}
        >
          <p
            style={{
              fontSize: 10,
              fontWeight: 500,
              letterSpacing: "0.06em",
              textTransform: "uppercase",
              color: "var(--color-text-secondary)",
              margin: "0 0 2px",
            }}
          >
            {c.label}
          </p>
          <p style={{ fontSize: 15, fontWeight: 600, margin: 0, color: c.color }}>{c.value}</p>
        </div>
      ))}
    </div>
  );
}

function HistoryTabBar({ active, counts, onChange }: { active: HistoryTab; counts: Record<HistoryTab, number>; onChange: (tab: HistoryTab) => void }) {
  return (
    <div style={{ display: "flex", borderBottom: "0.5px solid var(--color-border-tertiary)" }}>
      {(["all", "deposits", "withdrawals"] as HistoryTab[]).map((tab) => {
        const isActive = active === tab;
        return (
          <button
            key={tab}
            onClick={() => onChange(tab)}
            style={{
              flex: 1,
              fontSize: 12,
              fontWeight: isActive ? 600 : 400,
              padding: "9px 0",
              textAlign: "center",
              background: "none",
              border: "none",
              borderBottom: isActive ? "2px solid var(--bs-primary)" : "2px solid transparent",
              color: isActive ? "var(--color-text-primary)" : "var(--color-text-secondary)",
              cursor: "pointer",
              transition: "color 0.15s",
            }}
          >
            {HISTORY_TAB_LABELS[tab]}
            <span
              style={{
                marginLeft: 5,
                fontSize: 11,
                color: isActive ? "var(--bs-primary)" : "var(--color-text-secondary)",
              }}
            >
              ({counts[tab]})
            </span>
          </button>
        );
      })}
    </div>
  );
}

function ContributionRow({ contribution, formatCurrency }: { contribution: InvestmentContribution; formatCurrency: (n: number) => string }) {
  const isDeposit = contribution.contributionType === "deposit";
  const color = isDeposit ? "#10B981" : "#EF4444";

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "8px 16px",
        borderBottom: "0.5px solid var(--color-border-tertiary)",
      }}
    >
      {/* Dot */}
      <div
        style={{
          width: 7,
          height: 7,
          borderRadius: "50%",
          background: color,
          flexShrink: 0,
        }}
      />

      {/* Date */}
      <span
        style={{
          fontSize: 12,
          color: "var(--color-text-secondary)",
          whiteSpace: "nowrap",
          minWidth: 88,
        }}
      >
        {formatDate(toDate(contribution.date))}
      </span>

      {/* Note */}
      <span
        title={contribution.notes}
        style={{
          fontSize: 12,
          color: "var(--color-text-secondary)",
          flex: 1,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {contribution.notes || "—"}
      </span>

      {/* Amount */}
      <span
        style={{
          fontSize: 13,
          fontWeight: 600,
          color,
          flexShrink: 0,
        }}
      >
        {isDeposit ? "+" : "−"}
        {formatCurrency(contribution.amount)}
      </span>
    </div>
  );
}

export function HistoryModal({ goal, onClose, formatCurrency }: { goal: InvestmentGoalWithStats; onClose: () => void; formatCurrency: (n: number) => string }) {
  const [activeTab, setActiveTab] = useState<HistoryTab>("all");
  const { data: contributions = [], isLoading } = useContributions(goal.id);

  const deposits = contributions.filter((c) => c.contributionType === "deposit");
  const withdrawals = contributions.filter((c) => c.contributionType === "withdrawal");

  const counts: Record<HistoryTab, number> = {
    all: contributions.length,
    deposits: deposits.length,
    withdrawals: withdrawals.length,
  };

  const filtered = activeTab === "deposits" ? deposits : activeTab === "withdrawals" ? withdrawals : contributions;

  return (
    <Modal isOpen toggle={onClose} size="md">
      <ModalHeader toggle={onClose} style={{ fontSize: 14, fontWeight: 500 }}>
        {goal.icon} {goal.name} — History
      </ModalHeader>

      <ModalBody style={{ padding: 0 }}>
        {/* Summary bar */}
        <HistorySummaryBar totalDeposited={goal.totalDeposited} totalWithdrawn={goal.totalWithdrawn} totalSaved={goal.totalSaved} formatCurrency={formatCurrency} />

        {/* Tabs */}
        <HistoryTabBar active={activeTab} counts={counts} onChange={setActiveTab} />

        {/* Content */}
        {isLoading ? (
          <div style={{ textAlign: "center", padding: "2rem" }}>
            <Spinner size="sm" />
          </div>
        ) : filtered.length === 0 ? (
          <p
            style={{
              color: "var(--color-text-secondary)",
              textAlign: "center",
              padding: "2rem 0",
              fontSize: 13,
              margin: 0,
            }}
          >
            {activeTab === "all" ? "No contributions yet." : `No ${activeTab} yet.`}
          </p>
        ) : (
          <div
            style={{
              maxHeight: 300,
              overflowY: "auto",
              // Scroll shadow: subtle fade at top/bottom when content overflows
              background: `
                linear-gradient(var(--color-background-primary) 30%, transparent),
                linear-gradient(transparent, var(--color-background-primary) 70%) bottom,
                linear-gradient(rgba(0,0,0,0.05), transparent),
                linear-gradient(transparent, rgba(0,0,0,0.05)) bottom
              `,
              backgroundRepeat: "no-repeat",
              backgroundSize: "100% 20px, 100% 20px, 100% 7px, 100% 7px",
              backgroundAttachment: "local, local, scroll, scroll",
            }}
          >
            {filtered.map((c) => (
              <ContributionRow key={c.id} contribution={c} formatCurrency={formatCurrency} />
            ))}
          </div>
        )}

        {/* Row count hint */}
        {!isLoading && filtered.length > 0 && (
          <p
            style={{
              fontSize: 11,
              color: "var(--color-text-secondary)",
              textAlign: "center",
              padding: "6px 0 8px",
              margin: 0,
              borderTop: "0.5px solid var(--color-border-tertiary)",
            }}
          >
            {filtered.length} {filtered.length === 1 ? "transaction" : "transactions"}
          </p>
        )}
      </ModalBody>

      <ModalFooter style={{ padding: "10px 16px" }}>
        <Button color="secondary" outline size="sm" onClick={onClose}>
          Close
        </Button>
      </ModalFooter>
    </Modal>
  );
}
