import { useState, useEffect, useRef } from "react";
import { Navbar, Container, Button } from "reactstrap";
import { useNavigate } from "react-router-dom";
import styles from "./css/Topbar.module.css";

// Import elegant icons from React Icons
import {
  BsBell, // Bell for notifications
} from "react-icons/bs"; // Bootstrap Icons

import {
  FiUser, // User outline
  FiSettings, // Settings
  FiHelpCircle, // Help
  FiLogOut, // Logout
  FiMenu, // Hamburger menu
} from "react-icons/fi"; // Feather Icons (very elegant!)

import {
  IoChevronDown, // Dropdown arrow
} from "react-icons/io5"; // Ionicons

/**
 * Topbar Component
 *
 * 2025/2026 Pattern - Custom Dropdown Implementation
 * - Professional React Icons instead of emojis
 * - CSS Modules for scoped styling
 * - Click outside to close
 * - Proper positioning without overflow
 */

interface TopbarProps {
  toggleSidebar: () => void;
}

export function Topbar({ toggleSidebar }: TopbarProps) {
  const navigate = useNavigate();

  // Dropdown states
  const [isNotificationOpen, setIsNotificationOpen] = useState(false);
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);

  // Refs for click outside detection
  const notificationRef = useRef<HTMLDivElement>(null);
  const userMenuRef = useRef<HTMLDivElement>(null);

  // Mock user data
  const user = {
    name: "John Doe",
    email: "[email protected]",
    avatar: "", // Add URL here for image: "https://i.pravatar.cc/150?img=3"
  };

  const [notificationCount] = useState(3);

  const notifications = [
    { id: 1, message: "New transaction added", time: "2 min ago" },
    { id: 2, message: "Budget limit reached", time: "1 hour ago" },
    { id: 3, message: "Monthly report ready", time: "3 hours ago" },
  ];

  // Close dropdowns when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      // Check notification dropdown
      if (notificationRef.current && !notificationRef.current.contains(event.target as Node)) {
        setIsNotificationOpen(false);
      }
      // Check user menu dropdown
      if (userMenuRef.current && !userMenuRef.current.contains(event.target as Node)) {
        setIsUserMenuOpen(false);
      }
    };

    // Add event listener when any dropdown is open
    if (isNotificationOpen || isUserMenuOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }

    // Cleanup
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isNotificationOpen, isUserMenuOpen]);

  // Close dropdowns on Escape key
  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsNotificationOpen(false);
        setIsUserMenuOpen(false);
      }
    };

    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, []);

  const handleLogout = () => {
    setIsUserMenuOpen(false);
    console.log("User logged out");
    // navigate("/login");
  };

  const handleNotificationClick = (notificationId: number) => {
    console.log("Notification clicked:", notificationId);
    setIsNotificationOpen(false);
    // Navigate or mark as read
  };

  const handleMenuItemClick = (path: string) => {
    setIsUserMenuOpen(false);
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
          {/* Notification Dropdown */}
          <div className={styles.dropdownContainer} ref={notificationRef}>
            <button className={styles.notificationButton} onClick={() => setIsNotificationOpen(!isNotificationOpen)} aria-label="Notifications" aria-expanded={isNotificationOpen}>
              <BsBell size={20} className={styles.bellIcon} />
              {notificationCount > 0 && <span className={styles.notificationBadge}>{notificationCount}</span>}
            </button>

            {/* Notification Dropdown Menu */}
            <div className={`${styles.dropdownMenu} ${styles.notificationDropdown} ${isNotificationOpen ? styles.open : ""}`}>
              {/* Header */}
              <div className={styles.dropdownHeader}>
                <h6 className={styles.dropdownHeaderTitle}>Notifications</h6>
                <span className={styles.headerBadge}>{notificationCount}</span>
              </div>

              {/* Notification List */}
              <div className={styles.notificationList}>
                {notifications.map((notification) => (
                  <div key={notification.id} className={styles.notificationItem} onClick={() => handleNotificationClick(notification.id)}>
                    <div className={styles.notificationMessage}>{notification.message}</div>
                    <div className={styles.notificationTime}>{notification.time}</div>
                  </div>
                ))}
              </div>

              {/* View All Button */}
              <div className={styles.viewAllButton} onClick={() => handleMenuItemClick("/notifications")}>
                View all notifications
              </div>
            </div>
          </div>

          {/* User Menu Dropdown */}
          <div className={styles.dropdownContainer} ref={userMenuRef}>
            <button className={styles.userButton} onClick={() => setIsUserMenuOpen(!isUserMenuOpen)} aria-label="User menu" aria-expanded={isUserMenuOpen}>
              {/* User Avatar */}
              <div className={styles.userAvatar}>{user.avatar ? <img src={user.avatar} alt={user.name} className={styles.userAvatarImg} /> : getUserInitials()}</div>

              {/* User name - hidden on mobile */}
              <span className={`${styles.userName} d-none d-md-inline`}>{user.name}</span>

              {/* Dropdown caret */}
              <IoChevronDown size={16} className={`${styles.userCaret} d-none d-md-inline`} />
            </button>

            {/* User Dropdown Menu */}
            <div className={`${styles.dropdownMenu} ${styles.userDropdown} ${isUserMenuOpen ? styles.open : ""}`}>
              {/* User Info Header */}
              <div className={styles.userInfo}>
                <div className={styles.userInfoName}>{user.name}</div>
                <div className={styles.userInfoEmail}>{user.email}</div>
              </div>

              {/* Menu Items */}
              <div className={styles.dropdownItem} onClick={() => handleMenuItemClick("/profile")}>
                <FiUser size={18} className={styles.dropdownItemIcon} />
                <span>My Profile</span>
              </div>

              <div className={styles.dropdownItem} onClick={() => handleMenuItemClick("/settings")}>
                <FiSettings size={18} className={styles.dropdownItemIcon} />
                <span>Settings</span>
              </div>

              <div className={styles.dropdownItem} onClick={() => handleMenuItemClick("/help")}>
                <FiHelpCircle size={18} className={styles.dropdownItemIcon} />
                <span>Help & Support</span>
              </div>

              {/* Logout */}
              <div className={`${styles.dropdownItem} ${styles.logoutItem}`} onClick={handleLogout}>
                <FiLogOut size={18} className={styles.dropdownItemIcon} />
                <span>Sign Out</span>
              </div>
            </div>
          </div>
        </div>
      </Container>
    </Navbar>
  );
}
