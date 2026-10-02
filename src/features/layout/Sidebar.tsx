import { useEffect, useRef, useState, type ReactNode } from "react";
import { NavLink } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { FloatingPortal, autoUpdate, offset, shift, useFloating } from "@floating-ui/react";
import { useBillsNeedingAttention } from "../bills/useBills";
import { useProfile } from "./useProfile";
import "./css/navStyles.css";
import "./css/Sidebar.css";

import { FiHome, FiCreditCard, FiDollarSign, FiSettings, FiBriefcase, FiChevronsLeft, FiChevronsRight, FiTarget, FiCalendar, FiRepeat, FiPieChart, FiUsers, FiSliders, FiX } from "react-icons/fi";

import type { IconType } from "react-icons";

interface SidebarProps {
  /** The drawer, on a phone. Never true on a wide screen, where the bar is always there. */
  isOpen: boolean;
  /** `returnFocus` when the drawer was dismissed rather than left through a link. */
  onClose: (returnFocus: boolean) => void;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
  /** Wide enough for the fixed bar (Bootstrap's `lg`); below it the bar is a drawer. */
  isDesktop: boolean;
}

interface NavItemProp {
  path: string;
  label: string;
  icon: IconType;
  /** Shown as a count on the item. Zero draws nothing. */
  badge?: number;
  /** Red for something to pay; amber for something on its way — the future
   *  «Έσοδα» link's expected income is what this is kept for. */
  badgeTone?: "danger" | "warning";
}

/**
 * The tooltip a collapsed rail shows beside an icon.
 *
 * Ours rather than the browser's `title`: that one waits a second or so, cannot
 * say "2 bills need paying" on a second line, and does not appear for the
 * keyboard at all. Pointing at the icon or tabbing to it opens it; leaving,
 * clicking or Esc closes it.
 */
function useRailTip(enabled: boolean) {
  const [open, setOpen] = useState(false);
  // The trigger element, by callback ref into state — what Floating UI anchors to.
  const [reference, setReference] = useState<HTMLElement | null>(null);
  // Set by a press, so the focus that a click brings with it is not mistaken
  // for the keyboard arriving.
  const pressed = useRef(false);
  const close = () => setOpen(false);

  const handlers = {
    onMouseEnter: () => setOpen(true),
    onMouseLeave: close,
    onPointerDown: () => {
      pressed.current = true;
    },
    // The keyboard only: a click also focuses, and should go where it points
    // rather than leave a label hanging beside it.
    onFocus: () => {
      if (!pressed.current) setOpen(true);
    },
    onBlur: () => {
      pressed.current = false;
      close();
    },
  };

  return { open: enabled && open, close, reference, setReference, handlers };
}

/** Rendered on the body: the rail's list scrolls, and would clip anything that pokes out of it. */
function RailTip({ reference, open, onDismiss, label, detail }: { reference: HTMLElement | null; open: boolean; onDismiss: () => void; label: string; detail?: string }) {
  const { refs: anchor, floatingStyles } = useFloating({
    open,
    elements: { reference },
    placement: "right",
    strategy: "fixed",
    middleware: [offset(14), shift({ padding: 8 })],
    whileElementsMounted: autoUpdate,
  });

  // Esc closes it wherever the focus is — hover content has to be dismissible
  // without moving the pointer away.
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onDismiss();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, onDismiss]);

  if (!open) return null;
  return (
    <FloatingPortal>
      {/* Hidden from screen readers: the link already carries this text as its
          name, and reading it twice is noise. */}
      {/* eslint-disable-next-line react-hooks/refs -- `setFloating` is a Floating UI
          callback ref, not a React ref object; nothing reads `.current` here. */}
      <div ref={anchor.setFloating} style={floatingStyles} className="sidebar-tip" aria-hidden>
        {label}
        {detail && <small>{detail}</small>}
      </div>
    </FloatingPortal>
  );
}

