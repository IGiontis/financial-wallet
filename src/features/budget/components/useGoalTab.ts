import { useCallback, useEffect } from "react";
import { useSearchParams } from "react-router-dom";

// Which of the three tabs a goal screen is on — «Επισκόπηση · Κάρτες · Λίστα».
//
// In the address (`?tab=list`) so that a refresh, «back» from a goal's money in
// Transactions and a link someone kept all land on the same tab; and on the
// device, so that coming back to the screen from the menu (no `?tab` then)
// opens where it was left. The address wins when both have one: it is what was
// just asked for.

export const GOAL_TABS = ["overview", "cards", "list"] as const;
export type GoalTab = (typeof GOAL_TABS)[number];

/** The ids a tab and its panel point at each other by. */
export const goalTabIds = (base: string, tab: GoalTab) => ({ tab: `${base}-tab-${tab}`, panel: `${base}-panel-${tab}` });

const isGoalTab = (value: unknown): value is GoalTab => typeof value === "string" && (GOAL_TABS as readonly string[]).includes(value);

function readStored(key: string): unknown {
  try {
    const raw = localStorage.getItem(key);
    return raw === null ? undefined : JSON.parse(raw);
  } catch {
    return undefined;
  }
}

function store(key: string, tab: GoalTab) {
  try {
    localStorage.setItem(key, JSON.stringify(tab));
  } catch {
    // A private window or a full disk: the address still carries it.
  }
}

/**
 * The tab, and the way to change it. `screen` names the screen's keys
 * («goals», «investments»): `<screen>:tab` is the remembered tab, and
 * `<screen>:view` is the cards-or-list choice the screen had before the tabs —
 * someone who kept the list open lands on «Λίστα» the first time.
 */
export function useGoalTab(screen: string): [GoalTab, (tab: GoalTab) => void] {
  const [params, setParams] = useSearchParams();
  const key = `${screen}:tab`;
  const asked = params.get("tab");

  const tab: GoalTab = isGoalTab(asked)
    ? asked
    : (() => {
        const stored = readStored(key);
        if (isGoalTab(stored)) return stored;
        return readStored(`${screen}:view`) === "stacks" ? "list" : "overview";
      })();

  // The address says the tab whichever way it was arrived at, and the device
  // remembers what the address asked for. Replacing, not pushing: «back» leaves
  // the screen rather than stepping through every tab looked at.
  useEffect(() => {
    store(key, tab);
    if (asked !== tab) {
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          next.set("tab", tab);
          return next;
        },
        { replace: true },
      );
    }
  }, [asked, key, setParams, tab]);

  const choose = useCallback(
    (next: GoalTab) => {
      store(key, next);
      setParams(
        (prev) => {
          const params = new URLSearchParams(prev);
          params.set("tab", next);
          return params;
        },
        { replace: true },
      );
    },
    [key, setParams],
  );

  return [tab, choose];
}
