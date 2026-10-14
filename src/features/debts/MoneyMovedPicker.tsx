import { useId } from "react";
import { FormGroup, Input, Label } from "reactstrap";
import { useTranslation } from "react-i18next";
import AccountPicker from "../accounts/AccountPicker";

/**
 * Did money actually change hands — and if so, through which card?
 *
 * A debt is not always money handed over. A friend can owe you for the dinner
 * you paid last month, you can owe someone for what they bought you, a loan
 * can be settled in kind or forgiven. Those are debts with no card moving, and
 * forcing a card on them put money into an account that never received it.
 *
 * Switched on (the usual case, and where a new debt starts), it is the
 * ordinary card choice and moves that card. Switched off, `undefined`: only
 * the debt is written, and no transaction with it — see `debtCashRecords`.
 */
export function MoneyMovedPicker({ value, onChange, income }: { value: string | undefined; onChange: (next: string | undefined) => void; income: boolean }) {
  const { t } = useTranslation();
  const id = useId();
  const moved = value !== undefined;

  return (
    <div>
      <FormGroup switch className="mb-2">
        <Input type="switch" id={id} checked={moved} onChange={(e) => onChange(e.target.checked ? "" : undefined)} />
        <Label for={id} check className="small fw-medium">
          {t(income ? "debts.moneyMovedIn" : "debts.moneyMovedOut")}
        </Label>
      </FormGroup>
      {moved ? (
        <AccountPicker value={value} onChoose={onChange} income={income} />
      ) : (
        <p className="small text-body-secondary mb-0">{t("debts.noMoneyHint")}</p>
      )}
    </div>
  );
}
