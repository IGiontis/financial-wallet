import { useMemo } from "react";
import { Link } from "react-router-dom";
import { Card, CardBody } from "reactstrap";
import { useTranslation } from "react-i18next";
import { FiCheckCircle, FiXCircle } from "react-icons/fi";
import { Skeleton } from "../../../shared/components/Skeletons";
import type { Transaction } from "../../../shared/types/IndexTypes";
import { excludedByOpeningDate, type OpeningBalance } from "../../../shared/utils/balance";
import type { PaydayOutlook } from "../overviewTabs";
import styles from "../pages/css/OverviewPage.module.css";

type Money = (n: number) => string;

/**
 * The money there is now, and whether it lasts until pay day — one card, one
 * answer.
 *
 * The answer used to sit on a tab of its own, worked out by a simpler sum than
 * the Planner's, and the two disagreed one tap apart. Now it is the Planner's
 * own walk (see `paydayOutlook`), under the figure it starts from, with the bar
 * between them showing how the one becomes the other — so the second figure
 * never has to be taken on trust.
 *
 * The figure is plain unless it is below zero: green was spent on a number that
 * is simply a number, and is kept for the one thing that is good news, "you
 * make it".
 */
export default function OverviewHero({
  balance,
  transactions,
  opening,
  source,
  isLoading,
  banks,
  inGoals,
  outlook,
  formatCurrency,
  locale,
}: {
  balance: number;
  transactions: Transaction[];
  opening?: OpeningBalance;
  source?: "readings" | "settings";
  isLoading: boolean;
  /** Banks and cash as the latest reading and the records since put them, goals included. */
  banks?: number;
  inGoals: number;
  outlook: PaydayOutlook;
  formatCurrency: Money;
  locale: string;
}) {
  const { t } = useTranslation();

  // Only the Settings figure holds records back by date; after a bank reading
  // nearly every record is older than it, and saying so would be noise.
  const excluded = useMemo(() => (source === "settings" ? excludedByOpeningDate(transactions, opening) : 0), [transactions, opening, source]);

  const shortDate = new Intl.DateTimeFormat(locale, { day: "numeric", month: "short" });
  const dayDate = new Intl.DateTimeFormat(locale, { weekday: "short", day: "numeric", month: "short" });

  // Where the figure comes from, in one line: the subtraction itself when there
  // is one to show, rather than a sentence about it.
  const origin =
    source === "readings"
      ? inGoals > 0 && banks !== undefined
        ? t("overview.heroBanksLessGoals", { banks: formatCurrency(banks), goals: formatCurrency(inGoals) })
        : t("overview.heroFromBanks")
      : opening
        ? t("overview.currentBalanceHint", { date: new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", year: "numeric" }).format(opening.date) })
        : t("overview.currentBalanceNoOpening");

  const makesIt = outlook.lowest >= 0;
  const out = outlook.bills + outlook.commitments + outlook.lines;
  const have = outlook.start + outlook.incoming;
  // The bar's whole is everything there is to spend through the window; the
  // parts are what goes, and what stays.
  const whole = Math.max(have, out + Math.max(outlook.left, 0), 0.01);
  const parts = [
    { key: "bills", amount: outlook.bills, label: t("overview.partBills", { amount: formatCurrency(outlook.bills) }), colour: "var(--color-goal)" },
    { key: "commitments", amount: outlook.commitments, label: t("overview.partCommitments", { amount: formatCurrency(outlook.commitments) }), colour: "var(--color-invest)" },
    { key: "lines", amount: outlook.lines, label: t("overview.partMine", { amount: formatCurrency(outlook.lines) }), colour: "var(--color-border-primary)" },
  ].filter((part) => part.amount > 0);

  return (
    <Card className="mb-3">
      <CardBody className="p-3 p-sm-4">
        <div className="d-flex justify-content-between align-items-start gap-3">
          <div style={{ minWidth: 0 }}>
            <p className={styles.heroLabel}>{t("overview.currentBalance")}</p>
            {isLoading ? (
              <Skeleton height={38} width={180} style={{ marginBottom: 4 }} />
            ) : (
              <p className={styles.heroFigure} style={{ color: balance < 0 ? "var(--color-expense-text)" : undefined }}>
                {formatCurrency(balance)}
              </p>
            )}
            <p className="text-body-secondary mb-0 small">{isLoading ? <Skeleton width={200} /> : origin}</p>
          </div>

          {/* Until the banks have been read the figure is only as complete as
              the history entered — and the place to fix that is the banks. */}
          {source !== "readings" && !isLoading && (
            <Link to="/accounts" className="btn btn-outline-secondary btn-sm flex-shrink-0">
              {t("overview.addBanks")}
            </Link>
          )}
        </div>

        {/* The reassurance that makes backfilling safe: those older records are
            in the charts, they are simply not deducted twice. */}
        {excluded > 0 && (
          <p className="mb-0 mt-2 text-body-secondary" style={{ fontSize: 11.5 }}>
            ⓘ {t("overview.currentBalanceExcluded", { count: excluded })}
          </p>
        )}

        {!isLoading && (
          <div className={styles.heroVerdict}>
            <span className="d-inline-flex align-items-center gap-2 fw-semibold" style={{ color: makesIt ? "var(--color-income-text)" : "var(--color-expense-text)" }}>
              {makesIt ? <FiCheckCircle size={17} aria-hidden /> : <FiXCircle size={17} aria-hidden />}
              {t(makesIt ? (outlook.known ? "overview.verdictOk" : "overview.verdictOkMonth") : outlook.known ? "overview.verdictShort" : "overview.verdictShortMonth")}
            </span>

            <div className="d-flex align-items-baseline gap-2 flex-wrap mt-1">
              <span className={styles.heroLeft} style={{ color: outlook.left < 0 ? "var(--color-expense-text)" : undefined }}>
                {formatCurrency(outlook.left)}
              </span>
              <span className="small text-body-secondary">{t(outlook.left >= 0 ? "overview.leftOn" : "overview.shortOn", { date: shortDate.format(outlook.date) })}</span>
            </div>

            {makesIt ? (
              <>
                <div className={styles.heroBar} aria-hidden>
                  {parts.map((part) => (
                    <span key={part.key} style={{ width: `${(part.amount / whole) * 100}%`, background: part.colour }} />
                  ))}
                  <span style={{ width: `${(Math.max(outlook.left, 0) / whole) * 100}%`, background: "var(--color-income)" }} />
                </div>
                <ul className={styles.heroLegend}>
                  {parts.map((part) => (
                    <li key={part.key}>
                      <span className={styles.spendKey} style={{ background: part.colour }} aria-hidden />
                      {part.label}
                    </li>
                  ))}
                  {outlook.incoming > 0 && <li>{t("overview.partIncoming", { amount: formatCurrency(outlook.incoming) })}</li>}
                  <li>
                    <span className={styles.spendKey} style={{ background: "var(--color-income)" }} aria-hidden />
                    {t("overview.partLeft", { amount: formatCurrency(outlook.left), perDay: formatCurrency(outlook.perDay) })}
                  </li>
                </ul>
              </>
            ) : (
              <p className="small mb-0 mt-1">
                {t("overview.shortExplain", { need: formatCurrency(out), have: formatCurrency(have) })}{" "}
                {outlook.breaksOn &&
                  (outlook.breaksAt
                    ? t("overview.breaksAt", { date: dayDate.format(outlook.breaksOn), name: outlook.breaksAt })
                    : t("overview.breaksOn", { date: dayDate.format(outlook.breaksOn) }))}
              </p>
            )}

            {/* The way to the full walk, after the answer rather than beside it,
                where it pushed the verdict onto two lines on a phone. */}
            <div className="d-flex justify-content-between align-items-baseline gap-2 mt-2">
              {!outlook.known ? (
                <Link to="/planner" className="small text-decoration-none">
                  {t("overview.setPayday")}
                </Link>
              ) : (
                <span />
              )}
              <Link to="/planner" className="small text-decoration-none flex-shrink-0">
                {t("overview.openPlanner")}
              </Link>
            </div>
          </div>
        )}
      </CardBody>
    </Card>
  );
}
