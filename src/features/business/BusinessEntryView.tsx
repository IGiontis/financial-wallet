import { Fragment } from "react";
import { Button, Modal, ModalBody, ModalFooter, ModalHeader } from "reactstrap";
import { useTranslation } from "react-i18next";
import { FiEdit2 } from "react-icons/fi";
import { DeleteButton } from "../../shared/components/DeleteButton";
import { useOfflineGuard } from "../../shared/hooks/useOfflineGuard";
import { useRunOnce } from "../../shared/hooks/useRunOnce";
import { BUSINESS_CATEGORY_ID, VIRTUAL_CATEGORIES, categoryLabel } from "../../shared/utils/categories";
import { firestoreToDate } from "../../shared/utils/dates";
import { formatTable } from "../transactions/transactionDates";
import { useTransactions } from "../transactions/hooks/useTransactions";
import { useAccountList } from "../accounts/useMoneyAccounts";
import type { Business, BusinessEntry } from "../../shared/types/IndexTypes";
import { closingFigures, personalMove } from "./businessSummary";
import { businessOf, expenseName, lineName, profitTone, signed } from "./businessFormat";
import styles from "./css/Business.module.css";
import wiz from "../../shared/css/Wizard.module.css";

/** A closing's personal record, as it is named in a view or a question: what it did, where, and as what. */
function usePersonalSide(entry: BusinessEntry) {
  const { t } = useTranslation();
  const accounts = useAccountList();
  const { data: transactions } = useTransactions();
  const record = transactions?.find((tx) => tx.id === entry.linkedTransactionId);
  const accountId = record?.accountId ?? entry.accountId;
  const category = VIRTUAL_CATEGORIES[BUSINESS_CATEGORY_ID];
  return {
    move: personalMove(closingFigures(entry).profit),
    place: accounts.find((a) => a.id === accountId)?.name ?? t("business.mainAccount"),
    category: `${category.icon} ${categoryLabel(category.name, t)}`,
    description: record?.description,
  };
}

/**
 * A closing, to read: its business, every income and expense line, the
 * profit, and what it did to the owner's own money. Changing it is a step from
 * here («Επεξεργασία»); deleting sits on its own at the far left.
 */
