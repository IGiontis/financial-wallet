import { NavLink } from "react-router-dom";
import { Nav, NavItem, Button } from "reactstrap";
import { useTranslation } from "react-i18next";
import "./css/Sidebar.css";

import { FiHome, FiCreditCard, FiDollarSign, FiSettings, FiBriefcase, FiChevronsLeft, FiChevronsRight, FiTarget, FiCalendar, FiRepeat, FiPieChart } from "react-icons/fi";

import type { IconType } from "react-icons";

interface SidebarProps {
  isOpen: boolean;
  toggleSidebar: () => void;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
}

interface NavItemProp {
  path: string;
  label: string;
  icon: IconType;
}

export function Sidebar({ isOpen, toggleSidebar, isCollapsed, onToggleCollapse }: SidebarProps) {
  const { t } = useTranslation();

  const navItems: NavItemProp[] = [
    { path: "/", label: t("nav.overview"), icon: FiHome },
    { path: "/transactions", label: t("nav.transactions"), icon: FiCreditCard },
    { path: "/analytics", label: t("nav.analytics"), icon: FiPieChart },
    { path: "/investments", label: t("nav.investments"), icon: FiDollarSign },
    { path: "/goals", label: t("nav.goals"), icon: FiTarget },
    { path: "/bills", label: t("nav.bills"), icon: FiRepeat },
    { path: "/planner", label: t("nav.planner"), icon: FiCalendar },
    { path: "/settings", label: t("nav.settings"), icon: FiSettings },
  ];

  return (
    <>
      <div className={`sidebar-overlay d-lg-none ${isOpen ? "show" : ""}`} onClick={toggleSidebar} />

      <div className={`sidebar ${isOpen ? "open" : ""} ${isCollapsed ? "collapsed" : ""}`}>
        <div className="sidebar-header d-flex align-items-center">
          <div className="d-flex align-items-center gap-2 sidebar-logo">
            <FiBriefcase size={24} className="flex-shrink-0" />
            {!isCollapsed && <h4 className="mb-0 text-nowrap">MyFiWallet</h4>}
          </div>
        </div>

        <Nav vertical className="sidebar-nav">
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <NavItem key={item.path}>
                <NavLink
                  to={item.path}
                  end={item.path === "/"}
                  onClick={toggleSidebar}
                  className={({ isActive }) =>
                    `nav-link text-white d-flex align-items-center rounded
                    ${isCollapsed ? "justify-content-center" : "gap-2"}
                    ${isActive ? "bg-primary" : ""}`
                  }
                  title={isCollapsed ? item.label : undefined}
                >
                  <Icon size={20} className="nav-icon flex-shrink-0" />
                  {!isCollapsed && <span>{item.label}</span>}
                </NavLink>
              </NavItem>
            );
          })}

          <NavItem className="d-none d-lg-block">
            <Button
              color="link"
              className={`nav-link text-white d-flex align-items-center rounded w-100
                ${isCollapsed ? "justify-content-center" : "gap-2"}`}
              onClick={onToggleCollapse}
              title={isCollapsed ? t("nav.expandSidebar") : t("nav.collapseSidebar")}
            >
              {isCollapsed ? (
                <FiChevronsRight size={20} />
              ) : (
                <>
                  <FiChevronsLeft size={20} className="flex-shrink-0" />
                  <span>{t("nav.hideBar")}</span>
                </>
              )}
            </Button>
          </NavItem>
        </Nav>
      </div>
    </>
  );
}
