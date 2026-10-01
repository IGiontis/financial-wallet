import type { IconType } from "react-icons";
import { FiCalendar, FiCreditCard, FiHome, FiList, FiPieChart, FiRepeat, FiSettings, FiSliders, FiTarget, FiTrendingUp, FiUsers } from "react-icons/fi";

// Every place the app can take you, in one list.
//
// The sidebar on a wide screen and the menu sheet on a phone both draw from
// this, and the bottom bar picks its three pages out of it — so a page added
// here turns up everywhere at once, and one left out is missing everywhere,
// which is the kind of mistake somebody notices.

/** A count some destinations carry. Each one says what it counts in its own words. */
export type NavBadgeKey = "bills";

export type NavBadges = Partial<Record<NavBadgeKey, number>>;

/** What a badge reads as, so a screen reader hears "Bills, 2 bills need paying" rather than "Bills 2". */
export const BADGE_LABEL: Record<NavBadgeKey, string> = {
  bills: "bills.dueCount",
};

export interface NavDestination {
  path: string;
  labelKey: string;
  icon: IconType;
  badge?: NavBadgeKey;
}

export interface NavGroup {
  key: string;
  labelKey: string;
  items: NavDestination[];
}

export const OVERVIEW: NavDestination = { path: "/", labelKey: "nav.overview", icon: FiHome };
export const ANALYTICS: NavDestination = { path: "/analytics", labelKey: "nav.analytics", icon: FiPieChart };
export const TRANSACTIONS: NavDestination = { path: "/transactions", labelKey: "nav.transactions", icon: FiList };
export const BILLS: NavDestination = { path: "/bills", labelKey: "nav.bills", icon: FiRepeat, badge: "bills" };
export const PLANNER: NavDestination = { path: "/planner", labelKey: "nav.planner", icon: FiCalendar };
export const ALLOCATION: NavDestination = { path: "/allocation", labelKey: "nav.allocation", icon: FiSliders };
export const GOALS: NavDestination = { path: "/goals", labelKey: "nav.goals", icon: FiTarget };
export const ACCOUNTS: NavDestination = { path: "/accounts", labelKey: "nav.accounts", icon: FiCreditCard };
export const INVESTMENTS: NavDestination = { path: "/investments", labelKey: "nav.investments", icon: FiTrendingUp };
export const DEBTS: NavDestination = { path: "/debts", labelKey: "nav.debts", icon: FiUsers };

// Grouped by the question each screen answers rather than by the order they
// were built in: four short groups let the reader go straight to the part of
// their money they came for, where eleven equal rows made them scan them all.
export const NAV_GROUPS: NavGroup[] = [
  { key: "standing", labelKey: "nav.groupStanding", items: [OVERVIEW, ANALYTICS] },
  {
    key: "activity",
    labelKey: "nav.groupActivity",
    items: [
      TRANSACTIONS,
      BILLS,
      // The Income page belongs here, after Bills: money in beside money out.
      // It is not listed until the page exists — a link to nothing is worse
      // than a missing one. When it lands it is one line:
      //   { path: "/income", labelKey: "nav.income", icon: FiArrowDownCircle, badge: "income" }
      // plus "income" in NavBadgeKey/BADGE_LABEL for the late-income count
      // (amber, not red: nothing is owed, something just has not arrived).
    ],
  },
  { key: "plan", labelKey: "nav.groupPlan", items: [PLANNER, ALLOCATION, GOALS] },
  { key: "holdings", labelKey: "nav.groupHoldings", items: [ACCOUNTS, INVESTMENTS, DEBTS] },
];

/**
 * Settings is not one of the groups: it changes the app rather than showing the
 * money. It sits with the profile, the theme and the language instead.
 */
export const SETTINGS: NavDestination = { path: "/settings", labelKey: "nav.settings", icon: FiSettings };

/** The phone bar's pages, either side of the «+»: the three opened most. */
export const BAR_BEFORE_ADD: NavDestination[] = [OVERVIEW, TRANSACTIONS];
export const BAR_AFTER_ADD: NavDestination[] = [BILLS];

export const ALL_DESTINATIONS: NavDestination[] = [...NAV_GROUPS.flatMap((group) => group.items), SETTINGS];

/** Whether `path` is the page at `pathname` — the overview only on "/", the rest on their own subtree too. */
export function isCurrentPath(pathname: string, path: string): boolean {
  if (path === "/") return pathname === "/";
  return pathname === path || pathname.startsWith(`${path}/`);
}

/** "9+" past nine, so a long-neglected list cannot widen the row it sits in. */
export const badgeText = (count: number) => (count > 9 ? "9+" : String(count));
