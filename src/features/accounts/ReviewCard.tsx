import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useCurrencyConverter } from "../../shared/hooks/useCurrencyConverter";
import { useMoneyAccounts } from "./useMoneyAccounts";
import { expectedByAccount, mainAccount } from "./accountsUtils";
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
 */
export default function ReviewCard({ accountId, income, delta }: { accountId: string; income: boolean; /** Signed, in the base currency. */ delta?: number }) {
  const { t } = useTranslation();
  const { format: formatCurrency } = useCurrencyConverter();
  const { accounts, latest, transactions } = useMoneyAccounts();
  const holds = useMemo(() => expectedByAccount(accounts, latest, transactions), [accounts, latest, transactions]);
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
  const after = now !== undefined && delta !== undefined ? Math.round((now + delta) * 100) / 100 : undefined;

  return (
    <div className="d-flex align-items-center gap-3 mt-3">
      <div style={{ width: 128, flexShrink: 0 }}>
        <BankCard name={account.name} kind={account.kind} finish={accountFinishes(accounts)[account.id]} amount={now !== undefined ? formatCurrency(now) : undefined} compact />
      </div>
      <div className="small" style={{ minWidth: 0 }}>
        <div className="text-body-secondary">{label}</div>
        <div className="fw-semibold">{account.name}</div>
        {after !== undefined && (
          <div style={{ fontVariantNumeric: "tabular-nums" }}>
            {t("accounts.afterThis")}{" "}
            <span className="fw-semibold" style={{ color: after < 0 ? "var(--color-expense-text)" : undefined }}>
              {formatCurrency(after)}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
