import { useEffect, useState } from "react";

/** Bootstrap's `sm` boundary: below this, a phone held in one hand. */
export const NARROW_QUERY = "(max-width: 575.98px)";

/**
 * True on a screen too narrow for a control anchored to its field.
 *
 * Menus and calendars that hang off an input are the wrong shape on a phone:
 * there is no room beside the field, so they end up wherever there is space —
 * usually shoved to the bottom of the page, a long way from what opened them.
 * On a narrow screen those become sheets that own the screen instead.
 */
export function useNarrowScreen(query: string = NARROW_QUERY): boolean {
  const [narrow, setNarrow] = useState(() => typeof window !== "undefined" && window.matchMedia(query).matches);

  useEffect(() => {
    const media = window.matchMedia(query);
    const sync = () => setNarrow(media.matches);

    // Read once on mount as well as on change: the width can differ from what
    // the initial render saw — a rotation, a resized window, or simply a
    // remount — and a listener alone would keep the stale answer until the
    // next resize.
    sync();
    media.addEventListener("change", sync);
    // Rotation is the case that matters, and not every engine fires the media
    // query listener for it — resize always arrives.
    window.addEventListener("resize", sync);

    return () => {
      media.removeEventListener("change", sync);
      window.removeEventListener("resize", sync);
    };
  }, [query]);

  return narrow;
}

export default useNarrowScreen;
