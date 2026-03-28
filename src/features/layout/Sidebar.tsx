import { NavLink } from "react-router-dom";
import { Nav, NavItem } from "reactstrap";
import "./css/Sidebar.css"

/**
 * Sidebar Navigation Component
 *
 * 2025/2026 Best Practice Pattern:
 * - Uses CSS for responsive behavior instead of JavaScript
 * - Transform controlled by CSS classes
 * - Bootstrap utility classes for conditional visibility
 */

interface SidebarProps {
  isOpen: boolean;
  toggleSidebar: () => void;
}

export function Sidebar({ isOpen, toggleSidebar }: SidebarProps) {
  const navItems = [
    { path: "/", label: "Overview", icon: "📊" },
    { path: "/transactions", label: "Transactions", icon: "💳" },
    { path: "/budgets", label: "Budgets", icon: "💰" },
    { path: "/settings", label: "Settings", icon: "⚙️" },
  ];

  return (
    <>
      {/* Overlay for mobile - only visible when sidebar is open on mobile */}
      {/* d-lg-none = display none on large screens and up (Bootstrap class) */}
      <div className={`sidebar-overlay d-lg-none ${isOpen ? "show" : ""}`} onClick={toggleSidebar} />

      {/* Sidebar - CSS handles responsive positioning */}
      <div className={`sidebar ${isOpen ? "open" : ""}`}>
        {/* Logo */}
        <div className="sidebar-header">
          <h4 className="mb-0">💼 FinWallet</h4>
        </div>

        {/* Navigation */}
        <Nav vertical className="sidebar-nav">
          {navItems.map((item) => (
            <NavItem key={item.path}>
              <NavLink
                to={item.path}
                end={item.path === "/"}
                onClick={toggleSidebar} // Close on mobile when clicking
                className={({ isActive }) => `nav-link text-white d-flex align-items-center gap-2 rounded ${isActive ? "bg-primary" : ""}`}
              >
                <span className="nav-icon">{item.icon}</span>
                <span>{item.label}</span>
              </NavLink>
            </NavItem>
          ))}
        </Nav>
      </div>
    </>
  );
}
