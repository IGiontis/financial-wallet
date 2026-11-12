import { useCallback, useEffect } from "react";
import { useSearchParams } from "react-router-dom";

// Which tab a page with state tabs (`PageTabs`) is on, the way the goal screens
// keep theirs (`useGoalTab`): in the address (`?tab=month`), so a refresh, «back»
// and a kept link land on the same tab; and on the device (`storageKey`), so
// coming back from the menu — no `?tab` then — opens where it was left. The
// address wins when both have one: it is what was just asked for.

function readStored(key: string): unknown {
  try {
    const raw = localStorage.getItem(key);
    return raw === null ? undefined : JSON.parse(raw);
  } catch {
    return undefined;
  }
}

function store(key: string, tab: string) {
  try {
    localStorage.setItem(key, JSON.stringify(tab));
  } catch {
    // A private window or a full disk: the address still carries it.
  }
}

/**
 * `[tab, choose]` for a page's state tabs. `tabs` are the ids in order, `first`
 * the one a first visit opens on, `storageKey` where this device remembers the
 * last one chosen (JSON, as `useLocalStorage` writes it).
 */
export function usePageTab<T extends string>(tabs: readonly T[], first: T, storageKey: string): [T, (tab: T) => void] {
  const [params, setParams] = useSearchParams();
  const asked = params.get("tab");
  const isTab = (value: unknown): value is T => typeof value === "string" && (tabs as readonly string[]).includes(value);
  const stored = readStored(storageKey);
  const tab: T = isTab(asked) ? asked : isTab(stored) ? stored : first;

  // The address says the tab whichever way it was arrived at, and the device
  // remembers it. Replacing, not pushing: «back» leaves the page rather than
  // stepping through every tab looked at.
  useEffect(() => {
    store(storageKey, tab);
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
  }, [asked, storageKey, setParams, tab]);

  const choose = useCallback(
    (next: T) => {
      store(storageKey, next);
      setParams(
        (prev) => {
          const p = new URLSearchParams(prev);
          p.set("tab", next);
          return p;
        },
        { replace: true },
      );
    },
    [storageKey, setParams],
  );

  return [tab, choose];
}
