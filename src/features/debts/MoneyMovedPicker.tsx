import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import AccountPicker from "../accounts/AccountPicker";
import { useAccountList } from "../accounts/useMoneyAccounts";
import { YesNoChoice } from "../../shared/components/YesNoChoice";

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
 *
 * «Ναι» then asks where (item 97a): a card or cash must be chosen — there is
 * no «no particular card» — and `invalid` shows the error once the step was
 * left without one. `""` is «Ναι» with nothing chosen yet.
 *
 * `null` is not answered yet: on a new record neither tile starts chosen (the
 * owner's no-prefill rule covers tiles too), and `invalid` then asks for an
 * answer. Never saved — the forms block until it is answered.
 */
export function MoneyMovedPicker({
  value,
  onChange,
  income,
  toGoal,
  hideQuestion = false,
  invalid = false,
}: {
  value: string | undefined | null;
  onChange: (next: string | undefined) => void;
  income: boolean;
  /** Money borrowed that went straight to a goal — offered only where a new debt is being written. */
  toGoal?: ReactNode;
  /** The surrounding step already asks the question as its title. */
  hideQuestion?: boolean;
  /** The step was left unanswered, or on «Ναι» without a card: say so. */
  invalid?: boolean;
}) {
  const { t } = useTranslation();
  const answered = value !== null;
  const moved = typeof value === "string";
  const hasPlaces = useAccountList().length > 0;
  const side = income ? "In" : "Out";

  const choice = (
    <YesNoChoice
      question={t(`debts.moneyMoved${side}`)}
      hideQuestion={hideQuestion}
      className=""
      value={answered ? moved : undefined}
      // Choosing "yes" again keeps the card already picked.
      onChange={(yes) => onChange(yes ? (typeof value === "string" ? value : "") : undefined)}
      yesLabel={t(`debts.moneyMovedYes${side}`)}
      noLabel={t(`debts.moneyMovedNo${side}`)}
      yesHint={t("debts.moneyMovedYesHint")}
      noHint={t(`debts.noMoneyHint${side}`)}
      whenNo={toGoal ?? undefined}
    >
      {hasPlaces && (
        <p className="fw-semibold mb-2" style={{ fontSize: "var(--fs-text)" }}>
          {t(income ? "accounts.askIn" : "accounts.askOut")}
        </p>
      )}
      <AccountPicker value={value ?? ""} onChoose={onChange} income={income} invalid={invalid && moved} />
    </YesNoChoice>
  );
  return answered || !invalid ? choice : (
    <>
      {choice}
      <div className="invalid-feedback d-block mt-2">{t("debts.addWizard.answerNeeded")}</div>
    </>
  );
}
