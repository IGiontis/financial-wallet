import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useLocation, useNavigate } from "react-router-dom";
import { isDemo } from "../demoMode";
import type { TourHandle } from "./runTour";

// ─── Starting the demo's tour ────────────────────────────────────────────────
//
// What «▶ Ξενάγηση» does, apart from what it looks like: on a wide screen it is
// a button of its own beside the «DEMO» chip; on a phone it is an item in the
// chip's menu (see `DemoChrome`). Either way the tour and its library are
// fetched the moment it is asked for, and not before (see `runTour`).
//
// It never starts by itself. The most it does unasked is a few soft rings
// round whatever starts it, on the first visit, so whoever has just arrived
// knows it is there.

/** Set once the rings have been shown, so that a second visit is left alone. */
const TOUR_HINT_KEY = "demo:tour-hinted";

/** How long the rings last: three of 1.6s, and a little room. */
const HINT_MS = 5000;

// The browser's storage can refuse — a private window, blocked site data —
// and then the rings simply show again next time.
function hintedBefore(): boolean {
  try {
    return localStorage.getItem(TOUR_HINT_KEY) === "1";
  } catch {
    return true;
  }
}

function rememberHinted() {
  try {
    localStorage.setItem(TOUR_HINT_KEY, "1");
  } catch {
    // Nothing to keep it in; see `hintedBefore`.
  }
}

/**
 * `start` the tour; `running` while it is on (and while its chunk downloads);
 * `hint` while the first visit's rings are due. `enabled` false — the control
 * is not the one on screen at this width — keeps it from claiming the rings.
 */
export function useGuidedTour(enabled = true) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [running, setRunning] = useState(false);
  const [hint, setHint] = useState(() => enabled && isDemo() && !hintedBefore());
  const tour = useRef<TourHandle | null>(null);
  // Where the visitor is right now, for the tour to read at each step: a
  // step on the page already open does not push it onto the history again.
  const where = useRef(pathname);
  useEffect(() => {
    where.current = pathname;
  }, [pathname]);

  useEffect(() => {
    if (!hint) return;
    rememberHinted();
    const timer = window.setTimeout(() => setHint(false), HINT_MS);
    return () => window.clearTimeout(timer);
  }, [hint]);

  // The control going away (a full page load leaving the demo) takes the tour with it.
  useEffect(() => () => tour.current?.stop(), []);

  const start = async () => {
    if (running) return;
    setRunning(true);
    setHint(false);
    try {
      const { runTour } = await import("./runTour");
      tour.current = runTour({
        navigate: (path) => navigate(path),
        t,
        currentPath: () => where.current,
        onEnd: () => {
          tour.current = null;
          setRunning(false);
        },
      });
    } catch {
      // The chunk did not come (offline, a deploy in between): it is
      // pressable again, and the next press tries again.
      setRunning(false);
    }
  };

  return { start, running, hint };
}
