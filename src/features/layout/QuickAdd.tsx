import { lazy, Suspense, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "react-toastify";
import { useCategories, useCreateTransaction } from "../transactions/hooks/useTransactions";
import { saveWithoutWaiting } from "../../shared/utils/saveWithoutWaiting";

// The add form is a wizard with a category grid, a payee picker and Formik
// behind it — most of a page's worth of code, and the shell is on every page.
// Loaded on its own, so the first paint of whatever page you open does not wait
// for a form you may not open at all.
const loadAddForm = () => import("../transactions/components/AddTransactionModal");
const AddTransactionModal = lazy(loadAddForm);

/** The form and the two queries it needs, mounted only once somebody asks for it. */
function QuickAddForm({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const { t } = useTranslation();
  const createTransaction = useCreateTransaction();
  const { data: categories = [] } = useCategories();

  return (
    <AddTransactionModal
      isOpen={isOpen}
      onClose={onClose}
      categories={categories}
      onSubmit={(data) => saveWithoutWaiting(createTransaction, data, () => toast.error(t("transactions.saveFailed")))}
    />
  );
}

/**
 * «Νέα συναλλαγή» from any page: the bar's «+», the sidebar's button and the N
 * key all open this.
 *
 * Wired exactly as the Overview's floating button was — the same form, the same
 * save that does not wait for the server, the same message if the save is
 * refused afterwards — because this replaces it.
 *
 * Nothing is mounted until the first press. The categories are a Firestore read
 * the app runs on a free tier's budget for, and a shell that fetched them for
 * every page would spend it on a form most visits never open. After the first
 * press the form stays mounted, so it closes with its animation rather than
 * vanishing, and opens at once the next time.
 */
export function QuickAdd({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const [wanted, setWanted] = useState(isOpen);
  // Adjusting state from a prop during render — React's own pattern for
  // "remember that this has happened", with no effect and no extra paint.
  if (isOpen && !wanted) setWanted(true);

  // The code (not the data) fetched while the browser is idle, so the first
  // press opens the form instead of waiting on a download. Reads nothing.
  useEffect(() => {
    const idle = window.requestIdleCallback ?? ((callback: () => void) => window.setTimeout(callback, 2000));
    const cancel = window.cancelIdleCallback ?? window.clearTimeout;
    const handle = idle(() => void loadAddForm().catch(() => undefined));
    return () => cancel(handle);
  }, []);

  if (!wanted) return null;
  return (
    <Suspense fallback={null}>
      <QuickAddForm isOpen={isOpen} onClose={onClose} />
    </Suspense>
  );
}
