import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { FiAlertTriangle } from "react-icons/fi";
import { toneChip } from "../../../shared/utils/tone";
import { useCurrencyConverter } from "../../../shared/hooks/useCurrencyConverter";
import { useDebts } from "../../debts/useDebts";
import type { InvestmentGoalWithStats } from "../../../shared/types/IndexTypes";

/**
 * «⚠ 550 € χρέος · Νίκος» — on a goal that someone else paid part of: a small
 * yellow warning, since it is money still owed on a goal that reads as funded.
 *
 * The goal reads as funded, because it is; this is the one thing that says what
 * it cost you to get there. It shows what is still owed, so it shrinks as the
 * debt is paid back, and goes when it is cleared — or when the debt itself is
 * gone. Tapping it goes to the debts.
 */
export function CoveredMark({ goal, compact = false }: { goal: Pick<InvestmentGoalWithStats, "covered">; compact?: boolean }) {
  const { t } = useTranslation();
  const { format } = useCurrencyConverter();
  const { data: debts } = useDebts();
  if (!goal.covered?.length) return null;

  const open = goal.covered
    .map((c) => {
      // Until the debts have loaded, what was covered; after, what is still owed on
      // each of their debts — none for one cleared or deleted.
      const owed = debts ? c.debtIds.reduce((sum, id) => { const debt = debts.find((d) => d.id === id); return debt && !debt.isSettled ? sum + debt.remaining : sum; }, 0) : c.amount;
      return { person: c.person, owed: Math.round(owed * 100) / 100 };
    })
    .filter((c) => c.owed > 0.005);
  if (open.length === 0) return null;

  return (
    <span className={compact ? "d-flex flex-wrap gap-1" : "d-flex flex-column gap-1"}>
      {open.map((c) => (
        <Link
          key={c.person}
          to="/debts"
          onClick={(event) => event.stopPropagation()}
          title={t("goalWizard.coveredMarkOpen")}
          className="d-inline-flex align-items-center gap-1 text-decoration-none align-self-start"
          style={{
            ...toneChip("goal", true),
            border: "1px solid var(--goal-edge)",
            borderRadius: 999,
            padding: compact ? "1px 7px" : "2px 9px",
            fontSize: compact ? 11.5 : 12,
            fontWeight: 600,
          }}
        >
          <FiAlertTriangle size={compact ? 11 : 12} aria-hidden />
          {t("goalWizard.coveredMark", { amount: format(c.owed), who: c.person })}
        </Link>
      ))}
    </span>
  );
}

export default CoveredMark;
