import { useMemo } from "react";
import { Button, Modal, ModalBody, ModalFooter, ModalHeader } from "reactstrap";
import { useTranslation } from "react-i18next";
import { FiCheckSquare, FiSquare } from "react-icons/fi";

import { categoryLabel } from "../../shared/utils/categories";
import type { Category } from "../../shared/types/IndexTypes";
import type { Bucket } from "./allocationUtils";
import styles from "./css/Allocation.module.css";

interface Props {
  bucket: Bucket;
  categories: Category[];
  /** Every other bucket, so a category cannot be counted twice. */
  others: Bucket[];
  onChange: (categoryIds: string[]) => void;
  onClose: () => void;
}

/**
 * Which categories a bucket pays for.
 *
 * A category belongs to at most one bucket. Two buckets counting the same
 * spending would each report it in full, so the page would show more money
 * leaving than actually did — and the reader would have no way to tell which
 * of the two figures to believe. One owner is shown as taken, with the name of
 * the bucket that has it, rather than silently hidden.
 */
export default function CategoryLinkModal({ bucket, categories, others, onChange, onClose }: Props) {
  const { t } = useTranslation();
  const chosen = new Set(bucket.categoryIds ?? []);

  const takenBy = useMemo(() => {
    const map = new Map<string, string>();
    for (const other of others) for (const id of other.categoryIds ?? []) map.set(id, other.label);
    return map;
  }, [others]);

  const visible = useMemo(
    () => categories.filter((c) => c.type === "expense").sort((a, b) => categoryLabel(a.name, t).localeCompare(categoryLabel(b.name, t))),
    [categories, t],
  );

  const toggle = (id: string) => {
    const next = new Set(chosen);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onChange(Array.from(next));
  };

  return (
    <Modal isOpen toggle={onClose} centered scrollable>
      <ModalHeader toggle={onClose}>
        <span style={{ fontSize: 15 }}>{t("allocation.linkTitle", { name: bucket.label })}</span>
      </ModalHeader>
      <ModalBody className="pt-2">
        <p className="text-body-secondary" style={{ fontSize: 12.5 }}>
          {t("allocation.linkHint")}
        </p>

        {visible.length === 0 ? (
          <p className="text-body-secondary mb-0" style={{ fontSize: 13 }}>
            {t("allocation.noCategories")}
          </p>
        ) : (
          visible.map((category) => {
            const owner = takenBy.get(category.id);
            const on = chosen.has(category.id);

            return (
              <button key={category.id} type="button" className={styles.pickRow} onClick={() => !owner && toggle(category.id)} disabled={!!owner} aria-pressed={on}>
                {on ? <FiCheckSquare size={15} style={{ color: "var(--bs-primary)", flexShrink: 0 }} /> : <FiSquare size={15} style={{ flexShrink: 0, opacity: owner ? 0.4 : 1 }} />}
                <span aria-hidden>{category.icon ?? "\u{1F9FE}"}</span>
                <span className={styles.pickName} style={{ opacity: owner ? 0.55 : 1 }}>
                  {categoryLabel(category.name, t)}
                </span>
                {owner && <span className={styles.pickTaken}>{t("allocation.takenBy", { name: owner })}</span>}
              </button>
            );
          })
        )}
      </ModalBody>
      <ModalFooter>
        <Button color="primary" onClick={onClose}>
          {t("common.close")}
        </Button>
      </ModalFooter>
    </Modal>
  );
}
