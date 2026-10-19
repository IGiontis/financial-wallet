import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { FiUsers } from "react-icons/fi";
import { useCurrencyConverter } from "../../../shared/hooks/useCurrencyConverter";
import { useDebts } from "../../debts/useDebts";
import type { InvestmentGoalWithStats } from "../../../shared/types/IndexTypes";

/**
 * «550 € με χρέος στον Νίκο» — on a goal that someone else paid part of.
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
      const debt = debts?.find((d) => d.id === c.debtId);
      // Until the debts have loaded, what was covered; after, what is still owed — none, if cleared or deleted.
      const owed = debts ? (debt && !debt.isSettled ? debt.remaining : 0) : c.amount;
      return { person: c.person, owed };
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
          className="d-inline-flex align-items-center gap-1 text-decoration-none"
          style={{ fontSize: compact ? 11.5 : 12.5, fontWeight: 600, color: "var(--color-goal-text)" }}
        >
          <FiUsers size={compact ? 11 : 13} aria-hidden />
          {t("goalWizard.coveredMark", { amount: format(c.owed), who: c.person })}
        </Link>
      ))}
    </span>
  );
}

export default CoveredMark;
