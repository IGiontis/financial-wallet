import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { FiChevronLeft } from "react-icons/fi";
import { useTranslation } from "react-i18next";
import { AddButton } from "./AddButton";
import { PageBandContext } from "../hooks/useInPageBand";
import styles from "../css/PageHeader.module.css";

export interface PageHeaderProps {
  /** The page's name — the `h1`. It wraps; it is never cut short. */
  title: ReactNode;
  /** One line under it, saying what the page is for. */
  subtitle?: ReactNode;
  /**
   * The «+»'s words (aria/title) — the same ones the page gives `usePageAdd`,
   * so the floating «+» says the same thing. Given together with `onAdd`, the
   * square «+» shows at the band's left.
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
   * `DensitySwitch`, a `GoalPickMenu` — at the band's foot, under the title.
   * `PageTabs` in here draws itself as the band's base (underlines on its
   * bottom edge); the others keep their own look.
   */
  children?: ReactNode;
  className?: string;
}

/**
 * THE header of every page: one BAND on the page's surface, edge to edge and
 * flush against the top bar, holding the «+», the title, its one line, the
 * actions — and, at its foot, the page's one row of tabs or selectors.
 *
 * The owner picked the band on 2026-11-24 («option Β») over the soft card it
 * was from 2026-11-19 («option Α»): «να πιάνει από άκρη σε άκρη, κολλημένο με
 * το από πάνω». No radius, no shadow, no gap above it; the band's bottom edge
 * is its base, and the page's tabs sit on that edge as underlines
 * (`PageTabs`, through the band's context). Every page's top reads the same,
 * and a page's own header markup is a bug.
 *
 * Phone-first: the «+» keeps its 44px square and never shrinks, the title
 * takes the rest of the row and wraps (never truncates), and the actions drop
 * to a line of their own before anything is squeezed. At 320px nothing spills
 * out of the band.
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
      {children && (
        <div className={styles.controls}>
          {/* Everything in here is in the band: `PageTabs` asks (`useInPageBand`)
              and draws itself as the band's base. */}
          <PageBandContext.Provider value>{children}</PageBandContext.Provider>
        </div>
      )}
    </section>
  );
}

export default PageHeader;
