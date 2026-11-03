import { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { toast } from "react-toastify";
import { FiPlus } from "react-icons/fi";
import AddTransactionModal from "../transactions/components/AddTransactionModal";
import TransferWizard from "../transactions/components/TransferWizard";
import { useCategories, useCreateTransaction } from "../transactions/hooks/useTransactions";
import { saveWithoutWaiting } from "../../shared/utils/saveWithoutWaiting";
import { useCurrentPageAdd } from "../../shared/hooks/usePageAdd";
import type { CreateTransactionDTO } from "../../shared/types/IndexTypes";
import styles from "./css/AddFab.module.css";

/** The address the app icon's shortcut opens: any page, with this asking for a new transaction. */
export const ADD_PARAM = "quick";

/**
 * The «+» on every page, bottom right. On a page with an add of its own —
 * Goals, Banks & cash, Investments, Debts & loans (`usePageAdd`) — it opens
 * that; everywhere else the ordinary income/expense form, the same one the
 * Transactions page opens, with «Μεταφορά» swapping in its own wizard.
 *
 * Also opened by the app icon's shortcut (`?quick=expense`).
 */
export function AddFab() {
  const { t } = useTranslation();
  const { pathname, search } = useLocation();
  const navigate = useNavigate();
  const pageAdd = useCurrentPageAdd();
  const [open, setOpen] = useState<"transaction" | "transfer" | null>(null);

  // From the shortcut on the app icon: open for as long as the address asks; closing takes the question off it.
  const fromShortcut = new URLSearchParams(search).get(ADD_PARAM) === "expense";
  const close = () => {
    setOpen(null);
    if (fromShortcut) navigate(pathname, { replace: true });
  };

  // Not over the full form, which is the same thing as a page.
  const onFullForm = pathname.startsWith("/transactions/new");
  const label = pageAdd?.label ?? t("transactions.addTransaction");

  return (
    <>
      {!onFullForm && (
        <button type="button" className={styles.fab} onClick={() => (pageAdd ? pageAdd.onAdd() : setOpen("transaction"))} aria-label={label} title={label} data-tour="quick-expense">
          <FiPlus aria-hidden />
        </button>
      )}
      {(open === "transaction" || (fromShortcut && open === null)) && <TransactionDialog onClose={close} onPickTransfer={() => setOpen("transfer")} />}
      {open === "transfer" && <TransferWizard onClose={close} onBack={() => setOpen("transaction")} />}
    </>
  );
}

function TransactionDialog({ onClose, onPickTransfer }: { onClose: () => void; onPickTransfer: () => void }) {
  const { t } = useTranslation();
  const { data: categories = [] } = useCategories();
  const create = useCreateTransaction();
  const handleCreate = (data: CreateTransactionDTO): Promise<void> => saveWithoutWaiting(create, data, () => toast.error(t("transactions.saveFailed")));
  return <AddTransactionModal isOpen onClose={onClose} categories={categories} onSubmit={handleCreate} onPickTransfer={onPickTransfer} />;
}

export default AddFab;
