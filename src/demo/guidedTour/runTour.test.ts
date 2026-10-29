import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { Config } from "driver.js";
import type { TFunction } from "i18next";
import type { TourStep } from "./tourSteps";

// The walking the tour does on top of driver.js: to each step's page, wait for
// its element, past the ones that never come, and closed exactly once however
// it ends. driver.js itself is a stand-in that records what it was asked.

const lib = vi.hoisted(() => {
  const state = { config: undefined as Config | undefined, active: false, index: undefined as number | undefined };
  const instance = {
    isActive: vi.fn(() => state.active),
    drive: vi.fn((index: number) => {
      state.active = true;
      state.index = index;
    }),
    moveTo: vi.fn((index: number) => {
      state.index = index;
    }),
    destroy: vi.fn(() => {
      state.active = false;
      state.index = undefined;
    }),
    getActiveIndex: vi.fn(() => state.index),
    getState: vi.fn(() => undefined),
    refresh: vi.fn(),
  };
  const driver = vi.fn((config: Config) => {
    state.config = config;
    return instance;
  });
  return { state, instance, driver };
});

vi.mock("driver.js", () => ({ driver: lib.driver }));
vi.mock("../demoMode", () => ({ leaveDemo: vi.fn() }));

const { runTour } = await import("./runTour");

const t = ((key: string) => key) as unknown as TFunction;

const STEPS: TourStep[] = [
  { id: "one", route: "/", target: '[data-tour="one"]' },
  { id: "missing", route: "/goals", target: '[data-tour="never-there"]' },
  { id: "three", route: "/debts", target: '[data-tour="three"]' },
];

/** Puts a marked element on the page, with a box — jsdom draws none of its own. */
function mark(name: string) {
  const element = document.createElement("div");
  element.setAttribute("data-tour", name);
  element.getClientRects = () => [{}] as unknown as DOMRectList;
  document.body.append(element);
  return element;
}

const until = (check: () => boolean) => vi.waitFor(() => expect(check()).toBe(true), { timeout: 2000, interval: 10 });

beforeEach(() => {
  lib.state.active = false;
  lib.state.index = undefined;
  vi.clearAllMocks();
});
afterEach(() => {
  document.body.innerHTML = "";
});

describe("runTour", () => {
  it("opens the first step's page and points at its element once it is there", async () => {
    const navigate = vi.fn();
    let path = "/settings/profile";
    runTour({ navigate: (to) => ((path = to), navigate(to)), t, steps: STEPS, timeoutMs: 200, currentPath: () => path });

    expect(navigate).toHaveBeenCalledWith("/");
    expect(lib.instance.drive).not.toHaveBeenCalled();
    mark("one");
    await until(() => lib.instance.drive.mock.calls.length === 1);
    expect(lib.instance.drive).toHaveBeenCalledWith(0);
  });

  it("does not open the page it is already on again", async () => {
    mark("one");
    const navigate = vi.fn();
    runTour({ navigate, t, steps: STEPS, timeoutMs: 200, currentPath: () => "/" });
    await until(() => lib.instance.drive.mock.calls.length === 1);
    expect(navigate).not.toHaveBeenCalled();
  });

  it("passes over a step whose element never comes, and ends after the last", async () => {
    mark("one");
    mark("three");
    const navigate = vi.fn();
    const onEnd = vi.fn();
    let path = "/";
    runTour({ navigate: (to) => ((path = to), navigate(to)), t, steps: STEPS, timeoutMs: 100, currentPath: () => path, onEnd });
    await until(() => lib.instance.drive.mock.calls.length === 1);

    lib.state.config!.onNextClick!(undefined, {}, {} as never);
    await until(() => lib.instance.moveTo.mock.calls.length === 1);
    // To «Στόχοι» and on past it, to the step after.
    expect(navigate.mock.calls.map(([to]) => to)).toEqual(["/goals", "/debts"]);
    expect(lib.instance.moveTo).toHaveBeenCalledWith(2);

    // Back skips the same step the other way.
    lib.state.config!.onPrevClick!(undefined, {}, {} as never);
    await until(() => lib.instance.moveTo.mock.calls.length === 2);
    expect(lib.instance.moveTo).toHaveBeenLastCalledWith(0);
    lib.state.config!.onNextClick!(undefined, {}, {} as never);
    await until(() => lib.instance.moveTo.mock.calls.length === 3);

    // Next on the last step closes it, and says so once.
    lib.state.config!.onNextClick!(undefined, {}, {} as never);
    await until(() => onEnd.mock.calls.length === 1);
    expect(lib.instance.destroy).toHaveBeenCalledTimes(1);
  });

  it("presses the view a step needs first, unless it is already the one chosen", async () => {
    // A remembered list view hides the cards: the step presses «Κάρτες» before pointing.
    const steps: TourStep[] = [{ id: "goals", route: "/goals", target: '[data-tour="goal-card"]', activate: '[data-tour="views"] [data-view="cards"]' }];
    const views = mark("views");
    const cards = document.createElement("button");
    cards.setAttribute("data-view", "cards");
    cards.setAttribute("aria-pressed", "false");
    cards.getClientRects = () => [{}] as unknown as DOMRectList;
    cards.addEventListener("click", () => {
      cards.setAttribute("aria-pressed", "true");
      mark("goal-card");
    });
    views.append(cards);
    const clicked = vi.spyOn(cards, "click");

    runTour({ navigate: vi.fn(), t, steps, timeoutMs: 200, currentPath: () => "/goals" });
    await until(() => lib.instance.drive.mock.calls.length === 1);
    expect(clicked).toHaveBeenCalledTimes(1);

    // Back on the step with the cards already chosen: left alone, not pressed again.
    lib.state.config!.onPrevClick!(undefined, {}, {} as never);
    await until(() => lib.instance.moveTo.mock.calls.length === 1);
    expect(clicked).toHaveBeenCalledTimes(1);
  });

  it("closes, and says so once, from × or Esc", async () => {
    mark("one");
    const onEnd = vi.fn();
    runTour({ navigate: vi.fn(), t, steps: STEPS, timeoutMs: 100, currentPath: () => "/", onEnd });
    await until(() => lib.instance.drive.mock.calls.length === 1);

    lib.state.config!.onDestroyStarted!(undefined, {}, {} as never);
    expect(lib.instance.destroy).toHaveBeenCalledTimes(1);
    expect(onEnd).toHaveBeenCalledTimes(1);
  });

  it("stops waiting when it is stopped before anything was shown", async () => {
    const onEnd = vi.fn();
    const handle = runTour({ navigate: vi.fn(), t, steps: STEPS, timeoutMs: 100, currentPath: () => "/", onEnd });
    handle.stop();
    expect(onEnd).toHaveBeenCalledTimes(1);
    mark("one");
    await new Promise((resolve) => setTimeout(resolve, 200));
    expect(lib.instance.drive).not.toHaveBeenCalled();
    expect(onEnd).toHaveBeenCalledTimes(1);
  });

  it("blocks the page, keeps a stray tap from closing it, and follows reduced motion", () => {
    window.matchMedia = ((query: string) => ({ matches: query.includes("reduce"), media: query, addEventListener() {}, removeEventListener() {} })) as unknown as typeof window.matchMedia;
    runTour({ navigate: vi.fn(), t, steps: STEPS, timeoutMs: 50, currentPath: () => "/" }).stop();
    expect(lib.state.config).toMatchObject({ disableActiveInteraction: true, overlayClickBehavior: "none", animate: false, showProgress: true });
  });
});
