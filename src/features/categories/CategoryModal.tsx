import { useState } from "react";
import { Modal, ModalHeader, ModalBody, ModalFooter, Button, FormGroup, Label, Input, FormFeedback, FormText, Alert, Row, Col } from "reactstrap";
import { useTranslation } from "react-i18next";
import type { Category } from "../../shared/types/IndexTypes";
import { categoryLabel } from "../../shared/utils/categories";
import { cleanCategoryName, findScopeDuplicates, firstGrapheme, type CategoryScope } from "../../shared/utils/categoryNames";

/** A small, deliberately unopinionated palette — enough to tell rows apart. */
const ICON_CHOICES = ["🧾", "💳", "🏦", "🚗", "🏠", "🛠️", "📚", "🎁", "🍼", "🐶", "💊", "✂️", "📦", "🎓", "⚖️", "🧳"];

interface CategoryModalProps {
  /** Every category already visible to the user — the duplicate check's input. */
  existing: Category[];
  /** What the surrounding form is recording, used as the starting choice. */
  scope: CategoryScope;
  /** Present when editing an existing category (or a both-ways pair). */
  category?: { name: string; icon?: string; scope: CategoryScope; defaultPayee?: string; defaultAmount?: number };
  isSaving: boolean;
  onClose: () => void;
  onSubmit: (values: { name: string; scope: CategoryScope; icon: string; defaultPayee?: string; defaultAmount?: number }) => void;
}

/**
 * Creates or renames one of the user's own categories.
 *
 * The duplicate check runs as you type rather than on submit, because the
 * useful moment is before the effort: being told "that already exists, it's
 * called Rent" while typing "Ενοίκιο" is help, whereas the same message after
 * pressing Save is a rejection. It also matches across languages and accents —
 * see `findDuplicateCategory` for why a plain string comparison isn't enough.
 *
 * The scope is a three-way choice because plenty of categories genuinely work
 * both ways: betting, taxes, a loan, freelance work you sometimes refund.
 * Choosing "both" writes one document per type, which is how the seeded list
 * has always handled it.
 */
