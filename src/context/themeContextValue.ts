import { createContext } from "react";

// ─── Types ────────────────────────────────────────────────────────────────────

export type ThemePreference = "light" | "dark" | "system";
export type ResolvedTheme = "light" | "dark";

/**
 * The colourway: «Μπλε εμπιστοσύνης» (blue) or «Μαύρο & χρυσό» (gold). Colour
 * and nothing else — the shell, the cards and every button are built the same
 * in both (styles/tokens.css holds the palettes). Named
 * `NavStyle` and kept on `data-nav-style` / the `nav-style` key because that is
 * where the choice has always lived on this device; it used to pick among three
 * menu finishes (a, b, c), which `toNavStyle` maps forward.
 */
export type NavStyle = "blue" | "gold";

/** In the order Settings offers them. Blue is the default. */
export const NAV_STYLES: readonly NavStyle[] = ["blue", "gold"];

/**
 * What a stored value means now. The three old menu finishes were all blue
 * shells (Α a pine green for a few days, Β navy, Γ slate), so each lands on the
 * default blue; anything unknown — a later version's value, a hand-edited key,
 * or a colourway since dropped — «Μπεζ» ("sand") and «Γραφίτης» ("graphite"),
 * each offered for a few days — does too, rather than leaving the shell with no palette at all.
 */
export const toNavStyle = (stored: unknown): NavStyle => (NAV_STYLES as readonly unknown[]).includes(stored) ? (stored as NavStyle) : "blue";

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
  navStyle: "blue",
  setNavStyle: () => {},
});
