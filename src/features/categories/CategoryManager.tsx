import { useMemo, useState } from "react";
import { Alert, Badge, Button, Modal, ModalHeader, ModalBody, ModalFooter, Spinner } from "reactstrap";
import { useTranslation } from "react-i18next";
import { FiEdit2, FiTrash2 } from "react-icons/fi";
import { groupCategories, type CategoryGroup } from "../../shared/utils/categoryNames";
import { useCategories, useCreateCategoryScope, useUpdateCategoryGroup, useDeleteCategoryGroup, useCategoryGroupUsage } from "../transactions/hooks/useTransactions";
import CategoryModal from "./CategoryModal";

/** Badge wording per scope — "both" is the one worth calling out. */
const SCOPE_LABEL = { expense: "transactions.expense", income: "transactions.income", both: "categories.both" } as const;
const SCOPE_COLOR = { expense: "secondary", income: "success", both: "primary" } as const;

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
  const checkUsage = useCategoryGroupUsage();

  const [editing, setEditing] = useState<CategoryGroup | null>(null);
  const [creating, setCreating] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<CategoryGroup | null>(null);
  const [usage, setUsage] = useState<number | null>(null);

  const own = useMemo(() => groupCategories(categories.filter((c) => !c.isDefault)), [categories]);
  const defaultCount = categories.filter((c) => c.isDefault).length;

  const askDelete = (group: CategoryGroup) => {
    setDeleteTarget(group);
    setUsage(null);
    // Counted on open rather than up front: one read per category on every
    // settings visit, for a button most people never press.
    checkUsage.mutate(group.members.map((m) => m.id), { onSuccess: setUsage });
  };

  const confirmDelete = () => {
    if (!deleteTarget) return;
    deleteCategory.mutate(deleteTarget.members.map((m) => m.id), { onSuccess: () => setDeleteTarget(null) });
  };

  const inUse = usage !== null && usage > 0;

  if (isLoading) {
    return (
      <div className="text-center py-3">
        <Spinner size="sm" color="primary" />
      </div>
    );
  }

  return (
    <>
      <div className="d-flex justify-content-between align-items-center gap-2 mb-3">
        <span className="text-body-secondary" style={{ fontSize: 13 }}>
          {t("categories.builtInCount", { count: defaultCount })}
        </span>
        <Button color="primary" size="sm" onClick={() => setCreating(true)}>
          + {t("categories.new")}
        </Button>
      </div>

      {own.length === 0 ? (
        <p className="text-body-secondary mb-0" style={{ fontSize: 13 }}>
          {t("categories.noneYet")}
        </p>
      ) : (
        <div className="d-flex flex-column gap-2">
          {own.map((group) => (
            <div
              key={group.members.map((m) => m.id).join("-")}
              className="d-flex align-items-center gap-2 px-2 py-2"
              style={{ background: "var(--color-background-secondary)", borderRadius: "var(--border-radius-md)" }}
            >
              <span style={{ fontSize: 18 }} aria-hidden>
                {group.icon ?? "🧾"}
              </span>
              <span className="fw-medium text-truncate" style={{ fontSize: 14, flex: 1, minWidth: 0 }}>
                {group.name}
              </span>
              <Badge color={SCOPE_COLOR[group.scope]} pill style={{ fontSize: 10 }}>
                {t(SCOPE_LABEL[group.scope])}
              </Badge>
              <Button color="secondary" outline size="sm" onClick={() => setEditing(group)} aria-label={t("common.edit")} title={t("common.edit")}>
                <FiEdit2 size={13} />
              </Button>
              <Button color="danger" outline size="sm" onClick={() => askDelete(group)} aria-label={t("common.delete")} title={t("common.delete")}>
                <FiTrash2 size={13} />
              </Button>
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
          onSubmit={(values) => createCategory.mutate(values, { onSuccess: () => setCreating(false) })}
        />
      )}

      {editing && (
        <CategoryModal
          existing={categories}
          scope={editing.scope}
          category={editing}
          isSaving={updateCategory.isPending}
          onClose={() => setEditing(null)}
          onSubmit={(values) =>
            updateCategory.mutate(
              { categoryIds: editing.members.map((m) => m.id), data: { name: values.name, icon: values.icon } },
              { onSuccess: () => setEditing(null) },
            )
          }
        />
      )}

      <Modal isOpen={!!deleteTarget} toggle={() => setDeleteTarget(null)} centered>
        <ModalHeader toggle={() => setDeleteTarget(null)}>{t("categories.deleteTitle")}</ModalHeader>
        <ModalBody>
          {usage === null ? (
            <div className="text-center py-2">
              <Spinner size="sm" color="primary" />
            </div>
          ) : inUse ? (
            /* Refused rather than cascaded: deleting would leave those rows with
               a category that no longer resolves, and no way to find them. */
            <Alert color="warning" className="mb-0" style={{ fontSize: 13 }}>
              {t("categories.deleteBlocked", { name: deleteTarget?.name ?? "", count: usage })}
            </Alert>
          ) : (
            <p className="mb-0" style={{ fontSize: 14 }}>
              {t("categories.deleteConfirm", { name: deleteTarget?.name ?? "" })}
              {deleteTarget?.scope === "both" && <span className="d-block text-body-secondary mt-1" style={{ fontSize: 12 }}>{t("categories.deleteBothNote")}</span>}
            </p>
          )}
        </ModalBody>
        <ModalFooter>
          <Button color="secondary" outline onClick={() => setDeleteTarget(null)} disabled={deleteCategory.isPending}>
            {inUse ? t("common.close") : t("common.cancel")}
          </Button>
          {!inUse && usage !== null && (
            <Button color="danger" onClick={confirmDelete} disabled={deleteCategory.isPending}>
              {deleteCategory.isPending ? t("common.deleting") : t("common.delete")}
            </Button>
          )}
        </ModalFooter>
      </Modal>
    </>
  );
}
