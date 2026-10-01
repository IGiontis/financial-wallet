import { useContext } from "react";
import { ThemeContext, type ThemePreference } from "../../context/themeContextValue";

export type { ResolvedTheme, ThemePreference } from "../../context/themeContextValue";

/** Read and control the active colour theme. */
export const useTheme = () => useContext(ThemeContext);

/**
 * The three choices, in the order they are offered: Light, Dark and Auto.
 *
 * "Auto" is stored as `"system"`, the value the provider has followed the
 * device's `prefers-color-scheme` with since the start — it is also what anyone
 * who never picked a theme is on. Renaming it would have turned every saved
 * "system" into an unknown value; offering it under a friendlier name changes
 * nothing that is already stored.
 */
export const THEME_PREFERENCES: readonly ThemePreference[] = ["light", "dark", "system"];

/** The one after `current`, for a single button that steps through all three. */
export const nextThemePreference = (current: ThemePreference): ThemePreference => THEME_PREFERENCES[(THEME_PREFERENCES.indexOf(current) + 1) % THEME_PREFERENCES.length];