export default function CategoryModal({ existing, scope: initialScope, category, isSaving, onClose, onSubmit }: CategoryModalProps) {
  const { t } = useTranslation();
  const [name, setName] = useState(category?.name ?? "");
  const [scope, setScope] = useState<CategoryScope>(category?.scope ?? initialScope);
  const [icon, setIcon] = useState(category?.icon ?? ICON_CHOICES[0]);
  const [payee, setPayee] = useState(category?.defaultPayee ?? "");
  const [amount, setAmount] = useState(category?.defaultAmount != null ? String(category.defaultAmount) : "");
  const [touched, setTouched] = useState(false);

  const cleaned = cleanCategoryName(name);
  // Editing: the category being renamed is not its own duplicate.
  const others = category ? existing.filter((c) => c.name !== category.name) : existing;
  const duplicates = findScopeDuplicates(cleaned, scope, others);
  const duplicate = duplicates[0];

  const tooShort = cleaned.length > 0 && cleaned.length < 2;
  const error = !cleaned ? "categories.nameRequired" : tooShort ? "categories.nameTooShort" : cleaned.length > 40 ? "categories.nameTooLong" : "";
  const canSave = !error && !duplicate && !isSaving;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setTouched(true);
    if (!canSave) return;
    const parsedAmount = amount.trim() === "" ? undefined : Number(amount);
    onSubmit({
      name: cleaned,
      scope,
      icon,
      defaultPayee: payee.trim() || undefined,
      defaultAmount: Number.isFinite(parsedAmount) && parsedAmount! > 0 ? parsedAmount : undefined,
    });
  };

  const SCOPES: { value: CategoryScope; labelKey: string }[] = [
    { value: "expense", labelKey: "transactions.expense" },
    { value: "income", labelKey: "transactions.income" },
    { value: "both", labelKey: "categories.both" },
  ];

  return (
    <Modal isOpen toggle={onClose} centered>
      <ModalHeader toggle={onClose}>{category ? t("categories.editTitle") : t("categories.newTitle")}</ModalHeader>

      <form onSubmit={submit} noValidate>
        <ModalBody>
          <FormGroup>
            <Label className="small fw-medium">{t("common.name")} *</Label>
            <Input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              onBlur={() => setTouched(true)}
              placeholder={t("categories.namePlaceholder")}
              invalid={touched && (!!error || !!duplicate)}
              maxLength={60}
            />
            <FormFeedback>{error ? t(error) : ""}</FormFeedback>
            {!duplicate && <FormText style={{ fontSize: 11 }}>{t("categories.nameHint")}</FormText>}
          </FormGroup>

          {/* Shown the moment it applies, not held back until Save */}
          {duplicate && (
            <Alert color="warning" className="py-2" style={{ fontSize: 12 }}>
              {t("categories.duplicateWarning", { name: `${duplicate.icon ?? ""} ${categoryLabel(duplicate.name, t)}`.trim() })}
            </Alert>
          )}

          <FormGroup>
            <Label className="small fw-medium d-block">{t("categories.usedFor")}</Label>
            <div className="btn-group w-100" role="group">
              {SCOPES.map((option) => (
                <Button
                  key={option.value}
                  type="button"
                  color="secondary"
                  outline={scope !== option.value}
                  active={scope === option.value}
                  onClick={() => setScope(option.value)}
                  disabled={!!category}
                  style={{ fontSize: 13 }}
                >
                  {t(option.labelKey)}
                </Button>
              ))}
            </div>
            <FormText style={{ fontSize: 11 }}>{category ? t("categories.scopeLocked") : t("categories.scopeHint")}</FormText>
          </FormGroup>

          {/* What this category should fill in for you. The point of the whole
              feature: once a category knows it means "Netflix, €15.99, expense",
              recording one is picking it and nothing more. Both fields stay
              optional — a category that fills in less is still useful. */}
          <div className="p-2 mb-3" style={{ background: "var(--color-background-secondary)", borderRadius: "var(--border-radius-md)" }}>
            <Label className="small fw-medium d-block mb-2">{t("categories.autoFillTitle")}</Label>
            <Row className="g-2">
              <Col xs={12} sm={7}>
                <Label className="small" style={{ fontSize: 12 }}>
                  {t("transactions.payee")}
                </Label>
                <Input value={payee} onChange={(e) => setPayee(e.target.value)} placeholder={t("categories.defaultPayeePlaceholder")} maxLength={30} bsSize="sm" />
              </Col>
              <Col xs={12} sm={5}>
                <Label className="small" style={{ fontSize: 12 }}>
                  {t("common.amount")}
                </Label>
                <Input type="number" inputMode="decimal" min={0} step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="—" bsSize="sm" />
              </Col>
            </Row>
            <FormText style={{ fontSize: 11 }}>{t("categories.autoFillHint")}</FormText>
          </div>
          <FormGroup className="mb-0">
            <Label className="small fw-medium">{t("categories.icon")}</Label>

            {/* The grid is a shortcut, not the vocabulary. Sixteen icons cannot
                cover what people track, and the keyboard already has thousands —
                so the field is the real control and the grid just fills it. */}
            <div className="d-flex align-items-center gap-2 mb-2">
              <Input
                value={icon}
                onChange={(e) => setIcon(firstGrapheme(e.target.value))}
                placeholder="🧾"
                aria-label={t("categories.icon")}
                style={{ width: 72, fontSize: 22, textAlign: "center", lineHeight: 1.2 }}
              />
              <FormText style={{ fontSize: 11 }}>{t("categories.iconHint")}</FormText>
            </div>

            <div className="d-flex flex-wrap gap-1">
              {ICON_CHOICES.map((choice) => (
                <button
                  key={choice}
                  type="button"
                  onClick={() => setIcon(choice)}
                  aria-pressed={icon === choice}
                  style={{
                    width: 38,
                    height: 38,
                    fontSize: 18,
                    lineHeight: 1,
                    cursor: "pointer",
                    borderRadius: "var(--border-radius-md)",
                    background: icon === choice ? "color-mix(in srgb, var(--bs-primary) 15%, transparent)" : "var(--color-background-secondary)",
                    border: `1px solid ${icon === choice ? "var(--bs-primary)" : "transparent"}`,
                  }}
                >
                  {choice}
                </button>
              ))}
            </div>
          </FormGroup>
        </ModalBody>

        <ModalFooter>
          <Button type="button" color="secondary" outline onClick={onClose} disabled={isSaving}>
            {t("common.cancel")}
          </Button>
          <Button type="submit" color="primary" disabled={!canSave}>
            {isSaving ? t("common.saving") : category ? t("common.save") : t("categories.create")}
          </Button>
        </ModalFooter>
      </form>
    </Modal>
  );
}
