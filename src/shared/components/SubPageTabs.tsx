import { NavLink } from "react-router-dom";
import segmented from "../css/Segmented.module.css";

export interface SubPage {
  to: string;
  label: string;
  /** A count on it — what waits there. Zero draws nothing. */
  badge?: number;
  badgeTone?: "danger" | "warning";
  /** What the count means, read out with the page's name. */
  badgeLabel?: string;
}

/**
 * The pages of a section — «Σύνοψη · Πληρωμές · Όλα» — as tabs at its top.
 *
 * The same pages the sidebar lists under the section, so a phone, whose sidebar
 * is a drawer, can move between them without opening it. Real links to real
 * addresses rather than state: «back» returns to the one before, and each can be
 * kept as a bookmark.
 */
export function SubPageTabs({ pages, label }: { pages: SubPage[]; label: string }) {
  return (
    <nav className={`${segmented.group} ${segmented.even} ${segmented.fit} mb-3`} aria-label={label}>
      {pages.map((page) => (
        <NavLink
          key={page.to}
          to={page.to}
          end
          className={({ isActive }) => `${segmented.item} ${isActive ? segmented.active : ""} d-inline-flex align-items-center justify-content-center gap-1 text-decoration-none`}
          aria-label={page.badge ? `${page.label} — ${page.badgeLabel ?? page.badge}` : undefined}
        >
          {/* The count sits on the word's top-right corner, as a notification does,
              rather than beside it on the line. */}
          {/* The margin keeps the count's room in the row, so it never lands on the next tab. */}
          <span className="position-relative d-inline-block" style={page.badge ? { marginRight: 14 } : undefined}>
            {page.label}
            {!!page.badge && (
              <span
                className={`position-absolute badge rounded-pill ${page.badgeTone === "warning" ? "text-bg-warning" : "text-bg-danger"}`}
                style={{ top: -7, left: "100%", marginLeft: 2, fontSize: 9.5, padding: "2px 5px", lineHeight: 1 }}
                aria-hidden
              >
                {page.badge > 9 ? "9+" : page.badge}
              </span>
            )}
          </span>
        </NavLink>
      ))}
    </nav>
  );
}

export default SubPageTabs;