function SidebarLink({ item, railTips, onNavigate, children }: { item: NavItemProp; railTips: boolean; onNavigate: () => void; children?: ReactNode }) {
  const { t } = useTranslation();
  // Taken apart rather than kept as `tip.*`: the compiler lint sees an object
  // that holds a callback ref as a ref, and every read of it as a read in render.
  const { open: tipOpen, close: closeTip, reference, setReference, handlers } = useRailTip(railTips);
  const Icon = item.icon;
  // Read out as part of the link's name rather than left as a bare number,
  // which a screen reader would announce as "Bills, 2".
  const badgeLabel = item.badge ? t("bills.dueCount", { count: item.badge }) : undefined;

  return (
    <li className="nav-item">
      <NavLink
        to={item.path}
        end={item.path === "/"}
        ref={setReference}
        {...handlers}
        onClick={() => {
          closeTip();
          onNavigate();
        }}
        // `aria-current="page"` comes from NavLink itself; the class is only for
        // the look, which each menu style draws its own way.
        className={({ isActive }) => `nav-link sidebar-link ${isActive ? "nav-link-current" : ""}`}
        aria-label={badgeLabel ? `${item.label} — ${badgeLabel}` : undefined}
      >
        {children}
        <Icon className="nav-icon" aria-hidden />
        {/* Always in the document, only hidden by the collapsed rail's CSS —
            so a collapsed rail is still a list of named links. */}
        <span className="nav-label">{item.label}</span>
        {/* Capped so a long-neglected list cannot widen the rail. */}
        {!!item.badge && (
          <span className={`nav-badge ${item.badgeTone === "warning" ? "nav-badge-warning" : ""}`} aria-hidden>
            {item.badge > 9 ? "9+" : item.badge}
          </span>
        )}
      </NavLink>
      <RailTip reference={reference} open={tipOpen} onDismiss={closeTip} label={item.label} detail={badgeLabel} />
    </li>
  );
}

