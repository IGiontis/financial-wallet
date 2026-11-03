import { Modal, ModalBody, ModalHeader } from "reactstrap";
import { useTranslation } from "react-i18next";
import { fillParts, partsTotals, type PartFill } from "../goalParts";
import type { GoalPart } from "../../../shared/types/IndexTypes";
import styles from "./css/GoalParts.module.css";

/**
 * A part's bar in two stages: solid up to its «από», lighter above it up to
 * what it holds, the track up to its «έως». Shared by the sheet's rows and the
 * card's thin bar, so the two always say the same thing.
 */
export function PartStages({ min, max, filled }: { min: number; max: number; filled: number }) {
  const share = (n: number) => (max > 0 ? `${(Math.max(Math.min(n, max), 0) / max) * 100}%` : "0%");
  return (
    <>
      <span className={styles.stageMin} style={{ width: share(Math.min(filled, min)) }} />
      {filled > min && <span className={styles.stageExtra} style={{ left: share(min), width: share(filled - min) }} />}
    </>
  );
}

const stateKey = ({ filled, reachedMin, full }: PartFill) =>
  full ? "goals.partStateFull" : reachedMin ? "goals.partStateMin" : filled > 0 ? "goals.partStateFilling" : "goals.partStateEmpty";

/**
 * A goal's parts, opened from its card: a row each — its name and what it
 * holds of its «έως», its bar in two stages, its range and where it stands.
 * A view, so a tap outside closes it.
 */
export function GoalPartsSheet({ name, parts, saved, formatCurrency, onClose }: { name: string; parts: GoalPart[]; saved: number; formatCurrency: (n: number) => string; onClose: () => void }) {
  const { t } = useTranslation();
  const totals = partsTotals(parts);
  const fills = fillParts(parts, saved);

  return (
    <Modal isOpen toggle={onClose} centered scrollable>
      <ModalHeader toggle={onClose}>{name}</ModalHeader>
      <ModalBody>
        <div className={styles.summary}>
          <span className="text-body-secondary">{t("goals.partsSaved")}</span>
          <b className={styles.money}>
            {formatCurrency(Math.min(saved, totals.max))} / {formatCurrency(totals.max)}
          </b>
        </div>
        <p className={styles.summaryRange}>{t("goals.partRange", { min: formatCurrency(totals.min), max: formatCurrency(totals.max) })}</p>

        <ul className={styles.list} aria-label={t("goals.partsTitle")}>
          {fills.map((fill) => {
            const { part, filled, reachedMin } = fill;
            return (
              <li key={part.id} className={`${styles.item} ${filled <= 0 ? styles.itemEmpty : ""} ${reachedMin ? styles.reached : ""}`}>
                <div className={styles.itemHead}>
                  <span className={styles.itemName}>{part.label}</span>
                  <span className={styles.money}>
                    {formatCurrency(filled)} / {formatCurrency(part.max)}
                  </span>
                </div>
                <div className={styles.bar} aria-hidden>
                  <PartStages min={part.min} max={part.max} filled={filled} />
                  {part.min < part.max && <span className={styles.minMark} style={{ left: `${(part.min / part.max) * 100}%` }} />}
                </div>
                <div className={styles.itemMeta}>
                  <span className={styles.money}>
                    {part.min < part.max ? t("goals.partRange", { min: formatCurrency(part.min), max: formatCurrency(part.max) }) : t("goals.partFixed", { max: formatCurrency(part.max) })}
                  </span>
                  <span className={styles.state}>{t(stateKey(fill))}</span>
                </div>
              </li>
            );
          })}
        </ul>
        <p className={styles.legend}>{t("goals.partsFillRule")}</p>
        <p className={styles.legend}>{t("goals.partsLegend")}</p>
      </ModalBody>
    </Modal>
  );
}

export default GoalPartsSheet;
