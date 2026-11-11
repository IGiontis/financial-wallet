import { useMemo, useState } from "react";
import { celebrateSave, useSavedFlash } from "../../shared/feedback/saveFeedback";
import { Alert, Badge, Button, Modal, ModalHeader, ModalBody, ModalFooter } from "reactstrap";
import { useTranslation } from "react-i18next";
import { Skeleton, SkeletonRows } from "../../shared/components/Skeletons";
import { FiEdit2 } from "react-icons/fi";
import { groupCategories, type CategoryGroup, type CategoryScope } from "../../shared/utils/categoryNames";
import { useCategories, useCreateCategoryScope, useUpdateCategoryGroup, useDeleteCategoryGroup, useTransactions } from "../transactions/hooks/useTransactions";
import { useBills } from "../bills/useBills";
import { useIncomeList } from "../incomes/useIncomes";
import { useWorkspaceSetting } from "../../shared/hooks/useWorkspaceSetting";
import { PLANNER_KEYS, cleanLines } from "../plannerPage/plannerInputs";
import type { BudgetLine } from "../plannerPage/plannerUtils";
import CategoryModal from "./CategoryModal";
import { categoryUsage, totalUsage, type CategoryUsage } from "./categoryUsage";
import { typesToAdd } from "./categoryScope";
import { useOfflineGuard } from "../../shared/hooks/useOfflineGuard";
import { DeleteButton } from "../../shared/components/DeleteButton";
import { AddButton } from "../../shared/components/AddButton";

/** Badge wording per scope — "both" is the one worth calling out. */
const SCOPE_LABEL = { expense: "transactions.expense", income: "transactions.income", both: "categories.both" } as const;
const SCOPE_COLOR = { expense: "secondary", income: "success", both: "primary" } as const;

/** The kinds of record the delete dialog names, in the order it names them. */
const USAGE_KINDS: (keyof CategoryUsage)[] = ["transactions", "bills", "incomes", "plannerLines"];

/**
 * Everything that can point at a category, from what the app already holds:
 * nothing is read to ask. `ready` once each list has arrived — counting
 * against a list still on its way would let a category in use be deleted.
 */
function useUsageSources() {
  const transactions = useTransactions();
  const bills = useBills();
  const { incomes, isLoading: incomesLoading } = useIncomeList();
  const [storedLines] = useWorkspaceSetting<BudgetLine[]>(PLANNER_KEYS.lines, []);
  const plannerLines = useMemo(() => cleanLines(storedLines), [storedLines]);
  const ready = transactions.isSuccess && bills.isSuccess && !incomesLoading;
  const sources = useMemo(() => ({ transactions: transactions.data ?? [], bills: bills.data ?? [], incomes, plannerLines }), [transactions.data, bills.data, incomes, plannerLines]);
  return { ready, sources };
}

/**
 * The user's own categories, listed and editable.
 *
 * Only their own: the seeded defaults are shared documents, so renaming one
 * here would change it for everybody. They are shown as a read-only count
 * instead, which is the useful part anyway — "you have 34 built-in ones, plus
 * these three of your own".
 *
 * Listed by group rather than by document, so a category that works both ways
 * is one row wearing a "Both" badge. Two rows with the same name would look
 * exactly like the duplicate the New dialog refuses to create.
 */
