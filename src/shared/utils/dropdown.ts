import type { Modifier } from "@popperjs/core";

/**
 * Popper modifiers for row-level dropdown menus (⋮ → Edit / Delete).
 *
 * Without these, a menu next to the right edge of a wide screen renders past the
 * viewport and forces a horizontal scrollbar. `preventOverflow` pulls it back
 * inside, and the `-end` fallbacks keep it anchored to the toggle's right edge
 * so it always opens inward.
 *
 * `rootBoundary`, not `boundary`: Popper 1 took the string "viewport" for the
 * latter, Popper 2 wants an element there and ignores a string — so the menu
 * carried on running off the right edge of the screen with the guard apparently
 * in place. The version here is 2.
 *
 * Popper accepts partial modifiers (it merges them with its defaults), but the
 * typings ask for the full shape — hence the cast.
 */
export const DROPDOWN_MENU_MODIFIERS = [
  { name: "preventOverflow", options: { rootBoundary: "viewport", padding: 8, altAxis: true } },
  { name: "flip", options: { rootBoundary: "viewport", fallbackPlacements: ["top-end", "bottom-end"] } },
] as unknown as Modifier<string, object>[];
