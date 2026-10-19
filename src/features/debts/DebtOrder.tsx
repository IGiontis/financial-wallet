import { useState } from "react";
import { Input, InputGroup, InputGroupText } from "reactstrap";
import { useTranslation } from "react-i18next";
import { currentRate, isFloating, payoffOrder, payoffSaving } from "./debtsUtils";
import styles from "./css/DebtOrder.module.css";
import type { DebtWithStatus } from "../../shared/types/IndexTypes";

/**
 * «Σε ποιο δάνειο να ρίξεις πρώτα» — the dearest first.
 *
 * Money put against the highest rate kills more interest than the same money
 * anywhere else, and a list of balances does not show it: the biggest debt is
 * very often not the expensive one. Moved here from the old Allocation page.
 * Nothing on the page shows for someone with no loan charging interest.
 */
export function DebtOrder({ debts, formatCurrency }: { debts: DebtWithStatus[]; formatCurrency: (n: number) => string }) {
  const { t } = useTranslation();
  const [extra, setExtra] = useState("");

  const charged = payoffOrder(debts);
  if (charged.length === 0) return null;

  const amount = parseFloat(extra);
  const target = charged[0];
  const saving = Number.isFinite(amount) && amount > 0 ? payoffSaving(target, amount) : undefined;

  return (
    <section className={styles.card} aria-label={t("debtOrder.title")}>
      <div className={styles.title}>{t("debtOrder.title")}</div>
      <p className={styles.note}>{t("debtOrder.note")}</p>

      {charged.map((debt, index) => (
        <div key={debt.id} className={styles.row}>
          <span className={styles.rank}>{index + 1}</span>
          <span className={styles.main}>
            <span className={styles.name}>{debt.label || debt.person}</span>
            <span className={styles.meta}>{t(isFloating(debt) ? "debtOrder.rateFloating" : "debtOrder.rate", { rate: currentRate(debt), amount: formatCurrency(debt.remaining) })}</span>
          </span>
        </div>
      ))}

      <div className={styles.extra}>
        <span className={styles.extraLabel}>{t("debtOrder.extra")}</span>
        <InputGroup size="sm" style={{ maxWidth: 170 }}>
          <Input type="number" min={0} step="10" inputMode="decimal" value={extra} onChange={(event) => setExtra(event.target.value)} placeholder="100" aria-label={t("debtOrder.extra")} />
          <InputGroupText>{t("debts.perMonthSuffix")}</InputGroupText>
        </InputGroup>
      </div>

      <p className={saving && saving.monthsSaved > 0 ? styles.win : styles.quiet}>
        {saving === undefined
          ? t("debtOrder.prompt")
          : saving.monthsSaved <= 0
            ? t("debtOrder.nothing")
            : t("debtOrder.win", { amount: formatCurrency(amount), name: target.label || target.person, months: saving.monthsSaved, saved: formatCurrency(saving.interestSaved) })}
      </p>
    </section>
  );
}

export default DebtOrder;
