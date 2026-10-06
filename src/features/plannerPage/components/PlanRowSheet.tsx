import { Modal, ModalBody, ModalHeader, Table } from "reactstrap";
import { useTranslation } from "react-i18next";
import type { PlanRow } from "../plannerUtils";
import styles from "../css/PlannerPage.module.css";

/** One fact about a row: what it is called, and its value. */
export type RowFact = [label: string, value: string];

/**
 * What a row in "your figures" is made of, for the rows that have no editor
 * here — bills, goals, instalments: the app keeps those, so their sheet reads
 * rather than edits, and keeps the one thing that can be changed here, the
 * switch.
 *
 * The list itself shows a name, an amount and a switch. Everything that used
 * to run under the name — per month, how many times, the season, why a row is
 * zero — is here, in two columns.
 */
export function PlanRowSheet({ row, facts, onToggle, onClose }: { row: PlanRow; facts: RowFact[]; onToggle: () => void; onClose: () => void }) {
  const { t } = useTranslation();

  return (
    <Modal isOpen toggle={onClose} centered size="sm">
      <ModalHeader toggle={onClose}>
        <span style={{ fontSize: 15 }}>{row.label}</span>
      </ModalHeader>
      <ModalBody>
        <Table size="sm" borderless className={`${styles.sheetTable} mb-3`}>
          <tbody>
            {facts.map(([label, value]) => (
              <tr key={label}>
                <th scope="row" className="fw-normal text-body-secondary">
                  {label}
                </th>
                <td className="text-end fw-semibold" style={{ whiteSpace: "normal" }}>
                  {value}
                </td>
              </tr>
            ))}
          </tbody>
        </Table>
        <div className="form-check form-switch">
          <input className="form-check-input" type="checkbox" role="switch" id="plan-row-sheet-switch" checked={row.enabled} onChange={onToggle} />
          <label className="form-check-label small" htmlFor="plan-row-sheet-switch">
            {t("planner.rowInPlan")}
          </label>
        </div>
      </ModalBody>
    </Modal>
  );
}

export default PlanRowSheet;
