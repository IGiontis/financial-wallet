import { Navbar, Container, Button } from "reactstrap";
import { useNavigate } from "react-router-dom";
import styles from "./css/Topbar.module.css";
import { FiSettings, FiLogOut, FiMenu, FiSun, FiMoon } from "react-icons/fi";
import { IoChevronDown } from "react-icons/io5";
import { useAuth } from "../../shared/hooks/useAuth";
import { useTheme } from "../../shared/hooks/useTheme";
import { useTranslation } from "react-i18next";
import { logout } from "../../firebase/auth";
import { getUser } from "../../firebase/firestore";
import { useQuery } from "@tanstack/react-query";
import { exchangeRateKeys } from "../../shared/hooks/useCurrencyConverter";
import { MENU_DIVIDER, RowMenu } from "../../shared/components/RowMenu";
import { useBillsNeedingAttention } from "../bills/useBills";

interface TopbarProps {
  toggleSidebar: () => void;
}

export function Topbar({ toggleSidebar }: TopbarProps) {
  const navigate = useNavigate();
  const { currentUser } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const { t } = useTranslation();
  const billsDue = useBillsNeedingAttention();

  // Use same query key as useCurrencyConverter so cache is shared
  // When Settings saves and invalidates — Topbar updates instantly
  const { data: firestoreUser } = useQuery({
    queryKey: exchangeRateKeys.user(currentUser?.uid ?? ""),
    queryFn: () => getUser(currentUser!.uid),
    enabled: !!currentUser?.uid,
    staleTime: 0,
  });

  const isGoogle = currentUser?.providerData?.[0]?.providerId === "google.com";

  const displayName = isGoogle
    ? firestoreUser?.firstName
      ? `${firestoreUser.firstName} ${firestoreUser.lastName ?? ""}`.trim()
      : (currentUser?.displayName ?? "")
    : (firestoreUser?.username ?? currentUser?.email?.split("@")[0] ?? "User");

  const email = currentUser?.email ?? "";

  const getUserInitials = (): string => {
    if (firestoreUser?.firstName) {
      return `${firestoreUser.firstName[0]}${firestoreUser.lastName?.[0] ?? ""}`.toUpperCase();
    }
    if (currentUser?.displayName) {
      return currentUser.displayName
        .split(" ")
        .map((n: string) => n[0])
        .join("")
        .toUpperCase()
        .slice(0, 2);
    }
    return (currentUser?.email?.[0] ?? "U").toUpperCase();
  };

  const handleLogout = async () => {
    try {
      await logout();
      navigate("/login", { replace: true });
    } catch (err) {
      console.error("Logout error:", err);
    }
  };

  const avatarStyle: React.CSSProperties = {
    borderRadius: "50%",
    background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontWeight: 600,
    color: "#fff",
    flexShrink: 0,
  };

  return (
    <Navbar className={`border-bottom shadow-sm ${styles.topbar}`}>
      <Container fluid className={`${styles.topbarContainer} d-flex align-items-center justify-content-between`}>
        <Button
          color="light"
          className={`d-lg-none me-2 ${styles.menuButton}`}
          onClick={toggleSidebar}
          aria-label={billsDue ? `${t("nav.menu")} — ${t("bills.dueCount", { count: billsDue })}` : t("nav.menu")}
        >
          <FiMenu size={24} />
          {!!billsDue && <span className={styles.menuDot} aria-hidden />}
        </Button>

        <div className={styles.rightContent}>
          <Button
            color="link"
            className={styles.themeToggle}
            onClick={toggleTheme}
            aria-label={theme === "dark" ? t("nav.lightMode") : t("nav.darkMode")}
            title={theme === "dark" ? t("nav.lightMode") : t("nav.darkMode")}
          >
            {theme === "dark" ? <FiSun size={19} /> : <FiMoon size={19} />}
          </Button>

          <RowMenu
            label={displayName || email || t("nav.settings")}
            className={styles.userButton}
            menuClassName={styles.userDropdown}
            header={
              <div className={styles.userInfo}>
                <div style={{ ...avatarStyle, width: 36, height: 36, fontSize: 13, marginBottom: 8 }}>{getUserInitials()}</div>
                {displayName && <div style={{ fontWeight: 500, fontSize: 13, color: "var(--color-text-primary)" }}>{displayName}</div>}
                <div className={styles.userInfoEmail}>{email}</div>
              </div>
            }
            entries={[
              { label: t("nav.settings"), onSelect: () => navigate("/settings"), icon: <FiSettings size={18} /> },
              MENU_DIVIDER,
              { label: t("nav.signOut"), onSelect: handleLogout, icon: <FiLogOut size={18} />, danger: true },
            ]}
          >
            <div className={styles.userAvatar}>{getUserInitials()}</div>
            {/* Only show name once Firestore has loaded — prevents flash */}
            {firestoreUser && <span className={`${styles.userName} d-none d-md-inline`}>{displayName}</span>}
            <IoChevronDown size={16} className="d-none d-md-inline" />
          </RowMenu>
        </div>
      </Container>
    </Navbar>
  );
}
