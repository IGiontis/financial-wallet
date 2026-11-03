import { useId, type ReactNode } from "react";
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
 * Asked as a plain question with two answers rather than a switch, which was
 * not understood: «Ναι, σε/από κάρτα ή μετρητά» opens the ordinary card choice
 * and moves that card; «Όχι» is `undefined`, and only the debt is written, no
 * transaction with it — see `debtCashRecords`. The "no" is worded from the
 * side the money would have gone: coming in, the other person paid for you;
 * going out, you paid for them. That reads right for a new debt and for a
 * repayment made in kind alike.
 */
export function MoneyMovedPicker({
  value,
  onChange,
  income,
  toGoal,
  hideQuestion = false,
}: {
  value: string | undefined;
  onChange: (next: string | undefined) => void;
  income: boolean;
  /** Money borrowed that went straight to a goal — offered only where a new debt is being written. */
  toGoal?: ReactNode;
  /** The surrounding step already asks the question as its title. */
  hideQuestion?: boolean;
}) {
  const { t } = useTranslation();
  const questionId = useId();
  const moved = value !== undefined;
  const side = income ? "In" : "Out";
  const question = t(`debts.moneyMoved${side}`);

  const tile = (yes: boolean) => {
    const on = moved === yes;
    return (
      <button
        type="button"
        role="radio"
        aria-checked={on}
        className={`btn text-start h-100 w-100 ${on ? "btn-primary" : "btn-outline-secondary"}`}
        // Choosing "yes" again keeps the card already picked.
        onClick={() => onChange(yes ? (moved ? value : "") : undefined)}
      >
        <span className="d-block fw-semibold">{t(`debts.moneyMoved${yes ? "Yes" : "No"}${side}`)}</span>
        <span className="d-block small">{t(yes ? "debts.moneyMovedYesHint" : `debts.noMoneyHint${side}`)}</span>
      </button>
    );
  };

  return (
    <div>
      {!hideQuestion && (
        <div id={questionId} className="small fw-medium mb-2">
          {question}
        </div>
      )}
      <div className="row row-cols-1 row-cols-sm-2 g-2 mb-3" role="radiogroup" aria-label={hideQuestion ? question : undefined} aria-labelledby={hideQuestion ? undefined : questionId}>
        <div className="col">{tile(true)}</div>
        <div className="col">{tile(false)}</div>
      </div>
      {moved ? <AccountPicker value={value} onChoose={onChange} income={income} /> : toGoal}
    </div>
  );
}
