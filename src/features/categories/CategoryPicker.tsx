import { useMemo, useState } from "react";
import { Input } from "reactstrap";
import { useTranslation } from "react-i18next";
import type { Category } from "../../shared/types/IndexTypes";
import { categoryLabel } from "../../shared/utils/categories";
import { normalizeCategoryName } from "../../shared/utils/categoryNames";
import NewCategoryButton from "./NewCategoryButton";
import styles from "./css/CategoryPicker.module.css";

type PickerType = "expense" | "income";

interface CategoryPickerProps {
  categories: Category[];
  /** Currently selected category id, or "" for none. */
  value: string;
  /** Which side to list. Settled by the caller before the picker is shown. */
  type: PickerType;
  onChange: (categoryId: string, category: Category) => void;
  invalid?: boolean;
}

/**
 * Picking a category from the side the caller has already settled.
 *
 * This replaced a `<select>` holding thirty-odd options. On a phone that opened
 * a full-screen native list you scrolled blind — no icons, no grouping. Cards
 * show the icon, which is how people actually recognise these.
 *
 * It used to carry an expense/income tab strip too. Both callers ended up
 * fixing the type before the picker was reached — the add wizard asks it on a
 * screen of its own, and editing cannot swap it at all — so the strip was a
 * control nobody could operate, in two places, and it is gone.
 *
 * The filter box earns its place past a couple of dozen categories: scanning a
 * grid is fast until it isn't, and typing two letters beats scrolling.
 */
export default function CategoryPicker({ categories, value, type, onChange, invalid }: CategoryPickerProps) {
  const { t } = useTranslation();
  const [query, setQuery] = useState("");

  const visible = useMemo(() => {
    const needle = normalizeCategoryName(query);
    return categories
      .filter((c) => c.type === type)
      .filter((c) => !needle || normalizeCategoryName(categoryLabel(c.name, t)).includes(needle) || normalizeCategoryName(c.name).includes(needle))
      .sort((a, b) => categoryLabel(a.name, t).localeCompare(categoryLabel(b.name, t)));
  }, [categories, type, query, t]);

  return (
    <div className={invalid ? styles.wrapInvalid : undefined}>
      <div className="d-flex gap-2 mb-2">
        <Input
          bsSize="sm"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t("categories.filterPlaceholder")}
          aria-label={t("categories.filterPlaceholder")}
        />
        <NewCategoryButton categories={categories} type={type} size="sm" onCreated={(id) => {
          const created = categories.find((c) => c.id === id);
          if (created) onChange(id, created);
        }} />
      </div>

      {visible.length === 0 ? (
        <p className={styles.empty}>{t("categories.noneMatch")}</p>
      ) : (
        <div className={styles.grid} role="listbox">
          {visible.map((category) => {
            const selected = category.id === value;
            return (
              <button
                key={category.id}
                type="button"
                role="option"
                aria-selected={selected}
                className={`${styles.card} ${selected ? styles.cardSelected : ""}`}
                onClick={() => onChange(category.id, category)}
              >
                <span className={styles.cardIcon} aria-hidden>
                  {category.icon ?? "🧾"}
                </span>
                <span className={styles.cardName}>{categoryLabel(category.name, t)}</span>
                {/* A category that fills the form in for you is worth flagging —
                    otherwise the prefilled fields look like a glitch. */}
                {(category.defaultPayee || category.defaultAmount != null) && (
                  <span className={styles.cardAuto} title={t("categories.autoFillTitle")}>
                    ⚡
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
