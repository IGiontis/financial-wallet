import { useMemo, useState } from "react";
import { Button, FormFeedback, FormGroup, Input, Label, Modal, ModalBody, ModalFooter, ModalHeader } from "reactstrap";
import { useTranslation } from "react-i18next";
import { FORM_MODAL } from "../../shared/components/formModal";
import { NameCheck } from "../../shared/components/NameCheck";
import { WizardSteps } from "../transactions/components/WizardSteps";
import { cleanLine } from "../../shared/utils/cleanText";
import { matchName, similarName } from "../../shared/utils/nameMatch";
import { MAX_PAYEE_LENGTH } from "../transactions/payeeStore";
import { payeeRenameIds, savedAfterRename, type PayeeRow } from "./payeeNames";
import type { Transaction } from "../../shared/types/IndexTypes";
import { RequiredMark } from "../../shared/components/RequiredMark";

const STEPS = ["name", "review"] as const;
type Step = (typeof STEPS)[number];

export type PayeeModalMode = "add" | "rename" | "merge";

export interface PayeeRenameVars {
  ids: string[];
  to: string;
  /** The whole saved list after it, or undefined when the list does not change. */
  saved?: string[];
}

interface Props {
  mode: PayeeModalMode;
  /** The payee renamed or merged away. */
  row?: PayeeRow;
  /** A merge's target chosen up front (the «Πιθανά διπλά» list). */
  into?: PayeeRow;
  rows: readonly PayeeRow[];
  transactions: readonly Transaction[];
  /** Records tied to a bill, an income or a covered debt: never renamed (`linkedRecordIds`). */
  linked?: ReadonlySet<string>;
  saved: readonly string[];
  locked?: boolean;
  lockReason?: string;
  onClose: () => void;
  onAdd: (name: string) => Promise<void>;
  onRename: (vars: PayeeRenameVars) => Promise<void>;
  /** «Χρήση αυτού» on adding: the one already there is shown instead. */
  onShow: (name: string) => void;
}

/**
 * Adding a payee, renaming one everywhere, or merging one into another — one
 * small wizard: the name, then a review that states how many records change.
 * A rename to a name that is already there is refused and offered as a merge;
 * a similar one («Doro» for «Δώρο») is only suggested. See `matchName`.
 */
