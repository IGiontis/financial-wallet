import type { RefObject } from "react";
import { Navbar, Container, Button } from "reactstrap";
import { useNavigate } from "react-router-dom";
import styles from "./css/Topbar.module.css";
import { FiSettings, FiLogOut, FiMenu, FiSun, FiMoon } from "react-icons/fi";
import { IoChevronDown } from "react-icons/io5";
import { useTheme } from "../../shared/hooks/useTheme";
import { useTranslation } from "react-i18next";
import { MENU_DIVIDER, RowMenu } from "../../shared/components/RowMenu";
import { useBillsNeedingAttention } from "../bills/useBills";
import { useProfile, useSignOut } from "./useProfile";
import { LanguageToggle } from "./LanguageToggle";

interface TopbarProps {
  toggleSidebar: () => void;
  /** ☰, so the layout can hand focus back to it when the drawer is dismissed. */
  menuButtonRef: RefObject<HTMLButtonElement | null>;
  isDrawerOpen: boolean;
}

export function Topbar({ toggleSidebar, menuButtonRef, isDrawerOpen }: TopbarProps) {
  const navigate = useNavigate();
  const { theme, toggleTheme } = useTheme();
  const { t } = useTranslation();
  const billsDue = useBillsNeedingAttention();
  // The same cached user document the sidebar reads — one read, two places.
  const { displayName, email, initials, loaded } = useProfile();
  const signOut = useSignOut();

  return (
    // `container={false}`: reactstrap otherwise wraps the bar in a second
    // container-fluid, and its gutter doubled the inset ☰ sits at on a phone.
    <Navbar container={false} className={`border-bottom ${styles.topbar}`}>
      <Container fluid className={`${styles.topbarContainer} d-flex align-items-center flex-nowrap`}>
        <Button
          innerRef={menuButtonRef}
          color="link"
          className={`d-lg-none ${styles.iconButton} ${styles.menuButton}`}
          onClick={toggleSidebar}
          aria-expanded={isDrawerOpen}
          aria-controls="app-sidebar"
          aria-label={billsDue ? `${t("nav.menu")} — ${t("bills.dueCount", { count: billsDue })}` : t("nav.menu")}
        >
          <FiMenu aria-hidden />
          {!!billsDue && <span className={styles.menuDot} aria-hidden />}
        </Button>

        <div className={styles.rightContent}>
          <Button
            color="link"
            className={`${styles.iconButton} ${styles.themeToggle}`}
            onClick={toggleTheme}
            aria-label={theme === "dark" ? t("nav.lightMode") : t("nav.darkMode")}
            title={theme === "dark" ? t("nav.lightMode") : t("nav.darkMode")}
          >
            {theme === "dark" ? <FiSun aria-hidden /> : <FiMoon aria-hidden />}
          </Button>

          {/* The two display controls, kept apart: light/dark | language. */}
          <span className={styles.controlDivider} aria-hidden />
          <LanguageToggle />

          {/* Α parts the account from the controls with a hairline; the other
              styles draw the account as a shape of its own and hide this. */}
          <span className={`${styles.divider} d-none d-md-block`} aria-hidden />

          {/* Γ moves the account into the sidebar's foot on a wide screen and
              hides this one there; on a phone it stays up here for every style. */}
          <RowMenu
            label={displayName || email || t("nav.settings")}
            className={styles.userButton}
            menuClassName={styles.userDropdown}
            header={
              <div className={styles.userInfo}>
                <div className={`${styles.userAvatar} ${styles.userInfoAvatar}`}>{initials}</div>
                {displayName && <div className={styles.userInfoName}>{displayName}</div>}
                <div className={styles.userInfoEmail}>{email}</div>
              </div>
            }
            entries={[
              { label: t("nav.settings"), onSelect: () => navigate("/settings"), icon: <FiSettings size={18} /> },
              MENU_DIVIDER,
              { label: t("nav.signOut"), onSelect: signOut, icon: <FiLogOut size={18} />, danger: true },
            ]}
          >
            <div className={styles.userAvatar}>{initials}</div>
            {/* Only show name once Firestore has loaded — prevents flash */}
            {loaded && displayName && <span className={`${styles.userName} d-none d-md-inline`}>{displayName}</span>}
            <IoChevronDown className={`${styles.userChevron} d-none d-md-inline`} aria-hidden />
          </RowMenu>
        </div>
      </Container>
    </Navbar>
  );
}
