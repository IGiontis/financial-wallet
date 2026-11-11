import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { FiArrowRight, FiLock } from "react-icons/fi";
import type { LockState } from "../hooks/useRecordLocks";

/**
 * Says why a record that is half of a linked set can't be changed freely here,
 * with the way to where it is: «Αλλάζει από τα Δάνεια», opening the Debts page
 * on the person the debt is with. Nothing for a record that is free.
 */
export function LockNote({ state, onLeave }: { state: LockState | undefined; onLeave?: () => void }) {
  const { t } = useTranslation();
  if (state?.pending) return <p className="small text-body-secondary mt-3 mb-0">{t("transactions.lockChecking")}</p>;
  const lock = state?.lock;
  if (!lock || (lock.kind !== "covered" && lock.kind !== "debt")) return null;

  const why =
    lock.kind === "debt"
      ? t("transactions.debtLocked")
      : t(lock.payeeLocked ? "transactions.lockCoveredNotesOnly" : "transactions.lockCoveredWhy", { person: lock.person });

  return (
    <div className="small mt-3 mb-0 d-flex flex-column gap-1" role="note">
      <Link to="/debts" state={lock.person ? { person: lock.person } : undefined} onClick={onLeave} className="d-inline-flex align-items-center gap-1 fw-semibold align-self-start">
        <FiLock size={13} aria-hidden />
        {t("transactions.lockFromDebts")}
        <FiArrowRight size={13} aria-hidden />
      </Link>
      <span className="text-body-secondary">{why}</span>
    </div>
  );
}
