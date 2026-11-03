import { useMemo, useState, type ReactNode } from "react";
import { PageAddContext, type PageAdd } from "../hooks/usePageAdd";

/** Holds the page's add for the floating «+» — see `usePageAdd`. */
export function PageAddProvider({ children }: { children: ReactNode }) {
  const [current, set] = useState<PageAdd | null>(null);
  const value = useMemo(() => ({ current, set }), [current]);
  return <PageAddContext.Provider value={value}>{children}</PageAddContext.Provider>;
}
