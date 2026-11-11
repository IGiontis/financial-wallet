import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import AccountPicker from "../accounts/AccountPicker";
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
  const moved = value !== undefined;
  const side = income ? "In" : "Out";

  return (
    <YesNoChoice
      question={t(`debts.moneyMoved${side}`)}
      hideQuestion={hideQuestion}
      className=""
      value={moved}
      // Choosing "yes" again keeps the card already picked.
      onChange={(yes) => onChange(yes ? (moved ? value : "") : undefined)}
      yesLabel={t(`debts.moneyMovedYes${side}`)}
      noLabel={t(`debts.moneyMovedNo${side}`)}
      yesHint={t("debts.moneyMovedYesHint")}
      noHint={t(`debts.noMoneyHint${side}`)}
      whenNo={toGoal ?? undefined}
    >
      <AccountPicker value={value ?? ""} onChoose={onChange} income={income} />
    </YesNoChoice>
  );
}
