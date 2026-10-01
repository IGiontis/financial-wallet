import { NavLink, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { FiGrid, FiPlus } from "react-icons/fi";
import { ALL_DESTINATIONS, BADGE_LABEL, BAR_AFTER_ADD, BAR_BEFORE_ADD, badgeText, isCurrentPath, type NavBadges, type NavDestination } from "./navConfig";
import styles from "./css/BottomNav.module.css";

interface BottomNavProps {
  badges: NavBadges;
  canAdd: boolean;
  onAdd: () => void;
  menuOpen: boolean;
  onOpenMenu: () => void;
}

const BAR_PATHS = new Set([...BAR_BEFORE_ADD, ...BAR_AFTER_ADD].map((item) => item.path));

/** Destinations that only the menu reaches. */
const MENU_ONLY = ALL_DESTINATIONS.filter((item) => !BAR_PATHS.has(item.path));

function BarLink({ item, badges }: { item: NavDestination; badges: NavBadges }) {
  const { t } = useTranslation();
  const Icon = item.icon;
  const label = t(item.labelKey);
  const count = item.badge ? (badges[item.badge] ?? 0) : 0;
  const badgeLabel = item.badge && count > 0 ? t(BADGE_LABEL[item.badge], { count }) : undefined;

  return (
    <NavLink
      to={item.path}
      end={item.path === "/"}
      className={({ isActive }) => `${styles.item} ${isActive ? styles.current : ""}`}
      aria-label={badgeLabel ? `${label}, ${badgeLabel}` : undefined}
    >
      <span className={styles.pill}>
        <Icon size={21} aria-hidden />
        {count > 0 && (
          <span className={styles.badge} aria-hidden>
            {badgeText(count)}
          </span>
        )}
      </span>
      <span className={styles.label}>{label}</span>
    </NavLink>
  );
}

/**
 * The phone's navigation: Overview · Transactions · «+» · Bills · Menu, under
 * the thumb.
 *
 * The «+» is a button, not a link — it opens the add form over whatever page
 * you are on rather than taking you anywhere — and it is raised out of the bar
 * because writing something down is what the app is opened for most.
 *
 * It sits in the page's own column, after the scrolling area, rather than
 * floating over it: nothing on any page can end up underneath it, and a bar a
 * page keeps stuck to its own bottom (the Banks "update" dock) stops just above
 * it instead of behind it.
 */
export function BottomNav({ badges, canAdd, onAdd, menuOpen, onOpenMenu }: BottomNavProps) {
  const { t } = useTranslation();
  const { pathname } = useLocation();

  // The bar has no row for the page you are on when it is one of the menu's,
  // so the Menu button takes the "you are here" mark instead — on the
  // Planner, the bar still says where you are.
  const inMenu = MENU_ONLY.some((item) => isCurrentPath(pathname, item.path));
  // The same for counts: one on a page the bar does not show would otherwise
  // be invisible until the menu was opened.
  const menuCount = MENU_ONLY.reduce((sum, item) => sum + (item.badge ? (badges[item.badge] ?? 0) : 0), 0);

  return (
    <nav className={`${styles.bar} app-bottom-nav d-lg-none`} aria-label={t("nav.barLabel")}>
      <ul className={styles.row}>
        {BAR_BEFORE_ADD.map((item) => (
          <li key={item.path}>
            <BarLink item={item} badges={badges} />
          </li>
        ))}
        <li>
          {canAdd && (
            <button type="button" className={`${styles.item} ${styles.add}`} onClick={onAdd} aria-label={t("nav.newTransaction")} aria-keyshortcuts="N">
              <span className={styles.addCircle}>
                <FiPlus size={28} aria-hidden />
              </span>
              <span className={styles.label}>{t("nav.newShort")}</span>
            </button>
          )}
        </li>
        {BAR_AFTER_ADD.map((item) => (
          <li key={item.path}>
            <BarLink item={item} badges={badges} />
          </li>
        ))}
        <li>
          <button
            type="button"
            className={`${styles.item} ${inMenu ? styles.current : ""}`}
            onClick={onOpenMenu}
            aria-haspopup="dialog"
            aria-expanded={menuOpen}
            aria-label={menuCount > 0 ? `${t("nav.menu")}, ${t("nav.menuAttention")}` : undefined}
          >
            <span className={styles.pill}>
              <FiGrid size={21} aria-hidden />
              {menuCount > 0 && <span className={styles.dot} aria-hidden />}
            </span>
            <span className={styles.label}>{t("nav.menu")}</span>
          </button>
        </li>
      </ul>
    </nav>
  );
}
