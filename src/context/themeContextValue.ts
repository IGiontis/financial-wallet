import { createContext } from "react";

// ─── Types ────────────────────────────────────────────────────────────────────

export type ThemePreference = "light" | "dark" | "system";
export type ResolvedTheme = "light" | "dark";

export interface ThemeContextType {
  preference: ThemePreference; // what the user chose ("system" = follow OS)
  theme: ResolvedTheme; // what is actually rendered right now
  setPreference: (p: ThemePreference) => void;
  toggleTheme: () => void; // flips between light and dark
}

// Kept out of ThemeContext.tsx so that file only exports a component and
// React Fast Refresh can hot-reload it.
export const ThemeContext = createContext<ThemeContextType>({
  preference: "system",
  theme: "light",
  setPreference: () => {},
  toggleTheme: () => {},
});
