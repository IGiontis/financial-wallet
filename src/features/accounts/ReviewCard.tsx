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
 * figure after takes the old version out and puts the new one in — 100
 * changed to 80 gives the card 20 back, changed to 140 takes 40 more. When the
 * last bank reading already counted the record, the reading is corrected the
 * same way (`adjust`, see `adjustCheckInsForEdit`); switched off, the reading
 * stands as the bank's word and the card says so.
 */
export default function ReviewCard({
  accountId,
  income,
  delta,
  editing,
  adjust,
}: {
  accountId: string;
  income: boolean;
  /** Signed, in the base currency. */
  delta?: number;
  /** For an edit: the record as stored, and as it will be saved. */
  editing?: { original: Transaction; changed: Transaction };
  /** For an edit the last reading counted: whether that reading is corrected too. */
  adjust?: { on: boolean; onChange: (on: boolean) => void };
}) {
  const { t, i18n } = useTranslation();
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
  let after: number | undefined;
  // The last reading already counted the record being edited.
  const counted = !!editing && !!latest && !isAfterReading(editing.original, latest.at);
  const changes = !!editing && (realDelta(editing.original) !== realDelta(editing.changed) || accountOf(editing.original, accounts, main) !== accountOf(editing.changed, accounts, main));
  const kept = counted && changes && adjust?.on === false;
  if (editing && now !== undefined) {
    const out = accountOf(editing.original, accounts, main) === account.id ? realDelta(editing.original) : 0;
    // The new version counts if it lands after the reading, or the reading is corrected to hold it.
    const lands = accountOf(editing.changed, accounts, main) === account.id && (isAfterReading(editing.changed, latest!.at) || (counted && adjust?.on !== false));
    after = kept ? now : Math.round((now - out + (lands ? realDelta(editing.changed) : 0)) * 100) / 100;
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
        {kept ? (
          <div className="text-body-secondary">{t("accounts.editInReading")}</div>
        ) : after !== undefined && (
          <div style={{ fontVariantNumeric: "tabular-nums" }}>
            {t(editing ? "accounts.afterEdit" : "accounts.afterThis")}{" "}
            <span className="fw-semibold" style={{ color: after < 0 ? "var(--color-expense-text)" : undefined }}>
              {formatCurrency(after)}
            </span>
          </div>
        )}
        {counted && changes && adjust && latest && (
          <div className="form-check form-switch mt-2">
            <input className="form-check-input" type="checkbox" role="switch" id="adjust-reading" checked={adjust.on} onChange={(e) => adjust.onChange(e.target.checked)} />
            <label className="form-check-label" htmlFor="adjust-reading">
              {t("accounts.adjustReading", { date: new Intl.DateTimeFormat(i18n.resolvedLanguage, { weekday: "short", day: "numeric", month: "short" }).format(latest.at) })}
            </label>
            <div className="text-body-secondary" style={{ fontSize: 11.5 }}>
              {t("accounts.adjustReadingHint")}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
