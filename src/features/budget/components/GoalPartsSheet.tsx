import { Modal, ModalBody, ModalHeader } from "reactstrap";
import { useTranslation } from "react-i18next";
import { fillParts, partsTotals } from "../goalParts";
import type { GoalPart } from "../../../shared/types/IndexTypes";
import styles from "./css/GoalParts.module.css";

/**
 * A goal's parts, opened from the 👁 on its card: what each holds of its
 * «έως», a mark where its «από» is, green once that is met. A view, so a tap
 * outside closes it.
 */
export function GoalPartsSheet({ name, parts, saved, formatCurrency, onClose }: { name: string; parts: GoalPart[]; saved: number; formatCurrency: (n: number) => string; onClose: () => void }) {
  const { t } = useTranslation();
  const totals = partsTotals(parts);
  const fills = fillParts(parts, saved);

  return (
    <Modal isOpen toggle={onClose} centered scrollable>
      <ModalHeader toggle={onClose}>{name}</ModalHeader>
      <ModalBody>
        <div className="d-flex justify-content-between mb-3" style={{ fontVariantNumeric: "tabular-nums" }}>
          <span className="text-body-secondary">{t("goals.partsSaved")}</span>
          <b>
            {formatCurrency(Math.min(saved, totals.max))} / {formatCurrency(totals.max)}
          </b>
        </div>
        <ul className={styles.list} aria-label={t("goals.partsTitle")}>
          {fills.map(({ part, filled, reachedMin }) => (
            <li key={part.id} className={`${styles.item} ${filled <= 0 ? styles.itemEmpty : ""} ${reachedMin ? styles.reached : ""}`}>
              <div className={styles.itemHead}>
                <span>{part.label}</span>
                <span>
                  {formatCurrency(filled)} / {formatCurrency(part.max)}
                </span>
              </div>
              <div className={styles.bar} aria-hidden>
                <span className={styles.fill} style={{ width: `${part.max > 0 ? (filled / part.max) * 100 : 0}%` }} />
                {part.min < part.max && <span className={styles.minMark} style={{ left: `${(part.min / part.max) * 100}%` }} />}
              </div>
            </li>
          ))}
        </ul>
        <p className={styles.legend}>{t("goals.partsLegend")}</p>
      </ModalBody>
    </Modal>
  );
}

export default GoalPartsSheet;
