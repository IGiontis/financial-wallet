import type { Modifier } from "@popperjs/core";

/**
 * Popper modifiers for row-level dropdown menus (⋮ → Edit / Delete).
 *
 * Without these, a menu next to the right edge of a wide screen renders past the
 * viewport and forces a horizontal scrollbar. `preventOverflow` pulls it back
 * inside, and the `-end` fallbacks keep it anchored to the toggle's right edge
 * so it always opens inward.
 *
 * Popper accepts partial modifiers (it merges them with its defaults), but the
 * typings ask for the full shape — hence the cast.
 */
export const DROPDOWN_MENU_MODIFIERS = [
  { name: "preventOverflow", options: { boundary: "viewport", padding: 8 } },
  { name: "flip", options: { fallbackPlacements: ["top-end", "bottom-end"] } },
] as unknown as Modifier<string, object>[];
