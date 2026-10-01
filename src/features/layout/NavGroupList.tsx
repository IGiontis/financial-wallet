import { useId } from "react";
import { NavLink } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { BADGE_LABEL, badgeText, NAV_GROUPS, type NavBadges, type NavDestination } from "./navConfig";
import styles from "./css/Nav.module.css";

/** Two letters on a gradient disc — the same avatar the old top bar drew. */
export function Avatar({ initials, size = 36 }: { initials: string; size?: number }) {
  return (
    <span className={styles.avatar} style={{ width: size, height: size, fontSize: Math.round(size * 0.36) }} aria-hidden>
      {initials}
    </span>
  );
}

/**
 * One destination as a row: icon, name, and the count when it has one.
 *
 * `NavLink` marks the current page with `aria-current="page"` by itself. The
 * count is read as part of the name ("Bills, 2 bills need paying") rather than
 * left as a bare number after it.
 */
export function NavRow({ item, badges, collapsed = false, dense = false, onNavigate }: { item: NavDestination; badges: NavBadges; collapsed?: boolean; dense?: boolean; onNavigate?: () => void }) {
  const { t } = useTranslation();
  const Icon = item.icon;
  const label = t(item.labelKey);
  const count = item.badge ? (badges[item.badge] ?? 0) : 0;
  const badgeLabel = item.badge && count > 0 ? t(BADGE_LABEL[item.badge], { count }) : undefined;
  const name = badgeLabel ? `${label}, ${badgeLabel}` : undefined;

  return (
    <NavLink
      to={item.path}
      end={item.path === "/"}
      onClick={onNavigate}
      className={({ isActive }) => `${styles.link} ${isActive ? styles.current : ""} ${collapsed ? styles.iconOnly : ""} ${dense ? styles.dense : ""}`}
      aria-label={name ?? (collapsed ? label : undefined)}
      title={collapsed ? (name ?? label) : undefined}
    >
      <Icon size={19} className={styles.icon} aria-hidden />
      {!collapsed && <span className={styles.text}>{label}</span>}
      {count > 0 && (
        <span className={styles.badge} aria-hidden>
          {badgeText(count)}
        </span>
      )}
    </NavLink>
  );
}

/**
 * Every destination in its group — the sidebar's list and the phone menu's.
 *
 * Each group is a list named by its heading, so a screen reader announces
 * "Plan, list, 3 items" on the way in. Collapsed to icons there is no room for
 * a heading, so a rule carries the grouping and the name stays on the list.
 */
export function NavGroupList({
  badges,
  collapsed = false,
  dense = false,
  onNavigate,
  unlabelledFirst = false,
}: {
  badges: NavBadges;
  collapsed?: boolean;
  /** Rows sized for a pointer — the sidebar — rather than a thumb. */
  dense?: boolean;
  onNavigate?: () => void;
  /** The sidebar starts straight in, under the «+», as the mockup has it. */
  unlabelledFirst?: boolean;
}) {
  const { t } = useTranslation();
  const id = useId();

  return (
    <>
      {NAV_GROUPS.map((group, index) => {
        const headingId = `${id}-${group.key}`;
        const showHeading = !collapsed && !(unlabelledFirst && index === 0);
        return (
          <div key={group.key} className={styles.group}>
            {showHeading ? (
              <div id={headingId} className={styles.groupLabel}>
                {t(group.labelKey)}
              </div>
            ) : (
              index > 0 && <div className={styles.groupRule} aria-hidden />
            )}
            <ul className={styles.list} {...(showHeading ? { "aria-labelledby": headingId } : { "aria-label": t(group.labelKey) })}>
              {group.items.map((item) => (
                <li key={item.path}>
                  <NavRow item={item} badges={badges} collapsed={collapsed} dense={dense} onNavigate={onNavigate} />
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </>
  );
}
