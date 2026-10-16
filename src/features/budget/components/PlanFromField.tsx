import { useId } from "react";
import { FormFeedback, FormGroup, Label } from "reactstrap";
import { useTranslation } from "react-i18next";
import { FiCalendar } from "react-icons/fi";
import { DateField } from "../../../shared/components/DateField";

/**
 * "I'll start putting money in from…" — optional, and for the Planner alone.
 *
 * Without it the Planner asks a goal for money from today. Someone saving for
 * the summer from January wants October to December left alone, and the months
 * from January to share the target instead. Money can still go in earlier: the
 * field changes what is planned, not what can be done — the hint says so, so
 * nobody reads it as a lock.
 */
export function PlanFromField({ value, onChange, error, maxDate }: { value: string; onChange: (value: string) => void; error?: string; maxDate?: Date }) {
  const { t } = useTranslation();
  const id = useId();

  return (
    <FormGroup className="mb-0 mt-3">
      <Label for={id} style={{ fontSize: 13, fontWeight: 500 }} className="d-flex align-items-center gap-1">
        <FiCalendar size={13} aria-hidden /> {t("goals.planFrom")}
      </Label>
      <DateField id={id} value={value} onChange={onChange} clearable placeholder={t("goals.planFromPlaceholder")} minDate={new Date()} maxDate={maxDate} invalid={!!error} />
      {error && <FormFeedback className="d-block">{error}</FormFeedback>}
      <p className="small text-body-secondary mt-1 mb-0">{t("goals.planFromHint")}</p>
    </FormGroup>
  );
}

export default PlanFromField;
