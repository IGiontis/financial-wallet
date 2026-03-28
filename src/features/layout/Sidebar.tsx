import { NavLink } from "react-router-dom";
import { Nav, NavItem } from "reactstrap";
import "./css/Sidebar.css";

// Import elegant icons from React Icons
import {
  FiHome, // Overview/Home
  FiCreditCard, // Transactions
  FiDollarSign, // Budgets
  FiSettings, // Settings
  FiBriefcase, // Logo/Briefcase
} from "react-icons/fi"; // Feather Icons

import type { IconType } from "react-icons";

/**
 * Sidebar Navigation Component
 *
 * 2025/2026 Best Practice Pattern:
 * - Professional React Icons instead of emojis
 * - Uses CSS for responsive behavior instead of JavaScript
 * - Transform controlled by CSS classes
 * - Bootstrap utility classes for conditional visibility
 * - Type-safe icon components
 */

interface SidebarProps {
  isOpen: boolean;
  toggleSidebar: () => void;
}

interface NavItemProp {
  path: string;
  label: string;
  icon: IconType; // Type-safe icon component
}

export function Sidebar({ isOpen, toggleSidebar }: SidebarProps) {
  const navItems: NavItemProp[] = [
    { path: "/", label: "Overview", icon: FiHome },
    { path: "/transactions", label: "Transactions", icon: FiCreditCard },
    { path: "/budgets", label: "Budgets", icon: FiDollarSign },
    { path: "/settings", label: "Settings", icon: FiSettings },
  ];

  return (
    <>
      {/* Overlay for mobile - only visible when sidebar is open on mobile */}
      {/* d-lg-none = display none on large screens and up (Bootstrap class) */}
      <div className={`sidebar-overlay d-lg-none ${isOpen ? "show" : ""}`} onClick={toggleSidebar} />

      {/* Sidebar - CSS handles responsive positioning */}
      <div className={`sidebar ${isOpen ? "open" : ""}`}>
        {/* Logo */}
        <div className="sidebar-header d-flex align-items-center">
          <FiBriefcase size={24} className="me-2" />
          <h4 className="mb-0">FinWallet</h4>
        </div>

        {/* Navigation */}
        <Nav vertical className="sidebar-nav">
          {navItems.map((item) => {
            const Icon = item.icon; // Extract icon component
            return (
              <NavItem key={item.path}>
                <NavLink
                  to={item.path}
                  end={item.path === "/"}
                  onClick={toggleSidebar} // Close on mobile when clicking
                  className={({ isActive }) => `nav-link text-white d-flex align-items-center gap-2 rounded ${isActive ? "bg-primary" : ""}`}
                >
                  <Icon size={20} className="nav-icon" />
                  <span>{item.label}</span>
                </NavLink>
              </NavItem>
            );
          })}
        </Nav>
      </div>
    </>
  );
}
