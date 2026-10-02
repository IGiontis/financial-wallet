import { useState } from "react";
import { Button, Input, Modal, ModalBody, ModalFooter, ModalHeader } from "reactstrap";
import { useTranslation } from "react-i18next";
import { FiMoreHorizontal } from "react-icons/fi";

import { asHorizon, MAX_HORIZON_MONTHS, MIN_HORIZON_MONTHS, PLANNER_HORIZONS, type PlannerHorizon } from "../plannerUtils";
import styles from "../css/PlannerPage.module.css";

/** The pills a phone shows; the rest of `PLANNER_HORIZONS` sits behind "⋯" there. */
const PHONE_HORIZONS: readonly number[] = [1, 3, 6, 12];

interface HorizonPickerProps {
  horizon: PlannerHorizon;
  onChange: (horizon: PlannerHorizon) => void;
}

/**
 * How far ahead to look.
 *
 * Six offered lengths and a way to type any other. It used to be four fixed
 * names, which meant "what do the next three years look like?" was not a
 * question the page could be asked — though the answer was never a different
 * calculation, only a different number.
 *
 * A horizon that is not one of the six still gets a pill of its own rather than
 * leaving the row with nothing selected while the figures below it plainly
 * belong to something.
 *
 * On a phone only the first four are pills: «1μ 3μ 6μ 1χρ ⋯». Six pills and
 * the "⋯" filled the row edge to edge, and the two and three years are the
 * rarest asks — they wait inside "⋯", one tap away, with any other length.
 */
export function HorizonPicker({ horizon, onChange }: HorizonPickerProps) {
  const { t } = useTranslation();
  // Whole years read as years; everything else reads as months.
  const label = (months: number) => (months >= 12 && months % 12 === 0 ? t("planner.horizonYears", { count: months / 12 }) : t("planner.horizonMonths", { count: months }));
  const [asking, setAsking] = useState(false);
  const [typed, setTyped] = useState("");

  const current = asHorizon(horizon);
  const offered = PLANNER_HORIZONS.includes(current) ? PLANNER_HORIZONS : [...PLANNER_HORIZONS, current].sort((a, b) => a - b);

  const months = parseInt(typed, 10);
  const valid = Number.isFinite(months) && months >= MIN_HORIZON_MONTHS && months <= MAX_HORIZON_MONTHS;

  const commit = () => {
    if (!valid) return;
    onChange(asHorizon(months));
    setAsking(false);
    setTyped("");
  };

  return (
    <>
      <div className={styles.horizonRow} role="group" aria-label={t("planner.horizonLabel")}>
        {offered.map((option) => (
          <button
            key={option}
            type="button"
            // The long ones only from a tablet up, unless one of them is the horizon in use.
            className={`${styles.horizonPill} ${current === option ? styles.horizonOn : ""} ${PHONE_HORIZONS.includes(option) || current === option ? "" : "d-none d-md-inline-block"}`}
            aria-pressed={current === option}
            onClick={() => onChange(option)}
          >
            {label(option)}
          </button>
        ))}

        <button type="button" className={styles.horizonPill} onClick={() => setAsking(true)} aria-label={t("planner.horizonCustom")} title={t("planner.horizonCustom")}>
          <FiMoreHorizontal size={14} aria-hidden />
        </button>
      </div>

      {asking && (
        <Modal isOpen toggle={() => setAsking(false)} centered size="sm">
          <ModalHeader toggle={() => setAsking(false)}>
            <span style={{ fontSize: 15 }}>{t("planner.horizonCustom")}</span>
          </ModalHeader>
          <ModalBody className="pt-2" onKeyDown={(e) => e.key === "Enter" && commit()}>
            {/* The lengths a phone has no pill for, as one tap each. */}
            <div className="d-flex flex-wrap gap-2 mb-3">
              {PLANNER_HORIZONS.filter((option) => !PHONE_HORIZONS.includes(option)).map((option) => (
                <Button
                  key={option}
                  size="sm"
                  color={current === option ? "primary" : "secondary"}
                  outline={current !== option}
                  onClick={() => {
                    onChange(option);
                    setAsking(false);
                  }}
                >
                  {label(option)}
                </Button>
              ))}
            </div>
            <label className={styles.fieldLabel} htmlFor="horizon-months">
              {t("planner.horizonMonthsLabel")}
            </label>
            <Input
              id="horizon-months"
              autoFocus
              type="number"
              inputMode="numeric"
              min={MIN_HORIZON_MONTHS}
              max={MAX_HORIZON_MONTHS}
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              placeholder={String(current)}
            />
            <p className={styles.fieldHint}>{t("planner.horizonHint", { max: MAX_HORIZON_MONTHS, years: MAX_HORIZON_MONTHS / 12 })}</p>
          </ModalBody>
          <ModalFooter>
            <Button color="secondary" outline onClick={() => setAsking(false)}>
              {t("common.cancel")}
            </Button>
            <Button color="primary" onClick={commit} disabled={!valid}>
              {t("common.save")}
            </Button>
          </ModalFooter>
        </Modal>
      )}
    </>
  );
}

export default HorizonPicker;
