import { Navbar, Container, Button, UncontrolledDropdown, DropdownToggle, DropdownMenu, DropdownItem } from "reactstrap";
import { useNavigate } from "react-router-dom";
import styles from "./css/Topbar.module.css";

import { BsBell } from "react-icons/bs";
import { FiUser, FiSettings, FiHelpCircle, FiLogOut, FiMenu } from "react-icons/fi";
import { IoChevronDown } from "react-icons/io5";

interface TopbarProps {
  toggleSidebar: () => void;
}

export function Topbar({ toggleSidebar }: TopbarProps) {
  const navigate = useNavigate();

  const user = {
    name: "John Doe",
    email: "[email protected]",
    avatar: "",
  };

  const notificationCount = 3;

  const notifications = [
    { id: 1, message: "New transaction added", time: "2 min ago" },
    { id: 2, message: "Budget limit reached", time: "1 hour ago" },
    { id: 3, message: "Monthly report ready", time: "3 hours ago" },
  ];

  const getUserInitials = () =>
    user.name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);

  return (
    <Navbar color="white" light className="border-bottom shadow-sm">
      <Container fluid className={`${styles.topbarContainer} d-flex align-items-center justify-content-between`}>
        <Button color="light" className="d-lg-none me-2" onClick={toggleSidebar}>
          <FiMenu size={24} />
        </Button>

        <div className={styles.rightContent}>
          {/* Notifications */}
          <UncontrolledDropdown>
            <DropdownToggle tag="button" className={styles.notificationButton}>
              <BsBell size={20} className={styles.bellIcon} />
              {notificationCount > 0 && <span className={styles.notificationBadge}>{notificationCount}</span>}
            </DropdownToggle>

            <DropdownMenu end className={styles.notificationDropdown}>
              <div className={styles.dropdownHeader}>
                <h6 className={styles.dropdownHeaderTitle}>Notifications</h6>
                <span className={styles.headerBadge}>{notificationCount}</span>
              </div>

              {notifications.map((n) => (
                <DropdownItem key={n.id} className={styles.notificationItem}>
                  <div className={styles.notificationMessage}>{n.message}</div>
                  <div className={styles.notificationTime}>{n.time}</div>
                </DropdownItem>
              ))}

              <DropdownItem className={styles.viewAllButton}>View all notifications</DropdownItem>
            </DropdownMenu>
          </UncontrolledDropdown>

          {/* User */}
          <UncontrolledDropdown>
            <DropdownToggle tag="button" className={styles.userButton}>
              <div className={styles.userAvatar}>{user.avatar ? <img src={user.avatar} alt={user.name} className={styles.userAvatarImg} /> : getUserInitials()}</div>

              <span className={`${styles.userName} d-none d-md-inline`}>{user.name}</span>

              <IoChevronDown size={16} className="d-none d-md-inline" />
            </DropdownToggle>

            <DropdownMenu end className={styles.userDropdown}>
              <div className={styles.userInfo}>
                <div className={styles.userInfoName}>{user.name}</div>
                <div className={styles.userInfoEmail}>{user.email}</div>
              </div>

              <DropdownItem divider />

              <DropdownItem className={styles.dropdownItem} onClick={() => navigate("/profile")}>
                <FiUser size={18} className={styles.dropdownItemIcon} />
                My Profile
              </DropdownItem>

              <DropdownItem className={styles.dropdownItem} onClick={() => navigate("/settings")}>
                <FiSettings size={18} className={styles.dropdownItemIcon} />
                Settings
              </DropdownItem>

              <DropdownItem className={styles.dropdownItem} onClick={() => navigate("/help")}>
                <FiHelpCircle size={18} className={styles.dropdownItemIcon} />
                Help & Support
              </DropdownItem>

              <DropdownItem divider />

              <DropdownItem className={`${styles.dropdownItem} ${styles.logoutItem}`}>
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
