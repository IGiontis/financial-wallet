import { driver, type Driver, type DriveStep, type PopoverDOM } from "driver.js";
import "driver.js/dist/driver.css";
import "./css/guidedTour.css";
import type { TFunction } from "i18next";
import { leaveDemo } from "../demoMode";
import { TOUR_STEPS, type TourStep } from "./tourSteps";
import { TARGET_TIMEOUT_MS, findShown, waitForTarget } from "./waitForTarget";

// ─── The guided tour itself ──────────────────────────────────────────────────
//
// Loaded only when a visitor presses «▶ Ξενάγηση» (see `GuidedTourButton`):
// this module, driver.js and both their stylesheets are one lazy chunk, and
// nobody else's page ever fetches them.
//
// driver.js draws the dimmed page, the cut-out round the element and the
// popover. The walking from page to page is ours: driver.js knows one page,
// and a step's element is on another until the route has changed and the page
// has drawn it. So every move — Next, Back, the first step — goes through
// `go`, which changes the route, waits for the element (see `waitForTarget`),
// and only then asks driver.js to point at it. A step whose element never
// comes is passed over in the direction the visitor was going.
//
// While it runs the page is not to be used: driver.js stops the clicks on
// everything but the popover — the pointed-at element too — so nobody leaves
// a step half-way by tapping a link. Closing it, with ×, Esc or at the end,
// gives the page back where it stands; the tour does not take anyone home.

export interface TourOptions {
  navigate: (path: string) => void;
  t: TFunction;
  /** Once it is closed, however that happened. */
  onEnd?: () => void;
  steps?: readonly TourStep[];
  /** How long a step waits for its element. */
  timeoutMs?: number;
  /** The page shown now; the address bar's, unless a test says otherwise. */
  currentPath?: () => string;
}

export interface TourHandle {
  /** Closes it from outside — the button going away with the top bar. */
  stop: () => void;
}

// driver.js writes the title and the words in as HTML; ours are text.
const escapeHtml = (text: string) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const prefersReducedMotion = () => typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/**
 * Two frames: the page that has just drawn the element has laid it out by
 * then. A tab in the background gets no frames at all, so a timer stands in.
 */
const settle = () =>
  new Promise<void>((resolve) => {
    const timer = window.setTimeout(resolve, 120);
    if (typeof requestAnimationFrame !== "function") return;
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        window.clearTimeout(timer);
        resolve();
      }),
    );
  });

