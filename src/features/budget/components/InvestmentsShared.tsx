// features/budget/investmentShared.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Shared helpers + components used by BOTH InvestmentsPage and GoalsPage.
//
// File location:  src/features/budget/investmentShared.tsx
//
// InvestmentsPage imports: import { ... } from "./investmentShared"
// GoalsPage imports:       import { ... } from "../budget/investmentShared"
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
  const isYearly = goal.targetPeriod === "yearly";
  const periodLabel = isYearly ? "year" : "month";

  const st = goal.status ? statusConfig[goal.status] : null;
  const isPaused = !goal.isActive && !goal.isCompleted;
  const isEffectivelyCompleted = goal.isCompleted && goal.goalType !== "open_ended" && !isRecurring;

  // ── Carryover values ───────────────────────────────────────────────────────
  const arrears = goal.arrears ?? 0;
  const missedMonths = goal.missedMonths ?? 0;
  const periodSurplus = goal.periodSurplus ?? 0;
  const hasDebt = arrears > 0;
  const isAhead = periodSurplus > 0;

  // ── Progress bar values ────────────────────────────────────────────────────
  const targetAmount = goal.targetAmount ?? 0;
  const currentPeriodSaved = goal.currentPeriodSaved ?? 0;
  const totalDue = targetAmount + arrears;

  // When debt exists the bar spans totalDue; divider marks where current month ends
  const pctOfTotal = totalDue > 0 ? Math.min((currentPeriodSaved / totalDue) * 100, 100) : 0;
  const currentMonthSegmentPct = totalDue > 0 ? (targetAmount / totalDue) * 100 : 100;

  // Non-recurring pct (targeted goals)
  const pct = Math.min(goal.percentageReached ?? 0, 100);

  const progressColor = goal.status === "completed" ? "success" : goal.status === "behind" ? "danger" : goal.status === "ahead" ? "info" : "success";

  // ── StatCell ───────────────────────────────────────────────────────────────
  type StatVariant = "neutral" | "red" | "green-current";

  const variantStyles: Record<StatVariant, { bg: string; border: string; labelColor: string; valColor: string }> = {
    neutral: {
      bg: "#ffffff",
      border: "rgb(191, 195, 201)",
      labelColor: "#414344",
      valColor: "var(--color-text-primary)",
    },
    red: {
      bg: "#FEF2F2",
      border: "#FECACA",
      labelColor: "#991B1B",
      valColor: "#B91C1C",
    },
    "green-current": {
      bg: "#DCFCE7",
      border: "#86EFAC",
      labelColor: "#15803D",
      valColor: "#15803D",
    },
  };

  const StatCell = ({ label, value, xs = 6, variant = "neutral" }: { label: string; value: string | number; xs?: number; variant?: StatVariant }) => {
    const s = variantStyles[variant];
    return (
      <Col xs={xs}>
        <div
          style={{
            background: s.bg,
            borderRadius: 8,
            padding: "8px 10px",
            border: `1.5px solid ${s.border}`,
          }}
        >
          <p style={{ fontSize: 13, fontWeight: 400, color: s.labelColor, margin: "0 0 2px" }}>{label}</p>
          <p style={{ fontSize: 15, fontWeight: 600, margin: 0, color: s.valColor }}>{value}</p>
        </div>
      </Col>
    );
  };
  // ── Recurring progress bar ─────────────────────────────────────────────────
  const RecurringProgressBar = () => {
    // Ahead and no debt: simple full green bar
    if (isAhead && !hasDebt) {
      return (
        <div
          style={{
            height: 8,
            borderRadius: 4,
            background: "#D1FAE5",
            marginBottom: 6,
            overflow: "hidden",
          }}
        >
          <div style={{ height: 8, borderRadius: 4, background: "#10B981", width: "100%" }} />
        </div>
      );
    }

    // Debt: segmented bar — blue tint for current month portion, red tint for arrears
    if (hasDebt) {
      return (
        <div
          style={{
            position: "relative",
            height: 8,
            borderRadius: 4,
            overflow: "hidden",
            marginBottom: 6,
          }}
        >
          {/* Current month background segment */}
          <div
            style={{
              position: "absolute",
              left: 0,
              width: `${currentMonthSegmentPct}%`,
              height: "100%",
              background: "#BFDBFE",
            }}
          />
          {/* Arrears background segment */}
          <div
            style={{
              position: "absolute",
              left: `${currentMonthSegmentPct}%`,
              width: `${100 - currentMonthSegmentPct}%`,
              height: "100%",
              background: "#FECACA",
            }}
          />
          {/* Payment fill */}
          <div
            style={{
              position: "absolute",
              left: 0,
              width: `${pctOfTotal}%`,
              height: "100%",
              background: "#3B82F6",
              borderRadius: "4px 0 0 4px",
              zIndex: 2,
            }}
          />
          {/* White divider between current month and arrears */}
          <div
            style={{
              position: "absolute",
              left: `calc(${currentMonthSegmentPct}% - 1px)`,
              top: 0,
              width: 2,
              height: "100%",
              background: "#fff",
              zIndex: 3,
            }}
          />
        </div>
      );
    }

    // Normal: standard reactstrap progress bar
    return <Progress value={pct} color={progressColor} style={{ height: 8, borderRadius: 4, marginBottom: 6 }} />;
  };

  // ── Recurring progress note ────────────────────────────────────────────────
  const recurringNote = () => {
    if (hasDebt) {
      return (
        <p style={{ fontSize: 12, color: "var(--color-text-secondary)", marginBottom: "0.75rem" }}>
          {pctOfTotal.toFixed(0)}% of total due
          {" · "}
          <span style={{ fontWeight: 600, color: "var(--color-text-primary)" }}>{formatCurrency(Math.max(totalDue - currentPeriodSaved, 0))}</span> remaining
        </p>
      );
    }

    if (isAhead) {
      return (
        <p style={{ fontSize: 12, color: "var(--color-text-secondary)", marginBottom: "0.75rem" }}>
          {"100% · "}
          <span style={{ fontWeight: 600, color: "#10B981" }}>
            {formatCurrency(periodSurplus)} surplus this {periodLabel}
          </span>
        </p>
      );
    }

    return (
      <p style={{ fontSize: 12, color: "var(--color-text-secondary)", marginBottom: "0.75rem" }}>
        <span style={{ fontWeight: 600, color: "var(--color-text-primary)" }}>{pct.toFixed(1)}%</span> of {periodLabel} target
        {(goal.remaining ?? 0) > 0 && (
          <>
            {" · "}
            <span style={{ fontWeight: 600, color: "var(--color-text-primary)" }}>{formatCurrency(goal.remaining!)}</span> remaining
          </>
        )}
      </p>
    );
  };

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
        {/* ── Header ─────────────────────────────────────────────────────── */}
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

        {/* ── Recurring: progress bar + note ─────────────────────────────── */}
        {isRecurring && targetAmount > 0 && (
          <>
            <RecurringProgressBar />
            {recurringNote()}
          </>
        )}

        {/* ── Targeted: deadline progress ─────────────────────────────────── */}
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

        {/* ── Open-ended tracking: big total number ───────────────────────── */}
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

        {/* ── Stat mini cards ─────────────────────────────────────────────── */}
        <Row className="g-2 mb-3">
          {/* Debt cards — only when arrears exist */}
          {isRecurring && hasDebt && <StatCell label={isYearly ? "Years behind" : "Months behind"} value={missedMonths} variant="red" />}
          {isRecurring && hasDebt && <StatCell label="Arrears" value={formatCurrency(arrears)} variant="red" />}

          {/* Surplus card — only when ahead this period */}
          {isRecurring && isAhead && <StatCell label="Surplus"value={formatCurrency(periodSurplus)} variant="green-current" />}

          {/* Standard recurring stats */}
          {isRecurring && <StatCell label={`This ${periodLabel}`} value={formatCurrency(currentPeriodSaved)} />}
          {isRecurring && <StatCell label="Target" value={formatCurrency(targetAmount)} />}
          {isRecurring && <StatCell label="All-time saved" value={formatCurrency(goal.totalSaved)} />}

          {/* Non-recurring stats */}
          {!isRecurring && goal.monthlyRequired !== undefined && <StatCell label="Monthly needed" value={formatCurrency(goal.monthlyRequired)} />}
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

        {/* ── Action buttons ──────────────────────────────────────────────── */}
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
      <div
        style={{
          width: 7,
          height: 7,
          borderRadius: "50%",
          background: color,
          flexShrink: 0,
        }}
      />
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
      <span style={{ fontSize: 13, fontWeight: 600, color, flexShrink: 0 }}>
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
        <HistorySummaryBar totalDeposited={goal.totalDeposited} totalWithdrawn={goal.totalWithdrawn} totalSaved={goal.totalSaved} formatCurrency={formatCurrency} />

        <HistoryTabBar active={activeTab} counts={counts} onChange={setActiveTab} />

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
