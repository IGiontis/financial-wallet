import { createContext } from "react";

// ─── Types ────────────────────────────────────────────────────────────────────

export type ThemePreference = "light" | "dark" | "system";
export type ResolvedTheme = "light" | "dark";

/**
 * How the sidebar and the top bar are drawn: Α «Κλασικό», Β «Μπλε τόνος», Γ «Γυαλί».
 * The same menu in all three — the same groups, links and badges — finished
 * three ways. Stored as the letters the owner picked them by.
 */
export type NavStyle = "a" | "b" | "c";

/** In the order Settings offers them. Α is the default: the sidebar as it always
 * was, tidied — nothing to get used to again. */
export const NAV_STYLES: readonly NavStyle[] = ["a", "b", "c"];

export interface ThemeContextType {
  preference: ThemePreference; // what the user chose ("system" = follow OS)
  theme: ResolvedTheme; // what is actually rendered right now
  setPreference: (p: ThemePreference) => void;
  toggleTheme: () => void; // flips between light and dark
  navStyle: NavStyle; // the menu's finish, on this device
  setNavStyle: (s: NavStyle) => void;
}

// Kept out of ThemeContext.tsx so that file only exports a component and
// React Fast Refresh can hot-reload it.
export const ThemeContext = createContext<ThemeContextType>({
  preference: "system",
  theme: "light",
  setPreference: () => {},
  toggleTheme: () => {},
  navStyle: "a",
  setNavStyle: () => {},
});
