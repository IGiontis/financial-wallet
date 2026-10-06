import { Badge, Table } from "reactstrap";
import { useTranslation } from "react-i18next";
import type { MonthLedger } from "../dashboardUtils";
import MonthTrioChart, { type TrioRow } from "./MonthTrioChart";
import styles from "./css/Dashboard.module.css";

interface Props {
  ledger: MonthLedger;
  trio: TrioRow[];
  formatCurrency: (n: number) => string;
  monthLabel: (start: Date) => string;
}

const tone = (n: number) => (n > 0 ? "var(--color-income)" : n < 0 ? "var(--color-expense)" : undefined);

/**
 * Everything behind the "month by month" card: four readings of the period,
 * the three charts on one month axis, and every month as a row.
 *
 * The table lists the newest month first, as the transactions do, with its
 * totals at the foot; the charts read left to right in time, as charts do.
 */
export default function MonthByMonthDetails({ ledger, trio, formatCurrency, monthLabel }: Props) {
  const { t, i18n } = useTranslation();
  // One decimal, as the savings tile above the cards shows it.
  const percent = new Intl.NumberFormat(i18n.resolvedLanguage, { maximumFractionDigits: 1 });
  const signed = (n: number) => `${n > 0 ? "+" : n < 0 ? "−" : ""}${formatCurrency(Math.abs(n))}`;
  const rate = (n: number | undefined) => (n === undefined ? "—" : `${percent.format(n)}%`);
  const byKey = new Map(ledger.rows.map((r) => [r.key, r]));
  const best = ledger.best ? byKey.get(ledger.best) : undefined;
  const worst = ledger.worst ? byKey.get(ledger.worst) : undefined;

  const stats = [
    {
      label: t("analytics.ledger.average"),
      value: ledger.average ? signed(ledger.average.net) : "—",
      color: ledger.average ? tone(ledger.average.net) : undefined,
      sub: ledger.average ? t("analytics.ledger.finishedMonths", { count: ledger.average.months }) : t("analytics.ledger.noFinished"),
    },
    { label: t("analytics.ledger.best"), value: best ? monthLabel(best.start) : "—", sub: best ? signed(best.net) : "—", subColor: best ? tone(best.net) : undefined },
    { label: t("analytics.ledger.worst"), value: worst ? monthLabel(worst.start) : "—", sub: worst ? signed(worst.net) : "—", subColor: worst ? tone(worst.net) : undefined },
    {
      label: t("analytics.ledger.positive"),
      value: ledger.positive.of > 0 ? t("analytics.ledger.positiveValue", { count: ledger.positive.count, of: ledger.positive.of }) : "—",
      sub: t("analytics.ledger.positiveSub"),
    },
  ];

  return (
    <div className="d-flex flex-column gap-4">
      <div className="row g-2">
        {stats.map((stat) => (
          <div key={stat.label} className="col-6 col-md-3">
            <div className={styles.ledgerStat}>
              <div className={styles.ledgerStatLabel}>{stat.label}</div>
              <div className={styles.ledgerStatValue} style={{ color: stat.color }}>
                {stat.value}
              </div>
              <div className={styles.ledgerStatSub} style={{ color: stat.subColor }}>
                {stat.sub}
              </div>
            </div>
          </div>
        ))}
      </div>

      <section>
        <h4 className={styles.ledgerHeading}>{t("analytics.ledger.chartsTitle")}</h4>
        <p className={styles.ledgerNote}>{t("analytics.dashboard.trioChartsHint")}</p>
        <MonthTrioChart data={trio} formatCurrency={formatCurrency} large />
      </section>

      <section>
        <h4 className={styles.ledgerHeading}>{t("analytics.ledger.tableTitle")}</h4>
        <Table size="sm" hover responsive borderless className={`${styles.ledgerTable} mb-1`}>
          <thead>
            <tr>
              <th scope="col">{t("analytics.ledger.month")}</th>
              <th scope="col" className="text-end">
                {t("analytics.flow.income")}
              </th>
              <th scope="col" className="text-end">
                {t("analytics.flow.expenses")}
              </th>
              <th scope="col" className="text-end">
                {t("analytics.ledger.net")}
              </th>
              <th scope="col" className="text-end d-none d-sm-table-cell">
                {t("analytics.ledger.rate")}
              </th>
              <th scope="col" className="text-end d-none d-sm-table-cell">
                {t("analytics.netPosition.title")}
              </th>
            </tr>
          </thead>
          <tbody>
            {[...ledger.rows].reverse().map((row) => (
              <tr key={row.key}>
                <th scope="row" className="fw-semibold text-nowrap">
                  {monthLabel(row.start)}
                  {row.running && (
                    <Badge pill color="secondary" className={`${styles.ledgerTag} ms-1`}>
                      {t("analytics.ledger.running")}
                    </Badge>
                  )}
                  {row.key === ledger.best && (
                    <Badge pill color="success" className={`${styles.ledgerTag} ms-1`}>
                      {t("analytics.ledger.bestTag")}
                    </Badge>
                  )}
                  {row.key === ledger.worst && (
                    <Badge pill color="danger" className={`${styles.ledgerTag} ms-1`}>
                      {t("analytics.ledger.worstTag")}
                    </Badge>
                  )}
                </th>
                <td className="text-end">{formatCurrency(row.income)}</td>
                <td className="text-end">{formatCurrency(row.expenses)}</td>
                <td className="text-end fw-semibold" style={{ color: tone(row.net) }}>
                  {signed(row.net)}
                </td>
                <td className="text-end d-none d-sm-table-cell">{rate(row.rate)}</td>
                <td className="text-end d-none d-sm-table-cell">{signed(row.cumulative)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            {ledger.average && (
              <tr className={styles.ledgerFootFirst}>
                <th scope="row">{t("analytics.ledger.averageRow")}</th>
                <td className="text-end">{formatCurrency(ledger.average.income)}</td>
                <td className="text-end">{formatCurrency(ledger.average.expenses)}</td>
                <td className="text-end fw-semibold" style={{ color: tone(ledger.average.net) }}>
                  {signed(ledger.average.net)}
                </td>
                <td className="d-none d-sm-table-cell" />
                <td className="d-none d-sm-table-cell" />
              </tr>
            )}
            <tr className={ledger.average ? undefined : styles.ledgerFootFirst}>
              <th scope="row">{t("common.total")}</th>
              <td className="text-end fw-semibold">{formatCurrency(ledger.total.income)}</td>
              <td className="text-end fw-semibold">{formatCurrency(ledger.total.expenses)}</td>
              <td className="text-end fw-bold" style={{ color: tone(ledger.total.net) }}>
                {signed(ledger.total.net)}
              </td>
              <td className="text-end d-none d-sm-table-cell">{rate(ledger.total.rate)}</td>
              <td className="d-none d-sm-table-cell" />
            </tr>
          </tfoot>
        </Table>
        <p className={styles.ledgerNote}>{t("analytics.ledger.finishedNote")}</p>
      </section>
    </div>
  );
}
