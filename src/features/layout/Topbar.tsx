import { Navbar, Container, Button, UncontrolledDropdown, DropdownToggle, DropdownMenu, DropdownItem } from "reactstrap";
import { useNavigate } from "react-router-dom";
import styles from "./css/Topbar.module.css";
import { FiSettings, FiHelpCircle, FiLogOut, FiMenu } from "react-icons/fi";
import { IoChevronDown } from "react-icons/io5";
import { useAuth } from "../../context/AuthContext";
import { logout } from "../../firebase/auth";
import { getUser } from "../../firebase/firestore";
import { useQuery } from "@tanstack/react-query";
import { exchangeRateKeys } from "../../shared/hooks/useCurrencyConverter";

interface TopbarProps {
  toggleSidebar: () => void;
}

export function Topbar({ toggleSidebar }: TopbarProps) {
  const navigate = useNavigate();
  const { currentUser } = useAuth();

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
    <Navbar color="white" light className="border-bottom shadow-sm">
      <Container fluid className={`${styles.topbarContainer} d-flex align-items-center justify-content-between`}>
        <Button color="light" className="d-lg-none me-2" onClick={toggleSidebar}>
          <FiMenu size={24} />
        </Button>

        <div className={styles.rightContent}>
          <UncontrolledDropdown>
            <DropdownToggle tag="button" className={styles.userButton}>
              <div className={styles.userAvatar}>{getUserInitials()}</div>
              {/* Only show name once Firestore has loaded — prevents flash */}
              {firestoreUser && <span className={`${styles.userName} d-none d-md-inline`}>{displayName}</span>}
              <IoChevronDown size={16} className="d-none d-md-inline" />
            </DropdownToggle>

            <DropdownMenu end className={styles.userDropdown}>
              <div className={styles.userInfo}>
                <div style={{ ...avatarStyle, width: 36, height: 36, fontSize: 13, marginBottom: 8 }}>{getUserInitials()}</div>
                {displayName && <div style={{ fontWeight: 500, fontSize: 13, color: "var(--color-text-primary)" }}>{displayName}</div>}
                <div className={styles.userInfoEmail}>{email}</div>
              </div>

              <DropdownItem divider />

              <DropdownItem className={styles.dropdownItem} onClick={() => navigate("/settings")}>
                <FiSettings size={18} className={styles.dropdownItemIcon} />
                Settings
              </DropdownItem>

              <DropdownItem className={styles.dropdownItem} onClick={() => navigate("/help")}>
                <FiHelpCircle size={18} className={styles.dropdownItemIcon} />
                Help & Support
              </DropdownItem>

              <DropdownItem divider />

              <DropdownItem className={`${styles.dropdownItem} ${styles.logoutItem}`} onClick={handleLogout}>
                <FiLogOut size={18} className={styles.dropdownItemIcon} />
                Sign Out
              </DropdownItem>
            </DropdownMenu>
          </UncontrolledDropdown>
        </div>
      </Container>
    </Navbar>
  );
}
