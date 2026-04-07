import { useState } from "react";
import { Container, Row, Col, Card, CardBody, Badge, Button, Nav, NavItem, NavLink, Progress, Modal, ModalHeader, ModalBody, ModalFooter, Table } from "reactstrap";
// Import all types from your shared types file — adjust path to match your project
import type {
  InvestmentGoalWithStats,
  InvestmentContribution,
  CreateInvestmentContributionDTO,
  CreateInvestmentGoalDTO,
  InvestmentGoalStatus,
} from "../../shared/types/IndexTypes";
import AddDepositModal from "./AddDepositModal";
import WithdrawModal from "./WithdrawModal";
import AddNewGoalModal from "./AddNewGoalModal";

// ─── Dummy data ───────────────────────────────────────────────────────────────

const DUMMY_GOALS: InvestmentGoalWithStats[] = [
  {
    id: "1",
    userId: "user1",
    name: "New Car",
    icon: "🚗",
    color: "#3B82F6",
    notes: "BMW Series 3",
    goalType: "targeted",
    targetAmount: 40000,
    targetPeriod: "custom",
    deadline: new Date("2031-12-01"),
    isActive: true,
    isCompleted: false,
    createdAt: new Date("2025-01-01"),
    updatedAt: new Date("2025-04-01"),
    totalDeposited: 9200,
    totalWithdrawn: 500,
    totalSaved: 8700,
    percentageReached: 21.75,
    remaining: 31300,
    monthlyRequired: 444,
    yearlyRequired: 5328,
    monthsLeft: 70,
    status: "on_track",
    lastContributionDate: new Date("2025-04-01"),
    contributionCount: 15,
    withdrawalCount: 1,
  },
  {
    id: "2",
    userId: "user1",
    name: "Japan Trip",
    icon: "✈️",
    color: "#F59E0B",
    goalType: "targeted",
    targetAmount: 5000,
    targetPeriod: "yearly",
    deadline: new Date("2025-12-01"),
    isActive: true,
    isCompleted: false,
    createdAt: new Date("2025-01-01"),
    updatedAt: new Date("2025-03-15"),
    totalDeposited: 1200,
    totalWithdrawn: 0,
    totalSaved: 1200,
    percentageReached: 24,
    remaining: 3800,
    monthlyRequired: 475,
    yearlyRequired: 5700,
    monthsLeft: 8,
    status: "behind",
    lastContributionDate: new Date("2025-03-15"),
    contributionCount: 3,
    withdrawalCount: 0,
  },
  {
    id: "3",
    userId: "user1",
    name: "Emergency Fund",
    icon: "🛡️",
    color: "#10B981",
    notes: "3-6 months of expenses",
    goalType: "open_ended",
    isActive: true,
    isCompleted: false,
    createdAt: new Date("2024-06-01"),
    updatedAt: new Date("2025-04-01"),
    totalDeposited: 6800,
    totalWithdrawn: 300,
    totalSaved: 6500,
    lastContributionDate: new Date("2025-04-01"),
    contributionCount: 22,
    withdrawalCount: 2,
  },
  {
    id: "4",
    userId: "user1",
    name: "Home Down Payment",
    icon: "🏠",
    color: "#8B5CF6",
    goalType: "targeted",
    targetAmount: 80000,
    targetPeriod: "custom",
    deadline: new Date("2033-06-01"),
    isActive: true,
    isCompleted: false,
    createdAt: new Date("2024-01-01"),
    updatedAt: new Date("2025-02-01"),
    totalDeposited: 7000,
    totalWithdrawn: 0,
    totalSaved: 7000,
    percentageReached: 8.75,
    remaining: 73000,
    monthlyRequired: 800,
    yearlyRequired: 9600,
    monthsLeft: 98,
    status: "behind",
    lastContributionDate: new Date("2025-02-01"),
    contributionCount: 14,
    withdrawalCount: 0,
  },
  {
    id: "5",
    userId: "user1",
    name: "Vacation 2024",
    icon: "🏖️",
    color: "#EC4899",
    goalType: "targeted",
    targetAmount: 3000,
    targetPeriod: "yearly",
    isActive: false,
    isCompleted: true,
    completedAt: new Date("2024-07-15"),
    createdAt: new Date("2024-01-01"),
    updatedAt: new Date("2024-07-15"),
    totalDeposited: 3200,
    totalWithdrawn: 0,
    totalSaved: 3200,
    percentageReached: 100,
    remaining: 0,
    status: "completed",
    lastContributionDate: new Date("2024-07-15"),
    contributionCount: 7,
    withdrawalCount: 0,
  },
];

