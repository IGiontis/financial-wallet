import { NavLink } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Button } from "reactstrap";
import { FiBriefcase, FiChevronsLeft, FiChevronsRight, FiLogOut, FiPlus } from "react-icons/fi";
import { ThemeCycleButton, ThemeSwitch } from "../../shared/components/ThemeSwitch";
import { LanguageSwitch, LanguageToggleButton } from "./LanguageSwitch";
import { Avatar, NavGroupList } from "./NavGroupList";
import { SETTINGS, type NavBadges } from "./navConfig";
import { useProfile, useSignOut } from "./useProfile";
import nav from "./css/Nav.module.css";
import styles from "./css/SideNav.module.css";

interface SideNavProps {
  badges: NavBadges;
  collapsed: boolean;
  onToggleCollapse: () => void;
  onAdd: () => void;
}

/**
 * The wide-screen navigation: a light panel down the left with every page in
 * view, the «Νέα συναλλαγή» button above them, and who you are, the theme and
 * the language at the foot.
 *
 * Hidden below `lg`, where the bottom bar and its menu take over. Folds to a
 * 72px rail of icons, remembered between visits.
 */
export function SideNav({ badges, collapsed, onToggleCollapse, onAdd }: SideNavProps) {
  const { t } = useTranslation();
  const profile = useProfile();
  const signOut = useSignOut();
  const name = profile.loaded ? profile.displayName || profile.email : "";
  const settingsLabel = name ? `${name}, ${t("nav.settings")}` : t("nav.settings");

  // Beside the name rather than on a row of its own: a row less at the foot is
  // a page more of the list on a laptop's window.
  const collapseButton = (
    <button
      type="button"
      className={nav.iconButton}
      onClick={onToggleCollapse}
      aria-expanded={!collapsed}
      aria-label={collapsed ? t("nav.expandSidebar") : t("nav.collapseSidebar")}
      title={collapsed ? t("nav.expandSidebar") : t("nav.collapseSidebar")}
    >
      {collapsed ? <FiChevronsRight size={18} aria-hidden /> : <FiChevronsLeft size={18} aria-hidden />}
    </button>
  );

  return (
    <div className={`${styles.sidebar} ${collapsed ? styles.collapsed : ""} d-none d-lg-flex`}>
      <div className={styles.brand}>
        <span className={styles.logo} aria-hidden>
          <FiBriefcase size={17} />
        </span>
        {!collapsed && <span className={styles.brandName}>MyFiWallet</span>}
      </div>

      {profile.signedIn && (
        <Button
          color="primary"
          className={styles.add}
          onClick={onAdd}
          aria-label={collapsed ? t("nav.newTransaction") : undefined}
          title={collapsed ? t("nav.newTransaction") : undefined}
          aria-keyshortcuts="N"
        >
          <FiPlus size={18} aria-hidden className="flex-shrink-0" />
          {!collapsed && <span>{t("nav.newTransaction")}</span>}
        </Button>
      )}

      <nav className={styles.scroll} aria-label={t("nav.mainNav")}>
        <NavGroupList badges={badges} collapsed={collapsed} dense unlabelledFirst />
      </nav>

      <div className={styles.foot}>
        <div className={styles.profileRow}>
          <NavLink
            to={SETTINGS.path}
            className={({ isActive }) => `${nav.profile} ${isActive ? nav.profileCurrent : ""} ${collapsed ? styles.profileIconOnly : ""} flex-grow-1`}
            aria-label={collapsed ? settingsLabel : undefined}
            title={collapsed ? settingsLabel : undefined}
          >
            <Avatar initials={profile.initials} size={34} />
            {!collapsed && (
              <span className={nav.profileText}>
                <span className={nav.profileName}>{name || " "}</span>
                <span className={nav.profileHint}>{t("nav.settings")}</span>
              </span>
            )}
          </NavLink>
          {!collapsed && profile.signedIn && (
            <button type="button" className={`${nav.iconButton} ${nav.danger}`} onClick={signOut} aria-label={t("nav.signOut")} title={t("nav.signOut")}>
              <FiLogOut size={18} aria-hidden />
            </button>
          )}
          {!collapsed && collapseButton}
        </div>

        {collapsed ? (
          <div className={styles.railTools}>
            <ThemeCycleButton className={nav.iconButton} />
            <LanguageToggleButton className={nav.iconButton} />
            {profile.signedIn && (
              <button type="button" className={`${nav.iconButton} ${nav.danger}`} onClick={signOut} aria-label={t("nav.signOut")} title={t("nav.signOut")}>
                <FiLogOut size={18} aria-hidden />
              </button>
            )}
            {collapseButton}
          </div>
        ) : (
          <div className={styles.switches}>
            <ThemeSwitch iconsOnly className="flex-grow-1" />
            <LanguageSwitch />
          </div>
        )}
      </div>
    </div>
  );
}