export function PayeeNameModal({ mode, row, into, rows, transactions, linked, saved, locked, lockReason, onClose, onAdd, onRename, onShow }: Props) {
  const { t } = useTranslation();
  const [step, setStep] = useState<Step>("name");
  const [text, setText] = useState(mode === "rename" && row ? row.name : "");
  const [mergeInto, setMergeInto] = useState<PayeeRow | null>(into ?? null);
  const [touched, setTouched] = useState(false);
  const [saving, setSaving] = useState(false);

  const others = useMemo(() => (row ? rows.filter((r) => r.key !== row.key) : rows), [rows, row]);
  const cleaned = cleanLine(text);
  const match = mode === "merge" || mergeInto ? null : matchName(cleaned, others, (r) => [r.name]);
  const unchanged = mode === "rename" && !mergeInto && !!row && cleaned === row.name;

  const error = mode !== "merge" && !mergeInto ? (!cleaned ? "validation.nameRequired" : cleaned.length > MAX_PAYEE_LENGTH ? "validation.maxChars" : "") : "";
  const blocked = mode === "merge" || mergeInto ? !mergeInto : !!error || match?.kind === "same" || unchanged;

  // What the review states, and what Save writes: the same list.
  const target = mergeInto ? mergeInto.name : cleaned;
  const ids = useMemo(() => (row && target ? payeeRenameIds(transactions, row.name, target, linked) : []), [row, target, transactions, linked]);
  const nextSaved = row && target ? savedAfterRename(saved, row.name, target) : saved;
  const savedChanges = nextSaved !== saved;

  // Merge targets: the likeliest first — similar names, then the rest by name.
  const choices = useMemo(() => (row ? [...others].sort((a, b) => Number(similarName(b.name, row.name)) - Number(similarName(a.name, row.name)) || a.name.localeCompare(b.name)) : []), [others, row]);

  const next = () => {
    setTouched(true);
    if (!blocked) setStep("review");
  };

  const save = async () => {
    setSaving(true);
    try {
      if (mode === "add") await onAdd(cleaned);
      else await onRename({ ids, to: target, saved: savedChanges ? [...nextSaved] : undefined });
    } catch {
      // The hook said so; left open to try again.
    } finally {
      setSaving(false);
    }
  };

  const merging = mode === "merge" || !!mergeInto;
  const title = mode === "add" ? t("names.payeeAddTitle") : merging ? t("names.mergeTitle") : t("names.renameTitle");
  const mergeLabel = (name: string) => (mode === "add" ? t("names.useExisting", { name }) : t("names.mergeWith", { name }));
  const onUse = (picked: PayeeRow) => (mode === "add" ? onShow(picked.name) : setMergeInto(picked));

  return (
    <Modal {...FORM_MODAL} isOpen toggle={onClose} centered>
      <ModalHeader toggle={onClose}>{title}</ModalHeader>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (step === "name") next();
          else void save();
        }}
        noValidate
      >
        <ModalBody>
          <WizardSteps steps={STEPS} current={step} onGo={setStep} label={(s) => t(`names.step_${s}`)} large />

          {step === "name" && (
            <>
              {mode === "merge" || mergeInto ? (
                <FormGroup className="mb-0">
                  <Label className="small fw-medium" for="payee-merge-into">
                    {t("names.mergeIntoLabel", { name: row?.name ?? "" })}
                    <RequiredMark />
                  </Label>
                  <Input
                    id="payee-merge-into"
                    aria-required
                    type="select"
                    value={mergeInto?.key ?? ""}
                    invalid={touched && !mergeInto}
                    onChange={(e) => setMergeInto(others.find((r) => r.key === e.target.value) ?? null)}
                  >
                    <option value="">{t("names.pickOne")}</option>
                    {choices.map((r) => (
                      <option key={r.key} value={r.key}>
                        {r.name} · {t("names.records", { count: r.count })}
                      </option>
                    ))}
                  </Input>
                  <FormFeedback>{t("names.pickOneError")}</FormFeedback>
                  {mode === "rename" && (
                    <Button type="button" color="link" size="sm" className="px-0 mt-1" onClick={() => setMergeInto(null)}>
                      {t("names.backToRename")}
                    </Button>
                  )}
                </FormGroup>
              ) : (
                <FormGroup className="mb-0">
                  <Label className="small fw-medium" for="payee-name">
                    {t("transactions.payee")}
                    <RequiredMark />
                  </Label>
                  <Input
                    id="payee-name"
                    aria-required
                    autoFocus
                    value={text}
                    maxLength={MAX_PAYEE_LENGTH + 1}
                    placeholder={t("names.payeePlaceholder")}
                    invalid={touched && (!!error || match?.kind === "same")}
                    onChange={(e) => setText(e.target.value)}
                    onBlur={(e) => e.target.value.trim() !== "" && setTouched(true)}
                  />
                  <FormFeedback>{error ? t(error, { count: MAX_PAYEE_LENGTH }) : ""}</FormFeedback>
                  <NameCheck match={match} onUse={match ? () => onUse(match.item as PayeeRow) : undefined} useLabel={match ? mergeLabel(match.name) : undefined} />
                </FormGroup>
              )}
            </>
          )}

          {step === "review" && (
            <div style={{ fontSize: "var(--fs-text)" }} data-testid="payee-review">
              {mode === "add" ? (
                <p className="mb-0">{t("names.payeeAddReview", { name: cleaned })}</p>
              ) : (
                <>
                  <p className="mb-2 fw-medium text-break">
                    «{row?.name}» → «{target}»
                  </p>
                  <p className="mb-1" data-testid="payee-review-count">
                    {ids.length > 0 ? t("names.recordsChange", { count: ids.length }) : t("names.noRecordsChange")}
                  </p>
                  {merging && mergeInto && <p className="mb-1 text-body-secondary">{t("names.mergeAfter", { from: row?.name ?? "", name: mergeInto.name, count: mergeInto.count + (row?.count ?? 0) })}</p>}
                  {savedChanges && <p className="mb-0 text-body-secondary">{t("names.savedListChanges")}</p>}
                  {locked && <p className="mb-0 mt-2 text-body-secondary">{lockReason}</p>}
                </>
              )}
            </div>
          )}
        </ModalBody>

        {/* Back / Cancel on the left; Next or Save on the right. */}
        <ModalFooter className="justify-content-between">
          {step === "name" ? (
            <Button type="button" color="secondary" outline onClick={onClose}>
              {t("common.cancel")}
            </Button>
          ) : (
            <Button type="button" color="secondary" outline onClick={() => setStep("name")} disabled={saving}>
              ‹ {t("common.back")}
            </Button>
          )}
          {step === "review" ? (
            <Button type="submit" color="primary" disabled={saving || (mode !== "add" && !!locked)} title={mode !== "add" ? lockReason : undefined}>
              {saving ? t("common.saving") : merging ? t("names.mergeAction") : t("common.save")}
            </Button>
          ) : (
            <Button type="submit" color="primary" disabled={touched && blocked}>
              {t("common.next")} ›
            </Button>
          )}
        </ModalFooter>
      </form>
    </Modal>
  );
}

export default PayeeNameModal;

