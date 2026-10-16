import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { Link, NavLink, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { FloatingPortal, autoUpdate, offset, shift, useDismiss, useFloating, useInteractions } from "@floating-ui/react";
import { useBillsNeedingAttention } from "../bills/useBills";
import { useIncomesNeedingAttention } from "../incomes/useIncomes";
import { useProfile } from "./useProfile";
import "./css/navStyles.css";
import "./css/Sidebar.css";

import { FiHome, FiCreditCard, FiDollarSign, FiSettings, FiBriefcase, FiChevronsLeft, FiChevronsRight, FiChevronDown, FiTarget, FiCalendar, FiRepeat, FiPieChart, FiUsers, FiSliders, FiX, FiTrendingUp, FiPlusCircle, FiList, FiBookOpen, FiGrid } from "react-icons/fi";

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
  /** Red for something to pay; amber for something on its way — an income
   *  that is late or waits for an answer. */
  badgeTone?: "danger" | "warning";
  /** What the count means, read out with the link's name. Bills' wording when left out. */
  badgeLabel?: (count: number) => string;
  /** Pages under this one. The item then opens and closes them rather than being a link itself. */
  children?: NavChild[];
}

interface NavChild {
  path: string;
  label: string;
  icon?: IconType;
}

/** Whether a child is the page on screen: its own path exactly, or a page under it. */
const isWithin = (pathname: string, path: string) => pathname === path || pathname.startsWith(`${path}/`);

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
  const badgeLabel = item.badge ? (item.badgeLabel?.(item.badge) ?? t("bills.dueCount", { count: item.badge })) : undefined;

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

/**
 * An item with pages under it — «Συναλλαγές» with «Νέα συναλλαγή» and «Όλες».
 *
 * With room for words it opens in place: the item is a button with a chevron,
 * the pages a short indented list under it. It opens by itself on one of its
 * own pages, so the current one is always in sight, and a tap folds it away.
 *
 * On the collapsed rail there is no room under the icon, so the icon opens the
 * pages beside it instead, in a small panel that closes on a choice, a click
 * elsewhere or Esc.
 */
function SidebarGroupLink({ item, rail, onNavigate }: { item: NavItemProp & { children: NavChild[] }; rail: boolean; onNavigate: () => void }) {
  const { pathname } = useLocation();
  const listId = useId();
  const within = item.children.some((child) => isWithin(pathname, child.path));
  // Untouched, it follows the page; a tap decides for itself from then on.
  const [toggled, setToggled] = useState<boolean | null>(null);
  const expanded = toggled ?? within;
  const [flyout, setFlyout] = useState(false);
  const Icon = item.icon;

  const { refs, floatingStyles, context } = useFloating({
    open: rail && flyout,
    onOpenChange: setFlyout,
    placement: "right-start",
    strategy: "fixed",
    middleware: [offset(14), shift({ padding: 8 })],
    whileElementsMounted: autoUpdate,
  });
  const { getReferenceProps, getFloatingProps } = useInteractions([useDismiss(context)]);

  const leave = () => {
    setFlyout(false);
    onNavigate();
  };

  return (
    // Open, the item and its pages share one panel, so it is plain which
    // pages belong to it and where the next item begins.
    <li className={`nav-item ${!rail && expanded ? "sidebar-group-open" : ""}`}>
      <button
        type="button"
        ref={refs.setReference}
        {...getReferenceProps()}
        className={`nav-link sidebar-link sidebar-parent ${within ? "nav-link-within" : ""}`}
        aria-expanded={rail ? flyout : expanded}
        aria-controls={rail ? undefined : listId}
        onClick={() => (rail ? setFlyout((open) => !open) : setToggled(!expanded))}
      >
        <Icon className="nav-icon" aria-hidden />
        <span className="nav-label">{item.label}</span>
        <FiChevronDown className={`sidebar-chevron ${expanded ? "open" : ""}`} aria-hidden />
      </button>

      {!rail && expanded && (
        <ul id={listId} className="nav flex-column flex-nowrap sidebar-sub">
          {item.children.map((child) => (
            <li key={child.path} className="nav-item">
              <NavLink to={child.path} end onClick={onNavigate} className={({ isActive }) => `nav-link sidebar-link sidebar-sublink ${isActive ? "nav-link-current" : ""}`}>
                {child.icon && <child.icon className="nav-icon sidebar-subicon" aria-hidden />}
                <span className="nav-label">{child.label}</span>
              </NavLink>
            </li>
          ))}
        </ul>
      )}

      {rail && flyout && (
        <FloatingPortal>
          {/* eslint-disable-next-line react-hooks/refs -- `setFloating` is a Floating UI callback ref, not a React ref object. */}
          <div ref={refs.setFloating} style={floatingStyles} {...getFloatingProps()} className="sidebar-flyout">
            <div className="sidebar-flyout-title">{item.label}</div>
            <ul className="nav flex-column flex-nowrap">
              {item.children.map((child) => (
                <li key={child.path} className="nav-item">
                  <NavLink to={child.path} end onClick={leave} className={({ isActive }) => `sidebar-flyout-link ${isActive ? "active" : ""}`}>
                    {child.icon && <child.icon className="sidebar-flyout-icon" aria-hidden />}
                    {child.label}
                  </NavLink>
                </li>
              ))}
            </ul>
          </div>
        </FloatingPortal>
      )}
    </li>
  );
}

export function Sidebar({ isOpen, onClose, isCollapsed, onToggleCollapse, isDesktop }: SidebarProps) {
  const { t } = useTranslation();
  const billsDue = useBillsNeedingAttention();
  const incomesWaiting = useIncomesNeedingAttention();
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
        {
          path: "/transactions",
          label: t("nav.transactions"),
          icon: FiCreditCard,
          // Adding first: it is the thing done most often, and now a page of its own.
          children: [
            { path: "/transactions/new", label: t("nav.newTransaction"), icon: FiPlusCircle },
            { path: "/transactions", label: t("nav.allTransactions"), icon: FiList },
            // To read only: dense, by day, the month as it happened.
            { path: "/transactions/ledger", label: t("nav.ledger"), icon: FiBookOpen },
          ],
        },
        // Money in before money out. Amber rather than red: a late income is
        // something to look into, not a debt.
        {
          path: "/incomes",
          label: t("nav.incomes"),
          icon: FiTrendingUp,
          badge: incomesWaiting,
          badgeTone: "warning",
          badgeLabel: (count) => t("nav.incomesWaiting", { count }),
        },
        { path: "/bills", label: t("nav.bills"), icon: FiRepeat, badge: billsDue },
      ],
    },
    {
      key: "plan",
      label: t("nav.groupPlan"),
      items: [
        { path: "/planner", label: t("nav.planner"), icon: FiCalendar },
        // The month on one screen: what comes in and goes out, day by day.
        { path: "/calendar", label: t("nav.calendar"), icon: FiGrid },
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
          {/* The name is the way home, as on most sites: to the Overview. */}
          <Link to="/" onClick={navigate} className="sidebar-home" aria-label={t("nav.goHome")}>
            <span className="sidebar-logo" aria-hidden>
              <FiBriefcase />
            </span>
            <span className="sidebar-brand">MyFiWallet</span>
          </Link>
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
                    {group.items.map((item) =>
                      item.children ? (
                        <SidebarGroupLink key={item.path} item={{ ...item, children: item.children }} rail={railTips} onNavigate={navigate} />
                      ) : (
                        <SidebarLink key={item.path} item={item} railTips={railTips} onNavigate={navigate} />
                      ),
                    )}
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
