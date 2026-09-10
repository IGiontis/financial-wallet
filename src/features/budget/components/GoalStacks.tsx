import { memo, useMemo } from "react";
import { FiChevronDown, FiGrid, FiList, FiPlus } from "react-icons/fi";
import { useTranslation } from "react-i18next";
import { useLocalStorage } from "../../../shared/hooks/useLocalStorage";
import { MENU_DIVIDER, RowMenu } from "../../../shared/components/RowMenu";
import { formatDate, getStatusConfig, goalHeadline, relativeToNow, toDate } from "./goalDisplay";
import styles from "./css/GoalStacks.module.css";
import type { GoalGroup } from "./goalGrouping";
import type { GoalCardProps } from "./InvestmentsShared";
import type { InvestmentGoalStatus, InvestmentGoalWithStats } from "../../../shared/types/IndexTypes";

// One line per goal, stacked under the horizon it belongs to.
//
// The same data as the cards and the same actions behind them — this is a
// second reading of the list, not a second version of it.

/** The status colours, as the tokens rather than Bootstrap's own. */
const STATUS_TONE: Record<InvestmentGoalStatus, string> = {
  on_track: "var(--color-income)",
  ahead: "var(--color-invest)",
  behind: "var(--color-expense)",
  completed: "var(--color-text-secondary)",
};

type RowActions = Omit<GoalCardProps, "goal">;

// Memoised, now that the handlers above hold still: a row redraws when its own
// goal changes and not because someone typed a letter in the search box.
const GoalRow = memo(function GoalRow({ goal, formatCurrency, onViewHistory, onAddDeposit, onWithdraw, onDelete, onEdit, onTogglePause }: RowActions & { goal: InvestmentGoalWithStats }) {
  const { t } = useTranslation();
  const now = new Date();

  const accent = goal.color ?? "var(--color-invest)";
  // The same two figures the card puts in its ring, from the same function —
  // a row that measured a monthly goal against its lifetime total would read
  // 1,200% beside a card reading 62%.
  const { saved, target, pct } = goalHeadline(goal);

  const deadline = toDate(goal.deadline);
  // Midnight today, built rather than set: `setHours` would move `now` itself,
  // and everything read after it would be measured from a different moment.
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const overdue = !!deadline && !goal.isCompleted && deadline.getTime() < startOfToday.getTime();
  const status = goal.status ? getStatusConfig(goal.status) : null;
  const isRecurring = goal.targetPeriod === "monthly" || goal.targetPeriod === "yearly";
  const isDone = goal.isCompleted && goal.goalType !== "open_ended" && !isRecurring;
  const monthly = goal.monthlyRequired ?? 0;

  return (
    <div className={styles.row}>
      <span className={styles.icon} style={{ background: `color-mix(in srgb, ${accent} 14%, transparent)` }} aria-hidden>
        {goal.icon ?? "🎯"}
      </span>

      <div className={styles.main}>
        <div className={styles.name}>
          {goal.status && <span className={styles.dot} style={{ background: STATUS_TONE[goal.status] }} title={status?.label} />}
          {goal.name}
        </div>
        {/* Only what the heading above does not already say. On the goals
            screen every row is a targeted goal and on the investments screen
            the stack is named after the kind, so printing the type on every
            line was a word of furniture per row. */}
        <div className={`${styles.meta} ${overdue ? styles.metaLate : ""}`}>
          {isRecurring
            ? t(goal.targetPeriod === "yearly" ? "goals.thisYearShort" : "goals.thisMonthShort")
            : deadline
              ? `${formatDate(deadline)} · ${relativeToNow(deadline, now)}`
              : (goal.notes ?? "")}
        </div>
      </div>

      <div className={styles.bar}>
        <span className={styles.track}>
          <span className={styles.fill} style={{ width: `${pct}%`, background: accent }} />
        </span>
        <span className={styles.pct}>{Math.round(pct)}%</span>
      </div>

      <div className={styles.figures}>
        <div className={styles.amount}>
          {formatCurrency(saved)}
          {target > 0 && <span> / {formatCurrency(target)}</span>}
        </div>
        <div className={styles.pace}>{monthly > 0 && !isDone ? t("goals.stackNeedPerMonth", { amount: formatCurrency(monthly) }) : (goal.notes ?? "")}</div>
      </div>

      <div className={styles.menu}>
        {!isDone && (
          <button
            type="button"
            onClick={() => onAddDeposit(goal)}
            aria-label={`${t("investments.addDeposit")} — ${goal.name}`}
            style={{ background: "transparent", border: "none", padding: 2, cursor: "pointer", color: "var(--color-link)", lineHeight: 1 }}
          >
            <FiPlus size={16} />
          </button>
        )}

        <RowMenu
          label={goal.name}
          entries={[
            { label: t("goals.history"), onSelect: () => onViewHistory(goal) },
            ...(saved > 0 && !isDone ? [{ label: t("investments.withdraw"), onSelect: () => onWithdraw(goal) }] : []),
            MENU_DIVIDER,
            { label: t("common.edit"), onSelect: () => onEdit(goal), disabled: isDone },
            { label: t(goal.isActive ? "goals.pause" : "goals.resume"), onSelect: () => onTogglePause(goal), disabled: isDone },
            MENU_DIVIDER,
            { label: t("common.delete"), onSelect: () => onDelete(goal), danger: true },
          ]}
        />
      </div>
    </div>
  );
});

