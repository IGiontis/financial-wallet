import { useState } from "react";
import {
  Container,
  Row,
  Col,
  Card,
  CardBody,
  Badge,
  Button,
  Progress,
  Modal,
  ModalHeader,
  ModalBody,
  ModalFooter,
  Table,
  Spinner,
  Alert,
  Dropdown,
  DropdownToggle,
  DropdownMenu,
  DropdownItem,
  Nav,
  NavItem,
  NavLink,
  Input,
} from "reactstrap";
import { FiMoreVertical } from "react-icons/fi";
import type {
  InvestmentGoalWithStats,
  CreateInvestmentContributionDTO,
  CreateInvestmentGoalDTO,
  UpdateInvestmentGoalDTO,
  InvestmentGoalStatus,
} from "../../shared/types/IndexTypes";
import AddDepositModal from "./AddDepositModal";
import WithdrawModal from "./WithdrawModal";
import AddNewGoalModal from "./AddNewGoalModal";
import EditGoalModal from "./EditGoalModal";
import { useCurrencyConverter } from "../../shared/hooks/useCurrencyConverter";
import { useInvestmentGoals, useContributions, useCreateGoal, useAddContribution, useDeleteGoal, useUpdateGoal } from "./useInvestments";

// ─── Helpers ──────────────────────────────────────────────────────────────────

const toDate = (value: any): Date | undefined => {
  if (!value) return undefined;
  if (value instanceof Date) return value;
  if (value?.seconds) return new Date(value.seconds * 1000);
  return new Date(value);
};

const formatDate = (date?: Date) => (date ? new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(date) : "—");

const statusConfig: Record<InvestmentGoalStatus, { label: string; color: string }> = {
  on_track: { label: "On track", color: "success" },
  behind: { label: "Behind", color: "danger" },
  ahead: { label: "Ahead", color: "info" },
  completed: { label: "Completed", color: "secondary" },
};

// ─── Goal type helpers ─────────────────────────────────────────────────────────

function getGoalTypeLabel(goal: InvestmentGoalWithStats): string {
  if (goal.targetPeriod === "monthly") return "Recurring · Monthly";
  if (goal.targetPeriod === "yearly") return "Recurring · Yearly";
  if (goal.goalType === "targeted") return "Goal";
  return "Tracking";
}

function getGoalTypeBadgeColor(goal: InvestmentGoalWithStats): string {
  if (goal.targetPeriod === "monthly" || goal.targetPeriod === "yearly") return "primary";
  if (goal.goalType === "targeted") return "warning";
  return "secondary";
}

type FilterTab = "all" | "recurring" | "goals" | "tracking" | "completed";

// ─── SummaryCards ─────────────────────────────────────────────────────────────

