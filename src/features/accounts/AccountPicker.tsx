import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useCurrencyConverter } from "../../shared/hooks/useCurrencyConverter";
import { useMoneyAccounts } from "./useMoneyAccounts";
import { expectedByAccount, mainAccount } from "./accountsUtils";
import { accountFinishes } from "./accountTones";
import { BankCard, NoCard } from "./BankCard";
import styles from "./css/BankCard.module.css";

/**
 * Which card paid — or which account the money went into — as a step of its
 * own in the transaction form, between the category and the figures.
 *
 * Two rows. First the two answers that are not a bank card: "no particular
 * card", which starts chosen so that Next moves on without a decision, and
 * cash beside it. Then, under a rule, the cards — small, name and balance
 * only — each showing what it holds now, the same estimate as the Banks & cash
 * page, so choosing is also a glance at what is left on it.
 *
 * Leaving it empty is always right: the bank readings compare the total, and
 * naming a card only puts the record against that card rather than the main
 * one. Tapping one chooses it and moves on, as choosing a category does.
 */
export default function AccountPicker({ value, onChoose, income }: { value: string; onChoose: (id: string) => void; income: boolean }) {
  const { t } = useTranslation();
  const { format: formatCurrency } = useCurrencyConverter();
  const { accounts, latest, transactions } = useMoneyAccounts();
  const holds = useMemo(() => expectedByAccount(accounts, latest, transactions), [accounts, latest, transactions]);
  if (accounts.length === 0) return null;

  const main = mainAccount(accounts);
  const finishes = accountFinishes(accounts);
  // An account deleted since reads as "no particular card".
  const chosen = accounts.some((a) => a.id === value) ? value : "";
  const cash = accounts.filter((a) => a.kind === "cash");
  const cards = accounts.filter((a) => a.kind === "bank");

  const card = (account: (typeof accounts)[number], compact: boolean) => (
    <BankCard
      key={account.id}
      name={account.name}
      kind={account.kind}
      finish={finishes[account.id]}
      amount={holds[account.id] !== undefined ? formatCurrency(holds[account.id]) : undefined}
      badge={!compact && account.id === main?.id && accounts.length > 1 ? t("accounts.mainShort") : undefined}
      selected={chosen === account.id}
      compact={compact}
      onClick={() => onChoose(account.id)}
      label={holds[account.id] !== undefined ? `${account.name}, ${formatCurrency(holds[account.id])}` : account.name}
    />
  );

  return (
    <div role="group" aria-label={t(income ? "accounts.pickInto" : "accounts.pickFrom")}>
      <div className={styles.grid}>
        <NoCard title={t("accounts.noCard")} hint={main ? t("accounts.noCardHint", { name: main.name }) : ""} selected={chosen === ""} onClick={() => onChoose("")} />
        {cash.map((account) => card(account, false))}
      </div>

      {cards.length > 0 && (
        <>
          <div className={styles.divider}>
            <span>{t("accounts.cardsDivider")}</span>
          </div>
          <div className={`${styles.grid} ${styles.compactGrid}`}>{cards.map((account) => card(account, true))}</div>
        </>
      )}
    </div>
  );
}
