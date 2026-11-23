import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { FiChevronLeft } from "react-icons/fi";
import { useTranslation } from "react-i18next";
import { AddButton } from "./AddButton";
import styles from "../css/PageHeader.module.css";

export interface PageHeaderProps {
  /** The page's name — the `h1`. It wraps; it is never cut short. */
  title: ReactNode;
  /** One line under it, saying what the page is for. */
  subtitle?: ReactNode;
  /**
   * The «+»'s words (aria/title) — the same ones the page gives `usePageAdd`,
   * so the floating «+» says the same thing. Given together with `onAdd`, the
   * square «+» shows at the card's left.
   */
  addLabel?: string;
  onAdd?: () => void;
  /** The «+» greyed out — offline, or nothing more can be added. */
  addDisabled?: boolean;
  /** The right-hand slot: the page's own buttons, a picker, a zoom. */
  actions?: ReactNode;
  /** A record page's way back — «‹ Πίσω» to this address (`.claude/rules/ui.md` 9). */
  backTo?: string;
  /** Other words for it, when «Πίσω» is not what it does. */
  backLabel?: string;
  /**
   * The page's ONE row of tabs or selectors — `PageTabs`, a `ViewSwitch`, a
   * `DensitySwitch`, a `GoalPickMenu` — inside the same card, under the title.
   */
  children?: ReactNode;
  className?: string;
}

/**
 * THE header of every page: one soft card (the cards' surface, edge and radius)
 * holding the «+», the title, its one line, the actions — and, inside the same
 * card, the page's one row of tabs or selectors.
 *
 * The owner picked it on 2026-11-19 from three mockups («option Α, a card»,
 * `docs/DECISIONS.md`): every page's top now reads the same, and a page's own
 * header markup is a bug. It replaces `AddHeader`, which was the «+» and the
 * title on the bare page ground, with each page leaving its own room under it.
 *
 * Phone-first: the «+» keeps its 44px square and never shrinks, the title
 * takes the rest of the row and wraps (never truncates), and the actions drop
 * to a line of their own before anything is squeezed. At 320px nothing spills
 * out of the card.
 */
export function PageHeader({ title, subtitle, addLabel, onAdd, addDisabled, actions, backTo, backLabel, children, className = "" }: PageHeaderProps) {
  const { t } = useTranslation();
  const back = backTo ? (
    <Link to={backTo} className={`btn btn-outline-secondary btn-sm d-inline-flex align-items-center gap-1 flex-shrink-0 text-nowrap ${styles.back}`}>
      <FiChevronLeft size={14} aria-hidden /> {backLabel ?? t("common.back")}
    </Link>
  ) : null;

  return (
    <section className={`${styles.header} ${className}`}>
      <div className={styles.top}>
        {onAdd && addLabel && <AddButton label={addLabel} onClick={onAdd} disabled={addDisabled} />}
        <div className={styles.text}>
          <h1 className="h5 fw-semibold text-body-emphasis mb-0">{title}</h1>
          {subtitle && <p className="small text-body-secondary mb-0">{subtitle}</p>}
        </div>
        {(actions || back) && (
          <div className={styles.actions}>
            {actions}
            {back}
          </div>
        )}
      </div>
      {children && <div className={styles.controls}>{children}</div>}
    </section>
  );
}

export default PageHeader;
