import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useLocation, useNavigate } from "react-router-dom";
import { FiPlay } from "react-icons/fi";
import { isDemo } from "../demoMode";
import type { TourHandle } from "./runTour";
import styles from "./css/GuidedTourButton.module.css";

// ─── «▶ Ξενάγηση» ────────────────────────────────────────────────────────────
//
// The demo's tour of itself, from the top bar, beside the «DEMO» chip. Drawn
// only in the demo; a real account never sees it, and never downloads it: the
// tour and its library are fetched the moment the button is pressed, and not
// before (see `runTour`).
//
// It never starts by itself. The most it does unasked is a few soft rings
// round the button on the first visit, so whoever has just arrived knows it
// is there.

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

export function GuidedTourButton() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [running, setRunning] = useState(false);
  const [hint, setHint] = useState(() => isDemo() && !hintedBefore());
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

  // The top bar going away (a full page load leaving the demo) takes the tour with it.
  useEffect(() => () => tour.current?.stop(), []);

  if (!isDemo()) return null;

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
      // The chunk did not come (offline, a deploy in between): the button is
      // pressable again, and the next press tries again.
      setRunning(false);
    }
  };

  const label = t("guidedTour.button");
  return (
    <button type="button" className={`${styles.button} ${hint ? styles.hint : ""}`} onClick={start} disabled={running} title={t("guidedTour.buttonTitle")} data-demo="tour-button">
      <FiPlay className={styles.icon} aria-hidden />
      <span className={styles.label}>{label}</span>
    </button>
  );
}

export default GuidedTourButton;
