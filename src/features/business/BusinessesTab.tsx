import { useMemo, type CSSProperties } from "react";
import { Button, Modal, ModalBody, ModalFooter, ModalHeader } from "reactstrap";
import { useTranslation } from "react-i18next";
import { FiEdit2, FiTrash2 } from "react-icons/fi";
import { AddButton } from "../../shared/components/AddButton";
import { RowMenu } from "../../shared/components/RowMenu";
import { useSavedFlash } from "../../shared/feedback/saveFeedback";
import { useOfflineGuard } from "../../shared/hooks/useOfflineGuard";
import { toneChip } from "../../shared/utils/tone";
import type { Business, BusinessEntry } from "../../shared/types/IndexTypes";
import { BUSINESSES_MAX } from "./businessKeys";
import { activeLines } from "./businessFormat";
import { businessReach } from "./businessSummary";
import styles from "./css/Business.module.css";

// «Οι δουλειές μου»: one card per business — its name, its income lines in
// green, its expense lines in red, and the ⋮ with «Επεξεργασία» and
// «Διαγραφή». All of it the user's own, made here from nothing. On the user
// document: no read of its own.

export function BusinessesTab({ businesses, entries, onAdd, onEdit, onDelete }: { businesses: readonly Business[]; entries: readonly BusinessEntry[]; onAdd: () => void; onEdit: (business: Business) => void; onDelete: (business: Business) => void }) {
  const { t } = useTranslation();
  const settingsGuard = useOfflineGuard("settings");
  const deleteGuard = useOfflineGuard("delete");
  const flashClass = useSavedFlash("businesses", useMemo(() => businesses.map((b) => b.id), [businesses]), "card");
  const closings = useMemo(() => {
    const count = new Map<string, number>();
    for (const e of entries) count.set(e.businessId, (count.get(e.businessId) ?? 0) + 1);
    return count;
  }, [entries]);
  const full = businesses.length >= BUSINESSES_MAX;

  if (businesses.length === 0) return <FirstBusinessInvite onAdd={onAdd} />;

  const pills = (names: string[], tone: "income" | "expense") => (
    <ul className={styles.pills}>
      {names.map((name, i) => (
        <li key={`${i}-${name}`} className="badge rounded-pill" style={{ ...toneChip(tone), fontSize: "var(--fs-small)", fontWeight: 500 } as CSSProperties}>
          {name}
        </li>
      ))}
    </ul>
  );

  return (
    <>
      {/* The app's one «+» (`AddButton`), pinned left, as on the Names page's lists. */}
      <div className="d-flex align-items-center gap-2 mb-3">
        <AddButton small label={t("business.newBusiness")} onClick={onAdd} disabled={settingsGuard.locked || full} />
        <span className="text-body-secondary" style={{ fontSize: "var(--fs-text)" }}>
          {full ? t("business.businessesFull", { count: BUSINESSES_MAX }) : t("business.newBusiness")}
        </span>
      </div>
      <ul className={styles.businessCards}>
        {businesses.map((business) => {
          const incomes = activeLines(business.incomeLines).map((l) => l.name);
          const expenses = activeLines(business.expenseLines).map((l) => l.name);
          return (
            <li key={business.id} className={`${styles.card} ${styles.businessCard} ${flashClass(business.id)}`}>
              <div className={styles.businessHead}>
                <div style={{ minWidth: 0 }}>
                  <h3 className="h6 fw-semibold text-body-emphasis mb-0 text-break">{business.name}</h3>
                  <p className="small text-body-secondary mb-0">{t("business.closingsCount", { count: closings.get(business.id) ?? 0 })}</p>
                </div>
                <RowMenu
                  label={t("business.rowActions", { name: business.name })}
                  entries={[
                    { label: t("common.edit"), icon: <FiEdit2 size={14} aria-hidden />, disabled: settingsGuard.locked, onSelect: () => onEdit(business) },
                    { label: t("common.delete"), icon: <FiTrash2 size={14} aria-hidden />, danger: true, disabled: deleteGuard.locked, onSelect: () => onDelete(business) },
                  ]}
                />
              </div>
              <p className={styles.pillsLabel}>{t("business.incomeLines")}</p>
              {pills(incomes, "income")}
              <p className={styles.pillsLabel}>{t("business.expenseLines")}</p>
              {expenses.length > 0 ? pills(expenses, "expense") : <p className="small text-body-secondary mb-0">{t("business.noExpenseLines")}</p>}
            </li>
          );
        })}
      </ul>
    </>
  );
}

/** What the page says before there is any business: an invitation, with the way to make one. */
export function FirstBusinessInvite({ onAdd }: { onAdd: () => void }) {
  const { t } = useTranslation();
  const guard = useOfflineGuard("settings");
  return (
    <div className="text-center py-5 text-body-secondary">
      <p className="fs-1 mb-2" aria-hidden>
        🏪
      </p>
      <p className="fw-medium text-body-emphasis">{t("business.firstBusinessTitle")}</p>
      <p className="small">{t("business.firstBusinessBody")}</p>
      <Button color="primary" onClick={onAdd} disabled={guard.locked} title={guard.reason}>
        + {t("business.firstBusinessAdd")}
      </Button>
    </div>
  );
}

/**
 * «Διαγραφή;» for a business — and, plainly, everything that goes with it:
 * how many closings, and how many records of their profits and losses in the
 * owner's own money, with what they added up to. Counted from the closings on
 * the device (no read); the delete itself asks the server what is there.
 */
export function DeleteBusinessModal({ business, entries, busy, formatCurrency, onConfirm, onClose }: { business: Business; entries: readonly BusinessEntry[]; busy: boolean; formatCurrency: (n: number) => string; onConfirm: () => void; onClose: () => void }) {
  const { t } = useTranslation();
  const guard = useOfflineGuard("delete");
  const reach = businessReach(entries, business.id);
  return (
    <Modal isOpen toggle={onClose} centered size="sm" zIndex={1080}>
      <ModalHeader toggle={onClose}>{t("common.deleteConfirmTitle")}</ModalHeader>
      <ModalBody style={{ fontSize: "var(--fs-lead)" }}>
        <p className={reach.closings > 0 ? undefined : "mb-0"}>{t("business.deleteBusiness", { name: business.name })}</p>
        {reach.closings > 0 && <p className={reach.records > 0 ? "mb-2" : "mb-0"}>{t("business.deleteBusinessClosings", { count: reach.closings })}</p>}
        {reach.records > 0 && (
          <>
            <p className="mb-1">{t("business.deleteBusinessRecords", { count: reach.records })}</p>
            <ul className="mb-0 ps-3" style={{ fontSize: "var(--fs-text)" }}>
              {reach.profitIn > 0 && <li>{t("business.deleteBusinessProfits", { amount: formatCurrency(reach.profitIn) })}</li>}
              {reach.lossOut > 0 && <li>{t("business.deleteBusinessLosses", { amount: formatCurrency(reach.lossOut) })}</li>}
            </ul>
          </>
        )}
        <p className="small text-body-secondary mt-2 mb-0">{t("business.cannotUndo")}</p>
        {guard.locked && <p className="small text-body-secondary mt-2 mb-0">{guard.reason}</p>}
      </ModalBody>
      <ModalFooter>
        <Button color="secondary" outline onClick={onClose}>
          {t("common.cancel")}
        </Button>
        <Button color="danger" onClick={onConfirm} disabled={busy || guard.locked}>
          {busy ? t("common.deleting") : reach.closings > 0 ? t("business.deleteAll") : t("common.delete")}
        </Button>
      </ModalFooter>
    </Modal>
  );
}