function Stack({ group, actions, storageKey }: { group: GoalGroup; actions: RowActions; storageKey: string }) {
  const { t } = useTranslation();
  // Collapsed stacks are remembered per stack and per screen: someone who never
  // wants to see "Later" should not have to shut it again every visit.
  const [shut, setShut] = useLocalStorage<boolean>(`${storageKey}:${group.id}`, false);

  return (
    <section className={`${styles.stack} ${group.urgent ? styles.urgent : ""}`}>
      <button type="button" className={styles.head} onClick={() => setShut(!shut)} aria-expanded={!shut}>
        <span className={styles.headLeft}>
          <span className={`${styles.chevron} ${shut ? styles.chevronShut : ""}`}>
            <FiChevronDown size={15} />
          </span>
          {group.icon ? <span className={styles.glyph}>{group.icon}</span> : <span className={styles.title}>{group.label}</span>}
          <span className={styles.count}>{group.goals.length}</span>
        </span>

        {/* What the whole stack still needs, which is the figure a heading is
            worth having: six goals due this quarter is a number of items, and
            €4,200 between them is a decision. */}
        {group.remaining > 0 && (
          <span className={styles.headTotals}>
            {t("goals.stackLeft", { amount: actions.formatCurrency(group.remaining) })}
            {group.monthlyNeeded > 0 && <> · <strong>{t("goals.stackNeedPerMonth", { amount: actions.formatCurrency(group.monthlyNeeded) })}</strong></>}
          </span>
        )}
      </button>

      {!shut && group.goals.map((goal) => <GoalRow key={goal.id} goal={goal} {...actions} />)}
    </section>
  );
}

export function GoalStacks({ groups, storageKey, ...actions }: { groups: GoalGroup[]; storageKey: string } & RowActions) {
  // The rest element is a fresh object on every render, and it is both passed
  // down and spread onto every row — so every row saw new props whatever the
  // page did about its handlers. Holding it steady is what makes the work the
  // page has done upstream reach the rows at all.
  const { formatCurrency, onViewHistory, onAddDeposit, onWithdraw, onDelete, onEdit, onTogglePause } = actions;
  const steady = useMemo<RowActions>(
    () => ({ formatCurrency, onViewHistory, onAddDeposit, onWithdraw, onDelete, onEdit, onTogglePause }),
    [formatCurrency, onViewHistory, onAddDeposit, onWithdraw, onDelete, onEdit, onTogglePause],
  );

  return (
    <div className={styles.stacks}>
      {groups.map((group) => (
        <Stack key={group.id} group={group} actions={steady} storageKey={storageKey} />
      ))}
    </div>
  );
}

export type GoalView = "cards" | "stacks";

/**
 * Cards or list, and the choice sticks.
 *
 * Two readings of the same goals: the grid for looking at them, the stacks for
 * working through them. Which one someone wants is a habit, not a mood, so it
 * is remembered rather than reset on every visit.
 */
export function GoalViewToggle({ view, onChange }: { view: GoalView; onChange: (view: GoalView) => void }) {
  const { t } = useTranslation();

  return (
    <div className={styles.viewToggle} role="group" aria-label={t("goals.viewLabel")}>
      <button
        type="button"
        className={`${styles.viewBtn} ${view === "cards" ? styles.viewBtnOn : ""}`}
        aria-pressed={view === "cards"}
        onClick={() => onChange("cards")}
      >
        <FiGrid size={13} aria-hidden />
        <span className="d-none d-sm-inline">{t("goals.viewCards")}</span>
      </button>
      <button
        type="button"
        className={`${styles.viewBtn} ${view === "stacks" ? styles.viewBtnOn : ""}`}
        aria-pressed={view === "stacks"}
        onClick={() => onChange("stacks")}
      >
        <FiList size={13} aria-hidden />
        <span className="d-none d-sm-inline">{t("goals.viewStacks")}</span>
      </button>
    </div>
  );
}