function SummaryCards({ goals, formatCurrency }: { goals: InvestmentGoalWithStats[]; formatCurrency: (n: number) => string }) {
  const active = goals.filter((g) => g.isActive && !g.isCompleted);
  const completed = goals.filter((g) => g.isCompleted);
  const paused = goals.filter((g) => !g.isActive && !g.isCompleted);

  // Total saved — only from recurring goals (monthly / yearly)
  const recurringGoals = goals.filter((g) => g.targetPeriod === "monthly" || g.targetPeriod === "yearly");
  const totalSaved = recurringGoals.reduce((s, g) => s + g.totalSaved, 0);

  // Monthly needed — only active recurring goals (no paused)
  const totalMonthly = active.filter((g) => g.targetPeriod === "monthly" || g.targetPeriod === "yearly").reduce((sum, g) => sum + (g.monthlyRequired ?? 0), 0);

  // Remaining — only deadline / one-time targeted goals
  const remainingTotal = goals
    .filter((g) => g.goalType === "targeted" && g.targetPeriod !== "monthly" && g.targetPeriod !== "yearly" && !g.isCompleted)
    .reduce((sum, g) => sum + (g.remaining ?? 0), 0);

  const onTrack = active.filter((g) => g.status === "on_track" || g.status === "ahead").length;
  const targetedActive = active.filter((g) => g.goalType === "targeted").length;

  const onTrackRatio = targetedActive > 0 ? onTrack / targetedActive : 1;
  const onTrackColor = onTrackRatio === 1 ? "var(--bs-success)" : onTrackRatio >= 0.5 ? "var(--bs-warning)" : "var(--bs-danger)";

  const cards: {
    label: string;
    value: string;
    sub: string;
    valueColor?: string;
  }[] = [
    {
      label: "Total saved",
      value: formatCurrency(totalSaved),
      sub: `from ${recurringGoals.length} recurring goal${recurringGoals.length !== 1 ? "s" : ""}`,
    },
    {
      label: "Monthly needed",
      value: formatCurrency(totalMonthly),
      sub: "active recurring only",
    },
    {
      label: "Remaining",
      value: formatCurrency(remainingTotal),
      sub: "to reach deadline goals",
    },
    {
      label: "Active goals",
      value: String(active.length),
      sub: paused.length > 0 ? `${paused.length} paused` : "none paused",
    },
    {
      label: "On track",
      value: `${onTrack} / ${targetedActive}`,
      sub: "targeted goals",
      valueColor: onTrackColor,
    },
    {
      label: "Completed",
      value: String(completed.length),
      sub: completed.length === 1 ? "goal reached" : "goals reached",
    },
  ];

  return (
    <Row className="g-3 mb-4">
      {cards.map((c) => (
        <Col xs={6} md={4} xl={2} className="d-flex" key={c.label}>
          <Card className="text-center h-100 w-100">
            <CardBody className="d-flex p-1">
              <div
                style={{
                  background: "var(--color-background-secondary)",
                  borderRadius: "var(--border-radius-md)",
                  padding: "1rem",
                  width: "100%",
                  display: "flex",
                  flexDirection: "column",
                  justifyContent: "center",
                }}
              >
                <p
                  style={{
                    fontSize: 12,
                    color: "var(--color-text-secondary)",
                    margin: "0 0 4px",
                    textTransform: "uppercase",
                    letterSpacing: "0.04em",
                    fontWeight: 500,
                  }}
                >
                  {c.label}
                </p>
                <p
                  style={{
                    fontSize: 20,
                    fontWeight: 500,
                    margin: 0,
                    color: c.valueColor ?? "var(--color-text-primary)",
                  }}
                >
                  {c.value}
                </p>
                {c.sub && <p style={{ fontSize: 11, color: "var(--color-text-secondary)", margin: "2px 0 0" }}>{c.sub}</p>}
              </div>
            </CardBody>
          </Card>
        </Col>
      ))}
    </Row>
  );
}

// ─── GoalCard ─────────────────────────────────────────────────────────────────

