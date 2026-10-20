import { useMemo, useState } from "react";
import { Card, CardBody, Progress } from "reactstrap";
import { useTranslation } from "react-i18next";
import { useBills } from "../bills/useBills";
import { useDebts } from "../debts/useDebts";
import { committedMonthly, cushionLasts, cushionMonthly, EMERGENCY_MONTHS, emergencyTarget } from "./cushion";

/**
 * «Μαξιλάρι ασφαλείας»: how long the money you can spend would carry what a
 * bad month still has to pay — the bills and the instalments.
 *
 * The cushion is the page's own «Διαθέσιμα» (the banks, less what is set aside
 * for goals), handed in rather than worked out again, so the two figures one
 * card apart can never disagree. No goal money in it at all: a goal is money
 * already promised to something else.
 */
export function CushionCard({ available, formatCurrency }: { available: number; formatCurrency: (n: number) => string }) {
  const { t, i18n } = useTranslation();
  const { data: bills = [] } = useBills();
  const { data: debts = [] } = useDebts();
  const [now] = useState(() => new Date());

  // The goals' months are no part of it — see `cushionMonthly` — so none are passed.
  const committed = useMemo(() => committedMonthly(bills, [], debts, now), [bills, debts, now]);
  const monthly = cushionMonthly(committed);
  const target = emergencyTarget(committed);
  if (monthly <= 0) return null;

  const saved = Math.max(available, 0);
  const share = target > 0 ? Math.min(saved / target, 1) : 0;
  const lasts = cushionLasts(saved, monthly);
  const lastsText = !lasts
    ? ""
    : saved < 0.005
      ? t("cushion.none")
      : "days" in lasts
        ? t("cushion.lastsDays", { count: lasts.days })
        : t("cushion.lastsMonths", { count: lasts.months, months: new Intl.NumberFormat(i18n.resolvedLanguage ?? "en", { maximumFractionDigits: 1 }).format(lasts.months) });

  return (
    <Card className="mb-3">
      <CardBody>
        {/* The question first, then its answer in time — "8 days" — and only then
            the figures behind it. Two euro amounts and a convention, on their own,
            said nothing anyone could act on. */}
        <div className="fw-semibold" style={{ fontSize: 14 }}>
          {t("cushion.title")}
        </div>
        <p className="small text-body-secondary mb-2">{t("cushion.question")}</p>
        <div className="fw-bold mb-2" style={{ fontSize: 18, color: share >= 1 ? "var(--color-income-text)" : undefined }}>
          {lastsText}
        </div>
        <Progress value={share * 100} color="success" style={{ height: 6 }} aria-label={t("cushion.title")} />
        <div className="small mt-1" style={{ fontVariantNumeric: "tabular-nums" }}>
          {t(share >= 1 ? "cushion.ofMet" : "cushion.of", { saved: formatCurrency(saved), target: formatCurrency(target), months: EMERGENCY_MONTHS })}
        </div>
        <p className="small text-body-secondary mb-0 mt-2">{t("cushion.note", { months: EMERGENCY_MONTHS, amount: formatCurrency(monthly) })}</p>
      </CardBody>
    </Card>
  );
}

export default CushionCard;
