import { useMemo, useState } from "react";
import { Alert, Button } from "reactstrap";
import { useTranslation } from "react-i18next";
import { SkeletonPageHeader, SkeletonRows, SkeletonStats } from "../../shared/components/Skeletons";
import { FiPlus } from "react-icons/fi";

import { useCurrencyConverter } from "../../shared/hooks/useCurrencyConverter";
import { useDebts } from "./useDebts";
import { debtTotals, debtsByPerson } from "./debtsUtils";
import PersonDebtsModal from "./PersonDebtsModal";
import AddDebtModal from "./AddDebtModal";
import styles from "./css/DebtsPage.module.css";
import { PageShell } from "../../shared/components/PageShell";

/**
 * Who you owe, and who owes you.
 *
 * Kept out of transactions on purpose: borrowed money is not income and
 * repaying is not spending, so letting either into the ledger would distort
 * every average on the Analytics screen. The Planner reads the one half that
 * genuinely has to be found from somewhere — what you owe.
 */
export function DebtsPage() {
  const { t, i18n } = useTranslation();
  const lang = i18n.resolvedLanguage ?? "en";
  const { format: formatCurrency } = useCurrencyConverter();

  const { data: debts = [], isLoading, isError, error } = useDebts();
  const [openPerson, setOpenPerson] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  const people = useMemo(() => debtsByPerson(debts), [debts]);
  const totals = useMemo(() => debtTotals(people), [people]);
  const person = people.find((p) => p.person === openPerson);
  const netTone = totals.net > 0 ? "var(--color-income)" : totals.net < 0 ? "var(--color-expense)" : undefined;

  // The shape of what is coming, rather than a wheel. The whole page used to be
  // replaced by the spinner — heading, "add a loan" button and all — so there was
  // a moment where the screen offered nothing to do and nothing to read.
  if (isLoading) {
    return (
      <PageShell>
        <SkeletonPageHeader />
        <SkeletonStats count={3} />
        <SkeletonRows count={4} />
      </PageShell>
    );
  }

  /** Spelled out rather than signed — see the CSS note on `.personBalance`. */
  const balanceLabel = (owedByMe: number, owedToMe: number) => {
    if (owedByMe > 0 && owedToMe > 0) return { text: t("debts.bothWays", { out: formatCurrency(owedByMe), in: formatCurrency(owedToMe) }), tone: "var(--color-expense)" };
    if (owedByMe > 0) return { text: t("debts.youOweAmount", { amount: formatCurrency(owedByMe) }), tone: "var(--color-expense)" };
    if (owedToMe > 0) return { text: t("debts.owesYouAmount", { amount: formatCurrency(owedToMe) }), tone: "var(--color-income)" };
    return { text: t("debts.settledUp"), tone: undefined };
  };

  return (
    <PageShell>
      <div className="d-flex justify-content-between align-items-start mb-3 gap-2 flex-wrap">
        <div style={{ minWidth: 0 }}>
          <h1 className="h5 fw-semibold text-body-emphasis mb-0">{t("debts.title")}</h1>
          <p className="small text-body-secondary mb-0">{t("debts.subtitle")}</p>
        </div>
        <Button color="primary" onClick={() => setAdding(true)} className="text-nowrap">
          <FiPlus size={16} className="me-1" />
          {t("debts.add")}
        </Button>
      </div>

      {/* Inline rather than instead of the page: failing to read is no reason to
          take away the button that writes, and the first thing a new collection
          does is fail here until its rules are published. The code is shown
          because "permission-denied" and "unavailable" need different fixes. */}
      {isError && (
        <Alert color="danger" className="small">
          <div>{t("debts.loadFailed")}</div>
          {error instanceof Error && error.message && <div className="mt-1 font-monospace" style={{ fontSize: 11 }}>{error.message}</div>}
        </Alert>
      )}

      <div className={styles.totals}>
        <div className={`${styles.total} ${styles.totalOut}`}>
          <div className={styles.totalLabel}>{t("debts.youOwe")}</div>
          <div className={styles.totalAmount}>{formatCurrency(totals.owedByMe)}</div>
        </div>
        <div className={`${styles.total} ${styles.totalIn}`}>
          <div className={styles.totalLabel}>{t("debts.owedToYou")}</div>
          <div className={styles.totalAmount}>{formatCurrency(totals.owedToMe)}</div>
        </div>

        {/* Signed, because the sign is the answer: whether the pair above nets
            out for you or against you is the one thing the two tiles make you
            work out yourself. Zero takes no sign and no colour — "+€0.00" reads
            as a tiny win rather than as nothing owed either way. */}
        <div className={styles.net}>
          <span className={styles.netLabel}>{t("debts.net")}</span>
          <span className="d-flex align-items-baseline gap-2">
            <span className={styles.netAmount} style={{ color: netTone }}>
              {totals.net === 0 ? formatCurrency(0) : `${totals.net > 0 ? "+" : "−"}${formatCurrency(Math.abs(totals.net))}`}
            </span>
            <span className={styles.netNote}>{t(totals.net > 0 ? "debts.netAhead" : totals.net < 0 ? "debts.netBehind" : "debts.netEven")}</span>
          </span>
        </div>
      </div>

      <div className={`${styles.card} p-3 p-lg-4`}>
        {people.length === 0 ? (
          <p className="text-body-secondary mb-0" style={{ fontSize: 13 }}>
            {t("debts.empty")}
          </p>
        ) : (
          people.map((p) => {
            const balance = balanceLabel(p.owedByMe, p.owedToMe);
            return (
              <button key={p.person} type="button" className={styles.person} onClick={() => setOpenPerson(p.person)}>
                <span className={styles.personName}>{p.person}</span>
                <span className={styles.personCount}>{t("debts.loanCount", { count: p.openCount })}</span>
                <span className={`${styles.personBalance} ${p.openCount === 0 ? styles.settled : ""}`} style={{ color: balance.tone }}>
                  {balance.text}
                </span>
              </button>
            );
          })
        )}
      </div>

      {person && <PersonDebtsModal person={person} formatCurrency={formatCurrency} locale={lang} onClose={() => setOpenPerson(null)} />}
      {adding && <AddDebtModal knownPeople={people.map((p) => p.person)} onClose={() => setAdding(false)} />}
    </PageShell>
  );
}

export default DebtsPage;
