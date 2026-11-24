import { useLayoutEffect, useRef, type KeyboardEvent } from "react";
import { NavLink, useLocation } from "react-router-dom";
import styles from "../css/PageTabs.module.css";
import { pageTabIds } from "../utils/pageTabIds";
import { useInPageBand } from "../hooks/useInPageBand";

/** A tab that shows a panel on this page (`?tab=`). */
export interface PageTab<T extends string> {
  id: T;
  label: string;
}

/** A tab that is a child route of the section — «Σύνοψη · Πληρωμές · Όλα». */
export interface PageTabLink {
  to: string;
  label: string;
  /** A count on it — what waits there. Zero draws nothing. */
  badge?: number;
  badgeTone?: "danger" | "warning";
  /** What the count means, read out with the tab's name. */
  badgeLabel?: string;
}

interface Common {
  /** What the strip is, read out — usually the page's title. */
  label: string;
  /** Where the demo's guided tour points (`data-tour`). */
  "data-tour"?: string;
}

/** State tabs: one page, one panel per tab. */
interface StateTabs<T extends string> extends Common {
  /** Prefix of the tab and panel ids (`pageTabIds(base, id)`). */
  base: string;
  tabs: readonly PageTab<T>[];
  value: T;
  onChange: (tab: T) => void;
  links?: never;
}

/** Link tabs: each its own address, a child route of the section. */
interface LinkTabs extends Common {
  links: readonly PageTabLink[];
  base?: never;
  tabs?: never;
  value?: never;
  onChange?: never;
}

/**
 * The page's tabs — the ONE tab look on every page: inside the header's band
 * (where a page's tabs belong) they ARE the band's base, an underline row on
 * its bottom edge with the chosen one in the brand, bold, over a 2px brand
 * line; anywhere else they keep the boxes they always were. One row either
 * way, scrolling sideways when tight, never wrapping (`PageTabs.module.css`).
 *
 * Two kinds, same look and markup:
 * - **State tabs** (`tabs`, `value`, `onChange`, `base`): a real tablist. The
 *   arrow keys, Home and End move between them and choose as they go; only the
 *   chosen one is in the Tab order. The panel finds its ids with `pageTabIds`.
 *   The page keeps the open tab in the address (`?tab=`, `usePageTab`).
 * - **Link tabs** (`links`): the pages of a section, the same the sidebar lists
 *   under it, so a phone can move between them without opening the drawer. Real
 *   links: «back» returns to the one before, each can be kept as a bookmark. An
 *   optional count sits on a tab's top-right corner.
 */
export function PageTabs<T extends string>(props: StateTabs<T> | LinkTabs) {
  const strip = useRef<HTMLElement | null>(null);
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);
  const { pathname } = useLocation();
  const chosen = props.links ? pathname : props.value;
  const keepStrip = (node: HTMLElement | null) => {
    strip.current = node;
  };
  // In the page header's band the strip is the band's base: underlines on its
  // bottom edge. `data-band` is what the band's own stylesheet looks for to
  // give it the band's bottom padding back (`PageHeader.module.css`).
  const inBand = useInPageBand();
  const stripClass = `${styles.strip} ${inBand ? styles.band : ""}`;
  const band = inBand ? "" : undefined;

  // The chosen box in view: a phone opened on the last tab (from the address,
  // or the one remembered) shows it, not the first ones only.
  useLayoutEffect(() => {
    const row = strip.current;
    const on = row?.querySelector<HTMLElement>('[aria-selected="true"], [aria-current="page"]');
    if (!row || !on) return;
    const left = on.offsetLeft - row.offsetLeft;
    if (left < row.scrollLeft || left + on.offsetWidth > row.scrollLeft + row.clientWidth) row.scrollLeft = Math.max(0, left - (row.clientWidth - on.offsetWidth) / 2);
  }, [chosen]);

  if (props.links) {
    return (
      <nav ref={keepStrip} className={stripClass} data-band={band} aria-label={props.label} data-tour={props["data-tour"]}>
        {props.links.map((link) => (
          <NavLink
            key={link.to}
            to={link.to}
            end
            className={({ isActive }) => `${styles.tab} ${isActive ? styles.active : ""}`}
            aria-label={link.badge ? `${link.label} — ${link.badgeLabel ?? link.badge}` : undefined}
          >
            <span className={`${styles.word} ${link.badge ? styles.counted : ""}`}>
              {link.label}
              {!!link.badge && (
                <span className={`${styles.badge} badge rounded-pill ${link.badgeTone === "warning" ? "text-bg-warning" : "text-bg-danger"}`} aria-hidden>
                  {link.badge > 9 ? "9+" : link.badge}
                </span>
              )}
            </span>
          </NavLink>
        ))}
      </nav>
    );
  }

  const { base, label, tabs, value, onChange } = props;
  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const last = tabs.length - 1;
    const to =
      event.key === "ArrowRight" ? (index === last ? 0 : index + 1)
      : event.key === "ArrowLeft" ? (index === 0 ? last : index - 1)
      : event.key === "Home" ? 0
      : event.key === "End" ? last
      : undefined;
    if (to === undefined) return;
    event.preventDefault();
    onChange(tabs[to].id);
    buttons.current[to]?.focus();
  };

  return (
    <div ref={keepStrip} className={stripClass} data-band={band} role="tablist" aria-label={label} data-tour={props["data-tour"]}>
      {tabs.map((tab, index) => {
        const on = tab.id === value;
        const ids = pageTabIds(base, tab.id);
        return (
          <button
            key={tab.id}
            ref={(node) => {
              buttons.current[index] = node;
            }}
            type="button"
            role="tab"
            id={ids.tab}
            aria-controls={ids.panel}
            aria-selected={on}
            tabIndex={on ? 0 : -1}
            data-view={tab.id}
            className={`${styles.tab} ${on ? styles.active : ""}`}
            onClick={() => onChange(tab.id)}
            onKeyDown={(event) => onKeyDown(event, index)}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}

export default PageTabs;
