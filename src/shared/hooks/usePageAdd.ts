import { createContext, useContext, useEffect, useRef } from "react";

/** What a page adds: the words for the «+» and the way it opens the page's own form. */
export interface PageAdd {
  label: string;
  onAdd: () => void;
}

export interface PageAddRegistry {
  current: PageAdd | null;
  set: (add: PageAdd | null) => void;
}

/**
 * Where the floating «+» learns what to add. A page that has an add of its own
 * — a goal, a card, an investment, a debt — says so while it is on screen;
 * everywhere else the «+» opens a new transaction (see `AddFab`). Provided by
 * `PageAddProvider`.
 */
export const PageAddContext = createContext<PageAddRegistry>({ current: null, set: () => {} });

/** The page's add, if one is on screen. */
export const useCurrentPageAdd = () => useContext(PageAddContext).current;

/**
 * Called by a page with its own add, for as long as it is mounted. The handler
 * is read through a ref, so a page passing a fresh arrow on every render does
 * not register itself over and over.
 */
export function usePageAdd(label: string, onAdd: () => void) {
  const { set } = useContext(PageAddContext);
  const latest = useRef(onAdd);
  useEffect(() => {
    latest.current = onAdd;
  });
  useEffect(() => {
    set({ label, onAdd: () => latest.current() });
    return () => set(null);
  }, [label, set]);
}
