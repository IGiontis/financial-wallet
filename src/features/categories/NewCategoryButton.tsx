import { useState } from "react";
import { Button } from "reactstrap";
import { useTranslation } from "react-i18next";
import { FiPlus } from "react-icons/fi";
import type { Category } from "../../shared/types/IndexTypes";
import { useCreateCategoryScope } from "../transactions/hooks/useTransactions";
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
          isSaving={createCategory.isPending}
          onClose={() => setOpen(false)}
          onSubmit={(values) =>
            createCategory.mutate(values, {
              onSuccess: (created) => {
                setOpen(false);
                // A "both" choice writes two documents; select the half this
                // form is actually recording, not whichever came back first.
                const id = created[type];
                if (id) onCreated(id);
              },
            })
          }
        />
      )}
    </>
  );
}
