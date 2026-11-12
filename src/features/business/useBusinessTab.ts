import { useCallback, useEffect } from "react";
import { useSearchParams } from "react-router-dom";

// Which tab «Δουλειά» is on — «Επισκόπηση · Μέρες · Ημερολόγιο · Κατηγορίες» —
// kept the way the goal screens keep theirs (`useGoalTab`): in the address
// (`?tab=days`), so a refresh, «back» from a closing's record in Transactions
// and a kept link land on the same tab; and on the device, so coming back from
// the menu (no `?tab`) opens where it was left. The address wins.

export const BUSINESS_TABS = ["overview", "days", "calendar", "categories"] as const;
export type BusinessTab = (typeof BUSINESS_TABS)[number];

const KEY = "business:tab";
const isTab = (value: unknown): value is BusinessTab => typeof value === "string" && (BUSINESS_TABS as readonly string[]).includes(value);

function readStored(): unknown {
  try {
    const raw = localStorage.getItem(KEY);
    return raw === null ? undefined : JSON.parse(raw);
  } catch {
    return undefined;
  }
}

function store(tab: BusinessTab) {
  try {
    localStorage.setItem(KEY, JSON.stringify(tab));
  } catch {
    // A private window or a full disk: the address still carries it.
  }
}

export function useBusinessTab(): [BusinessTab, (tab: BusinessTab) => void] {
  const [params, setParams] = useSearchParams();
  const asked = params.get("tab");
  const stored = readStored();
  const tab: BusinessTab = isTab(asked) ? asked : isTab(stored) ? stored : "overview";

  // Replacing, not pushing: «back» leaves the page rather than stepping through every tab.
  useEffect(() => {
    store(tab);
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
  }, [asked, setParams, tab]);

  const choose = useCallback(
    (next: BusinessTab) => {
      store(next);
      setParams(
        (prev) => {
          const p = new URLSearchParams(prev);
          p.set("tab", next);
          return p;
        },
        { replace: true },
      );
    },
    [setParams],
  );

  return [tab, choose];
}
