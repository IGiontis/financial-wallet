import { useTranslation } from "react-i18next";
import { type SpendVerdict } from "./accountsUtils";
import { useCurrencyConverter } from "../../shared/hooks/useCurrencyConverter";

/**
 * What the reader is told when money would take an account below zero
 * (`useSpendCheck`, rule 22). It sits under the AMOUNT, which is where the
 * check belongs — the card was picked a step earlier.
 *
 * Two voices for the same refusal: cash that is not in the pocket cannot be
 * spent at all, while a card more often means our balance is behind — so that
 * message points at the balance update instead of calling him wrong.
 */
export function SpendNote({ check, className = "" }: { check: SpendVerdict; className?: string }) {
  const { t } = useTranslation();
  const { format } = useCurrencyConverter();
  if (check.kind === "ok") return null;
  const values = { holds: format(check.holds), short: format(check.short) };
  return <div className={`invalid-feedback d-block ${className}`}>{t(check.on === "cash" ? "accounts.spendRefuse" : "accounts.spendRefuseCard", values)}</div>;
}

export default SpendNote;
