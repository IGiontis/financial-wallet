import { useRef, type KeyboardEvent } from "react";
import { useTranslation } from "react-i18next";
import { GOAL_TABS, goalTabIds, type GoalTab } from "./useGoalTab";
import styles from "./css/GoalsWorkbench.module.css";

// The three tabs at the top of a goal screen: «Επισκόπηση · Κάρτες · Λίστα».
//
// Bootstrap's underline nav, so the look is the one the rest of the app's tabs
// can share: the chosen tab underlined in the brand's lettering colour, the
// others in the secondary text colour. A real tablist — the arrow keys, Home
// and End move between them and choose as they go, and only the chosen one is
// in the Tab order.

const LABEL_KEY: Record<GoalTab, string> = {
  overview: "goals.tabOverview",
  cards: "goals.tabCards",
  list: "goals.tabList",
};

export function GoalTabs({ base, label, value, onChange }: { base: string; label: string; value: GoalTab; onChange: (tab: GoalTab) => void }) {
  const { t } = useTranslation();
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);

  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const last = GOAL_TABS.length - 1;
    const to =
      event.key === "ArrowRight" ? (index === last ? 0 : index + 1) : event.key === "ArrowLeft" ? (index === 0 ? last : index - 1) : event.key === "Home" ? 0 : event.key === "End" ? last : undefined;
    if (to === undefined) return;
    event.preventDefault();
    onChange(GOAL_TABS[to]);
    buttons.current[to]?.focus();
  };

  return (
    // `goal-views` and `data-view` are what the demo's guided tour presses to
    // put the cards on screen before it points at one.
    <div className={`nav nav-underline flex-nowrap ${styles.tabs}`} role="tablist" aria-label={label} data-tour="goal-views">
      {GOAL_TABS.map((tab, index) => {
        const on = tab === value;
        const ids = goalTabIds(base, tab);
        return (
          <button
            key={tab}
            ref={(node) => {
              buttons.current[index] = node;
            }}
            type="button"
            role="tab"
            id={ids.tab}
            aria-controls={ids.panel}
            aria-selected={on}
            tabIndex={on ? 0 : -1}
            data-view={tab}
            className={`nav-link ${on ? "active" : ""} ${styles.tab}`}
            onClick={() => onChange(tab)}
            onKeyDown={(event) => onKeyDown(event, index)}
          >
            {t(LABEL_KEY[tab])}
          </button>
        );
      })}
    </div>
  );
}
