import { useMemo, useState } from "react";
import { Button, FormFeedback, FormGroup, Input, Label, Modal, ModalBody, ModalFooter, ModalHeader } from "reactstrap";
import { useTranslation } from "react-i18next";
import { FORM_MODAL } from "../../shared/components/formModal";
import { WizardSteps } from "../transactions/components/WizardSteps";
import { categoryLabel } from "../../shared/utils/categories";
import { similarName } from "../../shared/utils/nameMatch";
import type { CategoryGroup } from "../../shared/utils/categoryNames";
import { groupKey, mergeTargets, movedCount, planCategoryMerge, type CategoryMergePlan, type MergeSources } from "./categoryMerge";

const STEPS = ["into", "review"] as const;
type Step = (typeof STEPS)[number];

/** The kinds a merge moves, in the order the review names them. */
const KINDS = ["transactions", "bills", "incomes", "plannerLines"] as const;
const KIND_KEY: Record<(typeof KINDS)[number], string> = {
  transactions: "categories.usageTransactions",
  bills: "categories.usageBills",
  incomes: "categories.usageIncomes",
  plannerLines: "categories.usagePlannerLines",
};

interface Props {
  /** The category that goes. Always one of the user's own. */
  drop: CategoryGroup;
  /** A target chosen up front (the «Πιθανά διπλά» list). */
  into?: CategoryGroup;
  groups: readonly CategoryGroup[];
  /** What the records are, as the app holds them — the stored lists for incomes and Planner lines. */
  sources: MergeSources;
  /** Records to show beside each choice: how many transactions each carries. */
  counts: ReadonlyMap<string, number>;
  locked?: boolean;
  lockReason?: string;
  onClose: () => void;
  onMerge: (plan: CategoryMergePlan) => Promise<void>;
}

/**
 * One category merged into another, in two steps: which one it goes into,
 * then a review that says how many records of each kind move and that the
 * category is deleted after. Only targets that hold every side the dropped
 * one has are offered (`mergeTargets`).
 */
export function CategoryMergeModal({ drop, into, groups, sources, counts, locked, lockReason, onClose, onMerge }: Props) {
  const { t } = useTranslation();
  const [step, setStep] = useState<Step>("into");
  const [keepKey, setKeepKey] = useState(into ? groupKey(into) : "");
  const [touched, setTouched] = useState(false);
  const [saving, setSaving] = useState(false);

  const label = (g: CategoryGroup) => `${g.icon ?? ""} ${categoryLabel(g.name, t)}`.trim();
  const dropLabel = label(drop);

  // Similar names first, then the rest by name.
  const choices = useMemo(
    () =>
      groups
        .filter((g) => mergeTargets(drop.members, g.members) !== null)
        .sort((a, b) => Number(similarName(categoryLabel(b.name, t), categoryLabel(drop.name, t))) - Number(similarName(categoryLabel(a.name, t), categoryLabel(drop.name, t))) || categoryLabel(a.name, t).localeCompare(categoryLabel(b.name, t))),
    [groups, drop, t],
  );
  const keep = choices.find((g) => groupKey(g) === keepKey) ?? null;
  const pairs = keep ? mergeTargets(drop.members, keep.members) : null;
  const plan = useMemo(() => (pairs ? planCategoryMerge(pairs, sources) : null), [pairs, sources]);

  const save = async () => {
    if (!plan) return;
    setSaving(true);
    try {
      await onMerge(plan);
    } catch {
      // The caller said so; left open to try again.
    } finally {
      setSaving(false);
    }
  };

  const groupTxCount = (g: CategoryGroup) => g.members.reduce((sum, m) => sum + (counts.get(m.id) ?? 0), 0);

  return (
    <Modal {...FORM_MODAL} isOpen toggle={onClose} centered>
      <ModalHeader toggle={onClose}>{t("names.mergeTitle")}</ModalHeader>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          setTouched(true);
          if (step === "into") {
            if (keep) setStep("review");
          } else void save();
        }}
        noValidate
      >
        <ModalBody>
          <WizardSteps steps={STEPS} current={step} onGo={setStep} label={(s) => t(`names.step_${s}`)} large />

          {step === "into" &&
            (choices.length === 0 ? (
              <p className="mb-0" style={{ fontSize: "var(--fs-text)" }}>
                {t("names.mergeNoTarget", { name: dropLabel })}
              </p>
            ) : (
              <FormGroup className="mb-0">
                <Label className="small fw-medium" for="category-merge-into">
                  {t("names.mergeIntoLabel", { name: dropLabel })}
                </Label>
                <Input id="category-merge-into" type="select" value={keepKey} invalid={touched && !keep} onChange={(e) => setKeepKey(e.target.value)}>
                  <option value="">{t("names.pickOne")}</option>
                  {choices.map((g) => (
                    <option key={groupKey(g)} value={groupKey(g)}>
                      {label(g)} · {t("names.records", { count: groupTxCount(g) })}
                    </option>
                  ))}
                </Input>
                <FormFeedback>{t("names.pickOneError")}</FormFeedback>
              </FormGroup>
            ))}

          {step === "review" && keep && plan && (
            <div style={{ fontSize: "var(--fs-text)" }} data-testid="category-merge-review">
              <p className="mb-2 fw-medium text-break">
                «{dropLabel}» → «{label(keep)}»
              </p>
              {movedCount(plan) === 0 ? (
                <p className="mb-1">{t("names.noRecordsChange")}</p>
              ) : (
                <>
                  <p className="mb-1">{t("names.categoryMoves")}</p>
                  <ul className="mb-2 ps-3">
                    {KINDS.filter((kind) => plan.moves[kind] > 0).map((kind) => (
                      <li key={kind}>{t(KIND_KEY[kind], { count: plan.moves[kind] })}</li>
                    ))}
                  </ul>
                </>
              )}
              <p className="mb-0 text-body-secondary">{t("names.categoryMergeDeletes", { name: dropLabel })}</p>
              {locked && <p className="mb-0 mt-2 text-body-secondary">{lockReason}</p>}
            </div>
          )}
        </ModalBody>

        <ModalFooter className="justify-content-between">
          {step === "into" ? (
            <Button type="button" color="secondary" outline onClick={onClose}>
              {t("common.cancel")}
            </Button>
          ) : (
            <Button type="button" color="secondary" outline onClick={() => setStep("into")} disabled={saving}>
              ‹ {t("common.back")}
            </Button>
          )}
          {step === "review" ? (
            <Button type="submit" color="success" disabled={saving || !!locked} title={lockReason}>
              {saving ? t("common.saving") : t("names.mergeAction")}
            </Button>
          ) : (
            <Button type="submit" color="primary" disabled={choices.length === 0 || (touched && !keep)}>
              {t("common.next")} ›
            </Button>
          )}
        </ModalFooter>
      </form>
    </Modal>
  );
}

export default CategoryMergeModal;
