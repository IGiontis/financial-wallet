/**
 * How a page arrives each time the route changes (MainLayout): it fades up
 * from a little above. For anyone whose device asks for less motion it only
 * fades, in place — a change of opacity is not motion, and the owner's laptop
 * asks for less motion while he still wants to see the page arrive.
 *
 * Moved by `top` on a relatively placed box rather than by `transform`: a
 * transformed ancestor would carry anything fixed on the page (a strip, a
 * sheet) along with it.
 */
export const PAGE_ENTER_MS = 220;

export const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

export function pageEnterFrames(reduced: boolean): Keyframe[] {
  return reduced
    ? [{ opacity: 0 }, { opacity: 1 }]
    : [
        { opacity: 0, top: "-0.5rem" },
        { opacity: 1, top: "0" },
      ];
}

/** Whether this device asks for less motion; false where it cannot be asked. */
export function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && !!window.matchMedia?.(REDUCED_MOTION_QUERY).matches;
}
