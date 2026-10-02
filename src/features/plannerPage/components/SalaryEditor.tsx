import { Button, Input, InputGroup, InputGroupText, Modal, ModalBody, ModalFooter, ModalHeader } from "reactstrap";
import { useTranslation } from "react-i18next";

import type { SalaryInput } from "../../../shared/hooks/useSalary";
import type { SalaryPattern } from "../plannerUtils";
import styles from "../css/PlannerPage.module.css";

interface SalaryEditorProps {
  input: SalaryInput;
  onInput: (value: SalaryInput) => void;
  /** What the transactions suggest — the placeholder, and the way back. */
  detected?: SalaryPattern;
  isManual: boolean;
  baseCurrency: string;
  formatCurrency: (n: number) => string;
  onClose: () => void;
}

/**
 * The salary's amount and day, in a dialog of their own.
 *
 * They used to be two boxes open at the top of the income list, the only row
 * of the page that was a form. Now the salary is a row like every other — its
 * switch on the right, "1.450,00 € · on the 30th · ×3" under its name — and
 * this opens from it, the same way a line of your own opens its editor.
 *
 * The boxes still write straight through, as they did: the plan behind them
 * waits for the typing to stop, so there is nothing to confirm.
 */
export function SalaryEditor({ input, onInput, detected, isManual, baseCurrency, formatCurrency, onClose }: SalaryEditorProps) {
  const { t } = useTranslation();

  return (
    <Modal isOpen toggle={onClose} centered size="sm">
      <ModalHeader toggle={onClose}>
        <span style={{ fontSize: 15 }}>{t("planner.salaryLabel")}</span>
      </ModalHeader>
      <ModalBody className="pt-2">
        <p className={styles.fieldHint} style={{ marginTop: 0, marginBottom: 12 }}>
          {isManual ? t("planner.salaryHintSet") : detected ? t("planner.salaryHintDetected") : t("planner.salaryHintNone")}
        </p>

        <label className={styles.fieldLabel} htmlFor="salary-amount">
          {t("planner.salaryAmount")}
        </label>
        <InputGroup className="mb-3">
          <Input
            id="salary-amount"
            type="number"
            min={0}
            inputMode="decimal"
            placeholder={detected ? String(detected.amount) : "0"}
            value={input.amount}
            onChange={(e) => onInput({ ...input, amount: e.target.value })}
            style={{ fontSize: 16 }}
          />
          <InputGroupText>{baseCurrency}</InputGroupText>
        </InputGroup>

        <label className={styles.fieldLabel} htmlFor="salary-day">
          {t("planner.salaryDay")}
        </label>
        <Input
          id="salary-day"
          type="number"
          min={1}
          max={31}
          inputMode="numeric"
          placeholder={detected ? String(detected.dayOfMonth) : "1"}
          value={input.day}
          onChange={(e) => onInput({ ...input, day: e.target.value })}
          style={{ fontSize: 16 }}
        />

        {isManual && detected && (
          <button type="button" className={`${styles.linkButton} mt-3`} onClick={() => onInput({ amount: "", day: "" })}>
            {t("planner.salaryReset", { amount: formatCurrency(detected.amount), day: detected.dayOfMonth })}
          </button>
        )}
      </ModalBody>
      <ModalFooter>
        <Button color="primary" onClick={onClose}>
          {t("common.close")}
        </Button>
      </ModalFooter>
    </Modal>
  );
}

export default SalaryEditor;
