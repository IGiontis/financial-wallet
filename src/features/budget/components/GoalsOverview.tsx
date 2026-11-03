import { useCallback, useMemo, type CSSProperties, type ReactNode } from "react";
import { Card, CardBody, Col, Row } from "reactstrap";
import { useTranslation } from "react-i18next";
import { MonthBars, type MonthBarTone } from "../../../shared/components/MonthBars";
import { SkeletonChartCard, SkeletonRows, SkeletonStats } from "../../../shared/components/Skeletons";
import type { MonthMoves, NearItem } from "./goalOverview";
import styles from "./css/GoalsWorkbench.module.css";

// The «Επισκόπηση» tab of a goal screen: its boxes, the few goals nearest their
// figure, and the money that went in, month by month, over the last year.
//
// Three blocks and no more — the cards and the list are a tab away, so this one
// can afford to leave things out.

/** A box at the top: one figure, what it is, and a line under it. */
export interface OverviewTile {
  label: string;
  value: string;
  sub?: string;
  /** The colour of its top edge — a meaning, never the figure's own colour. */
  tone: "goal" | "income" | "expense" | "invest" | "brand" | "neutral";
  icon: string;
}

const TONE_EDGE: Record<OverviewTile["tone"], string> = {
  goal: "var(--color-goal)",
  income: "var(--color-income)",
  expense: "var(--color-expense)",
  invest: "var(--color-invest)",
  brand: "var(--bs-primary)",
  neutral: "var(--border)",
};

export function GoalsOverview({
  loading,
  tiles,
  nearTitle,
  nearEmpty,
  near,
  moves,
  chartTone,
  formatCurrency,
  footer,
}: {
  loading: boolean;
  tiles: OverviewTile[];
  nearTitle: string;
  nearEmpty: string;
  near: NearItem[];
  moves: MonthMoves[];
  chartTone: MonthBarTone;
  formatCurrency: (n: number) => string;
  /** Under the blocks — the screen's own note, if it has one. */
  footer?: ReactNode;
}) {
  const { t, i18n } = useTranslation();
  const locale = i18n.resolvedLanguage ?? "el";

  const bars = useMemo(
    () =>
      moves.map((month) => ({
        start: month.start,
        total: month.deposits,
        title: month.withdrawals > 0 ? `+${formatCurrency(month.deposits)} · −${formatCurrency(month.withdrawals)}` : `+${formatCurrency(month.deposits)}`,
      })),
    [moves, formatCurrency],
  );
  // Whole euros under the columns: twelve of «€150.00» side by side ran into
  // each other. The bar's own title keeps the cents.
  const short = useCallback((n: number) => formatCurrency(Math.round(n)).replace(/[.,]00(?=\D*$)/, ""), [formatCurrency]);
  const peak = Math.max(0, ...bars.map((bar) => bar.total));
  const highs = peak > 0 ? bars.filter((bar) => bar.total === peak) : [];
  const putIn = moves.reduce((sum, month) => sum + month.deposits, 0);
  const takenOut = moves.reduce((sum, month) => sum + month.withdrawals, 0);

  if (loading) {
    return (
      <>
        <SkeletonStats count={4} />
        <Row className="g-3 mt-0">
          <Col xl={5}>
            <SkeletonRows count={3} />
          </Col>
          <Col xl={7}>
            <SkeletonChartCard height={200} />
          </Col>
        </Row>
      </>
    );
  }

  return (
    <>
      <div className={styles.overviewTiles}>
        {tiles.map((tile) => (
          <div key={tile.label} className={styles.overviewTile} style={{ "--edge": TONE_EDGE[tile.tone] } as CSSProperties}>
            <div className={styles.overviewTileHead}>
              <p className={styles.overviewTileLabel}>{tile.label}</p>
              <span aria-hidden>{tile.icon}</span>
            </div>
            <p className={styles.overviewFigure}>{tile.value}</p>
            {tile.sub && <p className={styles.overviewTileSub}>{tile.sub}</p>}
          </div>
        ))}
      </div>

      <Row className="g-3">
        <Col xl={5} className="d-flex">
          <Card className={`w-100 ${styles.overviewCard}`}>
            <CardBody>
              <h2 className="stat-head mb-3">{nearTitle}</h2>
              {near.length === 0 ? (
                <p className="small text-body-secondary mb-0">{nearEmpty}</p>
              ) : (
                <ul className={styles.nearList} style={{ "--near": `var(--${chartTone}-fill)` } as CSSProperties}>
                  {near.map(({ goal, saved, target, pct }) => (
                    <li key={goal.id} className={styles.nearItem}>
                      <div className={styles.nearHead}>
                        <span className={styles.nearName}>
                          <span aria-hidden>{goal.icon ?? "🎯"}</span> {goal.name}
                        </span>
                        <span className={styles.nearPct}>{Math.round(pct)}%</span>
                      </div>
                      <div className={styles.nearTrack} role="progressbar" aria-label={goal.name} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(pct)}>
                        <span className={styles.nearFill} style={{ width: `${pct}%` }} />
                      </div>
                      <p className={styles.nearMoney}>
                        {formatCurrency(saved)} / {formatCurrency(target)}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </CardBody>
          </Card>
        </Col>

        <Col xl={7} className="d-flex">
          <Card className={`w-100 ${styles.overviewCard}`}>
            <CardBody>
              <h2 className="stat-head mb-1">{t("goals.overTime")}</h2>
              <p className="small text-body-secondary mb-3">{t("goals.overTimeSub")}</p>
              {putIn === 0 && takenOut === 0 ? (
                <p className="small text-body-secondary mb-0">{t("goals.overTimeEmpty")}</p>
              ) : (
                <>
                  <MonthBars months={bars} formatCurrency={short} locale={locale} label={t("goals.overTime")} highs={highs} highTone={chartTone} lowTone={chartTone} />
                  <p className={styles.overTimeTotals}>
                    {t("goals.overTimeTotals", { in: formatCurrency(putIn), out: formatCurrency(takenOut) })}
                  </p>
                </>
              )}
            </CardBody>
          </Card>
        </Col>
      </Row>
      {footer}
    </>
  );
}
