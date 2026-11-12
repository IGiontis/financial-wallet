import { useId, useMemo, useState } from "react";
import { Button, FormGroup, Input, Label, Modal, ModalBody, ModalFooter, ModalHeader } from "reactstrap";
import { useTranslation } from "react-i18next";
import { toast } from "react-toastify";
import { AddButton } from "../../shared/components/AddButton";
import { ManageList } from "../../shared/components/ManageList";
import { NameCheck } from "../../shared/components/NameCheck";
import { FORM_MODAL } from "../../shared/components/formModal";
import { RequiredMark } from "../../shared/components/RequiredMark";
import { celebrateSave, useSavedFlash } from "../../shared/feedback/saveFeedback";
import { useOfflineGuard } from "../../shared/hooks/useOfflineGuard";
import { cleanLine } from "../../shared/utils/cleanText";
import { matchName } from "../../shared/utils/nameMatch";
import type { BusinessCategory, BusinessEntry } from "../../shared/types/IndexTypes";
import { newCategoryId, useBusinessCategories, useMoveBusinessCategory } from "./useBusiness";

// «Κατηγορίες»: the business's expense categories («υποκατηγορίες εξόδων») —
// four to start with (Μεταφορικά, Λειτουργικά έξοδα, Εμπορεύματα, Εφορία +
// ΕΦΚΑ), renamed, added to or deleted here. On the user document: a rename is
// one write and no read, however many days name it. A name is trimmed and
// compared ignoring case, accents and spacing; a near one («Metaforika» beside
// «Μεταφορικά») is offered, not silently made. Deleting one that days use asks
// where their lines go.

export function BusinessCategories({ entries }: { entries: readonly BusinessEntry[] }) {
  const { t } = useTranslation();
  const [categories] = useBusinessCategories();
  const settingsGuard = useOfflineGuard("settings");
  const deleteGuard = useOfflineGuard("delete");
  const [editing, setEditing] = useState<{ category?: BusinessCategory } | null>(null);
  const [deleting, setDeleting] = useState<BusinessCategory | null>(null);
  const flash = useSavedFlash("businessCategories", useMemo(() => categories.map((c) => c.id), [categories]));

  /** How many days name each category. */
  const uses = useMemo(() => {
    const count = new Map<string, number>();
    for (const e of entries) for (const id of new Set((e.expenses ?? []).map((l) => l.categoryId))) count.set(id, (count.get(id) ?? 0) + 1);
    return count;
  }, [entries]);

  return (
    <>
      {/* The app's one «+» (`AddButton`), pinned left, as on the Names page's lists. */}
      <div className="d-flex align-items-center gap-2 mb-3">
        <AddButton small label={t("business.addCategory")} onClick={() => setEditing({})} disabled={settingsGuard.locked} />
        <span className="text-body-secondary" style={{ fontSize: "var(--fs-text)" }}>
          {t("business.addCategory")}
        </span>
      </div>
      {categories.length === 0 ? (
        <p className="small text-body-secondary mb-0">{t("business.noCategories")}</p>
      ) : (
        <ManageList
          groups={[{ key: "out", title: t("business.categoriesTitle"), tone: "danger", items: categories.map((c) => ({ id: c.id, name: c.name, icon: "🧾", meta: t("business.categoryUses", { count: uses.get(c.id) ?? 0 }) })) }]}
          hint={t("business.categoriesHint")}
          onEdit={(id) => {
            const category = categories.find((c) => c.id === id);
            if (category) setEditing({ category });
          }}
          onDelete={(id) => setDeleting(categories.find((c) => c.id === id) ?? null)}
          deleteLocked={deleteGuard.locked}
          deleteReason={deleteGuard.reason}
          flash={flash}
        />
      )}
      {editing && <CategoryModal category={editing.category} onClose={() => setEditing(null)} />}
      {deleting && <DeleteCategoryModal category={deleting} uses={uses.get(deleting.id) ?? 0} onClose={() => setDeleting(null)} />}
    </>
  );
}

