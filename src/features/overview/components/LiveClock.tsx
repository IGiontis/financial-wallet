import { memo, useEffect, useState } from "react";
import { formatClock } from "../../../shared/utils/dates";

/**
 * The time, to the second, ticking — after the date on the Overview.
 *
 * Its own little component that owns its own clock, so only these few
 * characters re-render each second, never the page around it. Reads nothing
 * but the device's clock: no Firestore. While the tab is hidden it stops, and
 * on return it is set at once and lined up to the turn of the second again.
 * Figures are tabular so the width doesn't jiggle; no animation.
 *
 * 24-hour in Greek (06:55:22); in English the locale's own way (5:23:55 PM).
 */
export const LiveClock = memo(function LiveClock({ locale }: { locale: string }) {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    let interval: ReturnType<typeof setInterval> | undefined;
    let align: ReturnType<typeof setTimeout> | undefined;

    const stop = () => {
      clearTimeout(align);
      clearInterval(interval);
      align = interval = undefined;
    };
    // Tick on the turn of each second, so the display never lags the real
    // second by most of one.
    const start = () => {
      stop();
      setNow(new Date());
      align = setTimeout(() => {
        setNow(new Date());
        interval = setInterval(() => setNow(new Date()), 1000);
      }, 1000 - (Date.now() % 1000));
    };
    const onVisibility = () => (document.visibilityState === "hidden" ? stop() : start());

    if (document.visibilityState !== "hidden") start();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      stop();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  return (
    <time dateTime={now.toISOString()} style={{ fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>
      {formatClock(now, locale)}
    </time>
  );
});
