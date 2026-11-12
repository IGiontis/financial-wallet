import { useRef, type KeyboardEvent } from "react";
import styles from "../css/UnderlineTabs.module.css";
import { underlineTabIds } from "../utils/underlineTabIds";

export interface UnderlineTab<T extends string> {
  id: T;
  label: string;
}

/**
 * A page's inner tabs, underlined — the same look and keyboard as the Goals and
 * Investments tabs (`GoalTabs`). A real tablist: the arrow keys, Home and End
 * move between them and choose as they go; only the chosen one is in the Tab
 * order. The panel says which tab labels it with `underlineTabIds`.
 */
export function UnderlineTabs<T extends string>({ base, label, tabs, value, onChange }: { base: string; label: string; tabs: readonly UnderlineTab<T>[]; value: T; onChange: (tab: T) => void }) {
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);

  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const last = tabs.length - 1;
    const to =
      event.key === "ArrowRight" ? (index === last ? 0 : index + 1) : event.key === "ArrowLeft" ? (index === 0 ? last : index - 1) : event.key === "Home" ? 0 : event.key === "End" ? last : undefined;
    if (to === undefined) return;
    event.preventDefault();
    onChange(tabs[to].id);
    buttons.current[to]?.focus();
  };

  return (
    <div className={`nav nav-underline flex-nowrap ${styles.tabs}`} role="tablist" aria-label={label}>
      {tabs.map((tab, index) => {
        const on = tab.id === value;
        const ids = underlineTabIds(base, tab.id);
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
            className={`nav-link ${on ? "active" : ""} ${styles.tab}`}
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

export default UnderlineTabs;