export default function CategoryManager() {
  const { t } = useTranslation();
  const { data: categories = [], isLoading } = useCategories();

  const createCategory = useCreateCategoryScope();
  const updateCategory = useUpdateCategoryGroup();
  const deleteCategory = useDeleteCategoryGroup();
  const deleteGuard = useOfflineGuard("delete");
  const { ready: usageReady, sources } = useUsageSources();

  const [editing, setEditing] = useState<CategoryGroup | null>(null);
  const [creating, setCreating] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<CategoryGroup | null>(null);
  const [savingEdit, setSavingEdit] = useState(false);

  const own = useMemo(() => groupCategories(categories.filter((c) => !c.isDefault)), [categories]);
  // The category just made or edited lights once its dialog has gone.
  const categoryFlash = useSavedFlash("categories", useMemo(() => own.flatMap((g) => g.members.map((m) => m.id)), [own]));
  const defaultCount = categories.filter((c) => c.isDefault).length;

  // Both halves of a «both» at once: a pair is deleted together, so it is in
  // use if either half is.
  const usage = useMemo(() => (deleteTarget && usageReady ? categoryUsage(deleteTarget.members.map((m) => m.id), sources) : null), [deleteTarget, usageReady, sources]);
  const inUse = usage !== null && totalUsage(usage) > 0;

  const confirmDelete = () => {
    if (!deleteTarget || usage === null || inUse) return;
    deleteCategory.mutate(deleteTarget.members.map((m) => m.id), { onSuccess: () => setDeleteTarget(null) });
  };

  /**
   * Saves an edit. Widening to «both» is the existing documents updated first,
   * then the missing half created under the new name — in that order, so a
   * failure in between leaves a one-sided category with its new name rather
   * than two halves that no longer match and list as two categories.
   */
  const saveEdit = async (group: CategoryGroup, values: { name: string; icon: string; scope: CategoryScope }) => {
    const fields = { name: values.name, icon: values.icon };
    const missing = typesToAdd(group.scope, values.scope);
    setSavingEdit(true);
    try {
      await updateCategory.mutateAsync({ categoryIds: group.members.map((m) => m.id), data: fields });
      for (const type of missing) await createCategory.mutateAsync({ name: fields.name, icon: fields.icon, scope: type });
      celebrateSave({ collection: "categories", id: group.members[0]?.id });
      setEditing(null);
    } catch {
      // Left open, as it was, to try again.
    } finally {
      setSavingEdit(false);
    }
  };

  if (isLoading) return <SkeletonRows count={4} />;

  return (
    <>
      {/* The app's one «+» (`AddButton`) pinned left; the words beside it wrap. */}
      <div className="d-flex align-items-center gap-2 mb-3">
        <AddButton small label={t("categories.new")} onClick={() => setCreating(true)} />
        <span className="text-body-secondary" style={{ fontSize: "var(--fs-text)", minWidth: 0 }}>
          {t("categories.builtInCount", { count: defaultCount })}
        </span>
      </div>

      {own.length === 0 ? (
        <p className="text-body-secondary mb-0" style={{ fontSize: "var(--fs-text)" }}>
          {t("categories.noneYet")}
        </p>
      ) : (
        <div className="d-flex flex-column gap-2">
          {own.map((group) => (
            <div
              key={group.members.map((m) => m.id).join("-")}
              className={`d-flex align-items-center gap-2 px-2 py-2 ${group.members.map((m) => categoryFlash(m.id)).find(Boolean) ?? ""}`}
              style={{ background: "var(--color-background-secondary)", borderRadius: "var(--radius-md)" }}
            >
              <span style={{ fontSize: 18 }} aria-hidden>
                {group.icon ?? "🧾"}
              </span>
              <span className="fw-medium text-break" style={{ fontSize: "var(--fs-lead)", flex: 1, minWidth: 0 }}>
                {group.name}
              </span>
              <Badge color={SCOPE_COLOR[group.scope]} pill style={{ fontSize: "var(--fs-caption)" }}>
                {t(SCOPE_LABEL[group.scope])}
              </Badge>
              <Button color="secondary" outline size="sm" onClick={() => setEditing(group)} aria-label={t("common.edit")} title={t("common.edit")}>
                <FiEdit2 size={13} />
              </Button>
              <DeleteButton opensConfirm iconOnly size="sm" onClick={() => setDeleteTarget(group)} />
            </div>
          ))}
        </div>
      )}

      {creating && (
        <CategoryModal
          existing={categories}
          scope="expense"
          isSaving={createCategory.isPending}
          onClose={() => setCreating(false)}
          onSubmit={(values) =>
            createCategory.mutate(values, {
              onSuccess: () => {
                // Its id is the server's: the row that appears is the one lit.
                celebrateSave({ collection: "categories" });
                setCreating(false);
              },
            })
          }
        />
      )}

      {editing && (
        <CategoryModal
          existing={categories}
          scope={editing.scope}
          category={editing}
          isSaving={savingEdit}
          onClose={() => setEditing(null)}
          onSubmit={(values) => void saveEdit(editing, values)}
        />
      )}

      <Modal isOpen={!!deleteTarget} toggle={() => setDeleteTarget(null)} centered>
        <ModalHeader toggle={() => setDeleteTarget(null)}>{t("categories.deleteTitle")}</ModalHeader>
        <ModalBody>
          {usage === null ? (
            <Skeleton height={14} count={2} />
          ) : inUse ? (
            /* Refused rather than cascaded: deleting would leave those records
               with a category that no longer resolves. Moving them to another
               one writes every one of them, and is not offered (yet). */
            <Alert color="warning" className="mb-0" style={{ fontSize: "var(--fs-text)" }} data-testid="category-in-use">
              <p className="mb-1">{t("categories.deleteUsedBy", { name: deleteTarget?.name ?? "" })}</p>
              <ul className="mb-2 ps-3">
                {USAGE_KINDS.filter((kind) => usage[kind] > 0).map((kind) => (
                  <li key={kind}>{t(`categories.usage${kind[0].toUpperCase()}${kind.slice(1)}`, { count: usage[kind] })}</li>
                ))}
              </ul>
              <p className="mb-0">{t("categories.deleteUsedHint")}</p>
            </Alert>
          ) : (
            <p className="mb-0" style={{ fontSize: "var(--fs-lead)" }}>
              {t("categories.deleteConfirm", { name: deleteTarget?.name ?? "" })}
              {deleteTarget?.scope === "both" && <span className="d-block text-body-secondary mt-1" style={{ fontSize: "var(--fs-small)" }}>{t("categories.deleteBothNote")}</span>}
            </p>
          )}
        </ModalBody>
        <ModalFooter>
          <Button color="secondary" outline onClick={() => setDeleteTarget(null)} disabled={deleteCategory.isPending}>
            {inUse ? t("common.close") : t("common.cancel")}
          </Button>
          {!inUse && usage !== null && (
            <Button color="danger" onClick={confirmDelete} disabled={deleteCategory.isPending || deleteGuard.locked} title={deleteGuard.reason}>
              {deleteCategory.isPending ? t("common.deleting") : t("common.delete")}
            </Button>
          )}
        </ModalFooter>
      </Modal>
    </>
  );
}
