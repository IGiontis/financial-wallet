import { useTranslation } from "react-i18next";
import { FiPlay } from "react-icons/fi";
import { isDemo } from "../demoMode";
import { useNarrowScreen } from "../../shared/hooks/useNarrowScreen";
import { useGuidedTour } from "./useGuidedTour";
import styles from "./css/GuidedTourButton.module.css";

// ─── «▶ Ξενάγηση» ────────────────────────────────────────────────────────────
//
// The demo's tour of itself, from the top bar, beside the «DEMO» chip. Drawn
// only in the demo, and only from a tablet up: on a phone the bar has no room
// for it, and the tour is an item in the chip's menu instead (`DemoBadge`).
// What starting it does is `useGuidedTour`'s.

export function GuidedTourButton() {
  const { t } = useTranslation();
  const narrow = useNarrowScreen();
  const { start, running, hint } = useGuidedTour(!narrow);

  if (!isDemo() || narrow) return null;

  const label = t("guidedTour.button");
  return (
    <button type="button" className={`${styles.button} ${hint ? styles.hint : ""}`} onClick={start} disabled={running} title={t("guidedTour.buttonTitle")} data-demo="tour-button">
      <FiPlay className={styles.icon} aria-hidden />
      <span className={styles.label}>{label}</span>
    </button>
  );
}

export default GuidedTourButton;
