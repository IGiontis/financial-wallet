import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { useLocalStorage } from "../shared/hooks/useLocalStorage";
import { NAV_STYLES, ThemeContext, type NavStyle, type ResolvedTheme, type ThemePreference } from "./themeContextValue";

// ─── Helpers ──────────────────────────────────────────────────────────────────

const DARK_QUERY = "(prefers-color-scheme: dark)";

const getSystemTheme = (): ResolvedTheme => (typeof window !== "undefined" && window.matchMedia(DARK_QUERY).matches ? "dark" : "light");

// ─── Provider ─────────────────────────────────────────────────────────────────

export function ThemeProvider({ children }: { children: ReactNode }) {
  // Default to "system" so first-time users get their OS preference,
  // then remember whatever they explicitly pick.
  const [preference, setPreference] = useLocalStorage<ThemePreference>("theme-preference", "system");
  const [systemTheme, setSystemTheme] = useState<ResolvedTheme>(getSystemTheme);

  // The menu's finish lives beside the theme for the same reason the theme does:
  // it is how this screen looks, not something about the money, so it stays on
  // the device and costs no read or write. Anything it does not recognise — a
  // value from a later version, a hand-edited key — falls back to Α rather than
  // leaving the shell with no style at all.
  const [storedNavStyle, setNavStyle] = useLocalStorage<NavStyle>("nav-style", "a");
  const navStyle: NavStyle = NAV_STYLES.includes(storedNavStyle) ? storedNavStyle : "a";

  // Track OS changes while "system" is selected
  useEffect(() => {
    const mq = window.matchMedia(DARK_QUERY);
    const onChange = (e: MediaQueryListEvent) => setSystemTheme(e.matches ? "dark" : "light");
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  const theme: ResolvedTheme = preference === "system" ? systemTheme : preference;

  // Drive Bootstrap 5.3's native colour mode + the browser UI colour
  useEffect(() => {
    document.documentElement.setAttribute("data-bs-theme", theme);
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", theme === "dark" ? "#14181e" : "#0d6efd");
  }, [theme]);

  // On <html>, next to `data-bs-theme`, so one selector can ask for both —
  // the blue and glass sidebars have a light-theme and a dark-theme shade — and
  // so it also reaches what is portalled out of the shell, like the rail's
  // tooltips.
  useEffect(() => {
    document.documentElement.setAttribute("data-nav-style", navStyle);
  }, [navStyle]);

  const toggleTheme = useCallback(() => {
    setPreference(theme === "dark" ? "light" : "dark");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [theme]);

  const value = useMemo(
    () => ({ preference, theme, setPreference, toggleTheme, navStyle, setNavStyle }),
    [preference, theme, setPreference, toggleTheme, navStyle, setNavStyle],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}
