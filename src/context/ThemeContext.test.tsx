import { describe, it, expect, beforeAll, beforeEach, afterEach } from "vitest";
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import i18n from "../i18n";
import { ThemeProvider } from "./ThemeContext";
import { ThemeCycleButton, ThemeSwitch } from "../shared/components/ThemeSwitch";

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

beforeEach(() => localStorage.removeItem("theme-preference"));
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