/** A new category, or a new name for one: the field, what it meets, and on a rename «πριν → μετά». */
function CategoryModal({ category, onClose }: { category?: BusinessCategory; onClose: () => void }) {
  const { t } = useTranslation();
  const id = useId();
  const [categories, setCategories] = useBusinessCategories();
  const guard = useOfflineGuard("settings");
  const [name, setName] = useState(category?.name ?? "");
  const typed = cleanLine(name);
  const match = matchName(typed, categories, (c) => [c.name], category && categories.find((c) => c.id === category.id));
  const unchanged = !!category && typed === category.name;
  const canSave = !!typed && match?.kind !== "same" && !unchanged && !guard.locked;

  const save = () => {
    if (!canSave) return;
    if (category) {
      setCategories((previous) => previous.map((c) => (c.id === category.id ? { ...c, name: typed } : c)));
      celebrateSave({ collection: "businessCategories", id: category.id });
    } else {
      setCategories((previous) => [...previous, { id: newCategoryId(), name: typed }]);
      celebrateSave({ collection: "businessCategories" });
    }
    onClose();
  };

  return (
    <Modal {...FORM_MODAL} isOpen toggle={onClose} centered>
      <ModalHeader toggle={onClose}>{t(category ? "business.renameCategory" : "business.addCategory")}</ModalHeader>
      <form
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
      >
        <ModalBody>
          <FormGroup className="mb-0">
            <Label for={id} className="small fw-medium mb-1">
              {t("common.name")}
              <RequiredMark />
            </Label>
            <Input id={id} autoFocus aria-required value={name} maxLength={80} placeholder={t("business.categoryPlaceholder")} onChange={(e) => setName(e.target.value)} />
            <NameCheck match={match} />
          </FormGroup>
          {category && typed && !unchanged && (
            <p className="small mt-3 mb-0" role="status">
              <s className="text-body-secondary">{category.name}</s> → <b>{typed}</b>
            </p>
          )}
          {!category && typed && match?.kind !== "same" && (
            <p className="small text-body-secondary mt-3 mb-0" role="status">
              {t("business.newCategorySays", { name: typed })}
            </p>
          )}
        </ModalBody>
        <ModalFooter>
          <Button type="button" color="secondary" outline onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button type="submit" color="primary" disabled={!canSave} title={guard.reason}>
            {t("common.save")}
          </Button>
        </ModalFooter>
      </form>
    </Modal>
  );
}

/**
 * Deleting a category. Unused, it simply goes. Used, the lines under it go to
 * another category, chosen here — never picked for the reader — and the
 * dialog says on how many days.
 */
function DeleteCategoryModal({ category, uses, onClose }: { category: BusinessCategory; uses: number; onClose: () => void }) {
  const { t } = useTranslation();
  const id = useId();
  const [categories, setCategories] = useBusinessCategories();
  const move = useMoveBusinessCategory();
  const guard = useOfflineGuard("delete");
  const others = categories.filter((c) => c.id !== category.id);
  const [target, setTarget] = useState("");
  const needsTarget = uses > 0;
  const canDelete = !guard.locked && !move.isPending && (!needsTarget || others.some((c) => c.id === target));
  const targetName = others.find((c) => c.id === target)?.name ?? "";

  const remove = () => setCategories((previous) => previous.filter((c) => c.id !== category.id));
  const confirm = () => {
    if (!canDelete) return;
    if (!needsTarget) {
      remove();
      onClose();
      return;
    }
    // The lines first, the category after: a failure leaves the category, never lines naming nothing.
    move.mutate(
      { fromId: category.id, toId: target },
      {
        onSuccess: (moved) => {
          remove();
          toast.success(t("business.categoryMoved", { count: moved.length, name: targetName }));
          onClose();
        },
        onError: () => toast.error(t("business.deleteFailed")),
      },
    );
  };

  return (
    <Modal isOpen toggle={onClose} centered zIndex={1080}>
      <ModalHeader toggle={onClose}>{t("common.deleteConfirmTitle")}</ModalHeader>
      <ModalBody style={{ fontSize: "var(--fs-lead)" }}>
        {!needsTarget ? (
          <p className="mb-0">{t("common.deleteConfirmNamed", { name: category.name })}</p>
        ) : others.length === 0 ? (
          <p className="mb-0">{t("business.categoryNoOther", { count: uses, name: category.name })}</p>
        ) : (
          <>
            <p>{t("business.categoryInUse", { count: uses, name: category.name })}</p>
            <Label for={id} className="small fw-medium mb-1">
              {t("business.moveTo")}
            </Label>
            <Input id={id} type="select" value={target} onChange={(e) => setTarget(e.target.value)}>
              <option value="" disabled>
                {t("business.moveToPlaceholder")}
              </option>
              {others.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Input>
            {target && <p className="small text-body-secondary mt-2 mb-0">{t("business.categoryWillMove", { count: uses, from: category.name, to: targetName })}</p>}
          </>
        )}
      </ModalBody>
      <ModalFooter>
        <Button color="secondary" outline onClick={onClose}>
          {t("common.cancel")}
        </Button>
        <Button color="danger" onClick={confirm} disabled={!canDelete} title={guard.reason}>
          {move.isPending ? t("common.deleting") : needsTarget ? t("business.moveAndDelete") : t("common.delete")}
        </Button>
      </ModalFooter>
    </Modal>
  );
}
