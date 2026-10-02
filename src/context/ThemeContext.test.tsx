import { describe, it, expect, beforeAll, beforeEach, afterEach } from "vitest";
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import i18n from "../i18n";
import { ThemeProvider } from "./ThemeContext";
import { ThemeCycleButton, ThemeSwitch } from "../shared/components/ThemeSwitch";
import { NavStylePicker } from "../features/settings/components/NavStylePicker";

// Light, Dark and Auto — and Auto meaning the device's own setting, live: when
// the phone goes dark at sunset, the app goes with it.

/** A `prefers-color-scheme: dark` the test can flip, the way the OS would. */
function fakeColourScheme(dark: boolean) {
  const listeners = new Set<(event: MediaQueryListEvent) => void>();
  const list = {
    get matches() {
      return dark;
    },
    media: "(prefers-color-scheme: dark)",
    addEventListener: (_: string, listener: (event: MediaQueryListEvent) => void) => listeners.add(listener),
    removeEventListener: (_: string, listener: (event: MediaQueryListEvent) => void) => listeners.delete(listener),
  };
  window.matchMedia = (() => list) as unknown as typeof window.matchMedia;
  return {
    set(next: boolean) {
      dark = next;
      act(() => listeners.forEach((listener) => listener({ matches: next } as MediaQueryListEvent)));
    },
  };
}

const original = window.matchMedia;
const shown = () => document.documentElement.getAttribute("data-bs-theme");
const pressed = () => screen.getAllByRole("button", { pressed: true }).map((b) => b.textContent);

beforeAll(async () => {
  await i18n.changeLanguage("en");
});

beforeEach(() => {
  localStorage.removeItem("theme-preference");
  localStorage.removeItem("nav-style");
  document.documentElement.removeAttribute("data-nav-style");
});
afterEach(() => {
  window.matchMedia = original;
});

describe("the theme", () => {
  it("starts on Auto for anyone who never chose, and follows the device as it changes", () => {
    const device = fakeColourScheme(false);
    render(
      <ThemeProvider>
        <ThemeSwitch />
      </ThemeProvider>,
    );
    expect(pressed()).toEqual(["Auto"]);
    expect(shown()).toBe("light");

    device.set(true);
    expect(shown()).toBe("dark");
    device.set(false);
    expect(shown()).toBe("light");
  });

  it("holds a chosen theme whatever the device does, and remembers it", async () => {
    const device = fakeColourScheme(false);
    render(
      <ThemeProvider>
        <ThemeSwitch />
      </ThemeProvider>,
    );
    await userEvent.click(screen.getByRole("button", { name: "Dark" }));
    expect(shown()).toBe("dark");
    expect(localStorage.getItem("theme-preference")).toBe(JSON.stringify("dark"));

    device.set(false);
    expect(shown()).toBe("dark");

    // Back to Auto: the device's setting again, at once.
    device.set(true);
    await userEvent.click(screen.getByRole("button", { name: "Light" }));
    expect(shown()).toBe("light");
    await userEvent.click(screen.getByRole("button", { name: "Auto" }));
    expect(shown()).toBe("dark");
    expect(localStorage.getItem("theme-preference")).toBe(JSON.stringify("system"));
  });

  it("keeps what an existing user saved", () => {
    fakeColourScheme(true);
    localStorage.setItem("theme-preference", JSON.stringify("light"));
    render(
      <ThemeProvider>
        <ThemeSwitch />
      </ThemeProvider>,
    );
    expect(pressed()).toEqual(["Light"]);
    expect(shown()).toBe("light");
  });

  it("steps Light → Dark → Auto from the rail's single button, saying where it goes next", async () => {
    fakeColourScheme(false);
    localStorage.setItem("theme-preference", JSON.stringify("light"));
    render(
      <ThemeProvider>
        <ThemeCycleButton />
      </ThemeProvider>,
    );
    await userEvent.click(screen.getByRole("button", { name: "Theme: Light. Switch to Dark" }));
    expect(shown()).toBe("dark");
    await userEvent.click(screen.getByRole("button", { name: "Theme: Dark. Switch to Auto" }));
    expect(screen.getByRole("button", { name: "Theme: Auto. Switch to Light" })).toBeInTheDocument();
    expect(shown()).toBe("light");
  });
});

// The menu's finish — Α, Β or Γ — kept on the device beside the theme, and
// applied to the shell the moment it is pressed.
const navStyle = () => document.documentElement.getAttribute("data-nav-style");

describe("the menu style", () => {
  it("is Α until one is chosen, and the choice shows as pressed", () => {
    fakeColourScheme(false);
    render(
      <ThemeProvider>
        <NavStylePicker />
      </ThemeProvider>,
    );
    expect(navStyle()).toBe("a");
    expect(pressed()).toEqual(["A Classic"]);
  });

  it("changes the shell at once and remembers it, whatever the theme", async () => {
    const device = fakeColourScheme(false);
    render(
      <ThemeProvider>
        <ThemeSwitch />
        <NavStylePicker />
      </ThemeProvider>,
    );
    await userEvent.click(screen.getByRole("button", { name: "C Glass" }));
    expect(navStyle()).toBe("c");
    expect(localStorage.getItem("nav-style")).toBe(JSON.stringify("c"));

    // Independent of the theme, in either direction.
    await userEvent.click(screen.getByRole("button", { name: "Dark" }));
    device.set(true);
    expect(navStyle()).toBe("c");
    await userEvent.click(screen.getByRole("button", { name: "B Blue tone" }));
    expect(shown()).toBe("dark");
    expect(navStyle()).toBe("b");
    expect(pressed()).toEqual(["Dark", "B Blue tone"]);
  });

  it("keeps what was saved on this device", () => {
    fakeColourScheme(false);
    localStorage.setItem("nav-style", JSON.stringify("b"));
    render(
      <ThemeProvider>
        <NavStylePicker />
      </ThemeProvider>,
    );
    expect(navStyle()).toBe("b");
    expect(pressed()).toEqual(["B Blue tone"]);
  });

  it("falls back to Α for a value it does not know", () => {
    fakeColourScheme(false);
    localStorage.setItem("nav-style", JSON.stringify("glass"));
    render(
      <ThemeProvider>
        <NavStylePicker />
      </ThemeProvider>,
    );
    expect(navStyle()).toBe("a");
    expect(pressed()).toEqual(["A Classic"]);
  });
});
