import { useId } from "react";
import { Input, Label } from "reactstrap";
import { useTranslation } from "react-i18next";

/** The longest a note may be — the security rules' limit on `notes`. */
export const NOTE_MAX = 1000;

/**
 * «Σχόλιο»: why, or how, a payment happened, in the user's own words — read
 * back in the history, so that months later the reason is still there.
 */
export function PaymentNote({ value, onChange, className, small }: { value: string; onChange: (value: string) => void; className?: string; small?: boolean }) {
  const { t } = useTranslation();
  const id = useId();
  return (
    <div className={className}>
      <Label for={id} className="small fw-medium mb-1">
        {t("debts.note")} <span className="text-body-secondary fw-normal">{t("debts.noteOptional")}</span>
      </Label>
      <Input
        id={id}
        type="textarea"
        rows={2}
        bsSize={small ? "sm" : undefined}
        maxLength={NOTE_MAX}
        value={value}
        placeholder={t("debts.notePlaceholder")}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}

export default PaymentNote;