const DUMMY_CONTRIBUTIONS: Record<string, InvestmentContribution[]> = {
  "1": [
    {
      id: "c1",
      userId: "user1",
      goalId: "1",
      amount: 600,
      contributionType: "deposit",
      date: new Date("2025-04-01"),
      notes: "April saving",
      createdAt: new Date("2025-04-01"),
      updatedAt: new Date("2025-04-01"),
    },
    {
      id: "c2",
      userId: "user1",
      goalId: "1",
      amount: 500,
      contributionType: "withdrawal",
      date: new Date("2025-03-10"),
      notes: "Emergency",
      createdAt: new Date("2025-03-10"),
      updatedAt: new Date("2025-03-10"),
    },
    {
      id: "c3",
      userId: "user1",
      goalId: "1",
      amount: 600,
      contributionType: "deposit",
      date: new Date("2025-03-01"),
      notes: "March saving",
      createdAt: new Date("2025-03-01"),
      updatedAt: new Date("2025-03-01"),
    },
    {
      id: "c4",
      userId: "user1",
      goalId: "1",
      amount: 600,
      contributionType: "deposit",
      date: new Date("2025-02-01"),
      notes: "February saving",
      createdAt: new Date("2025-02-01"),
      updatedAt: new Date("2025-02-01"),
    },
  ],
  "2": [
    {
      id: "c5",
      userId: "user1",
      goalId: "2",
      amount: 400,
      contributionType: "deposit",
      date: new Date("2025-03-15"),
      createdAt: new Date("2025-03-15"),
      updatedAt: new Date("2025-03-15"),
    },
    {
      id: "c6",
      userId: "user1",
      goalId: "2",
      amount: 400,
      contributionType: "deposit",
      date: new Date("2025-02-01"),
      createdAt: new Date("2025-02-01"),
      updatedAt: new Date("2025-02-01"),
    },
    {
      id: "c7",
      userId: "user1",
      goalId: "2",
      amount: 400,
      contributionType: "deposit",
      date: new Date("2025-01-10"),
      createdAt: new Date("2025-01-10"),
      updatedAt: new Date("2025-01-10"),
    },
  ],
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

const formatCurrency = (amount: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(amount);

const formatDate = (date?: Date) => (date ? new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(date) : "—");

const statusConfig: Record<InvestmentGoalStatus, { label: string; color: string }> = {
  on_track: { label: "On track", color: "success" },
  behind: { label: "Behind", color: "danger" },
  ahead: { label: "Ahead", color: "info" },
  completed: { label: "Completed", color: "secondary" },
};

// ─── Types ────────────────────────────────────────────────────────────────────

type FilterTab = "all" | "targeted" | "open_ended" | "completed";

// ─── SummaryCards ─────────────────────────────────────────────────────────────

function SummaryCards({ goals }: { goals: InvestmentGoalWithStats[] }) {
  const active = goals.filter((g) => g.isActive && !g.isCompleted);
  const completed = goals.filter((g) => g.isCompleted);
  const totalSaved = goals.reduce((s, g) => s + g.totalSaved, 0);
  const onTrack = active.filter((g) => g.status === "on_track" || g.status === "ahead").length;
  const targetedActive = active.filter((g) => g.goalType === "targeted").length;

  const cards = [
    { label: "Total saved", value: formatCurrency(totalSaved) },
    { label: "Active goals", value: String(active.length) },
    { label: "On track", value: `${onTrack} / ${targetedActive}` },
    { label: "Completed", value: String(completed.length) },
  ];

  return (
    <Row className="g-3 mb-4">
      {cards.map((c) => (
        <Col xs={6} md={3} key={c.label}>
          <div
            style={{
              background: "var(--color-background-secondary)",
              borderRadius: "var(--border-radius-md)",
              padding: "1rem",
            }}
          >
            <p style={{ fontSize: 13, color: "var(--color-text-secondary)", margin: "0 0 4px" }}>{c.label}</p>
            <p style={{ fontSize: 22, fontWeight: 500, margin: 0, color: "var(--color-text-primary)" }}>{c.value}</p>
          </div>
        </Col>
      ))}
    </Row>
  );
}

// ─── GoalCard ─────────────────────────────────────────────────────────────────

interface GoalCardProps {
  goal: InvestmentGoalWithStats;
  onViewHistory: (goal: InvestmentGoalWithStats) => void;
  onAddDeposit: (goal: InvestmentGoalWithStats) => void;
  onWithdraw: (goal: InvestmentGoalWithStats) => void;
}

function GoalCard({ goal, onViewHistory, onAddDeposit, onWithdraw }: GoalCardProps) {
  const isTargeted = goal.goalType === "targeted";
  const pct = Math.min(goal.percentageReached ?? 0, 100);
  const st = goal.status ? statusConfig[goal.status] : null;

  const progressColor = goal.status === "completed" ? "success" : goal.status === "behind" ? "danger" : goal.status === "ahead" ? "info" : "success";

  return (
    <Card className="mb-3 h-100" style={{ border: "0.5px solid var(--color-border-tertiary)", borderRadius: "var(--border-radius-lg)" }}>
      <CardBody>
        {/* Header */}
        <div className="d-flex justify-content-between align-items-start mb-3">
          <div className="d-flex align-items-center gap-2">
            <span style={{ fontSize: 24 }}>{goal.icon ?? "💰"}</span>
            <div>
              <p style={{ fontWeight: 500, margin: 0, color: "var(--color-text-primary)" }}>{goal.name}</p>
              <p style={{ fontSize: 12, color: "var(--color-text-secondary)", margin: 0 }}>{isTargeted ? "Targeted goal" : "Open-ended"}</p>
            </div>
          </div>
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
        </div>

        {/* Progress (targeted only) */}
        {isTargeted && goal.targetAmount && (
          <>
            <div className="d-flex justify-content-between mb-1">
              <span style={{ fontSize: 13, color: "var(--color-text-secondary)" }}>{formatCurrency(goal.totalSaved)} saved</span>
              <span style={{ fontSize: 13, color: "var(--color-text-secondary)" }}>{formatCurrency(goal.targetAmount)} goal</span>
            </div>
            <Progress value={pct} color={progressColor} style={{ height: 8, borderRadius: 4, marginBottom: "0.75rem" }} />
            <p style={{ fontSize: 12, color: "var(--color-text-secondary)", marginBottom: "0.75rem" }}>
              {pct.toFixed(1)}% reached
              {goal.remaining !== undefined && goal.remaining > 0 && ` · ${formatCurrency(goal.remaining)} remaining`}
            </p>
          </>
        )}

        {/* Open-ended total */}
        {!isTargeted && (
          <div className="mb-3">
            <p style={{ fontSize: 22, fontWeight: 500, margin: 0, color: "var(--color-text-primary)" }}>{formatCurrency(goal.totalSaved)}</p>
            <p style={{ fontSize: 12, color: "var(--color-text-secondary)", margin: 0 }}>total saved</p>
          </div>
        )}

        {/* Key stats row */}
        <Row className="g-2 mb-3">
          {goal.monthlyRequired !== undefined && (
            <Col xs={6}>
              <div style={{ background: "var(--color-background-secondary)", borderRadius: "var(--border-radius-md)", padding: "8px 10px" }}>
                <p style={{ fontSize: 11, color: "var(--color-text-secondary)", margin: "0 0 2px" }}>Monthly needed</p>
                <p style={{ fontSize: 14, fontWeight: 500, margin: 0 }}>{formatCurrency(goal.monthlyRequired)}</p>
              </div>
            </Col>
          )}
          {goal.monthsLeft !== undefined && (
            <Col xs={6}>
              <div style={{ background: "var(--color-background-secondary)", borderRadius: "var(--border-radius-md)", padding: "8px 10px" }}>
                <p style={{ fontSize: 11, color: "var(--color-text-secondary)", margin: "0 0 2px" }}>Months left</p>
                <p style={{ fontSize: 14, fontWeight: 500, margin: 0 }}>{goal.monthsLeft}</p>
              </div>
            </Col>
          )}
          {goal.deadline && (
            <Col xs={6}>
              <div style={{ background: "var(--color-background-secondary)", borderRadius: "var(--border-radius-md)", padding: "8px 10px" }}>
                <p style={{ fontSize: 11, color: "var(--color-text-secondary)", margin: "0 0 2px" }}>Deadline</p>
                <p style={{ fontSize: 14, fontWeight: 500, margin: 0 }}>{formatDate(goal.deadline)}</p>
              </div>
            </Col>
          )}
          <Col xs={goal.monthlyRequired !== undefined ? 6 : 12}>
            <div style={{ background: "var(--color-background-secondary)", borderRadius: "var(--border-radius-md)", padding: "8px 10px" }}>
              <p style={{ fontSize: 11, color: "var(--color-text-secondary)", margin: "0 0 2px" }}>Contributions</p>
              <p style={{ fontSize: 14, fontWeight: 500, margin: 0 }}>{goal.contributionCount}</p>
            </div>
          </Col>
        </Row>

        {goal.notes && <p style={{ fontSize: 12, color: "var(--color-text-secondary)", fontStyle: "italic", marginBottom: "0.75rem" }}>{goal.notes}</p>}

        {/* Actions */}
        <div className="d-flex gap-2">
          <Button size="sm" color="primary" style={{ flex: 1 }} onClick={() => onAddDeposit(goal)}>
            Add deposit
          </Button>
          {goal.totalSaved > 0 && (
            <Button size="sm" color="secondary" outline style={{ flex: 1 }} onClick={() => onWithdraw(goal)}>
              Withdraw
            </Button>
          )}
          <Button size="sm" color="secondary" outline onClick={() => onViewHistory(goal)}>
            History
          </Button>
        </div>
      </CardBody>
    </Card>
  );
}

// ─── HistoryModal ─────────────────────────────────────────────────────────────

interface HistoryModalProps {
  goal: InvestmentGoalWithStats;
  contributions: InvestmentContribution[];
  onClose: () => void;
}

function HistoryModal({ goal, contributions, onClose }: HistoryModalProps) {
  return (
    <Modal isOpen toggle={onClose} size="md">
      <ModalHeader toggle={onClose}>
        {goal.icon} {goal.name} — History
      </ModalHeader>
      <ModalBody>
        <Row className="g-2 mb-3">
          <Col xs={4}>
            <div style={{ background: "var(--color-background-secondary)", borderRadius: "var(--border-radius-md)", padding: "8px 10px", textAlign: "center" }}>
              <p style={{ fontSize: 11, color: "var(--color-text-secondary)", margin: "0 0 2px" }}>Deposited</p>
              <p style={{ fontSize: 15, fontWeight: 500, margin: 0 }}>{formatCurrency(goal.totalDeposited)}</p>
            </div>
          </Col>
          <Col xs={4}>
            <div style={{ background: "var(--color-background-secondary)", borderRadius: "var(--border-radius-md)", padding: "8px 10px", textAlign: "center" }}>
              <p style={{ fontSize: 11, color: "var(--color-text-secondary)", margin: "0 0 2px" }}>Withdrawn</p>
              <p style={{ fontSize: 15, fontWeight: 500, margin: 0 }}>{formatCurrency(goal.totalWithdrawn)}</p>
            </div>
          </Col>
          <Col xs={4}>
            <div style={{ background: "var(--color-background-secondary)", borderRadius: "var(--border-radius-md)", padding: "8px 10px", textAlign: "center" }}>
              <p style={{ fontSize: 11, color: "var(--color-text-secondary)", margin: "0 0 2px" }}>Net saved</p>
              <p style={{ fontSize: 15, fontWeight: 500, margin: 0 }}>{formatCurrency(goal.totalSaved)}</p>
            </div>
          </Col>
        </Row>

        {contributions.length === 0 ? (
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
                  <td style={{ fontSize: 13 }}>{formatDate(c.date)}</td>
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

export default function InvestmentsPage() {
  const [filter, setFilter] = useState<FilterTab>("all");
  const [historyGoal, setHistoryGoal] = useState<InvestmentGoalWithStats | null>(null);
  const [depositGoal, setDepositGoal] = useState<InvestmentGoalWithStats | null>(null);
  const [withdrawGoal, setWithdrawGoal] = useState<InvestmentGoalWithStats | null>(null);
  const [showNewGoal, setShowNewGoal] = useState(false);

  // ── Handlers (replace console.log with your TanStack Query mutations) ───────

  const handleDeposit = (data: CreateInvestmentContributionDTO) => {
    console.log("deposit", data);
    // TODO: depositMutation.mutate(data)
  };

  const handleWithdraw = (data: CreateInvestmentContributionDTO) => {
    console.log("withdraw", data);
    // TODO: withdrawMutation.mutate(data)
  };

  const handleCreateGoal = (data: CreateInvestmentGoalDTO, isActive: boolean) => {
    console.log("new goal", { ...data, isActive });
    // TODO: createGoalMutation.mutate({ ...data, isActive })
  };

  // ── Filtering ────────────────────────────────────────────────────────────────

  const filtered = DUMMY_GOALS.filter((g) => {
    if (filter === "all") return !g.isCompleted;
    if (filter === "targeted") return g.goalType === "targeted" && !g.isCompleted;
    if (filter === "open_ended") return g.goalType === "open_ended" && !g.isCompleted;
    if (filter === "completed") return g.isCompleted;
    return true;
  });

  const tabCount = (tab: FilterTab) => {
    if (tab === "all") return DUMMY_GOALS.filter((g) => !g.isCompleted).length;
    if (tab === "completed") return DUMMY_GOALS.filter((g) => g.isCompleted).length;
    return DUMMY_GOALS.filter((g) => g.goalType === tab && !g.isCompleted).length;
  };

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <Container fluid className="py-4">
      {/* Page header */}
      <div className="d-flex justify-content-between align-items-center mb-4">
        <div>
          <h5 style={{ fontWeight: 500, margin: 0, color: "var(--color-text-primary)" }}>Investments</h5>
          <p style={{ fontSize: 13, color: "var(--color-text-secondary)", margin: 0 }}>Track your savings goals and contributions</p>
        </div>
        <Button color="primary" onClick={() => setShowNewGoal(true)}>
          + New goal
        </Button>
      </div>

      {/* Summary cards */}
      <SummaryCards goals={DUMMY_GOALS} />

      {/* Filter tabs */}
      <Nav tabs className="mb-4" style={{ borderBottom: "0.5px solid var(--color-border-tertiary)" }}>
        {(["all", "targeted", "open_ended", "completed"] as FilterTab[]).map((tab) => (
          <NavItem key={tab}>
            <NavLink active={filter === tab} onClick={() => setFilter(tab)} style={{ cursor: "pointer", fontSize: 14, textTransform: "capitalize" }}>
              {tab.replace("_", " ")}
              <Badge color="secondary" className="ms-2" style={{ fontSize: 11 }}>
                {tabCount(tab)}
              </Badge>
            </NavLink>
          </NavItem>
        ))}
      </Nav>

      {/* Goal cards grid */}
      {filtered.length === 0 ? (
        <div style={{ textAlign: "center", padding: "4rem 0", color: "var(--color-text-secondary)" }}>
          <p style={{ fontSize: 40 }}>💰</p>
          <p style={{ fontWeight: 500 }}>No goals here yet</p>
          <p style={{ fontSize: 14 }}>Create your first investment goal to start tracking.</p>
          <Button color="primary" onClick={() => setShowNewGoal(true)}>
            + New goal
          </Button>
        </div>
      ) : (
        <Row className="g-3">
          {filtered.map((goal) => (
            <Col xs={12} md={6} xl={4} key={goal.id}>
              <GoalCard goal={goal} onViewHistory={setHistoryGoal} onAddDeposit={setDepositGoal} onWithdraw={setWithdrawGoal} />
            </Col>
          ))}
        </Row>
      )}

      {/* ── Modals ─────────────────────────────────────────────────────────── */}

      {historyGoal && <HistoryModal goal={historyGoal} contributions={DUMMY_CONTRIBUTIONS[historyGoal.id] ?? []} onClose={() => setHistoryGoal(null)} />}

      {depositGoal && <AddDepositModal goal={depositGoal} isOpen onClose={() => setDepositGoal(null)} onSubmit={handleDeposit} />}

      {withdrawGoal && <WithdrawModal goal={withdrawGoal} isOpen onClose={() => setWithdrawGoal(null)} onSubmit={handleWithdraw} />}

      <AddNewGoalModal isOpen={showNewGoal} onClose={() => setShowNewGoal(false)} onSubmit={handleCreateGoal} />
    </Container>
  );
}
