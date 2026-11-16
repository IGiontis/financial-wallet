import { useState } from "react";
import { Button, Input, InputGroup, InputGroupText, Modal, ModalBody, ModalHeader } from "reactstrap";
import { useTranslation } from "react-i18next";
import { FiCalendar, FiCheck, FiRotateCcw, FiSlash } from "react-icons/fi";
import { DateField } from "../../../shared/components/DateField";
import { useCurrencyConverter } from "../../../shared/hooks/useCurrencyConverter";
import { toISODay } from "../../../shared/utils/dates";
import type { OccurrenceOverride } from "../../plannerPage/plannerActuals";
import type { Income, IncomeStatus } from "../incomesUtils";
import type { IncomeFormats } from "../incomeText";
import styles from "../css/IncomesPage.module.css";
import { FORM_MODAL } from "../../../shared/components/formModal";
import { useFormChanged } from "../../../shared/hooks/useFormChanged";
import { UnchangedHint } from "../../../shared/components/UnchangedHint";
import { asNumber } from "../../../shared/utils/sameValues";
import { currencySymbol } from "../../../shared/utils/currency";

// «Αυτή τη φορά…», from a row's ⋮: what can be said about one time only — it
// comes on another day, with another amount, or not at all — as on the
// Planner, whose store it writes to. Kept off the income's card, which is for
// reading.

type Mode = "menu" | "date" | "amount";

export default function ThisTimeSheet({
  income,
  status,
  formatCurrency,
  f,
  onClose,
  onArrive,
  onSay,
}: {
  income: Income;
  status: IncomeStatus;
  formatCurrency: (n: number) => string;
  f: IncomeFormats;
  onClose: () => void;
  onArrive: (income: Income, status: IncomeStatus) => void;
  /** Says something about this time, or (`undefined`) takes it back. */
  onSay: (key: string, value: OccurrenceOverride | undefined) => void;
}) {
  const { t } = useTranslation();
  const { convert, convertToBase, baseCurrency, displayCurrency } = useCurrencyConverter();
  const sign = currencySymbol(displayCurrency);
  const [mode, setMode] = useState<Mode>("menu");
  const [dateValue, setDateValue] = useState(() => toISODay(status.expectedDate));
  const [amountValue, setAmountValue] = useState(() => String(Number(convert(status.expected).toFixed(2))));
  const typed = Number(amountValue.replace(",", "."));
  // «No change, no Save»: the day or the amount it is already expected with
  // says nothing new about this time.
  const { unchanged: sameDay } = useFormChanged(toISODay(status.expectedDate), dateValue);
  const { unchanged: sameAmount } = useFormChanged(Number(convert(status.expected).toFixed(2)), asNumber(amountValue));

  const say = (value: OccurrenceOverride | undefined) => {
    onSay(status.key, value);
    onClose();
  };

  return (
    <Modal {...FORM_MODAL} isOpen toggle={onClose} centered size="sm">
      <ModalHeader toggle={onClose} tag="div" className="w-100">
        <div className="fw-semibold">{t("incomes.thisTime.title", { name: income.name })}</div>
        <div className="text-body-secondary" style={{ fontSize: "var(--fs-text)" }}>
          {f.weekdayDate.format(status.expectedDate)} · {status.approximate ? "≈" : ""}
          {formatCurrency(status.expected)}
        </div>
      </ModalHeader>
      <ModalBody>
        {mode === "date" && (
          <div className="d-flex gap-2 align-items-start">
            <div style={{ flex: 1 }}>
              <DateField value={dateValue} onChange={setDateValue} small />
            </div>
            <Button color="primary" size="sm" disabled={!dateValue || sameDay} onClick={() => say({ date: dateValue })}>
              {t("common.save")}
            </Button>
          </div>
        )}
        {mode === "date" && <UnchangedHint show={sameDay} className="d-block mt-1" />}

        {mode === "amount" && (
          <div className="d-flex gap-2 align-items-start">
            <InputGroup size="sm">
              <Input type="number" min={0.01} step={0.01} inputMode="decimal" value={amountValue} onChange={(e) => setAmountValue(e.target.value)} aria-label={t("incomes.card.otherAmount")} />
              <InputGroupText>{sign}</InputGroupText>
            </InputGroup>
            <Button color="primary" size="sm" disabled={!(typed > 0) || sameAmount} onClick={() => say({ amount: Math.round((baseCurrency === displayCurrency ? typed : convertToBase(typed)) * 100) / 100 })}>
              {t("common.save")}
            </Button>
          </div>
        )}
        {mode === "amount" && <UnchangedHint show={sameAmount} className="d-block mt-1" />}

        {mode === "menu" && (
          <div className={styles.choices}>
            {status.canArrive && (
              <button
                type="button"
                className={`${styles.choice} ${styles.choiceArrive}`}
                onClick={() => {
                  onClose();
                  onArrive(income, status);
                }}
              >
                <FiCheck aria-hidden className={styles.choiceIcon} />
                {t("incomes.arrive")}
              </button>
            )}
            <button type="button" className={styles.choice} onClick={() => setMode("date")}>
              <FiCalendar aria-hidden className={styles.choiceIcon} />
              {t("incomes.card.otherDay")}
            </button>
            <button type="button" className={styles.choice} onClick={() => setMode("amount")}>
              <span aria-hidden className={styles.choiceIcon}>
                {sign}
              </span>
              {t("incomes.card.otherAmount")}
            </button>
            <button type="button" className={`${styles.choice} ${styles.choiceSkip}`} onClick={() => say({ state: "skipped" })}>
              <FiSlash aria-hidden className={styles.choiceIcon} />
              {t("incomes.card.notThisTime")}
            </button>
            {status.overridden && (
              <button type="button" className={styles.choice} onClick={() => say(undefined)}>
                <FiRotateCcw aria-hidden className={styles.choiceIcon} />
                {t("incomes.thisTime.undo")}
              </button>
            )}
            <div className="text-body-secondary" style={{ fontSize: "var(--fs-small)" }}>
              {t("incomes.card.thisTimeOnly")}
            </div>
          </div>
        )}
      </ModalBody>
    </Modal>
  );
}
