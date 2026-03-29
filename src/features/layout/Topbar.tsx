import { Navbar, Container, Button, UncontrolledDropdown, DropdownToggle, DropdownMenu, DropdownItem } from "reactstrap";
import { useNavigate } from "react-router-dom";
import styles from "./css/Topbar.module.css";

// Import elegant icons from React Icons
import { BsBell } from "react-icons/bs";
import { FiUser, FiSettings, FiHelpCircle, FiLogOut, FiMenu } from "react-icons/fi";
import { IoChevronDown } from "react-icons/io5";

/**
 * Topbar Component
 *
 * 2025/2026 Pattern - Reactstrap Dropdown Implementation
 * - Uses UncontrolledDropdown (no state management needed!)
 * - Built-in accessibility, click-outside, and keyboard navigation
 * - Professional React Icons
 * - CSS Modules for custom styling
 */

interface TopbarProps {
  toggleSidebar: () => void;
}

export function Topbar({ toggleSidebar }: TopbarProps) {
  const navigate = useNavigate();

  // Mock user data
  const user = {
    name: "John Doe",
    email: "[email protected]",
    avatar: "", // Add URL here for image: "https://i.pravatar.cc/150?img=3"
  };

  const notificationCount = 3;

  const notifications = [
    { id: 1, message: "New transaction added", time: "2 min ago" },
    { id: 2, message: "Budget limit reached", time: "1 hour ago" },
    { id: 3, message: "Monthly report ready", time: "3 hours ago" },
  ];

  const handleLogout = () => {
    console.log("User logged out");
    // navigate("/login");
  };

  const handleNotificationClick = (notificationId: number) => {
    console.log("Notification clicked:", notificationId);
    // Navigate or mark as read
  };

  const handleMenuItemClick = (path: string) => {
    navigate(path);
  };

  // Get user initials for avatar
  const getUserInitials = () => {
    return user.name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);
  };

  return (
    <Navbar color="white" light className="border-bottom shadow-sm">
      <Container fluid className={`${styles.topbarContainer} d-flex align-items-center justify-content-between`}>
        {/* Hamburger Button - Only visible on mobile */}
        <Button color="light" className="d-lg-none me-2" onClick={toggleSidebar} aria-label="Toggle sidebar">
          <FiMenu size={24} className={styles.hamburgerIcon} />
        </Button>

        {/* Right side content */}
        <div className={styles.rightContent}>
          {/* Notification Dropdown - Uncontrolled (no state needed!) */}
          <UncontrolledDropdown className={styles.dropdownContainer}>
            <DropdownToggle tag="button" className={styles.notificationButton} aria-label="Notifications">
              <BsBell size={20} className={styles.bellIcon} />
              {notificationCount > 0 && <span className={styles.notificationBadge}>{notificationCount}</span>}
            </DropdownToggle>

            <DropdownMenu end className={styles.notificationDropdown}>
              {/* Header */}
              <div className={styles.dropdownHeader}>
                <h6 className={styles.dropdownHeaderTitle}>Notifications</h6>
                <span className={styles.headerBadge}>{notificationCount}</span>
              </div>

              {/* Notification List */}
              <div className={styles.notificationList}>
                {notifications.map((notification) => (
                  <DropdownItem key={notification.id} className={styles.notificationItem} onClick={() => handleNotificationClick(notification.id)}>
                    <div className={styles.notificationMessage}>{notification.message}</div>
                    <div className={styles.notificationTime}>{notification.time}</div>
                  </DropdownItem>
                ))}
              </div>

              {/* View All Button */}
              <DropdownItem className={styles.viewAllButton} onClick={() => handleMenuItemClick("/notifications")}>
                View all notifications
              </DropdownItem>
            </DropdownMenu>
          </UncontrolledDropdown>

          {/* User Menu Dropdown - Uncontrolled */}
          <UncontrolledDropdown className={styles.dropdownContainer}>
            <DropdownToggle tag="button" className={styles.userButton} aria-label="User menu">
              {/* User Avatar */}
              <div className={styles.userAvatar}>{user.avatar ? <img src={user.avatar} alt={user.name} className={styles.userAvatarImg} /> : getUserInitials()}</div>

              {/* User name - hidden on mobile */}
              <span className={`${styles.userName} d-none d-md-inline`}>{user.name}</span>

              {/* Dropdown caret */}
              <IoChevronDown size={16} className={`${styles.userCaret} d-none d-md-inline`} />
            </DropdownToggle>

            <DropdownMenu end className={styles.userDropdown}>
              {/* User Info Header */}
              <div className={styles.userInfo}>
                <div className={styles.userInfoName}>{user.name}</div>
                <div className={styles.userInfoEmail}>{user.email}</div>
              </div>

              <DropdownItem divider />

              {/* Menu Items */}
              <DropdownItem className={styles.dropdownItem} onClick={() => handleMenuItemClick("/profile")}>
                <FiUser size={18} className={styles.dropdownItemIcon} />
                <span>My Profile</span>
              </DropdownItem>

              <DropdownItem className={styles.dropdownItem} onClick={() => handleMenuItemClick("/settings")}>
                <FiSettings size={18} className={styles.dropdownItemIcon} />
                <span>Settings</span>
              </DropdownItem>

              <DropdownItem className={styles.dropdownItem} onClick={() => handleMenuItemClick("/help")}>
                <FiHelpCircle size={18} className={styles.dropdownItemIcon} />
                <span>Help & Support</span>
              </DropdownItem>

              <DropdownItem divider />

              {/* Logout */}
              <DropdownItem className={`${styles.dropdownItem} ${styles.logoutItem}`} onClick={handleLogout}>
                <FiLogOut size={18} className={styles.dropdownItemIcon} />
                <span>Sign Out</span>
              </DropdownItem>
            </DropdownMenu>
          </UncontrolledDropdown>
        </div>
      </Container>
    </Navbar>
  );
}
