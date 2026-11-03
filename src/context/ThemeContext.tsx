import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { useLocalStorage } from "../shared/hooks/useLocalStorage";
import { ThemeContext, toNavStyle, type NavStyle, type ResolvedTheme, type ThemePreference } from "./themeContextValue";

// ─── Helpers ──────────────────────────────────────────────────────────────────

const DARK_QUERY = "(prefers-color-scheme: dark)";

const getSystemTheme = (): ResolvedTheme => (typeof window !== "undefined" && window.matchMedia(DARK_QUERY).matches ? "dark" : "light");

// ─── Provider ─────────────────────────────────────────────────────────────────

export function ThemeProvider({ children }: { children: ReactNode }) {
  // Default to "system" so first-time users get their OS preference,
  // then remember whatever they explicitly pick.
  const [preference, setPreference] = useLocalStorage<ThemePreference>("theme-preference", "system");
  const [systemTheme, setSystemTheme] = useState<ResolvedTheme>(getSystemTheme);

  // The colourway lives beside the theme for the same reason the theme does:
  // it is how this screen looks, not something about the money, so it stays on
  // the device and costs no read or write. The key is the one the old menu
  // styles used; their letters (a, b, c) and anything else unrecognised read as
  // the default blue (toNavStyle), so nobody is left with no palette.
  const [storedNavStyle, setNavStyle] = useLocalStorage<NavStyle>("nav-style", "blue");
  const navStyle: NavStyle = toNavStyle(storedNavStyle);

  // Track OS changes while "system" is selected
  useEffect(() => {
    const mq = window.matchMedia(DARK_QUERY);
    const onChange = (e: MediaQueryListEvent) => setSystemTheme(e.matches ? "dark" : "light");
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  const theme: ResolvedTheme = preference === "system" ? systemTheme : preference;

  // Drive Bootstrap 5.3's native colour mode + the browser UI colour
  // The colourway on <html>, next to `data-bs-theme`, so one selector can ask
  // for both — every palette has a light and a dark mode — and so it also
  // reaches what is portalled out of the shell, like the rail's tooltips.
  useEffect(() => {
    const root = document.documentElement;
    root.setAttribute("data-bs-theme", theme);
    root.setAttribute("data-nav-style", navStyle);
    // The phone's own bar above the app takes the shell's colour, so the two
    // read as one. It sits over the top-left of the frame, where the shell's
    // gradient starts — its dark end, in every colourway and mode — so it is
    // read from that token, now that both attributes are set. The fallbacks are
    // blue's dark ends, for a stylesheet that has not loaded.
    const shell = getComputedStyle(root).getPropertyValue("--shell-dark").trim();
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", shell || (theme === "dark" ? "#0e1b2e" : "#b4cce6"));
  }, [theme, navStyle]);

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