interface GoalCardProps {
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

function GoalCard({ goal, showTypeBadge = false, onViewHistory, onAddDeposit, onWithdraw, onDelete, onEdit, onTogglePause, formatCurrency }: GoalCardProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const isTargeted = goal.goalType === "targeted";
  const isRecurring = goal.targetPeriod === "monthly" || goal.targetPeriod === "yearly";
  const pct = Math.min(goal.percentageReached ?? 0, 100);
  const st = goal.status ? statusConfig[goal.status] : null;
  const progressColor = goal.status === "completed" ? "success" : goal.status === "behind" ? "danger" : goal.status === "ahead" ? "info" : "success";

  return (
    <Card
      className="mb-3 h-100"
      style={{
        border: "0.5px solid var(--color-border-tertiary)",
        borderRadius: "var(--border-radius-lg)",
        boxShadow: "none",
      }}
    >
      <CardBody>
        {/* Header */}
        <div className="d-flex justify-content-between gap-3 align-items-start mb-3">
          <div className="d-flex align-items-center gap-2" style={{ minWidth: 0 }}>
            <span style={{ fontSize: 24, flexShrink: 0 }}>{goal.icon ?? "💰"}</span>
            <div style={{ minWidth: 0 }}>
              <p style={{ fontWeight: 500, margin: 0, color: "var(--color-text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{goal.name}</p>
              <div className="d-flex align-items-center gap-1 flex-wrap">
                <p style={{ fontSize: 12, color: "var(--color-text-secondary)", margin: 0 }}>{getGoalTypeLabel(goal)}</p>
                {/* Type badge shown when searching across all types */}
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
              {!goal.isActive && !goal.isCompleted && (
                <Badge color="warning" style={{ fontSize: 11 }}>
                  Paused
                </Badge>
              )}
            </div>
            <Dropdown isOpen={menuOpen} toggle={() => setMenuOpen((o) => !o)} direction="down">
              <DropdownToggle
                tag="button"
                style={{ background: "transparent", border: "none", padding: "2px 4px", cursor: "pointer", color: "var(--color-text-secondary)", lineHeight: 1 }}
              >
                <FiMoreVertical size={16} />
              </DropdownToggle>
              <DropdownMenu end>
                <DropdownItem style={{ fontSize: 13 }} onClick={() => onEdit(goal)} disabled={goal.isCompleted}>
                  Edit goal
                </DropdownItem>
                <DropdownItem style={{ fontSize: 13 }} onClick={() => onTogglePause(goal)} disabled={goal.isCompleted}>
                  {goal.isActive ? "Pause goal" : "Resume goal"}
                </DropdownItem>
                <DropdownItem divider />
                <DropdownItem style={{ fontSize: 13, color: "var(--bs-danger)" }} onClick={() => onDelete(goal)}>
                  Delete goal
                </DropdownItem>
              </DropdownMenu>
            </Dropdown>
          </div>
        </div>

        {/* Recurring goal — current period progress */}
        {isRecurring && goal.targetAmount && (
          <>
            <div className="d-flex justify-content-between mb-1">
              <span style={{ fontSize: 13, color: "var(--color-text-secondary)" }}>
                {formatCurrency(goal.currentPeriodSaved ?? 0)} this {goal.targetPeriod === "monthly" ? "month" : "year"}
              </span>
              <span style={{ fontSize: 13, color: "var(--color-text-secondary)" }}>{formatCurrency(goal.targetAmount)} target</span>
            </div>
            <Progress value={pct} color={progressColor} style={{ height: 8, borderRadius: 4, marginBottom: "0.5rem" }} />
            <p style={{ fontSize: 12, color: "var(--color-text-secondary)", marginBottom: "0.75rem" }}>
              {pct.toFixed(1)}% of {goal.targetPeriod === "monthly" ? "monthly" : "yearly"} target
              {(goal.remaining ?? 0) > 0 && ` · ${formatCurrency(goal.remaining!)} remaining`}
            </p>
          </>
        )}

        {/* One-time targeted goal — deadline progress */}
        {isTargeted && !isRecurring && goal.targetAmount && (
          <>
            <div className="d-flex justify-content-between mb-1">
              <span style={{ fontSize: 13, color: "var(--color-text-secondary)" }}>{formatCurrency(goal.totalSaved)}</span>
              <span style={{ fontSize: 13, color: "var(--color-text-secondary)" }}>{formatCurrency(goal.targetAmount)}</span>
            </div>
            <Progress value={pct} color={progressColor} style={{ height: 8, borderRadius: 4, marginBottom: "0.5rem" }} />
            <p style={{ fontSize: 12, color: "var(--color-text-secondary)", marginBottom: "0.75rem" }}>
              {pct.toFixed(1)}% reached
              {(goal.remaining ?? 0) > 0 && ` · ${formatCurrency(goal.remaining!)} remaining`}
            </p>
          </>
        )}

        {/* Tracking (open-ended) — just show total */}
        {!isTargeted && (
          <div className="mb-3">
            <p style={{ fontSize: 22, fontWeight: 500, margin: 0 }}>{formatCurrency(goal.totalSaved)}</p>
            <p style={{ fontSize: 12, color: "var(--color-text-secondary)", margin: 0 }}>total saved</p>
          </div>
        )}

        {/* Stats mini cards */}
        <Row className="g-2 mb-3">
          {isRecurring && (
            <Col xs={6}>
              <div style={{ background: "var(--color-background-secondary)", borderRadius: "var(--border-radius-md)", padding: "8px 10px" }}>
                <p style={{ fontSize: 11, color: "var(--color-text-secondary)", margin: "0 0 2px" }}>All-time saved</p>
                <p style={{ fontSize: 13, fontWeight: 500, margin: 0 }}>{formatCurrency(goal.totalSaved)}</p>
              </div>
            </Col>
          )}
          {goal.monthlyRequired !== undefined && !isRecurring && (
            <Col xs={6}>
              <div style={{ background: "var(--color-background-secondary)", borderRadius: "var(--border-radius-md)", padding: "8px 10px" }}>
                <p style={{ fontSize: 11, color: "var(--color-text-secondary)", margin: "0 0 2px" }}>Monthly needed</p>
                <p style={{ fontSize: 13, fontWeight: 500, margin: 0 }}>{formatCurrency(goal.monthlyRequired)}</p>
              </div>
            </Col>
          )}
          {goal.monthsLeft !== undefined && (
            <Col xs={6}>
              <div style={{ background: "var(--color-background-secondary)", borderRadius: "var(--border-radius-md)", padding: "8px 10px" }}>
                <p style={{ fontSize: 11, color: "var(--color-text-secondary)", margin: "0 0 2px" }}>Months left</p>
                <p style={{ fontSize: 13, fontWeight: 500, margin: 0 }}>{goal.monthsLeft}</p>
              </div>
            </Col>
          )}
          {goal.deadline && (
            <Col xs={6}>
              <div style={{ background: "var(--color-background-secondary)", borderRadius: "var(--border-radius-md)", padding: "8px 10px" }}>
                <p style={{ fontSize: 11, color: "var(--color-text-secondary)", margin: "0 0 2px" }}>Deadline</p>
                <p style={{ fontSize: 13, fontWeight: 500, margin: 0 }}>{formatDate(toDate(goal.deadline))}</p>
              </div>
            </Col>
          )}
          <Col xs={isRecurring || goal.monthlyRequired !== undefined ? 6 : 12}>
            <div style={{ background: "var(--color-background-secondary)", borderRadius: "var(--border-radius-md)", padding: "8px 10px" }}>
              <p style={{ fontSize: 11, color: "var(--color-text-secondary)", margin: "0 0 2px" }}>Contributions</p>
              <p style={{ fontSize: 13, fontWeight: 500, margin: 0 }}>{goal.contributionCount}</p>
            </div>
          </Col>
        </Row>

        {goal.notes && <p style={{ fontSize: 12, color: "var(--color-text-secondary)", fontStyle: "italic", marginBottom: "0.75rem" }}>{goal.notes}</p>}

        {/* Action buttons */}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {!goal.isCompleted && (
            <Button size="sm" color="primary" style={{ flex: "1 1 auto", minWidth: 100 }} onClick={() => onAddDeposit(goal)}>
              Add deposit
            </Button>
          )}
          {goal.totalSaved > 0 && !goal.isCompleted && (
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

function DeleteConfirmModal({ goal, isDeleting, onConfirm, onClose }: { goal: InvestmentGoalWithStats; isDeleting: boolean; onConfirm: () => void; onClose: () => void }) {
  return (
    <Modal isOpen toggle={onClose} size="sm">
      <ModalHeader toggle={onClose}>Delete goal</ModalHeader>
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

function HistoryModal({ goal, onClose, formatCurrency }: { goal: InvestmentGoalWithStats; onClose: () => void; formatCurrency: (n: number) => string }) {
  const { data: contributions = [], isLoading } = useContributions(goal.id);

  return (
    <Modal isOpen toggle={onClose} size="md">
      <ModalHeader toggle={onClose}>
        {goal.icon} {goal.name} — History
      </ModalHeader>
      <ModalBody>
        <Row className="g-2 mb-3">
          {[
            { label: "Deposited", value: goal.totalDeposited },
            { label: "Withdrawn", value: goal.totalWithdrawn },
            { label: "Net saved", value: goal.totalSaved },
          ].map((s) => (
            <Col xs={4} key={s.label}>
              <div style={{ background: "var(--color-background-secondary)", borderRadius: "var(--border-radius-md)", padding: "8px 10px", textAlign: "center" }}>
                <p style={{ fontSize: 11, color: "var(--color-text-secondary)", margin: "0 0 2px" }}>{s.label}</p>
                <p style={{ fontSize: 15, fontWeight: 500, margin: 0 }}>{formatCurrency(s.value)}</p>
              </div>
            </Col>
          ))}
        </Row>

        {isLoading ? (
          <div className="text-center py-4">
            <Spinner size="sm" />
          </div>
        ) : contributions.length === 0 ? (
          <p style={{ color: "var(--color-text-secondary)", textAlign: "center", padding: "2rem 0" }}>No contribution history yet.</p>
        ) : (
          <Table size="sm" responsive>
            <thead>
              <tr>
                <th style={{ fontSize: 12, fontWeight: 500 }}>Date</th>
                <th style={{ fontSize: 12, fontWeight: 500 }}>Type</th>
                <th style={{ fontSize: 12, fontWeight: 500 }}>Amount</th>
                <th style={{ fontSize: 12, fontWeight: 500 }}>Notes</th>
              </tr>
            </thead>
            <tbody>
              {contributions.map((c) => (
                <tr key={c.id}>
                  <td style={{ fontSize: 13 }}>{formatDate(toDate(c.date))}</td>
                  <td>
                    <Badge color={c.contributionType === "deposit" ? "success" : "danger"} style={{ fontSize: 11 }}>
                      {c.contributionType}
                    </Badge>
                  </td>
                  <td style={{ fontSize: 13, fontWeight: 500 }}>
                    {c.contributionType === "withdrawal" ? "−" : "+"}
                    {formatCurrency(c.amount)}
                  </td>
                  <td style={{ fontSize: 13, color: "var(--color-text-secondary)" }}>{c.notes ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </Table>
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

// ─── InvestmentsPage ──────────────────────────────────────────────────────────

const TAB_LABELS: Record<FilterTab, string> = {
  all: "All",
  recurring: "Recurring",
  goals: "Goals",
  tracking: "Tracking",
  completed: "Completed",
};

export default function InvestmentsPage() {
  const [filter, setFilter] = useState<FilterTab>("all");
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

  const handleDeposit = (data: CreateInvestmentContributionDTO): Promise<void> =>
    new Promise((resolve, reject) => {
      addContribution.mutate({ data, goalName: depositGoal?.name ?? "" }, { onSuccess: () => resolve(), onError: (err) => reject(err) });
    });

  const handleWithdraw = (data: CreateInvestmentContributionDTO): Promise<void> =>
    new Promise((resolve, reject) => {
      addContribution.mutate({ data, goalName: withdrawGoal?.name ?? "" }, { onSuccess: () => resolve(), onError: (err) => reject(err) });
    });

  const handleCreateGoal = (data: CreateInvestmentGoalDTO, isActive: boolean): Promise<void> =>
    new Promise((resolve, reject) => {
      createGoalMutation.mutate({ data, isActive }, { onSuccess: () => resolve(), onError: (err) => reject(err) });
    });

  const handleEditGoal = (goalId: string, data: UpdateInvestmentGoalDTO): Promise<void> =>
    new Promise((resolve, reject) => {
      updateGoalMutation.mutate({ goalId, data }, { onSuccess: () => resolve(), onError: (err) => reject(err) });
    });

  const handleDeleteGoal = () => {
    if (!deleteGoal) return;
    deleteGoalMutation.mutate(deleteGoal.id, { onSuccess: () => setDeleteGoal(null) });
  };

  const handleTogglePause = (goal: InvestmentGoalWithStats) => {
    updateGoalMutation.mutate({ goalId: goal.id, data: { isActive: !goal.isActive } });
  };

  // ── Filtering ─────────────────────────────────────────────────────────────

  const isSearching = search.trim().length > 0;

  const filterByTab = (g: InvestmentGoalWithStats): boolean => {
    const isRecurring = g.targetPeriod === "monthly" || g.targetPeriod === "yearly";
    if (filter === "all") return !g.isCompleted;
    if (filter === "recurring") return isRecurring && !g.isCompleted;
    if (filter === "goals") return g.goalType === "targeted" && !isRecurring && !g.isCompleted;
    if (filter === "tracking") return g.goalType === "open_ended" && !g.isCompleted;
    if (filter === "completed") return g.isCompleted;
    return true;
  };

  const filterBySearch = (g: InvestmentGoalWithStats): boolean => {
    const q = search.toLowerCase().trim();
    return g.name.toLowerCase().includes(q) || (g.notes?.toLowerCase().includes(q) ?? false);
  };

  // When searching: ignore tab, search all goals
  // When not searching: apply tab filter
  const filtered = isSearching ? goals.filter(filterBySearch) : goals.filter(filterByTab);

  const tabCount = (tab: FilterTab): number => {
    const isRecurring = (g: InvestmentGoalWithStats) => g.targetPeriod === "monthly" || g.targetPeriod === "yearly";
    if (tab === "all") return goals.filter((g) => !g.isCompleted).length;
    if (tab === "recurring") return goals.filter((g) => isRecurring(g) && !g.isCompleted).length;
    if (tab === "goals") return goals.filter((g) => g.goalType === "targeted" && !isRecurring(g) && !g.isCompleted).length;
    if (tab === "tracking") return goals.filter((g) => g.goalType === "open_ended" && !g.isCompleted).length;
    if (tab === "completed") return goals.filter((g) => g.isCompleted).length;
    return 0;
  };

  // Empty state label depends on context
  const emptyLabel = isSearching ? `No results for "${search}"` : `No ${TAB_LABELS[filter].toLowerCase()} goals yet`;

  return (
    <Container fluid className="py-4">
      {/* Header */}
      <div className="d-flex justify-content-between align-items-center mb-4 flex-wrap gap-2">
        <div>
          <h5 style={{ fontWeight: 500, margin: 0, color: "var(--color-text-primary)" }}>Investments</h5>
          <p style={{ fontSize: 13, color: "var(--color-text-secondary)", margin: 0 }}>Track your savings goals and contributions</p>
        </div>
        <Button color="primary" onClick={() => setShowNewGoal(true)}>
          + New goal
        </Button>
      </div>

      {isLoading && (
        <div className="text-center py-5">
          <Spinner color="primary" />
        </div>
      )}

      {isError && <Alert color="danger">Failed to load investment goals. Please refresh the page.</Alert>}

      {!isLoading && !isError && (
        <>
          <SummaryCards goals={goals} formatCurrency={formatCurrency} />

          {/* Search bar */}
          <div style={{ position: "relative", marginBottom: "1.25rem" }}>
            <Input
              placeholder="Search goals by name or notes..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{
                fontSize: 14,
                paddingRight: search ? "2.5rem" : "1rem",
                border: "1px solid var(--color-border-secondary)",
                borderRadius: "var(--border-radius-md)",
                background: "var(--color-background-secondary)",
                color: "var(--color-text-primary)",
              }}
            />
            {search && (
              <button
                onClick={() => setSearch("")}
                style={{
                  position: "absolute",
                  right: 10,
                  top: "50%",
                  transform: "translateY(-50%)",
                  background: "transparent",
                  border: "none",
                  cursor: "pointer",
                  color: "var(--color-text-secondary)",
                  fontSize: 18,
                  lineHeight: 1,
                  padding: "0 4px",
                }}
              >
                ×
              </button>
            )}
          </div>

          {/* Search context hint */}
          {isSearching && (
            <p style={{ fontSize: 13, color: "var(--color-text-secondary)", marginBottom: "1rem" }}>
              Showing {filtered.length} result{filtered.length !== 1 ? "s" : ""} across all categories
            </p>
          )}

          {/* Tabs — greyed out when searching */}
          {!isSearching && (
            <div
              style={{
                overflowX: "auto",
                marginBottom: "1.5rem",
                msOverflowStyle: "none",
                scrollbarWidth: "none",
              }}
            >
              <Nav
                tabs
                style={{
                  flexWrap: "nowrap",
                  minWidth: "max-content",
                  borderBottom: "1px solid var(--color-border-tertiary)",
                }}
              >
                {(["all", "recurring", "goals", "tracking", "completed"] as FilterTab[]).map((tab) => {
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
                        {TAB_LABELS[tab]}
                        <Badge
                          pill
                          style={{
                            color: "#e0f0ff",
                            backgroundColor: "#0d6efd",
                            fontWeight: 500,
                            fontSize: 11,
                            padding: "4px 8px",
                          }}
                        >
                          {tabCount(tab)}
                        </Badge>
                      </NavLink>
                    </NavItem>
                  );
                })}
              </Nav>
            </div>
          )}

          {/* Goals grid */}
          {filtered.length === 0 ? (
            <div style={{ textAlign: "center", padding: "4rem 0", color: "var(--color-text-secondary)" }}>
              <p style={{ fontSize: 40 }}>💰</p>
              <p style={{ fontWeight: 500 }}>{emptyLabel}</p>
              {!isSearching && <p style={{ fontSize: 14 }}>Create your first investment goal to start tracking.</p>}
              {!isSearching && (
                <Button color="primary" onClick={() => setShowNewGoal(true)}>
                  + New goal
                </Button>
              )}
            </div>
          ) : (
            <Row className="g-3">
              {filtered.map((goal) => (
                <Col xs={12} md={6} xl={4} key={goal.id}>
                  <GoalCard
                    goal={goal}
                    showTypeBadge={isSearching}
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

      {historyGoal && <HistoryModal goal={historyGoal} onClose={() => setHistoryGoal(null)} formatCurrency={formatCurrency} />}
      {depositGoal && <AddDepositModal goal={depositGoal} isOpen onClose={() => setDepositGoal(null)} onSubmit={handleDeposit} />}
      {withdrawGoal && <WithdrawModal goal={withdrawGoal} isOpen onClose={() => setWithdrawGoal(null)} onSubmit={handleWithdraw} />}
      {editGoal && <EditGoalModal goal={editGoal} isOpen onClose={() => setEditGoal(null)} onSubmit={handleEditGoal} />}
      {deleteGoal && <DeleteConfirmModal goal={deleteGoal} isDeleting={deleteGoalMutation.isPending} onConfirm={handleDeleteGoal} onClose={() => setDeleteGoal(null)} />}
      <AddNewGoalModal isOpen={showNewGoal} onClose={() => setShowNewGoal(false)} onSubmit={handleCreateGoal} />
    </Container>
  );
}
