import { useMemo } from "react";
import { Card, CardBody } from "reactstrap";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import type { Transaction } from "../../../shared/types/IndexTypes";
import { currentBalance, excludedByOpeningDate } from "../../../shared/utils/balance";
import { useOpeningBalance } from "../../../shared/hooks/useOpeningBalance";

/**
 * How much money there is right now — deliberately outside the metric row.
 *
 * Everything in that row answers "during the selected period"; this answers
 * "as of today" and ignores the period picker entirely. Sitting it among them
 * would make it read as period-scoped, which is the one thing it must not be.
 */
export default function CurrentBalanceCard({ transactions, formatCurrency }: { transactions: Transaction[]; formatCurrency: (n: number) => string }) {
  const { t, i18n } = useTranslation();
  const { opening } = useOpeningBalance();

  const balance = useMemo(() => currentBalance(transactions, opening), [transactions, opening]);
  const excluded = useMemo(() => excludedByOpeningDate(transactions, opening), [transactions, opening]);

  const dateFmt = new Intl.DateTimeFormat(i18n.resolvedLanguage ?? "en", { day: "numeric", month: "short", year: "numeric" });

  return (
    <Card className="mb-4">
      <CardBody className="p-3 p-sm-4">
        <div className="d-flex justify-content-between align-items-start gap-3 flex-wrap">
          <div style={{ minWidth: 0 }}>
            <p className="text-uppercase text-body-secondary mb-1" style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.05em" }}>
              {t("overview.currentBalance")}
            </p>
            <p
              className="fw-bold mb-1"
              style={{ fontSize: "2rem", lineHeight: 1.1, fontVariantNumeric: "tabular-nums", color: balance >= 0 ? "var(--color-income)" : "var(--color-expense)" }}
            >
              {formatCurrency(balance)}
            </p>
            <p className="text-body-secondary mb-0" style={{ fontSize: 12 }}>
              {opening ? t("overview.currentBalanceHint", { date: dateFmt.format(opening.date) }) : t("overview.currentBalanceNoOpening")}
            </p>
          </div>

          {/* Without a declared starting point the figure is only as complete as
              the history entered, which is worth saying rather than implying. */}
          {!opening && (
            <Link to="/settings" className="btn btn-outline-secondary btn-sm flex-shrink-0">
              {t("overview.setStartingBalance")}
            </Link>
          )}
        </div>

        {/* The reassurance that makes backfilling safe: those older records are
            in the charts, they are simply not deducted twice. */}
        {excluded > 0 && (
          <p className="mb-0 mt-2" style={{ fontSize: 11.5, color: "var(--color-text-secondary)" }}>
            ⓘ {t("overview.currentBalanceExcluded", { count: excluded })}
          </p>
        )}
      </CardBody>
    </Card>
  );
}
