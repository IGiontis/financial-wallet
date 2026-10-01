import { NavLink } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Button, Offcanvas } from "reactstrap";
import { FiChevronRight, FiLogOut, FiX } from "react-icons/fi";
import { ThemeSwitch } from "../../shared/components/ThemeSwitch";
import { LanguageSwitch } from "./LanguageSwitch";
import { Avatar, NavGroupList } from "./NavGroupList";
import { SETTINGS, type NavBadges } from "./navConfig";
import { useProfile, useSignOut } from "./useProfile";
import nav from "./css/Nav.module.css";
import styles from "./css/MenuSheet.module.css";

const TITLE_ID = "app-menu-title";

/**
 * The phone's «Μενού»: every page in its group, with who you are at the top
 * and the theme, the language and signing out at the bottom.
 *
 * A dialog (Bootstrap's offcanvas, from below): it holds the keyboard's focus
 * while open, Esc and the backdrop close it, and focus goes back to the Menu
 * button afterwards. Choosing a page closes it as well.
 */
export function MenuSheet({ isOpen, onClose, badges }: { isOpen: boolean; onClose: () => void; badges: NavBadges }) {
  const { t } = useTranslation();
  const profile = useProfile();
  const signOut = useSignOut();
  const name = profile.loaded ? profile.displayName || profile.email : "";

  return (
    <Offcanvas
      isOpen={isOpen}
      toggle={onClose}
      direction="bottom"
      className={styles.sheet}
      labelledBy={TITLE_ID}
      aria-modal="true"
      trapFocus
      returnFocusAfterClose
    >
      <div className={styles.handle} aria-hidden />
      <h2 id={TITLE_ID} className="visually-hidden">
        {t("nav.menu")}
      </h2>

      <div className={styles.head}>
        <NavLink to={SETTINGS.path} onClick={onClose} className={({ isActive }) => `${nav.profile} ${isActive ? nav.profileCurrent : ""} flex-grow-1`}>
          <Avatar initials={profile.initials} size={44} />
          <span className={nav.profileText}>
            <span className={nav.profileName}>{name || " "}</span>
            <span className={nav.profileHint}>
              {t("nav.settingsAndProfile")}
              <FiChevronRight size={13} aria-hidden className="ms-1" />
            </span>
          </span>
        </NavLink>
        <button type="button" className={`${nav.iconButton} ${styles.close}`} onClick={onClose} aria-label={t("common.close")}>
          <FiX size={20} aria-hidden />
        </button>
      </div>

      <nav className={styles.body} aria-label={t("nav.allPages")}>
        <NavGroupList badges={badges} onNavigate={onClose} />
      </nav>

      <div className={styles.foot}>
        <ThemeSwitch className="w-100" />
        <div className={styles.footRow}>
          <LanguageSwitch />
          {profile.signedIn && (
            <Button color="danger" outline className={styles.signOut} onClick={signOut}>
              <FiLogOut size={16} aria-hidden />
              {t("nav.signOut")}
            </Button>
          )}
        </div>
      </div>
    </Offcanvas>
  );
}
