import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { useLocalStorage } from "../shared/hooks/useLocalStorage";
import { ThemeContext, type ResolvedTheme, type ThemePreference } from "./themeContextValue";

// ─── Helpers ──────────────────────────────────────────────────────────────────

const DARK_QUERY = "(prefers-color-scheme: dark)";

const getSystemTheme = (): ResolvedTheme => (typeof window !== "undefined" && window.matchMedia(DARK_QUERY).matches ? "dark" : "light");

// ─── Provider ─────────────────────────────────────────────────────────────────

export function ThemeProvider({ children }: { children: ReactNode }) {
  // Default to "system" so first-time users get their OS preference,
  // then remember whatever they explicitly pick.
  const [preference, setPreference] = useLocalStorage<ThemePreference>("theme-preference", "system");
  const [systemTheme, setSystemTheme] = useState<ResolvedTheme>(getSystemTheme);

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

  const toggleTheme = useCallback(() => {
    setPreference(theme === "dark" ? "light" : "dark");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [theme]);

  const value = useMemo(() => ({ preference, theme, setPreference, toggleTheme }), [preference, theme, setPreference, toggleTheme]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}
