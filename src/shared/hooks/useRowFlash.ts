import { useCallback, useEffect, useRef, useState } from "react";

/** The class that lights a row (styles/theme.css, «Save feedback»). */
export const ROW_FLASH = "row-flash";

/** As long as the flash itself: `--motion-flash` in styles/shape.css. */
export const ROW_FLASH_MS = 1600;

/**
 * Lights the row that was just saved, so a dialog closing onto an unchanged
 * looking page still says that something happened.
 *
 *   const { flash, flashClass } = useRowFlash();
 *   // after the save resolves, with the saved record's id:
 *   onSaved: (id) => flash(id)
 *   // on each row:
 *   <li className={`${styles.row} ${flashClass(row.id)}`}>
 *
 * The id is kept for the length of the flash and then let go, so a row that
 * is drawn later (a new one, arriving with the next read) still lights when it
 * appears, and a row re-rendered after it has finished does not light again.
 * Flashing the same id twice in a row starts it over. Under reduced motion
 * the CSS holds the tint still instead of fading it.
 */
export function useRowFlash<Id extends string | number = string>() {
  const [flashed, setFlashed] = useState<{ id: Id; at: number } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => () => clearTimeout(timer.current), []);

  const flash = useCallback((id: Id) => {
    clearTimeout(timer.current);
    // Off for a frame first, so the same row flashed again restarts its animation.
    setFlashed(null);
    requestAnimationFrame(() => setFlashed({ id, at: Date.now() }));
    timer.current = setTimeout(() => setFlashed(null), ROW_FLASH_MS + 50);
  }, []);

  const flashClass = useCallback((id: Id) => (flashed?.id === id ? ROW_FLASH : ""), [flashed]);

  return { flash, flashClass, flashedId: flashed?.id ?? null };
}
