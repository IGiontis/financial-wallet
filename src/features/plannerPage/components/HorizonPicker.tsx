import { useState } from "react";
import { Button, Input, Modal, ModalBody, ModalFooter, ModalHeader } from "reactstrap";
import { useTranslation } from "react-i18next";
import { FiMoreHorizontal } from "react-icons/fi";

import { asHorizon, MAX_HORIZON_MONTHS, MIN_HORIZON_MONTHS, PLANNER_HORIZONS, type PlannerHorizon } from "../plannerUtils";
import styles from "../css/PlannerPage.module.css";

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
            className={`${styles.horizonPill} ${current === option ? styles.horizonOn : ""}`}
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
