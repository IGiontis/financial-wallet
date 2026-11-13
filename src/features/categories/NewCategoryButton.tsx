import { useState } from "react";
import { toast } from "react-toastify";
import { useRunOnce } from "../../shared/hooks/useRunOnce";
import { Button } from "reactstrap";
import { useTranslation } from "react-i18next";
import { sameName } from "../../shared/utils/nameMatch";
import { FiPlus } from "react-icons/fi";
import type { Category } from "../../shared/types/IndexTypes";
import { newCategoryIds, useCreateCategoryScope } from "../transactions/hooks/useTransactions";
import { saveWithoutWaiting } from "../../shared/utils/saveWithoutWaiting";
import CategoryModal from "./CategoryModal";

interface NewCategoryButtonProps {
  categories: Category[];
  /** Whatever the surrounding form is recording — the starting choice. */
  type: "expense" | "income";
  /** Receives the new category's id so the form can select it immediately. */
  onCreated: (categoryId: string) => void;
  size?: string;
}

/**
 * Adds a category without leaving the form you're filling in.
 *
 * The alternative — sending people to Settings and back — loses whatever they
 * had already typed, which is exactly when a missing category turns up: mid
 * entry, with an amount and a date already in the fields.
 */
export default function NewCategoryButton({ categories, type, onCreated, size }: NewCategoryButtonProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const createCategory = useCreateCategoryScope();
  // Runs once and waits for the server: no second category from a second press.
  const [run, creating] = useRunOnce();

  return (
    <>
      <Button
        type="button"
        color="secondary"
        outline
        size={size}
        onClick={() => setOpen(true)}
        aria-label={t("categories.new")}
        title={t("categories.new")}
        style={{ flexShrink: 0 }}
      >
        <FiPlus size={14} />
      </Button>

      {open && (
        <CategoryModal
          existing={categories}
          scope={type}
          isSaving={creating}
          onClose={() => setOpen(false)}
          // The one already there, on the side this form records.
          onUseExisting={(existing) => {
            setOpen(false);
            const pick = existing.type === type ? existing : categories.find((c) => c.type === type && sameName(c.name, existing.name));
            if (pick) onCreated(pick.id);
          }}
          onSubmit={(values) =>
            void run(() => {
              // Never waits for the server: the ids are made here, the
              // category is on the list at once and picked in the form; a
              // refusal later takes it off and says so (`saveWithoutWaiting`).
              const ids = newCategoryIds(values.scope);
              void saveWithoutWaiting(createCategory, { ...values, ids }, () => toast.error(t("toasts.categorySaveFailed")));
              setOpen(false);
              toast.success(t("toasts.categoryCreated", { name: values.name }));
              // A "both" choice writes two documents; select the half this
              // form is actually recording.
              const id = ids[type];
              if (id) onCreated(id);
            })
          }
        />
      )}
    </>
  );
}