export function BusinessEntryView({
  entry,
  businesses,
  formatCurrency,
  onClose,
  onEdit,
  onDelete,
}: {
  entry: BusinessEntry;
  businesses: readonly Business[];
  formatCurrency: (n: number) => string;
  onClose: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const { t, i18n } = useTranslation();
  const lang = i18n.resolvedLanguage ?? "en";
  const deleteGuard = useOfflineGuard("delete");
  const personal = usePersonalSide(entry);
  const business = businessOf(businesses, entry.businessId);
  const f = closingFigures(entry);
  const gone = t("business.lineGone");
  const stat = (label: string, value: string, className = "") => (
    <div className={wiz.wizStatic}>
      <span className={wiz.wizLabel}>{label}</span>
      <span className={`${wiz.wizValue} ${className}`}>{value}</span>
    </div>
  );

  return (
    <Modal isOpen toggle={onClose} centered scrollable>
      <ModalHeader toggle={onClose}>
        {business?.name ?? t("business.unknownBusiness")} · {formatTable(firestoreToDate(entry.date), lang)}
      </ModalHeader>
      <ModalBody>
        <div className={wiz.wizCard} role="group" aria-label={t("business.incomeLines")}>
          <div className={styles.sideHead}>{t("business.incomeLines")}</div>
          {(entry.incomes ?? []).map((line, i) => (
            <Fragment key={`${line.lineId}-${i}`}>{stat(lineName(business, line.lineId, gone), signed(line.amount, formatCurrency, "+"))}</Fragment>
          ))}
          {stat(t("business.turnover"), signed(f.turnover, formatCurrency, "+"), styles.total)}
        </div>
        <div className={`${wiz.wizCard} mt-3`} role="group" aria-label={t("business.expenseLines")}>
          <div className={styles.sideHead}>{t("business.expenseLines")}</div>
          {(entry.expenses ?? []).map((line, i) => (
            <Fragment key={`${line.lineId ?? line.name}-${i}`}>
              {stat([expenseName(business, line, gone), line.lineId ? "" : t("business.oneOffTag"), line.note].filter(Boolean).join(" · "), signed(line.amount, formatCurrency, "−"))}
            </Fragment>
          ))}
          {stat(t("business.expenses"), signed(f.expenses, formatCurrency, "−"), styles.total)}
        </div>
        <div className={`${wiz.wizCard} mt-3`}>
          {stat(t(Math.round(f.profit * 100) < 0 ? "business.loss" : "business.profit"), signed(f.profit, formatCurrency), `${styles.total} ${profitTone(f.profit, styles)}`)}
          {entry.notes && stat(t("common.notes"), entry.notes)}
        </div>
        <div className={`${wiz.wizCard} mt-3`} role="group" aria-label={t("business.sidePersonal")}>
          <div className={styles.sideHead}>{t("business.sidePersonal")}</div>
          {personal.move ? (
            <>
              {stat(
                t(personal.move.type === "income" ? "business.moneyIn" : "business.moneyOut"),
                `${signed(personal.move.amount, formatCurrency, personal.move.type === "income" ? "+" : "−")} · ${personal.place}`,
                personal.move.type === "income" ? styles.positive : styles.negative,
              )}
              {stat(t("common.category"), personal.category)}
              {personal.description && stat(t("business.recordName"), personal.description)}
            </>
          ) : (
            stat(t("business.moneyIn"), t("business.nothingMoves"))
          )}
        </div>
      </ModalBody>
      <ModalFooter className="justify-content-between">
        <DeleteButton opensConfirm onClick={onDelete} disabled={deleteGuard.locked} title={deleteGuard.reason} />
        <Button color="primary" onClick={onEdit}>
          <FiEdit2 size={14} className="me-1" aria-hidden />
          {t("common.edit")}
        </Button>
      </ModalFooter>
    </Modal>
  );
}

/**
 * «Διαγραφή;» for a closing — and, plainly, that its record in the owner's
 * own money goes with it: how much, which card.
 */
export function BusinessDeleteModal({ entry, businessName, formatCurrency, busy, onConfirm, onClose }: { entry: BusinessEntry; businessName: string; formatCurrency: (n: number) => string; busy: boolean; onConfirm: () => void | Promise<unknown>; onClose: () => void }) {
  const { t, i18n } = useTranslation();
  const deleteGuard = useOfflineGuard("delete");
  // Runs once; nothing here closes or presses again until the delete answers.
  const [run, running] = useRunOnce();
  const working = running || busy;
  const close = () => {
    if (!working) onClose();
  };

  const personal = usePersonalSide(entry);
  const day = formatTable(firestoreToDate(entry.date), i18n.resolvedLanguage ?? "en");
  const linked = !!entry.linkedTransactionId && !!personal.move;
  return (
    <Modal isOpen toggle={close} backdrop={working ? "static" : true} keyboard={!working} centered size="sm" zIndex={1080}>
      <ModalHeader toggle={working ? undefined : close}>{t("common.deleteConfirmTitle")}</ModalHeader>
      <ModalBody style={{ fontSize: "var(--fs-lead)" }}>
        <p className={linked ? undefined : "mb-0"}>{t("business.deleteClosing", { day, name: businessName })}</p>
        {linked && <p className="mb-0">{t(personal.move!.type === "income" ? "business.deleteClosingIncome" : "business.deleteClosingExpense", { amount: formatCurrency(personal.move!.amount), place: personal.place })}</p>}
        <p className="small text-body-secondary mt-2 mb-0">{t("business.cannotUndo")}</p>
      </ModalBody>
      <ModalFooter>
        <Button color="secondary" outline onClick={close} disabled={working}>
          {t("common.cancel")}
        </Button>
        <Button color="danger" onClick={() => void run(onConfirm)} disabled={working || deleteGuard.locked} title={deleteGuard.reason} aria-busy={working || undefined}>
          {working ? t("common.deleting") : linked ? t("business.deleteBoth") : t("common.delete")}
        </Button>
      </ModalFooter>
    </Modal>
  );
}
