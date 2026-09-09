// features/budget/investmentShared.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Shared helpers + components used by BOTH InvestmentsPage and GoalsPage.
//
// File location:  src/features/budget/investmentShared.tsx
// ─────────────────────────────────────────────────────────────────────────────

import { Fragment, useState } from "react";
import {
  Badge,
  Button,
  Card,
  CardBody,
  Dropdown,
  DropdownItem,
  DropdownMenu,
  DropdownToggle,
  Modal,
  ModalBody,
  ModalFooter,
  ModalHeader,
} from "reactstrap";
import { FiMoreVertical } from "react-icons/fi";
import type { InvestmentGoalWithStats, InvestmentContribution } from "../../../shared/types/IndexTypes";
import { useContributions } from "../useInvestments";
import { SkeletonRows } from "../../../shared/components/Skeletons";
import { DROPDOWN_MENU_MODIFIERS } from "../../../shared/utils/dropdown";
import i18n from "../../../i18n";
import { daysSinceContribution, formatDate, getGoalTypeLabel, getStatusConfig, perWeek, projectedFinish, savingPace, toDate } from "./goalDisplay";

// ─── Progress ring ────────────────────────────────────────────────────────────
// The share of the target, drawn once and read at a glance. It replaced a row
// of identical bordered boxes that reported figures without ever answering the
// question a savings goal raises: how far along am I, and will I get there.

function ProgressRing({ pct, accent, centre }: { pct: number; accent: string; centre: string }) {
  const size = 74;
  const stroke = 8;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const filled = Math.max(0, Math.min(pct, 100)) / 100;

  return (
    <div style={{ position: "relative", width: size, height: size, flexShrink: 0 }}>
      <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }} aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke={`color-mix(in srgb, var(${accent}) 20%, transparent)`} strokeWidth={stroke} />
        {filled > 0 && (
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke={`var(${accent})`}
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={`${circumference * filled} ${circumference}`}
          />
        )}
      </svg>
      <span
        style={{
          position: "absolute",
          inset: 0,
          display: "grid",
          placeItems: "center",
          fontSize: 15,
          fontWeight: 650,
          color: "var(--color-text-primary)",
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {centre}
      </span>
    </div>
  );
}

// ─── Foot figure ──────────────────────────────────────────────────────────────
// Three of these along the bottom, divided by rules rather than boxed. Boxes
// give every figure the same weight; rules let the numbers themselves carry it.

function Figure({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div style={{ flex: 1, minWidth: 0, padding: "9px 6px", textAlign: "center" }}>
      <p
        style={{
          margin: 0,
          fontSize: 13,
          fontWeight: 650,
          color: tone ?? "var(--color-text-primary)",
          fontVariantNumeric: "tabular-nums",
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
        }}
      >
        {value}
      </p>
      <p style={{ margin: "2px 0 0", fontSize: 11, lineHeight: 1.25, color: "var(--color-text-secondary)" }}>{label}</p>
    </div>
  );
}

const FIGURE_DIVIDER = <div style={{ width: 1, background: "var(--color-border-tertiary)", alignSelf: "stretch" }} />;

// ─── GoalCard ─────────────────────────────────────────────────────────────────

export interface GoalCardProps {
  goal: InvestmentGoalWithStats;
  onViewHistory: (goal: InvestmentGoalWithStats) => void;
  onAddDeposit: (goal: InvestmentGoalWithStats) => void;
  onWithdraw: (goal: InvestmentGoalWithStats) => void;
  onDelete: (goal: InvestmentGoalWithStats) => void;
  onEdit: (goal: InvestmentGoalWithStats) => void;
  onTogglePause: (goal: InvestmentGoalWithStats) => void;
  formatCurrency: (n: number) => string;
}

