import { useState } from "react";
import { Button, Modal, ModalBody, ModalFooter, ModalHeader } from "reactstrap";
import { useTranslation } from "react-i18next";
import { FiInfo } from "react-icons/fi";
import { rateExample } from "./rateExample";
import styles from "./css/DebtsPage.module.css";
import type { DebtWithStatus } from "../../shared/types/IndexTypes";

/**
 * What a floating rate is, and what one point on the index does to a loan.
 *
 * Three short answers and then the arithmetic, because the arithmetic is the
 * part nobody guesses right: a point on the rate lands as about a tenth on the
 * payment, and the end date does not move at all.
 */
function RateExplainer({
  debt,
  formatCurrency,
  locale,
  onClose,
}: {
  debt?: DebtWithStatus;
  formatCurrency: (n: number) => string;
  locale: string;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const facts = rateExample(debt);
  if (!facts) return null;

  const pct = new Intl.NumberFormat(locale, { maximumFractionDigits: 2 });
  const share = new Intl.NumberFormat(locale, { style: "percent", maximumFractionDigits: 0 });
  const monthFmt = new Intl.DateTimeFormat(locale, { month: "short", year: "numeric" });
  const finish = monthFmt.format(facts.finish);
  const heavier = facts.now.instalment > 0 ? (facts.up.instalment - facts.now.instalment) / facts.now.instalment : 0;

  return (
    <Modal isOpen toggle={onClose} centered scrollable>
      <ModalHeader toggle={onClose}>
        <span style={{ fontSize: 15 }}>{t("debts.rateHelpTitle")}</span>
      </ModalHeader>

      <ModalBody className="pt-2">
        <div className={styles.helpSection}>
          <div className={styles.helpHeading}>{t("debts.rateHelpParts")}</div>
          <p className={styles.helpBody}>{t("debts.rateHelpPartsBody")}</p>

          {/* The sum itself, because it is the whole idea in one line. */}
          <div className={styles.partsRow}>
            <span className={styles.part}>
              {pct.format(facts.base)}% <em>{t("debts.rateHelpIndex")}</em>
            </span>
            <span className={styles.partOp}>+</span>
            <span className={styles.part}>
              {pct.format(facts.margin)}% <em>{t("debts.rateHelpMargin")}</em>
            </span>
            <span className={styles.partOp}>=</span>
            <span className={`${styles.part} ${styles.partSum}`}>{pct.format(facts.now.rate)}%</span>
          </div>
        </div>

        {/* The vocabulary before the arithmetic. Every line here names a box on
            the form and says what goes in it, using the same numbers the example
            below is worked out from. */}
        <div className={styles.helpSection}>
          <div className={styles.helpHeading}>{t("debts.rateHelpFields")}</div>
          <dl className={styles.fields}>
            <dt>{t("common.amount")}</dt>
            <dd>{t("debts.fieldAmountBody", { amount: formatCurrency(facts.amount) })}</dd>

            <dt>{t("debts.baseRate")}</dt>
            <dd>{t("debts.fieldIndexBody", { value: pct.format(facts.base) })}</dd>

            <dt>{t("debts.margin")}</dt>
            <dd>{t("debts.fieldMarginBody", { value: pct.format(facts.margin) })}</dd>

            <dt>{t("debts.interestRate")}</dt>
            <dd>{t("debts.fieldRateBody")}</dd>

            <dt>{t("debts.termMonths")}</dt>
            <dd>{t("debts.fieldTermBody", { months: facts.months, years: Math.round(facts.months / 12) })}</dd>

            <dt>{t("debts.interestFree")}</dt>
            <dd>{t("debts.fieldFreeBody")}</dd>
          </dl>
        </div>

        <div className={styles.helpSection}>
          <div className={styles.helpHeading}>{t("debts.rateHelpWhen")}</div>
          <p className={`${styles.helpBody} mb-0`}>{t("debts.rateHelpWhenBody")}</p>
        </div>

        <div className={styles.helpSection}>
          <div className={styles.helpHeading}>{t("debts.rateHelpEffect")}</div>
          <p className={`${styles.helpBody} mb-0`}>{t("debts.rateHelpEffectBody")}</p>
        </div>

        <div className={styles.helpSection}>
          <div className={styles.helpHeading}>{t("debts.rateHelpExample")}</div>
          <p className={styles.helpBody}>
            {facts.yours
              ? t("debts.rateHelpYours")
              : t("debts.rateHelpExampleIntro", {
                  amount: formatCurrency(facts.amount),
                  months: facts.months,
                  base: pct.format(facts.base),
                  margin: pct.format(facts.margin),
                })}
          </p>

          <div className={styles.helpTable}>
            <div className={styles.helpTableHead}>
              <span />
              <span>{t("debts.rateHelpToday", { rate: pct.format(facts.now.rate) })}</span>
              <span>{t("debts.rateHelpRaised", { rate: pct.format(facts.up.rate) })}</span>
            </div>

            <div className={styles.helpTableRow}>
              <span>{t("debts.rateHelpRowInstalment")}</span>
              <span>{formatCurrency(facts.now.instalment)}</span>
              <span className={styles.helpTableUp}>{formatCurrency(facts.up.instalment)}</span>
            </div>

            <div className={styles.helpTableRow}>
              <span>{t("debts.rateHelpRowInterest")}</span>
              <span>{formatCurrency(facts.now.interest)}</span>
              <span className={styles.helpTableUp}>{formatCurrency(facts.up.interest)}</span>
            </div>

            {/* The same date twice, on purpose: it is the half of this nobody
                expects, and a row that repeats itself says it without a word. */}
            <div className={styles.helpTableRow}>
              <span>{t("debts.rateHelpRowFinish")}</span>
              <span>{finish}</span>
              <span>{finish}</span>
            </div>
          </div>

          <p className={styles.helpPunch}>{t("debts.rateHelpPunch", { percent: share.format(heavier) })}</p>
        </div>

        <div className={styles.helpSection}>
          <div className={styles.helpHeading}>{t("debts.rateHelpApp")}</div>
          <p className={`${styles.helpBody} mb-0`}>{t("debts.rateHelpAppBody")}</p>
        </div>
      </ModalBody>

      <ModalFooter>
        <Button color="primary" onClick={onClose}>
          {t("debts.rateHelpGot")}
        </Button>
      </ModalFooter>
    </Modal>
  );
}

/**
 * The dot that opens it.
 *
 * Given a loan it explains that loan; given none — on the form, before anything
 * is typed — it explains an ordinary mortgage instead, so the answer is there at
 * the moment the question comes up rather than afterwards.
 */
export function RateHelpButton({ debt, formatCurrency, locale }: { debt?: DebtWithStatus; formatCurrency: (n: number) => string; locale: string }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);

  return (
    <>
      <button type="button" className={styles.rateHelp} onClick={() => setOpen(true)}>
        <FiInfo size={13} aria-hidden />
        {t("debts.rateHelpOpen")}
      </button>
      {open && <RateExplainer debt={debt} formatCurrency={formatCurrency} locale={locale} onClose={() => setOpen(false)} />}
    </>
  );
}
