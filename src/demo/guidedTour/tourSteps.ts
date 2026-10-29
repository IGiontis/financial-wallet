// ─── The guided tour, step by step ───────────────────────────────────────────
//
// What the demo's «▶ Ξενάγηση» shows, in the order it shows it: a page, one
// thing on it, and two lines about what that thing is for. Plain data, so a
// test can hold every step against the router, the translations and the pages
// without loading the tour's library.
//
// Each target is a `data-tour` mark on a real element of a real page (or the
// shell's own `data-demo` marks). Only the page and the top bar: on a phone
// the sidebar is a drawer, closed, and nothing in it can be pointed at.
//
// The words are `guidedTour.steps.<id>.title` and `.body`, in both languages.

export type TourSide = "top" | "right" | "bottom" | "left";

export interface TourStep {
  /** Its key in `guidedTour.steps`, and its name in the tests. */
  id: string;
  /** The page it is on — a path the router knows. */
  route: string;
  /** What it points at. */
  target: string;
  /**
   * A control to press first, when the target is behind one: the Overview
   * opens on whichever of its tabs was last chosen, and the tour's three steps
   * there are on «Σύνοψη»; the Calendar, Goals and Investments open on the view
   * last chosen (remembered on the device, so a refresh keeps it), and the
   * grid and the cards are in one of two. Pressed only when it is not already
   * the one chosen.
   */
  activate?: string;
  /** Where the popover goes, when there is room; the library picks otherwise. */
  side?: TourSide;
  /** The last step: it asks for an account, with a button of its own. */
  finale?: boolean;
}

const mark = (name: string) => `[data-tour="${name}"]`;

/** The Overview's first tab, «Σύνοψη» — where the money, the payday answer and the tiles are. */
const OVERVIEW_ALL_TAB = `${mark("overview-tabs")} [role="tab"]:first-child`;

/** The Calendar's month grid, rather than its timeline. */
const CALENDAR_MONTH_VIEW = `${mark("calendar-views")} [data-view="month"]`;

/** Goals and Investments as cards, rather than as the list. */
const GOAL_CARDS_VIEW = `${mark("goal-views")} [data-view="cards"]`;

export const TOUR_STEPS: readonly TourStep[] = [
  { id: "money", route: "/", target: mark("overview-money"), activate: OVERVIEW_ALL_TAB, side: "bottom" },
  { id: "payday", route: "/", target: mark("overview-payday"), activate: OVERVIEW_ALL_TAB, side: "top" },
  { id: "tiles", route: "/", target: mark("overview-tiles"), activate: OVERVIEW_ALL_TAB, side: "top" },
  { id: "quick", route: "/", target: mark("quick-expense"), side: "left" },
  { id: "transactions", route: "/transactions", target: mark("transactions-list"), side: "bottom" },
  { id: "ledger", route: "/transactions/ledger", target: mark("ledger-categories"), side: "top" },
  { id: "analytics", route: "/analytics", target: mark("analytics-kpis"), side: "bottom" },
  { id: "incomes", route: "/incomes/record", target: mark("income-line"), side: "bottom" },
  { id: "bills", route: "/bills/pay", target: mark("bills-outstanding"), side: "top" },
  { id: "calendar", route: "/calendar", target: mark("calendar-grid"), activate: CALENDAR_MONTH_VIEW, side: "top" },
  { id: "planner", route: "/planner", target: mark("planner-glance"), side: "bottom" },
  { id: "goals", route: "/goals", target: mark("goal-card"), activate: GOAL_CARDS_VIEW, side: "bottom" },
  { id: "accounts", route: "/accounts", target: mark("accounts-finding"), side: "bottom" },
  { id: "investments", route: "/investments", target: mark("goal-card"), activate: GOAL_CARDS_VIEW, side: "bottom" },
  { id: "debts", route: "/debts", target: mark("debts-people"), side: "top" },
  { id: "finish", route: "/", target: '[data-demo="account-actions"]', side: "bottom", finale: true },
];