export function runTour({ navigate, t, onEnd, steps = TOUR_STEPS, timeoutMs = TARGET_TIMEOUT_MS, currentPath = () => window.location.pathname }: TourOptions): TourHandle {
  const total = steps.length;
  /** The element each step found, handed to driver.js as that step's. */
  const found: (Element | undefined)[] = [];
  // Each move takes a number; a wait that finds its number is no longer the
  // latest one stops — a second Next while a page is loading wins.
  let move = 0;
  let ended = false;
  let resizeWatch: ResizeObserver | undefined;

  // driver.js measures again when the window scrolls or resizes. This app
  // scrolls inside its own column, not the window, and its pages settle for a
  // moment after they are drawn — a chart, a figure, a list arriving above the
  // element and moving it down. So the cut-out and the popover are measured
  // again on any scroll anywhere (caught on the way down, since a scroll does
  // not bubble), and a few times a second besides.
  const follow = () => {
    if (tour.isActive() && waiting === 0) tour.refresh();
  };
  let waiting = 0;

  /** Over: whatever is waiting stops, and the button is told. Once. */
  const finish = () => {
    if (ended) return;
    ended = true;
    move++;
    resizeWatch?.disconnect();
    document.removeEventListener("scroll", follow, { capture: true });
    window.clearInterval(tick);
    onEnd?.();
  };
  /**
   * Closes it, from anywhere: ×, Esc, the last step's «Τέλος», the sign-up
   * button, the button unmounting. Not through driver.js's `onDestroyed`,
   * which it calls only once a step's highlight has finished drawing — on an
   * animation frame, which a tab in the background does not get.
   */
  const close = () => {
    if (tour.isActive()) tour.destroy();
    finish();
  };

  const hidePopover = (tour: Driver) => {
    const popover = tour.getState("popover") as PopoverDOM | undefined;
    if (popover) popover.wrapper.style.display = "none";
  };

  const addSignUp = (popover: PopoverDOM) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "mfw-tour-cta";
    button.textContent = t("guidedTour.createAccount");
    button.addEventListener("click", () => {
      close();
      leaveDemo("/register");
    });
    popover.footer.before(button);
  };

  const driveSteps: DriveStep[] = steps.map((step, index) => ({
    element: () => found[index] ?? document.body,
    popover: {
      title: escapeHtml(t(`guidedTour.steps.${step.id}.title`)),
      description: escapeHtml(t(`guidedTour.steps.${step.id}.body`)),
      side: step.side,
      align: "center",
      progressText: t("guidedTour.progress", { current: index + 1, total }),
      ...(step.finale ? { onPopoverRender: (popover: PopoverDOM) => addSignUp(popover) } : {}),
    },
  }));

  const reduced = prefersReducedMotion();
  const tour = driver({
    steps: driveSteps,
    animate: !reduced,
    smoothScroll: false,
    allowClose: true,
    // A stray tap on the dim, on a phone, should not throw the tour away.
    overlayClickBehavior: "none",
    // The app's own ink rather than pure black: a dim, not a blackout.
    overlayColor: "#0b1626",
    overlayOpacity: 0.55,
    disableActiveInteraction: true,
    allowKeyboardControl: true,
    showProgress: true,
    showButtons: ["next", "previous", "close"],
    stagePadding: 6,
    stageRadius: 12,
    popoverOffset: 12,
    popoverClass: "mfw-tour",
    nextBtnText: t("guidedTour.next"),
    prevBtnText: t("guidedTour.back"),
    doneBtnText: t("guidedTour.done"),
    closeBtnLabel: t("guidedTour.close"),
    onNextClick: () => void go((tour.getActiveIndex() ?? -1) + 1, 1),
    onPrevClick: () => void go((tour.getActiveIndex() ?? 1) - 1, -1),
    // A page whose figures arrive after it has been pointed at grows under the
    // cut-out; following its size keeps the hole round what is there now.
    onHighlighted: (element) => {
      resizeWatch?.disconnect();
      if (!element || typeof ResizeObserver === "undefined") return;
      resizeWatch = new ResizeObserver(() => tour.refresh());
      resizeWatch.observe(element);
    },
    // ×, Esc: driver.js asks before closing, so that the closing is ours.
    onDestroyStarted: close,
  });

  document.addEventListener("scroll", follow, { capture: true, passive: true });
  const tick = window.setInterval(follow, 400);

  async function go(index: number, direction: 1 | -1): Promise<void> {
    const mine = ++move;
    const stale = () => ended || mine !== move;
    const from = tour.getActiveIndex();
    // Between steps the popover is hidden and there is nothing to measure.
    waiting++;
    let shown: number | undefined;
    try {
      shown = await walk(index, direction, stale);
    } finally {
      waiting--;
    }
    if (stale()) return;
    if (shown !== undefined) {
      if (tour.isActive()) tour.moveTo(shown);
      else tour.drive(shown);
      return;
    }
    // Nothing left that way. Forward, that is the end; back, there was nothing
    // before this step to show, so it goes back to the step it was on.
    if (direction === 1 || from === undefined) close();
    else void go(from, 1);
  }

  /**
   * From step `index` on, in `direction`: the first step whose element turns
   * up — on its page, which is opened first — or `undefined` when none does.
   */
  async function walk(index: number, direction: 1 | -1, stale: () => boolean): Promise<number | undefined> {
    for (let i = index; i >= 0 && i < total; i += direction) {
      const step = steps[i];
      if (currentPath() !== step.route) navigate(step.route);
      if (tour.isActive()) hidePopover(tour);

      if (step.activate) {
        const control = await waitForTarget(step.activate, timeoutMs, stale);
        if (stale()) return undefined;
        // A tab says it is chosen with aria-selected, a view switch's option with aria-pressed.
        if (control instanceof HTMLElement && control.getAttribute("aria-selected") !== "true" && control.getAttribute("aria-pressed") !== "true") control.click();
      }

      const element = await waitForTarget(step.target, timeoutMs, stale);
      if (stale()) return undefined;
      if (!element) continue;

      await settle();
      if (stale()) return undefined;
      // The page may have drawn it again since: point at what is there now.
      found[i] = findShown(step.target) ?? element;
      return i;
    }
    return undefined;
  }

  void go(0, 1);

  return { stop: close };
}