export function Sidebar({ isOpen, onClose, isCollapsed, onToggleCollapse, isDesktop }: SidebarProps) {
  const { t } = useTranslation();
  const billsDue = useBillsNeedingAttention();
  const profile = useProfile();
  const closeRef = useRef<HTMLButtonElement>(null);
  const navRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const [hasMore, setHasMore] = useState(false);

  // Labels beside the icons only on the collapsed rail of a wide screen. The
  // drawer is never collapsed — a phone always gets the words.
  const railTips = isDesktop && isCollapsed;
  // The collapse button is an icon on its own in every state, so it always has one.
  const { open: collapseTipOpen, close: closeCollapseTip, reference: collapseButton, setReference: setCollapseButton, handlers: collapseTipHandlers } = useRailTip(isDesktop);
  const collapseLabel = isCollapsed ? t("nav.expandSidebar") : t("nav.collapseSidebar");

  // Into the drawer as it opens, so the keyboard and a screen reader start
  // where the eye does instead of behind the backdrop.
  useEffect(() => {
    if (isOpen) closeRef.current?.focus();
  }, [isOpen]);

  // The fade at the foot of the list says "there is more below" — and only
  // while there is. Observed rather than computed once: the list changes height
  // when the rail collapses, and the window when a phone turns.
  useEffect(() => {
    const nav = navRef.current;
    if (!nav || typeof ResizeObserver === "undefined") return;
    const check = () => setHasMore(nav.scrollTop + nav.clientHeight < nav.scrollHeight - 1);
    const observer = new ResizeObserver(check);
    observer.observe(nav);
    if (listRef.current) observer.observe(listRef.current);
    nav.addEventListener("scroll", check, { passive: true });
    return () => {
      observer.disconnect();
      nav.removeEventListener("scroll", check);
    };
  }, []);

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
        // «Έσοδα» goes here, between Transactions and Bills, once its page
        // exists — e.g. { path: "/incomes", label: t("nav.incomes"), icon:
        // FiTrendingUp, badge: incomesExpected, badgeTone: "warning" }. The
        // amber badge is already styled in all three menu styles.
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
        { path: "/accounts", label: t("nav.accounts"), icon: FiBriefcase },
        { path: "/investments", label: t("nav.investments"), icon: FiDollarSign },
        { path: "/debts", label: t("nav.debts"), icon: FiUsers },
      ],
    },
  ];

  // Settings is not one of the four: it is where you go to change the app, not
  // to look at your money. It sits on its own at the foot, always in the same
  // place.
  const settingsItem: NavItemProp = { path: "/settings", label: t("nav.settings"), icon: FiSettings };

  const navigate = () => onClose(false);
  const avatar = (
    <span className="sidebar-avatar" aria-hidden>
      {profile.initials}
    </span>
  );
  // Before the user document arrives the name would flash from the email's to
  // the real one; the email is known from the start.
  const who = (
    <span className="sidebar-who">
      {profile.loaded && profile.displayName && <span className="sidebar-who-name">{profile.displayName}</span>}
      <span className="sidebar-who-email">{profile.email}</span>
    </span>
  );

  return (
    <>
      <div className={`sidebar-overlay d-lg-none ${isOpen ? "show" : ""}`} onClick={() => onClose(true)} aria-hidden />

      <nav id="app-sidebar" aria-label={t("nav.mainNavigation")} className={`sidebar ${isOpen ? "open" : ""} ${isCollapsed ? "collapsed" : ""} ${hasMore ? "has-more" : ""}`}>
        {/* Everything each style might show up here is in the document, and the
            style decides what is drawn: the logo and name, or (Β, on a phone)
            who is signed in; the ✕ only where the bar is a drawer. */}
        <div className="sidebar-header">
          <span className="sidebar-logo" aria-hidden>
            <FiBriefcase />
          </span>
          <span className="sidebar-brand">MyFiWallet</span>
          <div className="sidebar-profile">
            {avatar}
            {who}
          </div>
          <button ref={closeRef} type="button" className="sidebar-close d-lg-none" onClick={() => onClose(true)} aria-label={t("nav.closeMenu")}>
            <FiX aria-hidden />
          </button>
        </div>

        <div className="sidebar-body">
          <div ref={navRef} className="sidebar-nav">
            <div ref={listRef}>
              {navGroups.map((group) => (
                <div key={group.key} className="sidebar-group">
                  {/* A heading while there is room for one; the collapsed rail
                      draws it as a rule. Still the list's name either way. */}
                  <div className="sidebar-group-label" id={`nav-group-${group.key}`}>
                    {group.label}
                  </div>
                  <ul className="nav flex-column flex-nowrap" aria-labelledby={`nav-group-${group.key}`}>
                    {group.items.map((item) => (
                      <SidebarLink key={item.path} item={item} railTips={railTips} onNavigate={navigate} />
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="sidebar-foot">
          <ul className="nav flex-column flex-nowrap">
            {/* Γ turns this link into a card with who is signed in, the gear on
                its end; the others show it as the plain row it always was. */}
            <SidebarLink item={settingsItem} railTips={railTips} onNavigate={navigate}>
              {avatar}
              {who}
            </SidebarLink>
          </ul>

          <button
            type="button"
            ref={setCollapseButton}
            {...collapseTipHandlers}
            onClick={() => {
              closeCollapseTip();
              onToggleCollapse();
            }}
            className="sidebar-collapse d-none d-lg-flex"
            aria-label={collapseLabel}
          >
            {isCollapsed ? <FiChevronsRight aria-hidden /> : <FiChevronsLeft aria-hidden />}
          </button>
          <RailTip reference={collapseButton} open={collapseTipOpen} onDismiss={closeCollapseTip} label={collapseLabel} />
        </div>
      </nav>
    </>
  );
}
