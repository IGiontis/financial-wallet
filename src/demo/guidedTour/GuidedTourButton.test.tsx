import { describe, it, expect, vi, beforeAll, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, useLocation } from "react-router-dom";
import i18n from "../../i18n";
import { enterDemo, exitDemo } from "../demoMode";
import { GuidedTourButton } from "./GuidedTourButton";
import { TOUR_STEPS } from "./tourSteps";

// «▶ Ξενάγηση»: only in the demo, named for a screen reader even where it is
// an icon, and the tour's library fetched only once it is pressed.

const lib = vi.hoisted(() => {
  const instance = {
    isActive: vi.fn(() => false),
    drive: vi.fn(),
    moveTo: vi.fn(),
    destroy: vi.fn(),
    getActiveIndex: vi.fn(() => undefined),
    getState: vi.fn(() => undefined),
    refresh: vi.fn(),
  };
  return { instance, driver: vi.fn(() => instance) };
});
vi.mock("driver.js", () => ({ driver: lib.driver }));

/** Where the router is, for the test to read. */
function Where() {
  return <output data-testid="where">{useLocation().pathname}</output>;
}

const renderButton = (path = "/goals") =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <GuidedTourButton />
      <Where />
    </MemoryRouter>,
  );

beforeAll(async () => {
  await i18n.changeLanguage("en");
});
afterEach(() => {
  exitDemo();
  localStorage.clear();
  vi.clearAllMocks();
});

describe("GuidedTourButton", () => {
  it("is not there outside the demo", () => {
    renderButton();
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("in the demo, is a button named «Tour», with its longer name as its title", () => {
    enterDemo();
    renderButton();
    const button = screen.getByRole("button", { name: "Tour" });
    expect(button).toHaveAttribute("title", "Take a tour of the app");
    // The icon is decoration; the name is the word, kept in the page at every width.
    expect(button.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
  });

  it("rings on the first visit only", () => {
    enterDemo();
    const first = renderButton();
    expect(screen.getByRole("button").className).toMatch(/hint/);
    first.unmount();
    renderButton();
    expect(screen.getByRole("button").className).not.toMatch(/hint/);
  });

  it("loads the tour only when pressed, and takes the visitor to its first page", async () => {
    enterDemo();
    const view = renderButton("/goals");
    expect(lib.driver).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole("button", { name: "Tour" }));
    await waitFor(() => expect(lib.driver).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.getByTestId("where")).toHaveTextContent(TOUR_STEPS[0].route));
    // Pressed once: not pressable again while it runs.
    expect(screen.getByRole("button", { name: "Tour" })).toBeDisabled();
    view.unmount();
  });
});
