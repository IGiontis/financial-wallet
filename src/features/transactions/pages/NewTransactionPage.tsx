import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { toast } from "react-toastify";
import type { CreateTransactionDTO } from "../../../shared/types/IndexTypes";
import { useCategories, useCreateTransaction } from "../hooks/useTransactions";
import AddTransactionModal from "../components/AddTransactionModal";
import TransferWizard from "../components/TransferWizard";
import { saveWithoutWaiting } from "../../../shared/utils/saveWithoutWaiting";
import { PageShell } from "../../../shared/components/PageShell";

/**
 * «Νέα συναλλαγή» as a page of its own, under Transactions in the menu.
 *
 * The same wizard the dialog was, across the whole page and down to the
 * footer: the steps along the top, Back and Next always at the bottom, and the
 * room between given to the step — the categories fill it and scroll inside
 * it. Saving or cancelling goes to the list.
 */
export function NewTransactionPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { data: categories = [] } = useCategories();
  const createMutation = useCreateTransaction();
  // «Μεταφορά», the first step's third kind, swaps in its own wizard.
  const [transfer, setTransfer] = useState(false);

  const handleCreate = (data: CreateTransactionDTO): Promise<void> => saveWithoutWaiting(createMutation, data, () => toast.error(t("transactions.saveFailed")));

  return (
    <PageShell className="fill-page">
      <h1 className="h5 fw-semibold text-body-emphasis mb-3">{t(transfer ? "transactions.transfer.title" : "transactions.addTransaction")}</h1>
      {transfer ? (
        <TransferWizard asPage onClose={() => navigate("/transactions")} onBack={() => setTransfer(false)} />
      ) : (
        <AddTransactionModal asPage isOpen categories={categories} onSubmit={handleCreate} onClose={() => navigate("/transactions")} onPickTransfer={() => setTransfer(true)} />
      )}
    </PageShell>
  );
}
