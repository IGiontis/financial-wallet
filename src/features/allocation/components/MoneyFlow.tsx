import { useState } from "react";
import { Input, InputGroup, InputGroupText } from "reactstrap";
import { useTranslation } from "react-i18next";
import { currentRate, isFloating, payoffSaving } from "../../debts/debtsUtils";
import { payoffOrder } from "../allocationUtils";
import styles from "../css/Allocation.module.css";
import type { Committed } from "../allocationUtils";
import type { DebtWithStatus } from "../../../shared/types/IndexTypes";

// Where the month goes, before anything is decided about it.
//
// The page used to open with the arithmetic written out as a sentence —
// "€1,400 pay − €577 bills − €195 goals − €250 debts" — which is correct and
// tells you nothing you can feel. The same four numbers as one bar answer the
// question the page is named after in the time it takes to look at it: most of
// a Greek salary is spoken for before anyone decides anything, and the part
// that is actually yours to divide is the small piece on the end.

const TONES = {
  bills: "var(--color-expense)",
  debts: "var(--color-goal)",
  goals: "var(--color-invest)",
  free: "var(--color-income)",
} as const;

export function MonthFlow({
  income,
  committed,
  free,
  extra,
  extraLabel,
  formatCurrency,
}: {
  income: number;
  committed: Committed;
  free: number;
  /** Taken off the top for this month only, if anything was. */
  extra: number;
  extraLabel: string;
  formatCurrency: (n: number) => string;
}) {
  const { t } = useTranslation();

  // Shares of what came in. Against anything else the bar would stop meaning
  // "of my pay", which is the only thing it is for.
  const share = (amount: number) => (income > 0 ? Math.max(amount, 0) / income : 0);
  const pct = (amount: number) => Math.round(share(amount) * 100);

  const segments = [
    { key: "bills", amount: committed.bills, tone: TONES.bills },
    { key: "debts", amount: committed.debts, tone: TONES.debts },
    { key: "goals", amount: committed.goals, tone: TONES.goals },
    { key: "free", amount: Math.max(free, 0), tone: TONES.free },
  ].filter((segment) => segment.amount > 0);

  return (
    <>
      <div className={styles.flowBar} role="img" aria-label={t("allocation.flowTitle")}>
        {segments.map((segment) => (
          <span key={segment.key} className={styles.flowSeg} style={{ width: `${share(segment.amount) * 100}%`, background: segment.tone }}>
            {share(segment.amount) >= 0.12 ? `${pct(segment.amount)}%` : ""}
          </span>
        ))}
      </div>

      <div className={styles.flowSteps}>
        <div className={styles.flowStep}>
          <span className={styles.flowName}>{t("allocation.flowIncome")}</span>
          <strong>{formatCurrency(income)}</strong>
        </div>

        {committed.bills > 0 && (
          <div className={styles.flowStep}>
            <span className={styles.flowDot} style={{ background: TONES.bills }} aria-hidden />
            <span className={styles.flowName}>{t("allocation.flowBills")}</span>
            <strong>−{formatCurrency(committed.bills)}</strong>
          </div>
        )}

        {committed.debts > 0 && (
          <div className={styles.flowStep}>
            <span className={styles.flowDot} style={{ background: TONES.debts }} aria-hidden />
            <span className={styles.flowName}>{t("allocation.flowDebts")}</span>
            <strong>−{formatCurrency(committed.debts)}</strong>
          </div>
        )}

        {committed.goals > 0 && (
          <div className={styles.flowStep}>
            <span className={styles.flowDot} style={{ background: TONES.goals }} aria-hidden />
            <span className={styles.flowName}>{t("allocation.flowGoals")}</span>
            <strong>−{formatCurrency(committed.goals)}</strong>
          </div>
        )}

        {extra > 0 && (
          <div className={styles.flowStep}>
            <span className={styles.flowName}>{extraLabel}</span>
            <strong>−{formatCurrency(extra)}</strong>
          </div>
        )}
      </div>

      <div className={`${styles.flowFree} ${free < 0 ? styles.flowFreeNegative : ""}`}>
        <span>{t("allocation.freeLeft")}</span>
        <strong>{formatCurrency(free)}</strong>
      </div>
      {income > 0 && free > 0 && <p className={styles.flowShare}>{t("allocation.flowShare", { share: pct(free) })}</p>}
    </>
  );
}

// ─── Which loan to attack first ──────────────────────────────────────────────
//
// The one piece of advice on this page that is not about the reader's habits.
// Money put against the highest rate kills more interest than the same money
// anywhere else, and the ordering is not obvious from a list of balances: the
// biggest debt is very often not the expensive one.

export function DebtOrder({ debts, formatCurrency }: { debts: DebtWithStatus[]; formatCurrency: (n: number) => string }) {
  const { t } = useTranslation();
  const [extra, setExtra] = useState("");

  const charged = payoffOrder(debts);

  if (charged.length === 0) {
    return <p className={styles.orderEmpty}>{t("allocation.orderNone")}</p>;
  }

  const amount = parseFloat(extra);
  const target = charged[0];
  const saving = Number.isFinite(amount) && amount > 0 ? payoffSaving(target, amount) : undefined;

  return (
    <>
      <p className={styles.orderNote}>{t("allocation.orderNote")}</p>

      {charged.map((debt, index) => (
        <div key={debt.id} className={styles.orderRow}>
          <span className={styles.orderRank}>{index + 1}</span>
          <span className={styles.orderMain}>
            <span className={styles.orderName}>{debt.label || debt.person}</span>
            <span className={styles.orderMeta}>
              {t(isFloating(debt) ? "allocation.orderRateFloating" : "allocation.orderRate", {
                rate: currentRate(debt),
                amount: formatCurrency(debt.remaining),
              })}
            </span>
          </span>
        </div>
      ))}

      <div className={styles.orderExtra}>
        <span className={styles.orderExtraLabel}>{t("allocation.orderExtra")}</span>
        <InputGroup size="sm" style={{ maxWidth: 170 }}>
          <Input type="number" min={0} step="10" inputMode="decimal" value={extra} onChange={(event) => setExtra(event.target.value)} placeholder="100" aria-label={t("allocation.orderExtra")} />
          <InputGroupText>{t("debts.perMonthSuffix")}</InputGroupText>
        </InputGroup>
      </div>

      <p className={saving && saving.monthsSaved > 0 ? styles.orderWin : styles.orderEmpty}>
        {saving === undefined
          ? t("allocation.orderPrompt")
          : saving.monthsSaved <= 0
            ? t("allocation.orderNothing")
            : t("allocation.orderWin", {
                amount: formatCurrency(amount),
                name: target.label || target.person,
                months: saving.monthsSaved,
                saved: formatCurrency(saving.interestSaved),
              })}
      </p>
    </>
  );
}
