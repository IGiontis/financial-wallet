import { useMemo, useState } from "react";
import { Card, CardBody, Progress } from "reactstrap";
import { useTranslation } from "react-i18next";
import { useBills } from "../bills/useBills";
import { useDebts } from "../debts/useDebts";
import { useInvestmentGoals } from "../budget/useInvestments";
import { ownSaved } from "../budget/goalHolding";
import { committedMonthly, EMERGENCY_MONTHS, emergencyTarget } from "./cushion";

/**
 * «Μαξιλάρι ασφαλείας»: what is set aside in goals against three months of
 * what is already spoken for — the bills, the goals' months and the
 * instalments. It came from the old Allocation page, figures unchanged.
 *
 * Only your own money counts: what someone else paid toward a goal was spent
 * the day they paid, and would cushion nothing.
 */
export function CushionCard({ formatCurrency }: { formatCurrency: (n: number) => string }) {
  const { t } = useTranslation();
  const { data: bills = [] } = useBills();
  const { data: goals = [] } = useInvestmentGoals();
  const { data: debts = [] } = useDebts();
  const [now] = useState(() => new Date());

  const committed = useMemo(() => committedMonthly(bills, goals, debts, now), [bills, goals, debts, now]);
  const target = emergencyTarget(committed);
  const saved = useMemo(
    () => goals.filter((g) => g.isActive && !g.isCompleted).reduce((sum, g) => sum + ownSaved({ totalSaved: g.totalSaved ?? 0, totalCovered: g.totalCovered }), 0),
    [goals],
  );
  if (committed.total <= 0) return null;
  const share = target > 0 ? Math.min(saved / target, 1) : 0;

  return (
    <Card className="mb-3">
      <CardBody>
        <div className="d-flex align-items-baseline justify-content-between gap-2 mb-2">
          <span className="fw-semibold" style={{ fontSize: 14 }}>
            {t("cushion.title")}
          </span>
          <span className="fw-bold" style={{ fontVariantNumeric: "tabular-nums" }}>
            {t("cushion.of", { saved: formatCurrency(saved), target: formatCurrency(target) })}
          </span>
        </div>
        <Progress value={share * 100} color="success" style={{ height: 6 }} aria-label={t("cushion.title")} />
        <p className="small text-body-secondary mb-0 mt-2">{t("cushion.note", { months: EMERGENCY_MONTHS, amount: formatCurrency(committed.total) })}</p>
      </CardBody>
    </Card>
  );
}

export default CushionCard;
