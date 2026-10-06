import { useMemo } from "react";
import type { Transaction } from "../../shared/types/IndexTypes";
import { isAfterReading } from "../../shared/utils/balance";
import { useTranslation } from "react-i18next";
import { useCurrencyConverter } from "../../shared/hooks/useCurrencyConverter";
import { useMoneyAccounts } from "./useMoneyAccounts";
import { accountOf, expectedByAccount, mainAccount, realDelta } from "./accountsUtils";
import { accountFinishes } from "./accountTones";
import { BankCard, NoCard } from "./BankCard";

/**
 * The card a transaction is about to be saved against, shown on the review
 * step as the card itself rather than its name in a sentence — the same small
 * card that was tapped two steps earlier, so the read-back is recognised at a
 * glance.
 *
 * With `delta`, it also says what the card will hold once this is saved. That
 * is the question behind choosing a card at all ("is there enough on it?"),
 * and answering it here spares the reader the subtraction.
 *
 * Editing (`editing`): the record is already in what the card holds, so the
 * figure after is worked out without the old version and with the new one —
 * 100 changed to 110 takes 10 more, not 110 more. And a record that sits
 * before the last bank reading moves nothing: the reading is what the bank
 * said, so the card says that instead of a figure that will not change.
 */
export default function ReviewCard({
  accountId,
  income,
  delta,
  editing,
}: {
  accountId: string;
  income: boolean;
  /** Signed, in the base currency. */
  delta?: number;
  /** For an edit: the record as stored, and as it will be saved. */
  editing?: { original: Transaction; changed: Transaction };
}) {
  const { t } = useTranslation();
  const { format: formatCurrency } = useCurrencyConverter();
  const { accounts, latest, transactions } = useMoneyAccounts();
  const holds = useMemo(() => expectedByAccount(accounts, latest, transactions), [accounts, latest, transactions]);
  // Without the record being edited: the ground the new version lands on.
  const withoutIt = useMemo(
    () => (editing ? expectedByAccount(accounts, latest, transactions.filter((tx) => tx.id !== editing.original.id)) : undefined),
    [editing, accounts, latest, transactions],
  );
  if (accounts.length === 0) return null;

  const account = accounts.find((a) => a.id === accountId);
  const main = mainAccount(accounts);
  const label = t(income ? "accounts.reviewIntoLabel" : "accounts.reviewFromLabel");

  if (!account) {
    return (
      <div className="d-flex align-items-center gap-3 mt-3">
        <div style={{ width: 128, flexShrink: 0 }}>
          <NoCard title={t("accounts.noCard")} compact />
        </div>
        <div className="small" style={{ minWidth: 0 }}>
          <div className="text-body-secondary">{label}</div>
          <div className="fw-semibold">{t("accounts.noCard")}</div>
          {main && <div className="text-body-secondary">{t("accounts.noCardHint", { name: main.name })}</div>}
        </div>
      </div>
    );
  }

  const now = holds[account.id];
  let after: number | undefined;
  let inReading = false;
  if (editing && withoutIt) {
    const base = withoutIt[account.id];
    const counts = !!latest && isAfterReading(editing.changed, latest.at) && accountOf(editing.changed, accounts, main) === account.id;
    inReading = !!latest && !isAfterReading(editing.changed, latest.at);
    after = base === undefined ? undefined : Math.round((base + (counts ? realDelta(editing.changed) : 0)) * 100) / 100;
  } else if (now !== undefined && delta !== undefined) {
    after = Math.round((now + delta) * 100) / 100;
  }

  return (
    <div className="d-flex align-items-center gap-3 mt-3">
      <div style={{ width: 128, flexShrink: 0 }}>
        <BankCard name={account.name} kind={account.kind} finish={accountFinishes(accounts)[account.id]} amount={now !== undefined ? formatCurrency(now) : undefined} compact />
      </div>
      <div className="small" style={{ minWidth: 0 }}>
        <div className="text-body-secondary">{label}</div>
        <div className="fw-semibold">{account.name}</div>
        {inReading ? (
          <div className="text-body-secondary">{t("accounts.editInReading")}</div>
        ) : after !== undefined && (
          <div style={{ fontVariantNumeric: "tabular-nums" }}>
            {t(editing ? "accounts.afterEdit" : "accounts.afterThis")}{" "}
            <span className="fw-semibold" style={{ color: after < 0 ? "var(--color-expense-text)" : undefined }}>
              {formatCurrency(after)}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
