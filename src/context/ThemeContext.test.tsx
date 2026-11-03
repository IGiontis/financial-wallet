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

// The colourway — blue or gold — kept on the device beside the theme,
// and applied to the whole app the moment it is pressed.
const navStyle = () => document.documentElement.getAttribute("data-nav-style");

describe("the colourway", () => {
  it("is Trust blue until one is chosen, and the choice shows as pressed", () => {
    fakeColourScheme(false);
    render(
      <ThemeProvider>
        <NavStylePicker />
      </ThemeProvider>,
    );
    expect(navStyle()).toBe("blue");
    expect(pressed()).toEqual(["Trust blue"]);
  });

  it("offers the two, in order, as a group named for colour", () => {
    fakeColourScheme(false);
    render(
      <ThemeProvider>
        <NavStylePicker />
      </ThemeProvider>,
    );
    const group = screen.getByRole("group", { name: "Colours" });
    expect([...group.querySelectorAll("button")].map((b) => b.textContent)).toEqual(["Trust blue", "Black & gold"]);
  });

  it("changes the app at once and remembers it, whatever the theme", async () => {
    const device = fakeColourScheme(false);
    render(
      <ThemeProvider>
        <ThemeSwitch />
        <NavStylePicker />
      </ThemeProvider>,
    );
    await userEvent.click(screen.getByRole("button", { name: "Black & gold" }));
    expect(navStyle()).toBe("gold");
    expect(localStorage.getItem("nav-style")).toBe(JSON.stringify("gold"));

    // Independent of the theme, in either direction.
    await userEvent.click(screen.getByRole("button", { name: "Dark" }));
    device.set(true);
    expect(navStyle()).toBe("gold");
    await userEvent.click(screen.getByRole("button", { name: "Trust blue" }));
    expect(shown()).toBe("dark");
    expect(navStyle()).toBe("blue");
    expect(localStorage.getItem("nav-style")).toBe(JSON.stringify("blue"));
    expect(pressed()).toEqual(["Dark", "Trust blue"]);
  });

  it("keeps what was saved on this device", () => {
    fakeColourScheme(false);
    localStorage.setItem("nav-style", JSON.stringify("gold"));
    render(
      <ThemeProvider>
        <NavStylePicker />
      </ThemeProvider>,
    );
    expect(navStyle()).toBe("gold");
    expect(pressed()).toEqual(["Black & gold"]);
  });

  // The phone's own bar takes the shell's top-left colour — its dark end — so
  // the bar and the frame under it read as one.
  it("gives the phone's bar the shell's dark end", () => {
    fakeColourScheme(false);
    const meta = document.createElement("meta");
    meta.name = "theme-color";
    document.head.append(meta);
    document.documentElement.style.setProperty("--shell-dark", "#123456");
    try {
      render(
        <ThemeProvider>
          <NavStylePicker />
        </ThemeProvider>,
      );
      expect(meta.getAttribute("content")).toBe("#123456");
    } finally {
      document.documentElement.style.removeProperty("--shell-dark");
      meta.remove();
    }
  });

  // The key once held the three old menu styles, and for a few days each the
  // dropped colourways «Μπεζ» ("sand") and «Γραφίτης» ("graphite"); whoever
  // chose one of them, and anything else unrecognised, lands on the default.
  it.each(["a", "b", "c", "sand", "graphite", "glass", 42, null])("reads a stored %j as Trust blue", (stored) => {
    fakeColourScheme(false);
    localStorage.setItem("nav-style", JSON.stringify(stored));
    render(
      <ThemeProvider>
        <NavStylePicker />
      </ThemeProvider>,
    );
    expect(navStyle()).toBe("blue");
    expect(pressed()).toEqual(["Trust blue"]);
  });
});
