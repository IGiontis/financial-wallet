import { NavLink } from "react-router-dom";
import { Nav, NavItem, Button } from "reactstrap";
import { useTranslation } from "react-i18next";
import { useBillsNeedingAttention } from "../bills/useBills";
import "./css/Sidebar.css";

import { FiHome, FiCreditCard, FiDollarSign, FiSettings, FiBriefcase, FiChevronsLeft, FiChevronsRight, FiTarget, FiCalendar, FiRepeat, FiPieChart, FiUsers, FiSliders } from "react-icons/fi";

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
  /** Shown as a red count on the item. Zero draws nothing. */
  badge?: number;
}

export function Sidebar({ isOpen, toggleSidebar, isCollapsed, onToggleCollapse }: SidebarProps) {
  const { t } = useTranslation();
  const billsDue = useBillsNeedingAttention();

  // Grouped by the question each screen answers, rather than by the order they
  // happened to be built in. Ten equal entries in a column make the reader scan
  // the whole list every time; four short groups let them jump to the part of
  // their money they came for.
  const navGroups: { key: string; label: string; items: NavItemProp[] }[] = [
    {
      key: "standing",
      label: t("nav.groupStanding"),
      items: [
        { path: "/", label: t("nav.overview"), icon: FiHome },
        { path: "/analytics", label: t("nav.analytics"), icon: FiPieChart },
      ],
    },
    {
      key: "daily",
      label: t("nav.groupDaily"),
      items: [
        { path: "/transactions", label: t("nav.transactions"), icon: FiCreditCard },
        { path: "/bills", label: t("nav.bills"), icon: FiRepeat, badge: billsDue },
      ],
    },
    {
      key: "plan",
      label: t("nav.groupPlan"),
      items: [
        { path: "/planner", label: t("nav.planner"), icon: FiCalendar },
        { path: "/allocation", label: t("nav.allocation"), icon: FiSliders },
        { path: "/goals", label: t("nav.goals"), icon: FiTarget },
      ],
    },
    {
      key: "holdings",
      label: t("nav.groupHoldings"),
      items: [
        { path: "/investments", label: t("nav.investments"), icon: FiDollarSign },
        { path: "/debts", label: t("nav.debts"), icon: FiUsers },
      ],
    },
  ];

  // Settings is not one of the four: it is where you go to change the app, not
  // to look at your money. It sits on its own at the foot, always in the same
  // place.
  const settingsItem: NavItemProp = { path: "/settings", label: t("nav.settings"), icon: FiSettings };

  const renderItem = (item: NavItemProp) => {
    const Icon = item.icon;
    // Read out as part of the link's name rather than left as a bare number,
    // which a screen reader would announce as "Bills, 2".
    const badgeLabel = item.badge ? t("bills.dueCount", { count: item.badge }) : undefined;

    return (
      <NavItem key={item.path}>
        <NavLink
          to={item.path}
          end={item.path === "/"}
          onClick={toggleSidebar}
          className={({ isActive }) =>
            // Not `bg-primary`. A solid blue block for the current page is the
            // loudest thing on the rail, and the rail is the one part of the app
            // nobody is looking at — they are looking at what it opened.
            `nav-link d-flex align-items-center rounded
            ${isCollapsed ? "justify-content-center" : "gap-2"}
            ${isActive ? "nav-link-current" : ""}`
          }
          title={isCollapsed ? [item.label, badgeLabel].filter(Boolean).join(" — ") : undefined}
          aria-label={badgeLabel ? `${item.label} — ${badgeLabel}` : undefined}
        >
          <Icon size={20} className="nav-icon flex-shrink-0" />
          {!isCollapsed && <span>{item.label}</span>}
          {/* Capped so a long-neglected list cannot widen the rail. */}
          {!!item.badge && (
            <span className="nav-badge" aria-hidden>
              {item.badge > 9 ? "9+" : item.badge}
            </span>
          )}
        </NavLink>
      </NavItem>
    );
  };

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
          {navGroups.map((group) => (
            <div key={group.key} className="sidebar-group">
              {/* A heading while there is room for one; a rule when the rail is
                  collapsed to icons and a word would not fit. */}
              {isCollapsed ? <div className="sidebar-group-rule" aria-hidden /> : <div className="sidebar-group-label">{group.label}</div>}
              {group.items.map(renderItem)}
            </div>
          ))}
        </Nav>

        <Nav vertical className="sidebar-foot">
          {renderItem(settingsItem)}

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
