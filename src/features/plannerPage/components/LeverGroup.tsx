import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { FiChevronDown, FiChevronRight, FiPlus } from "react-icons/fi";
import styles from "../css/PlannerPage.module.css";

interface LeverGroupProps {
  title: string;
  /** Rows inside. Shown beside the title so a folded group still says how big it is. */
  count?: number;
  /** Signed total for the group, in the window. */
  total: number;
  formatCurrency: (n: number) => string;
  open: boolean;
  onToggle: () => void;
  /** "Skip all" / "Include all", when there is more than one row to sweep. */
  sweepLabel?: string;
  onSweep?: () => void;
  /** Opens this group's editor. Absent for groups the user cannot add to. */
  onAdd?: () => void;
  addLabel?: string;
  children: ReactNode;
}

/**
 * One folded group of the things the plan is made of.
 *
 * The page used to draw every bill, goal, debt and budget line at once — on a
 * phone that is a wall of rows below the one chart anybody came to read. Folded
 * to a summary, each group still says what it is, how many, and what it costs;
 * opening one is a tap, and the tap is right next to the row you wanted.
 *
 * Deliberately not a drawer. The workflow this page exists for is switching
 * rows off to ask "and if I dropped this?", and a drawer puts a tap between the
 * question and every answer.
 */
export function LeverGroup({ title, count, total, formatCurrency, open, onToggle, sweepLabel, onSweep, onAdd, addLabel, children }: LeverGroupProps) {
  const { t } = useTranslation();
  const tone = total > 0 ? "var(--color-income)" : total < 0 ? "var(--color-expense)" : undefined;

  return (
    <div className={styles.group}>
      <div className={styles.groupHead}>
        <button type="button" className={styles.groupToggle} onClick={onToggle} aria-expanded={open}>
          {open ? <FiChevronDown size={15} aria-hidden /> : <FiChevronRight size={15} aria-hidden />}
          <span className={styles.groupTitle}>{title}</span>
          {count !== undefined && count > 0 && <span className={styles.groupCount}>{t("planner.groupCount", { count })}</span>}
          <span className={styles.groupTotal} style={{ color: tone }}>
            {total === 0 ? formatCurrency(0) : `${total > 0 ? "+" : "−"}${formatCurrency(Math.abs(total))}`}
          </span>
        </button>

        {/* Only while open: sweeping rows you cannot see is how a plan quietly
            loses its bills. */}
        {open && sweepLabel && onSweep && (
          <button type="button" className={styles.sectionToggle} onClick={onSweep}>
            {sweepLabel}
          </button>
        )}

        {/* Beside the group it adds to, and reachable whether or not the group
            is unrolled — a link at the foot of a folded list is unreachable. */}
        {onAdd && (
          <button type="button" className={styles.groupAdd} onClick={onAdd} aria-label={addLabel} title={addLabel}>
            <FiPlus size={15} aria-hidden />
          </button>
        )}
      </div>

      {open && <div className={styles.groupBody}>{children}</div>}
    </div>
  );
}

export default LeverGroup;
