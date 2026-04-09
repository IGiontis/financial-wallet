import { Navbar, Container, Button, UncontrolledDropdown, DropdownToggle, DropdownMenu, DropdownItem } from "reactstrap";
import { useNavigate } from "react-router-dom";
import styles from "./css/Topbar.module.css";

import { FiSettings, FiHelpCircle, FiLogOut, FiMenu } from "react-icons/fi";
import { IoChevronDown } from "react-icons/io5";

import { useAuth } from "../../context/AuthContext";
import { logout } from "../../firebase/auth";

interface TopbarProps {
  toggleSidebar: () => void;
}

export function Topbar({ toggleSidebar }: TopbarProps) {
  const navigate = useNavigate();
  const { currentUser } = useAuth();

  // ── Derive display values from Firebase auth user ─────────────────────────
  const displayName = currentUser?.displayName ?? currentUser?.email?.split("@")[0] ?? "User";
  const email = currentUser?.email ?? "";
  const avatar = currentUser?.photoURL ?? "";

  const getUserInitials = () =>
    displayName
      .split(" ")
      .map((n: string) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);

  // ── Logout ────────────────────────────────────────────────────────────────
  const handleLogout = async () => {
    try {
      await logout();
      navigate("/login", { replace: true });
    } catch (err) {
      console.error("Logout error:", err);
    }
  };

  return (
    <Navbar color="white" light className="border-bottom shadow-sm">
      <Container fluid className={`${styles.topbarContainer} d-flex align-items-center justify-content-between`}>
        <Button color="light" className="d-lg-none me-2" onClick={toggleSidebar}>
          <FiMenu size={24} />
        </Button>

        <div className={styles.rightContent}>
          {/* User */}
          <UncontrolledDropdown>
            <DropdownToggle tag="button" className={styles.userButton}>
              <div className={styles.userAvatar}>{avatar ? <img src={avatar} alt={displayName} className={styles.userAvatarImg} /> : getUserInitials()}</div>
              <span className={`${styles.userName} d-none d-md-inline`}>{displayName}</span>
              <IoChevronDown size={16} className="d-none d-md-inline" />
            </DropdownToggle>

            <DropdownMenu end className={styles.userDropdown}>
              <div className={styles.userInfo}>
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
