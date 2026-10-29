import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import i18n from "../../i18n";
import { WelcomeTour } from "./WelcomeTour";
import { TourGate } from "./TourGate";

// Whole pages, many clicks each: alone they take a second or two, but under a
// full parallel run the 5 s default was missed now and then. Room, not a fix
// for slowness — a test that genuinely hangs still fails.
vi.setConfig({ testTimeout: 20_000 });

// The welcome tour: a card a page, Next through to the end or Skip from the start;
// shown once, the first time, and again when the settings ask.

const settings = vi.hoisted(() => ({ values: {} as Record<string, unknown>, writes: [] as [string, unknown][], loaded: true }));
vi.mock("../../shared/hooks/useWorkspaceSetting", () => ({
  useWorkspace: () => ({ isSuccess: settings.loaded }),
  useWorkspaceSetting: (key: string, initial: unknown) => [key in settings.values ? settings.values[key] : initial, (value: unknown) => settings.writes.push([key, value])],
}));
vi.mock("../../shared/hooks/useCurrencyConverter", () => ({ useCurrencyConverter: () => ({ format: (n: number) => `€${n.toFixed(2)}` }) }));

beforeAll(async () => {
  await i18n.changeLanguage("en");
});
beforeEach(() => {
  settings.values = {};
  settings.writes = [];
  settings.loaded = true;
});

describe("the welcome tour", () => {
  it("goes card by card to the end, and the last one finishes it", async () => {
    const onDone = vi.fn();
    render(<WelcomeTour onDone={onDone} />);
    expect(screen.getByRole("heading", { name: "Welcome to MyFiWallet" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Back" })).toBeNull();

    for (let i = 0; i < 11; i++) await userEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(screen.getByRole("heading", { name: "Planner" })).toBeInTheDocument();
    expect(onDone).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: "Let's go" }));
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it("goes back, jumps by its dots and by the arrow keys, and skips from anywhere", async () => {
    const onDone = vi.fn();
    render(<WelcomeTour onDone={onDone} />);
    await userEvent.click(screen.getByRole("button", { name: "Goals" }));
    expect(screen.getByRole("heading", { name: "Goals" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(screen.getByRole("heading", { name: "Calendar" })).toBeInTheDocument();
    await userEvent.keyboard("{ArrowRight}{ArrowRight}");
    expect(screen.getByRole("heading", { name: "Banks & cash" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Skip" }));
    expect(onDone).toHaveBeenCalledTimes(1);
  });
});

describe("when the tour shows", () => {
  const renderGate = (path = "/") =>
    render(
      <MemoryRouter initialEntries={[path]}>
        <TourGate />
      </MemoryRouter>,
    );

  it("once, the first time — and finishing it marks it seen", async () => {
    renderGate();
    await userEvent.click(screen.getByRole("button", { name: "Skip" }));
    expect(settings.writes).toEqual([["tour-seen", true]]);
  });

  it("not before the account's settings have come, nor once seen", () => {
    settings.loaded = false;
    const { unmount } = renderGate();
    expect(screen.queryByRole("dialog")).toBeNull();
    unmount();
    settings.loaded = true;
    settings.values = { "tour-seen": true };
    renderGate();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("again when the settings ask, seen already — writing nothing", async () => {
    settings.values = { "tour-seen": true };
    renderGate("/?tour=1");
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Skip" }));
    expect(settings.writes).toEqual([]);
  });
});