export function GoalCard({ goal, onViewHistory, onAddDeposit, onWithdraw, onDelete, onEdit, onTogglePause, formatCurrency }: GoalCardProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  // Read once per render: the pace and the projection are measured against it,
  // and two different "now"s inside one card would report two different days.
  const now = new Date();

  const isTargetedGoal = goal.goalType === "targeted";
  const isRecurring = goal.targetPeriod === "monthly" || goal.targetPeriod === "yearly";
  const isYearly = goal.targetPeriod === "yearly";

  const st = goal.status ? getStatusConfig(goal.status) : null;
  const isPaused = !goal.isActive && !goal.isCompleted;
  const isEffectivelyCompleted = goal.isCompleted && goal.goalType !== "open_ended" && !isRecurring;

  // ── Raw values ─────────────────────────────────────────────────────────────
  const arrears = goal.arrears ?? 0;
  const missedMonths = goal.missedMonths ?? 0;
  const periodSurplus = goal.periodSurplus ?? 0;
  const periodCredit = goal.periodCredit ?? 0;
  const targetAmount = goal.targetAmount ?? 0;
  const currentPeriodSaved = goal.currentPeriodSaved ?? 0; // clamped ≥ 0, display only
  const remaining = goal.remaining ?? 0;

  // ── Effective obligation for bar display ───────────────────────────────────
  // Credit silently reduces totalDue. We don't surface the credit number to the
  // user unless they haven't deposited anything this period yet (see isCreditCovered).
  const totalDue = Math.max(targetAmount - periodCredit, 0) + arrears;

  // ── State flags — all gated on status ─────────────────────────────────────
  // status from computeGoalStats is the single source of truth.
  // Raw arrears / periodSurplus can be non-zero at the same time (e.g. past miss
  // compensated by a big deposit this month), so we gate on status to avoid
  // showing contradictory UI.

  // Behind: past arrears still unresolved
  const hasDebt = arrears > 0 && goal.status === "behind";

  // Ahead: net-positive this period
  const isAhead = periodSurplus > 0 && goal.status === "ahead";

  // Credit-covered: month is fully covered by carryover AND the user has not
  // deposited anything this month yet. The moment they deposit, credit becomes
  // a silent background detail — we stop surfacing it.
  const isCreditCovered = periodCredit > 0 && !hasDebt && goal.status !== "behind" && remaining === 0 && currentPeriodSaved === 0;

  // Over-withdrawn: withdrawals pushed net negative without historical arrears
  const isWithdrawalDebt = !hasDebt && !isCreditCovered && !isAhead && goal.status === "behind" && remaining > 0;

  // ── Progress display percentage ────────────────────────────────────────────
  // totalDue already has credit baked in, so displayPct naturally reflects the
  // credit reduction without us needing to show a separate credit segment.
  const displayPct = totalDue > 0 ? Math.min((currentPeriodSaved / totalDue) * 100, 100) : goal.status !== "behind" ? 100 : 0;


  // Non-recurring pct (targeted goals)
  const pct = Math.min(goal.percentageReached ?? 0, 100);


  // StatCell and RecurringProgressBar are declared at module scope (below) so
  // React keeps their identity across renders instead of remounting them.

  // ── What the card says under the figure ────────────────────────────────────
  // One line, and it is the line worth reading: for a goal with a deadline it
  // is where the current pace actually lands, and for a recurring one it is how
  // this period stands. Everything else is a figure in the foot.

  const projection = projectedFinish(goal, now);
  const pace = savingPace(goal, now);
  const quietDays = daysSinceContribution(goal, now);

  const monthYear = (date: Date) => new Intl.DateTimeFormat(i18n.resolvedLanguage ?? "en", { month: "short", year: "numeric" }).format(date);

  const headline = (): { text: string; tone?: string } | undefined => {
    if (isRecurring) {
      if (hasDebt) return { text: `${formatCurrency(Math.max(totalDue - currentPeriodSaved, 0))} ${i18n.t("goals.stillOwed")}`, tone: "var(--color-expense-text)" };
      if (isCreditCovered) return { text: `${i18n.t("goals.coveredByCarryover")} · ${formatCurrency(periodCredit)}`, tone: "var(--color-income-text)" };
      if (isAhead) return { text: `${formatCurrency(periodSurplus)} ${i18n.t("goals.surplus").toLowerCase()}`, tone: "var(--color-income-text)" };
      if (isWithdrawalDebt) return { text: `${formatCurrency(remaining)} ${i18n.t("goals.stillOwed")}`, tone: "var(--color-expense-text)" };
      return undefined;
    }

    if (isEffectivelyCompleted) return undefined;

    if (projection) {
      const when = i18n.t("goals.finishesIn", { month: monthYear(projection.date) });
      if (projection.monthsLate) return { text: `${when} · ${i18n.t("goals.monthsPastDeadline", { count: projection.monthsLate })}`, tone: "var(--color-expense-text)" };
      if (projection.monthsEarly) return { text: `${when} · ${i18n.t("goals.monthsToSpare", { count: projection.monthsEarly })}`, tone: "var(--color-income-text)" };
      return { text: when };
    }

    // Nothing in the pot yet: there is no rate to project from, and guessing
    // one would be the card inventing a date.
    if (isTargetedGoal && remaining > 0 && !pace) {
      return goal.monthlyRequired ? { text: i18n.t("goals.startWith", { amount: formatCurrency(perWeek(goal.monthlyRequired)) }) } : { text: i18n.t("goals.noPaceYet") };
    }
    return undefined;
  };

  const note = headline();

  // ── The three figures along the foot ───────────────────────────────────────
  const lastMoveValue = quietDays === undefined ? i18n.t("goals.neverShort") : i18n.t("goals.daysShort", { count: quietDays });

  const figures: { label: string; value: string; tone?: string }[] = isRecurring
    ? hasDebt
      ? [
          { label: i18n.t(isYearly ? "goals.yearsBehindCount" : "goals.monthsBehindCount", { count: missedMonths }), value: String(missedMonths), tone: "var(--color-expense-text)" },
          { label: i18n.t("goals.stillOwed"), value: formatCurrency(remaining), tone: "var(--color-expense-text)" },
          { label: i18n.t(isYearly ? "goals.thisYearShort" : "goals.thisMonthShort"), value: formatCurrency(currentPeriodSaved) },
        ]
      : [
          { label: i18n.t(isYearly ? "goals.thisYearShort" : "goals.thisMonthShort"), value: formatCurrency(currentPeriodSaved) },
          { label: i18n.t("goals.targetLabel").toLowerCase(), value: formatCurrency(targetAmount) },
          { label: i18n.t("goals.allTime"), value: formatCurrency(goal.totalSaved) },
        ]
    : isTargetedGoal
      ? // One figure to a cell. Two of them side by side — "€140.00 · €32.19/wk" —
        // ran past the third of a card each cell gets and were cut off mid-number,
        // which is worse than not showing them at all.
        goal.monthlyRequired !== undefined
        ? pace
          ? [
              { label: i18n.t("goals.aMonth"), value: formatCurrency(goal.monthlyRequired) },
              { label: i18n.t("goals.yourPace"), value: formatCurrency(pace), tone: pace < goal.monthlyRequired ? "var(--color-expense-text)" : "var(--color-income-text)" },
              { label: i18n.t("goals.lastMove"), value: lastMoveValue },
            ]
          : // Nothing saved yet, so a pace and a last deposit are both blank. What
            // helps here is the size of the thing to start, not two dashes.
            [
              { label: i18n.t("goals.aMonth"), value: formatCurrency(goal.monthlyRequired) },
              { label: i18n.t("goals.aWeek"), value: formatCurrency(perWeek(goal.monthlyRequired)) },
              { label: i18n.t("goals.monthsLeftShort", { count: goal.monthsLeft ?? 0 }), value: String(goal.monthsLeft ?? 0) },
            ]
        : [
            { label: i18n.t("goals.remaining"), value: formatCurrency(remaining) },
            { label: i18n.t("goals.yourPace"), value: pace ? formatCurrency(pace) : "—" },
            { label: i18n.t("goals.lastMove"), value: lastMoveValue },
          ]
      : [
          { label: i18n.t("goals.deposited").toLowerCase(), value: formatCurrency(goal.totalDeposited) },
          { label: i18n.t("goals.withdrawn").toLowerCase(), value: formatCurrency(goal.totalWithdrawn) },
          { label: i18n.t("goals.averagePerMonth"), value: pace ? formatCurrency(pace) : "—" },
        ];

  // ── Identity band ──────────────────────────────────────────────────────────
  const deadlineDate = toDate(goal.deadline);
  const bandSubtitle = [
    isRecurring || !deadlineDate ? getGoalTypeLabel(goal) : i18n.t("goals.deadlineOn", { date: formatDate(deadlineDate) }),
    !isRecurring && goal.monthsLeft !== undefined && goal.monthsLeft > 0 ? i18n.t("goals.monthsLeftCount", { count: goal.monthsLeft }) : undefined,
  ]
    .filter(Boolean)
    .join(" · ");

  // Two tokens for one colour, on purpose. The solid one is what the ring, the
  // band and the borders are drawn in; the `-text` one is the readable version
  // of the same colour, which matters in light mode where green on white
  // measures 3.1:1 as text and passes comfortably as a stroke.
  const accent =
    goal.status === "behind" ? "--color-expense" : goal.status === "ahead" || goal.status === "completed" ? "--color-income" : isRecurring ? "--bs-primary" : "--color-goal";
  const accentText = accent === "--bs-primary" ? "--color-link" : `${accent}-text`;

  const ringPct = isRecurring ? displayPct : pct;
  const hasRing = (isRecurring && targetAmount > 0) || (isTargetedGoal && !!goal.targetAmount);
  const heroAmount = isRecurring ? currentPeriodSaved : goal.totalSaved;
  const heroSubtitle = isRecurring
    ? i18n.t("goals.ofTarget", { amount: formatCurrency(targetAmount) })
    : goal.targetAmount
      ? [i18n.t("goals.ofTarget", { amount: formatCurrency(goal.targetAmount) }), remaining > 0 ? i18n.t("goals.leftToGo", { amount: formatCurrency(remaining) }) : undefined].filter(Boolean).join(" · ")
      : i18n.t("investments.totalSaved");

  return (
    <Card
      className="mb-3 h-100"
      style={{
        border: "1px solid var(--color-border-tertiary)",
        borderRadius: "var(--border-radius-lg)",
        boxShadow: "none",
        // Deliberately not `overflow: hidden`. Clipping tidies the band's
        // corners and takes the row menu with it: the dropdown opened inside
        // the card and was cut off at its edge.
        opacity: isPaused ? 0.72 : 1,
        transition: "opacity 0.2s",
        display: "flex",
        flexDirection: "column",
      }}
    >
      {/* ── Identity band ─────────────────────────────────────────────────── */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "11px 14px",
          background: `color-mix(in srgb, var(${accent}) 10%, transparent)`,
          borderBottom: `1px solid color-mix(in srgb, var(${accent}) 26%, transparent)`,
          // Inside the card's own border, so a pixel tighter than its radius.
          borderTopLeftRadius: "calc(var(--border-radius-lg) - 1px)",
          borderTopRightRadius: "calc(var(--border-radius-lg) - 1px)",
        }}
      >
        <span
          style={{
            width: 34,
            height: 34,
            borderRadius: 17,
            display: "grid",
            placeItems: "center",
            fontSize: 17,
            flexShrink: 0,
            background: "var(--color-surface-raised)",
            border: `1px solid color-mix(in srgb, var(${accent}) 38%, transparent)`,
          }}
        >
          {goal.icon ?? "💰"}
        </span>

        <div style={{ minWidth: 0, flex: 1 }}>
          <p style={{ margin: 0, fontSize: 14.5, fontWeight: 600, color: "var(--color-text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {goal.name}
          </p>
          <p style={{ margin: 0, fontSize: 11.5, color: "var(--color-text-secondary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{bandSubtitle}</p>
        </div>

        <div className="d-flex align-items-center gap-2" style={{ flexShrink: 0 }}>
          {isPaused && (
            <Badge color="warning" style={{ fontSize: 10.5 }}>
              {i18n.t("common.paused")}
            </Badge>
          )}
          {st && (
            <span
              style={{
                fontSize: 11,
                fontWeight: 600,
                padding: "3px 9px",
                borderRadius: 999,
                whiteSpace: "nowrap",
                color: `var(${accentText})`,
                // The card's surface rather than another tint: stacked on the
                // band's own 10% wash, a 15% pill left the red label at 3.82:1
                // in dark mode. On the surface it clears 5:1 and reads as a chip
                // sitting on the band, which is what it is.
                background: "var(--color-surface-raised)",
                border: `1px solid color-mix(in srgb, var(${accent}) 38%, transparent)`,
              }}
            >
              {st.label}
            </span>
          )}
          <Dropdown className="card-row-menu" isOpen={menuOpen} toggle={() => setMenuOpen((o) => !o)}>
            <DropdownToggle
              tag="button"
              aria-label={goal.name}
              style={{ background: "transparent", border: "none", padding: "2px 2px", cursor: "pointer", color: "var(--color-text-secondary)", lineHeight: 1 }}
            >
              <FiMoreVertical size={16} />
            </DropdownToggle>
            <DropdownMenu end modifiers={DROPDOWN_MENU_MODIFIERS}>
              <DropdownItem style={{ fontSize: 13 }} onClick={() => onEdit(goal)} disabled={isEffectivelyCompleted}>
                {i18n.t("common.edit")}
              </DropdownItem>
              <DropdownItem style={{ fontSize: 13 }} onClick={() => onTogglePause(goal)} disabled={isEffectivelyCompleted}>
                {i18n.t(goal.isActive ? "goals.pause" : "goals.resume")}
              </DropdownItem>
              <DropdownItem divider />
              {/* The token red rather than Bootstrap's: #dc3545 measures 3.03:1 on
                  the dark menu, and this one is tuned for both themes. */}
              <DropdownItem style={{ fontSize: 13, color: "var(--color-expense)" }} onClick={() => onDelete(goal)}>
                {i18n.t("common.delete")}
              </DropdownItem>
            </DropdownMenu>
          </Dropdown>
        </div>
      </div>

      {/* ── The figure, and where it is going ─────────────────────────────── */}
      <CardBody style={{ padding: "14px", flex: "1 1 auto" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          {hasRing && <ProgressRing pct={ringPct} accent={accent} centre={`${Math.round(ringPct)}%`} />}
          <div style={{ minWidth: 0 }}>
            <p
              style={{
                margin: 0,
                fontSize: 25,
                fontWeight: 650,
                letterSpacing: "-0.02em",
                lineHeight: 1.1,
                color: "var(--color-text-primary)",
                fontVariantNumeric: "tabular-nums",
              }}
            >
              {formatCurrency(heroAmount)}
            </p>
            <p style={{ margin: "3px 0 0", fontSize: 12.5, color: "var(--color-text-secondary)", fontVariantNumeric: "tabular-nums" }}>{heroSubtitle}</p>
            {note && <p style={{ margin: "8px 0 0", fontSize: 12.5, fontWeight: 600, color: note.tone ?? "var(--color-text-primary)" }}>{note.text}</p>}
          </div>
        </div>

        {goal.notes && <p style={{ fontSize: 12, color: "var(--color-text-secondary)", fontStyle: "italic", margin: "12px 0 0" }}>{goal.notes}</p>}
      </CardBody>

      {/* ── Three figures, divided by rules ───────────────────────────────── */}
      <div
        style={{
          display: "flex",
          borderTop: "1px solid var(--color-border-tertiary)",
          background: "color-mix(in srgb, var(--color-text-primary) 3%, transparent)",
        }}
      >
        {figures.map((figure, index) => (
          <Fragment key={figure.label}>
            {index > 0 && FIGURE_DIVIDER}
            <Figure {...figure} />
          </Fragment>
        ))}
      </div>

      {/* ── Actions ───────────────────────────────────────────────────────── */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, padding: "11px 14px", borderTop: "1px solid var(--color-border-tertiary)" }}>
        {!isEffectivelyCompleted && (
          <Button size="sm" color="primary" style={{ flex: "1 1 auto", minWidth: 96 }} onClick={() => onAddDeposit(goal)}>
            {i18n.t("investments.addDeposit")}
          </Button>
        )}
        {goal.totalSaved > 0 && !isEffectivelyCompleted && (
          <Button size="sm" color="secondary" outline style={{ flex: "1 1 auto", minWidth: 84 }} onClick={() => onWithdraw(goal)}>
            {i18n.t("investments.withdraw")}
          </Button>
        )}
        <Button size="sm" color="secondary" outline style={{ flex: "1 1 auto", minWidth: 78 }} onClick={() => onViewHistory(goal)}>
          {i18n.t("goals.history")}
        </Button>
      </div>
    </Card>
  );
}

// ─── DeleteConfirmModal ───────────────────────────────────────────────────────

export function DeleteConfirmModal({ goal, isDeleting, onConfirm, onClose }: { goal: InvestmentGoalWithStats; isDeleting: boolean; onConfirm: () => void; onClose: () => void }) {
  return (
    <Modal isOpen toggle={onClose} centered size="sm">
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

const historyTabLabel = (tab: HistoryTab): string =>
  i18n.t(tab === "all" ? "investments.historyTabAll" : tab === "deposits" ? "investments.historyTabDeposits" : "investments.historyTabWithdrawals");

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
    { label: i18n.t("goals.deposited"), value: formatCurrency(totalDeposited), color: "var(--color-income)" },
    { label: i18n.t("goals.withdrawn"), value: formatCurrency(totalWithdrawn), color: "var(--color-expense)" },
    { label: i18n.t("goals.netSaved"), value: formatCurrency(totalSaved), color: "var(--color-text-primary)" },
  ];
  return (
    <div style={{ display: "flex", borderBottom: "0.5px solid var(--color-border-tertiary)" }}>
      {cells.map((c, i) => (
        <div key={c.label} style={{ flex: 1, textAlign: "center", padding: "10px 8px", borderLeft: i > 0 ? "0.5px solid var(--color-border-tertiary)" : "none" }}>
          <p style={{ fontSize: 10, fontWeight: 500, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--color-text-secondary)", margin: "0 0 2px" }}>{c.label}</p>
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
            {historyTabLabel(tab)}
            <span style={{ marginLeft: 5, fontSize: 11, color: isActive ? "var(--bs-primary)" : "var(--color-text-secondary)" }}>({counts[tab]})</span>
          </button>
        );
      })}
    </div>
  );
}

function ContributionRow({ contribution, formatCurrency }: { contribution: InvestmentContribution; formatCurrency: (n: number) => string }) {
  const isDeposit = contribution.contributionType === "deposit";
  const color = isDeposit ? "var(--color-income)" : "var(--color-expense)";
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 16px", borderBottom: "0.5px solid var(--color-border-tertiary)" }}>
      <div style={{ width: 7, height: 7, borderRadius: "50%", background: color, flexShrink: 0 }} />
      <span style={{ fontSize: 12, color: "var(--color-text-secondary)", whiteSpace: "nowrap", minWidth: 88 }}>{formatDate(toDate(contribution.date))}</span>
      <span title={contribution.notes} style={{ fontSize: 12, color: "var(--color-text-secondary)", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
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

  const sorted = [...contributions].sort((a, b) => toDate(b.date)!.getTime() - toDate(a.date)!.getTime());
  const deposits = sorted.filter((c) => c.contributionType === "deposit");
  const withdrawals = sorted.filter((c) => c.contributionType === "withdrawal");

  const counts: Record<HistoryTab, number> = { all: sorted.length, deposits: deposits.length, withdrawals: withdrawals.length };
  const filtered = activeTab === "deposits" ? deposits : activeTab === "withdrawals" ? withdrawals : sorted;

  return (
    <Modal isOpen toggle={onClose} centered size="md">
      <ModalHeader toggle={onClose} style={{ fontSize: 14, fontWeight: 500 }}>
        {i18n.t("investments.historyTitle", { icon: goal.icon ?? "", name: goal.name })}
      </ModalHeader>
      <ModalBody style={{ padding: 0 }}>
        <HistorySummaryBar totalDeposited={goal.totalDeposited} totalWithdrawn={goal.totalWithdrawn} totalSaved={goal.totalSaved} formatCurrency={formatCurrency} />
        <HistoryTabBar active={activeTab} counts={counts} onChange={setActiveTab} />

        {isLoading ? (
          <div style={{ padding: "1rem" }}>
            <SkeletonRows count={4} />
          </div>
        ) : filtered.length === 0 ? (
          <p style={{ color: "var(--color-text-secondary)", textAlign: "center", padding: "2rem 0", fontSize: 13, margin: 0 }}>
            {activeTab === "all" ? "No contributions yet." : `No ${activeTab} yet.`}
          </p>
        ) : (
          <div
            style={{
              maxHeight: 300,
              overflowY: "auto",
              background: `linear-gradient(var(--color-background-primary) 30%, transparent), linear-gradient(transparent, var(--color-background-primary) 70%) bottom, linear-gradient(rgba(0,0,0,0.05), transparent), linear-gradient(transparent, rgba(0,0,0,0.05)) bottom`,
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
