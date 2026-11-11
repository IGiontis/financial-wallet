import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useCurrencyConverter } from "../../shared/hooks/useCurrencyConverter";
import { useMoneyAccounts } from "./useMoneyAccounts";
import { chosenAccount, expectedByAccount, mainAccount, orderByFree, type FreeMoney } from "./accountsUtils";
import { accountFinishes } from "./accountTones";
import { BankCard } from "./BankCard";
import styles from "./css/BankCard.module.css";

/**
 * Which card paid — or which account the money went into — as a step of its
 * own in a money form.
 *
 * The answer is required (item 97a): there is no «no particular card» any
 * more, and nothing starts chosen — a default once kept a card unchanged for
 * money that had in fact left it. With exactly one place (only cash, say)
 * that one is shown chosen: there is nothing to decide. See `chosenAccount`.
 *
 * Cash first, then, under a rule, the cards — small, name and balance only —
 * each showing what it holds now, the same estimate as the Banks & cash page,
 * so choosing is also a glance at what is left on it.
 *
 * `invalid` (the step was left without an answer — `useStepTried`) adds the
 * error under the cards; never before Next was pressed.
 *
 * `free` (opt-in, the goal deposit — item 97d): each place shows its FREE
 * money rather than its balance, all in one row ordered most free first, the
 * ones whose balance is unknown last; one with less than `need` says «δεν
 * φτάνουν» and can still be tapped — the form says why it cannot go on.
 */
export default function AccountPicker({
  value,
  onChoose,
  income,
  invalid = false,
  free,
}: {
  value: string;
  onChoose: (id: string) => void;
  income: boolean;
  /** The user tried to move on without choosing: say so. */
  invalid?: boolean;
  /** Show and order by free money (see above). Other forms leave it out and keep their order. */
  free?: { amounts: Record<string, FreeMoney>; need: number };
}) {
  const { t } = useTranslation();
  const { format: formatCurrency } = useCurrencyConverter();
  const { accounts, latest, transactions } = useMoneyAccounts();
  const holds = useMemo(() => expectedByAccount(accounts, latest, transactions), [accounts, latest, transactions]);
  if (accounts.length === 0) return null;

  const main = mainAccount(accounts);
  const finishes = accountFinishes(accounts);
  const chosen = chosenAccount(accounts, value);
  const cash = accounts.filter((a) => a.kind === "cash");
  const cards = accounts.filter((a) => a.kind === "bank");
  const missing = invalid && !chosen;

  const card = (account: (typeof accounts)[number], compact: boolean) => {
    const known = free?.amounts[account.id];
    const short = !!known && free!.need > 0 && known.free + 0.005 < free!.need;
    const shown = free ? (known ? Math.max(known.free, 0) : undefined) : holds[account.id];
    const note = known ? t(short ? "accounts.freeShort" : "accounts.freeLabel") : free ? t("accounts.freeUnknown") : undefined;
    return (
      <BankCard
        key={account.id}
        name={account.name}
        kind={account.kind}
        finish={finishes[account.id]}
        amount={shown !== undefined ? formatCurrency(shown) : undefined}
        note={note}
        badge={!compact && account.id === main?.id && accounts.length > 1 ? t("accounts.mainShort") : undefined}
        selected={chosen === account.id}
        compact={compact}
        onClick={() => onChoose(account.id)}
        label={shown !== undefined ? `${account.name}, ${formatCurrency(shown)}${note ? ` ${note}` : ""}` : account.name}
      />
    );
  };

  return (
    <div role="group" aria-label={t(income ? "accounts.pickInto" : "accounts.pickFrom")} aria-invalid={missing || undefined}>
      {free && <div className={`${styles.grid} ${styles.compactGrid}`}>{orderByFree(accounts, free.amounts).map((account) => card(account, true))}</div>}

      {!free && cash.length > 0 && <div className={styles.grid}>{cash.map((account) => card(account, false))}</div>}

      {!free && cards.length > 0 && (
        <>
          {cash.length > 0 && (
            <div className={styles.divider}>
              <span>{t("accounts.cardsDivider")}</span>
            </div>
          )}
          <div className={`${styles.grid} ${styles.compactGrid}`}>{cards.map((account) => card(account, true))}</div>
        </>
      )}

      {missing && (
        <div className="invalid-feedback d-block mt-2" role="alert">
          {t(income ? "accounts.pickRequiredIn" : "accounts.pickRequiredOut")}
        </div>
      )}
    </div>
  );
}
