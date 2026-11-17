/**
 * The three ways «Πάγια» lists its bills (owner, 2026-11-17 — seven became three):
 *
 *   list   «Λίστα»     a card per bill with its dates, with the density switch (`BillStrip`);
 *   month  «Ο μήνας»   this month's bills on a line, against the pay day (`BillMonthTimeline`);
 *   year   «Η χρονιά»  the twelve months ahead, and what each bill costs a year.
 *
 * «Χρονολόγιο» (the calendar's tree) was dropped: a remembered choice of it opens the list.
 */
export type BillView = "list" | "month" | "year";

export const BILL_VIEWS: readonly BillView[] = ["list", "month", "year"];

/** A view remembered on the device (`bills-view-2`) as one of the three; anything else («timeline» included) → the list. */
export function billViewFrom(stored: unknown): BillView {
  return (BILL_VIEWS as readonly unknown[]).includes(stored) ? (stored as BillView) : "list";
}

/**
 * A choice kept under the old key (`bills-view`, seven views, up to
 * 2026-11-17), as the view that took it in: «Κάρτες», «Λίστα», «Κουτάκια» →
 * the list; the old «Ο μήνας» (`timeline`) → «Ο μήνας»; the tree
 * («Χρονολόγιο», dropped) → the list; «Μήνες» and «Ο χρόνος» → «Η χρονιά». A
 * new key, because `timeline` meant this month's line there.
 */
export function billViewFromOld(stored: unknown): BillView {
  switch (stored) {
    case "timeline":
      return "month";
    case "months":
    case "cost":
      return "year";
    default:
      return "list";
  }
}
