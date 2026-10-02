import { Fragment } from "react";
import { Col, Row } from "reactstrap";
import { useTranslation } from "react-i18next";
import { currentPause } from "../../bills/billsUtils";
import type { Income, IncomeYear, MonthSummary, SegmentState } from "../incomesUtils";
import type { IncomeFormats } from "../incomeText";
import styles from "../css/IncomesPage.module.css";

// The page's summary card: option 3's bar, on top of option 1's list.
//
// The owner chose the bar as a third tab, «Μήνας», with leave to put it above
// the list instead if it read better there. It does: the bar answers "has
// everything come?", which is the question every tab starts from, and as a tab
// it would have been one tap away from the list it adds up. So it is the card at
// the top of the page, for every tab, and the third tab is the year.

const SEGMENT_CLASS: Record<SegmentState, string> = { arrived: styles.segArrived, missing: styles.segMissing, ask: styles.segAsk };
const DOT: Record<SegmentState, string> = { arrived: "var(--color-income)", missing: "var(--color-goal)", ask: "var(--color-invest)" };

export function IncomeMonthCard({
  summary,
  incomes,
  formatCurrency,
  f,
  monthDate,
}: {
  summary: MonthSummary;
  incomes: Map<string, Income>;
  formatCurrency: (n: number) => string;
  f: IncomeFormats;
  monthDate: Date;
}) {
  const { t } = useTranslation();
  const name = (id: string) => incomes.get(id)?.name ?? "—";
  const approx = (on: boolean) => (on ? "≈" : "");
  const pct = summary.total > 0 ? Math.round((summary.arrived / summary.total) * 100) : 0;
  const arrivedParts = summary.segments.filter((s) => s.state === "arrived");
  const askingApprox = summary.segments.some((s) => s.state === "ask" && s.approximate);
  const missingApprox = summary.segments.some((s) => s.state === "missing" && s.approximate);

  return (
    <section className={`${styles.card} p-3 p-lg-4 mb-3`} aria-labelledby="incomes-month-title">
      <div id="incomes-month-title" className={styles.eyebrow}>
        {t("incomes.month.arrivedIn", { month: f.monthName(monthDate) })}
      </div>

      {summary.count === 0 ? (
        <p className="text-body-secondary mb-0 mt-2" style={{ fontSize: 13 }}>
          {t("incomes.month.nothing")}
        </p>
      ) : (
        <>
          <div className="d-flex align-items-baseline flex-wrap gap-2 mt-1 mb-2">
            <span className={styles.bigAmount}>{formatCurrency(summary.arrived)}</span>
            <span className={styles.ofTotal}>{t("incomes.month.ofTotal", { total: `${approx(summary.approximate)}${formatCurrency(summary.total)}` })}</span>
          </div>

          <div className={styles.bar} role="img" aria-label={t("incomes.month.barLabel", { arrived: formatCurrency(summary.arrived), total: formatCurrency(summary.total) })}>
            {summary.segments.map((segment) => (
              <span
                key={`${segment.incomeId}-${segment.state}`}
                className={`${styles.seg} ${SEGMENT_CLASS[segment.state]}`}
                style={{ flexGrow: segment.amount, flexBasis: 0 }}
                title={`${name(segment.incomeId)} · ${approx(segment.approximate)}${formatCurrency(segment.amount)}`}
              />
            ))}
          </div>

          <div className="d-flex justify-content-between gap-2 mt-2" style={{ fontSize: 12 }}>
            <span className="text-body-secondary">{t("incomes.month.countPct", { arrived: summary.arrivedCount, count: summary.count, pct })}</span>
            {summary.missing > 0 ? (
              <span className={styles.toneWaiting} style={{ fontWeight: 600 }}>
                {t("incomes.month.missing", { amount: `${approx(missingApprox)}${formatCurrency(summary.missing)}` })}
              </span>
            ) : summary.asking === 0 ? (
              <span className={styles.toneArrived} style={{ fontWeight: 600 }}>
                {t("incomes.month.allIn")}
              </span>
            ) : null}
          </div>

          <div className={styles.legend}>
            {summary.segments.map((segment) => (
              <span key={`${segment.incomeId}-${segment.state}`} className={styles.legendItem}>
                <span className={styles.legendDot} style={{ background: DOT[segment.state] }} aria-hidden />
                {name(segment.incomeId)} {approx(segment.approximate)}
                {formatCurrency(segment.amount)}
                {segment.state === "arrived" ? " ✓" : segment.state === "ask" ? " ;" : ""}
              </span>
            ))}
          </div>

          {/* The arithmetic, written out, so the big figure can be checked
              rather than taken on trust. */}
          <div className={styles.sum} aria-label={t("incomes.month.sumLabel")}>
            {arrivedParts.length > 1 && (
              <>
                {arrivedParts.map((part, index) => (
                  <Fragment key={part.incomeId}>
                    {index > 0 && <span aria-hidden>+</span>}
                    <span>{formatCurrency(part.amount)}</span>
                  </Fragment>
                ))}
                <span aria-hidden>=</span>
              </>
            )}
            <span className={`${styles.sumChip} ${styles.sumArrived}`}>{t("incomes.month.sumArrived", { amount: formatCurrency(summary.arrived) })}</span>
            {summary.asking > 0 && (
              <>
                <span aria-hidden>+</span>
                <span className={`${styles.sumChip} ${styles.sumAsk}`}>{t("incomes.month.sumAsk", { amount: `${approx(askingApprox)}${formatCurrency(summary.asking)}` })}</span>
              </>
            )}
            {summary.missing > 0 && (
              <>
                <span aria-hidden>+</span>
                <span className={`${styles.sumChip} ${styles.sumMissing}`}>{t("incomes.month.sumMissing", { amount: `${approx(missingApprox)}${formatCurrency(summary.missing)}` })}</span>
              </>
            )}
            {(summary.asking > 0 || summary.missing > 0) && (
              <>
                <span aria-hidden>=</span>
                <span className={styles.sumTotal}>
                  {approx(summary.approximate)}
                  {formatCurrency(summary.total)}
                </span>
              </>
            )}
          </div>
        </>
      )}
    </section>
  );
}

/** The two tiles under the card: a month across the year, and how many are running. */
export function IncomeTiles({ year, incomes, formatCurrency, now }: { year: IncomeYear; incomes: Income[]; formatCurrency: (n: number) => string; now: Date }) {
  const { t } = useTranslation();
  const active = incomes.filter((i) => i.active !== false);
  // A pause that is on now or still to come — «1 με παύση το καλοκαίρι».
  const withPause = active.filter((i) => {
    const state = currentPause(i, now)?.state;
    return state === "paused" || state === "upcoming";
  }).length;

  return (
    <Row className="g-2 mb-3">
      <Col xs={6}>
        <div className={styles.statBox}>
          <div className={styles.statLabel}>{t("incomes.tiles.perMonth")}</div>
          <div className={styles.statValue}>
            {year.approximate ? "≈" : ""}
            {formatCurrency(year.perMonth)}
          </div>
          <div className={styles.statSub}>{t("incomes.tiles.perMonthSub")}</div>
        </div>
      </Col>
      <Col xs={6}>
        <div className={styles.statBox}>
          <div className={styles.statLabel}>{t("incomes.tiles.active")}</div>
          <div className={styles.statValue}>{active.length}</div>
          <div className={styles.statSub}>{withPause > 0 ? t("incomes.tiles.withPause", { count: withPause }) : t("incomes.tiles.allRunning")}</div>
        </div>
      </Col>
    </Row>
  );
}
