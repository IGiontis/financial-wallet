import { useMemo, useState } from "react";
import { Button, FormFeedback, FormGroup, FormText, Input, Label, Modal, ModalBody, ModalFooter, ModalHeader } from "reactstrap";
import { useTranslation } from "react-i18next";
import type { Category } from "../../../shared/types/IndexTypes";
import { DateField } from "../../../shared/components/DateField";
import { useCurrencyConverter } from "../../../shared/hooks/useCurrencyConverter";
import { validationMessage } from "../../../shared/utils/validationMessage";
import { categoryLabel } from "../../../shared/utils/categories";
import { parseISODay, standaloneMonthName, toISODay, toISOMonth } from "../../../shared/utils/dates";
import NewCategoryButton from "../../categories/NewCategoryButton";
import type { MoneyAccount } from "../../accounts/accountsUtils";
import { INCOME_KINDS, KIND_ICON, incomeOccurrences, incomeYear, suggestIncomeCategory, type Income, type IncomeKind } from "../incomesUtils";
import { draftToIncome, validateAll, validateDraft, type DraftErrors, type DraftStep, type IncomeDraft } from "../incomeForm";
import { scheduleText, weekdayName, type IncomeFormats } from "../incomeText";
import segmented from "../../../shared/css/Segmented.module.css";
import styles from "../css/IncomesPage.module.css";

// One sheet for a new income and for changing one, in three steps, in the
// order of the Bills form — name, amount, «αλλάζει» → how often, which day,
// from when → pause — plus the two that are new here: where the money lands,
// and «ο μισθός μου». A change opens on a summary and goes straight to the step
// that is wanted, rather than walking all three to fix a day.

export interface IncomeFormModalProps {
  draft: IncomeDraft;
  isEdit: boolean;
  /** Open on this step; a change otherwise opens on its summary. */
  startStep?: DraftStep;
  categories: Category[];
  accounts: MoneyAccount[];
  /** The income that has «ο μισθός μου» now, if another one does. */
  salaryName?: string;
  f: IncomeFormats;
  now: Date;
  onSave: (income: Income) => void;
  onDelete: () => void;
  onArchive: () => void;
  onClose: () => void;
}

type View = DraftStep | "summary";

export default function IncomeFormModal({ draft: initial, isEdit, startStep, categories, accounts, salaryName, f, now, onSave, onDelete, onArchive, onClose }: IncomeFormModalProps) {
  const { t } = useTranslation();
  const { convertToBase, baseCurrency, displayCurrency, format } = useCurrencyConverter();
  const [draft, setDraft] = useState<IncomeDraft>(initial);
  const [view, setView] = useState<View>(startStep ?? (isEdit ? "summary" : 1));
  const [errors, setErrors] = useState<DraftErrors>({});
  const [confirmDelete, setConfirmDelete] = useState(false);
  // Whether the category was chosen by hand: until it is, it follows the kind.
  const [categoryTouched, setCategoryTouched] = useState(isEdit || !!initial.categoryId);

  const incomeCategories = useMemo(() => categories.filter((c) => c.type === "income").sort((a, b) => categoryLabel(a.name, t).localeCompare(categoryLabel(b.name, t))), [categories, t]);
  const toBase = (n: number) => (baseCurrency === displayCurrency ? n : convertToBase(n));
  const set = <K extends keyof IncomeDraft>(key: K, value: IncomeDraft[K]) => setDraft((d) => ({ ...d, [key]: value }));
  const error = (key: keyof IncomeDraft) => validationMessage(errors[key], t);

  const chooseKind = (kind: IncomeKind) =>
    setDraft((d) => {
      const kindName = (k: IncomeKind) => t(`incomes.kind.${k}`);
      const renamed = !d.name.trim() || d.name === kindName(d.kind) ? kindName(kind) : d.name;
      const category = categoryTouched ? d.categoryId : (suggestIncomeCategory(kind, categories)?.id ?? d.categoryId);
      return { ...d, kind, name: renamed, categoryId: category, isSalary: kind === "salary" && !salaryName && !isEdit ? true : d.isSalary };
    });

  // The draft as far as it goes, for the two previews — the next three dates,
  // and what a pause leaves of the year.
  const preview = useMemo(() => {
    const step2Ok = Object.keys(validateDraft(draft, 2)).length === 0;
    if (!step2Ok) return undefined;
    const filled = { ...draft, name: draft.name.trim() || "—", amount: Number(draft.amount) > 0 ? draft.amount : "1" };
    return draftToIncome({ ...filled, hasPause: filled.hasPause && Object.keys(validateDraft(filled, 3)).length === 0, hasEnd: false }, toBase);
    // `toBase` changes only with the currency, which does not change while the sheet is open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft]);

  const nextDates = useMemo(() => (preview ? incomeOccurrences(preview, now, new Date(now.getFullYear() + 3, 0, 1)).slice(0, 3) : []), [preview, now]);
  const pauseYear = useMemo(() => (preview && draft.hasPause && Number(draft.amount) > 0 ? incomeYear([preview], [], now) : undefined), [preview, draft.hasPause, draft.amount, now]);

  const goTo = (target: View) => {
    if (typeof view === "number" && typeof target === "number" && target > view) {
      const found = validateDraft(draft, view);
      setErrors(found);
      if (Object.keys(found).length > 0) return;
    }
    setErrors({});
    setView(target);
  };

  const save = () => {
    const found = validateAll(draft);
    setErrors(found);
    if (Object.keys(found).length > 0) {
      // Back to the first step with something wrong on it.
      const first = ([1, 2, 3] as DraftStep[]).find((s) => Object.keys(validateDraft(draft, s)).length > 0);
      if (first) setView(first);
      return;
    }
    const income = draftToIncome(draft, toBase);
    if (income) onSave(income);
  };

  const months = useMemo(() => Array.from({ length: 12 }, (_, m) => standaloneMonthName(f.lang, new Date(2020, m, 1))), [f.lang]);
  const unit = draft.frequency === "weekly" ? "incomes.form.unitWeeks" : draft.frequency === "yearly" ? "incomes.form.unitYears" : "incomes.form.unitMonths";
  const stepTitle = view === 1 ? t("incomes.form.step1") : view === 2 ? t("incomes.form.step2") : view === 3 ? t("incomes.form.step3") : t("incomes.form.summary");

  const summaryIncome = view === "summary" ? draftToIncome(draft, toBase) : undefined;
  const accountName = (id: string) => accounts.find((a) => a.id === id)?.name;

  return (
    <Modal isOpen toggle={onClose} centered scrollable>
      <ModalHeader toggle={onClose} tag="div" className="w-100">
        {typeof view === "number" && (
          <div className={styles.steps} aria-hidden>
            {[1, 2, 3].map((s) => (
              <span key={s} className={`${styles.stepBar} ${s <= view ? styles.stepBarOn : ""}`} />
            ))}
          </div>
        )}
        <div className="d-flex justify-content-between align-items-baseline gap-2">
          <span className="h6 mb-0 fw-semibold">{isEdit ? `${KIND_ICON[draft.kind]} ${initial.name}` : t("incomes.form.newTitle")}</span>
          {typeof view === "number" && <span className="text-body-secondary" style={{ fontSize: 12 }}>{t("incomes.form.stepOf", { step: view })}</span>}
        </div>
        <div className="text-body-secondary" style={{ fontSize: 12.5 }}>
          {stepTitle}
        </div>
      </ModalHeader>

      <form
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          if (view === 3 || view === "summary" || isEdit) save();
          else goTo((view + 1) as DraftStep);
        }}
      >
        <ModalBody>
          {view === "summary" && (
            <div>
              {[
                { step: 1 as DraftStep, label: t("incomes.form.sumWhat"), value: `${t(`incomes.kind.${draft.kind}`)} · ${draft.variable ? `${t("incomes.form.variableShort")} ≈` : ""}${format(toBase(Number(draft.amount) || 0))}` },
                { step: 2 as DraftStep, label: t("incomes.form.sumWhen"), value: summaryIncome ? scheduleText(summaryIncome, t, f) : t("incomes.form.sumIncomplete") },
                {
                  step: 3 as DraftStep,
                  label: t("incomes.form.sumWhere"),
                  value: [accountName(draft.accountId) ?? t("incomes.form.noAccount"), draft.hasPause ? t("incomes.form.sumPause") : undefined, draft.isSalary ? t("incomes.card.mySalary") : undefined]
                    .filter(Boolean)
                    .join(" · "),
                },
              ].map((row) => (
                <button key={row.step} type="button" className={styles.summaryRow} onClick={() => goTo(row.step)}>
                  <span className={styles.summaryLabel}>{row.label}</span>
                  <span className={styles.summaryValue}>{row.value}</span>
                  <span className="text-body-secondary" aria-hidden>
                    ›
                  </span>
                </button>
              ))}

              <div className="d-flex flex-wrap gap-2 mt-3">
                <Button type="button" color="secondary" outline size="sm" onClick={onArchive}>
                  {t("incomes.form.archive")}
                </Button>
                {confirmDelete ? (
                  <Button type="button" color="danger" size="sm" onClick={onDelete}>
                    {t("incomes.form.deleteConfirm")}
                  </Button>
                ) : (
                  <Button type="button" color="danger" outline size="sm" onClick={() => setConfirmDelete(true)}>
                    {t("common.delete")}
                  </Button>
                )}
              </div>
              {confirmDelete && (
                <p className="text-body-secondary mt-2 mb-0" style={{ fontSize: 12 }}>
                  {t("incomes.form.deleteHint")}
                </p>
              )}
            </div>
          )}

          {view === 1 && (
            <>
              <FormGroup>
                <Label className="small fw-medium d-block">{t("incomes.form.kind")}</Label>
                <div className={styles.kinds} role="radiogroup" aria-label={t("incomes.form.kind")}>
                  {INCOME_KINDS.map((kind) => (
                    <button key={kind} type="button" role="radio" aria-checked={draft.kind === kind} className={`${styles.kind} ${draft.kind === kind ? styles.kindOn : ""}`} onClick={() => chooseKind(kind)}>
                      <span aria-hidden>{KIND_ICON[kind]}</span> {t(`incomes.kind.${kind}`)}
                    </button>
                  ))}
                </div>
              </FormGroup>

              <FormGroup>
                <Label for="income-name" className="small fw-medium">
                  {t("common.name")} *
                </Label>
                <Input id="income-name" value={draft.name} placeholder={t("incomes.form.namePlaceholder")} onChange={(e) => set("name", e.target.value)} invalid={!!errors.name} />
                <FormFeedback>{error("name")}</FormFeedback>
              </FormGroup>

              <FormGroup switch className="d-flex align-items-start gap-2">
                <Input id="income-variable" type="switch" role="switch" checked={draft.variable} onChange={(e) => set("variable", e.target.checked)} />
                <div>
                  <Label for="income-variable" className="small fw-medium mb-0" style={{ cursor: "pointer" }}>
                    {t("incomes.form.variable")}
                  </Label>
                  <div className="text-body-secondary" style={{ fontSize: 11.5 }}>
                    {t("incomes.form.variableHint")}
                  </div>
                </div>
              </FormGroup>

              <FormGroup>
                <Label for="income-amount" className="small fw-medium">
                  {draft.variable ? t("incomes.form.estimatedAmount") : t("common.amount")} ({displayCurrency}) *
                </Label>
                <Input id="income-amount" type="number" inputMode="decimal" min={0.01} step={0.01} value={draft.amount} onChange={(e) => set("amount", e.target.value)} invalid={!!errors.amount} />
                <FormFeedback>{error("amount")}</FormFeedback>
              </FormGroup>

              <FormGroup className="mb-0">
                <Label for="income-category" className="small fw-medium">
                  {t("common.category")}
                </Label>
                <div className="d-flex gap-2">
                  <Input
                    id="income-category"
                    type="select"
                    value={draft.categoryId}
                    onChange={(e) => {
                      setCategoryTouched(true);
                      set("categoryId", e.target.value);
                    }}
                  >
                    <option value="">{t("incomes.form.categoryAuto")}</option>
                    {incomeCategories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.icon} {categoryLabel(c.name, t)}
                      </option>
                    ))}
                  </Input>
                  <NewCategoryButton
                    categories={categories}
                    type="income"
                    onCreated={(id) => {
                      setCategoryTouched(true);
                      set("categoryId", id);
                    }}
                  />
                </div>
                <FormText style={{ fontSize: 11.5 }}>{t("incomes.form.categoryHint")}</FormText>
              </FormGroup>
            </>
          )}

          {view === 2 && (
            <>
              <FormGroup>
                <Label className="small fw-medium d-block">{t("incomes.form.repeats")}</Label>
                <div className="btn-group w-100" role="group" aria-label={t("incomes.form.repeats")}>
                  {(["weekly", "monthly", "yearly"] as const).map((freq) => (
                    <Button
                      key={freq}
                      type="button"
                      color="primary"
                      outline={draft.frequency !== freq}
                      onClick={() =>
                        setDraft((d) => ({
                          ...d,
                          frequency: freq,
                          // A weekday and a day of the month are different numbers; a change of
                          // cadence clears it rather than reading the 5th as Friday.
                          day: freq === d.frequency ? d.day : "",
                          start: freq === "weekly" ? (parseISODay(d.start) ? d.start : toISODay(now)) : d.start.slice(0, 7),
                        }))
                      }
                    >
                      {t(`incomes.form.freq.${freq}`)}
                    </Button>
                  ))}
                </div>
              </FormGroup>

              <FormGroup>
                <Label for="income-every" className="small fw-medium">
                  {t("incomes.form.every")}
                </Label>
                <div className="input-group">
                  <Input id="income-every" type="number" min={1} max={24} step={1} value={draft.every} onChange={(e) => set("every", e.target.value)} invalid={!!errors.every} />
                  <span className="input-group-text">{t(unit, { count: Number(draft.every) || 1 })}</span>
                </div>
                {errors.every && <div className="invalid-feedback d-block">{error("every")}</div>}
              </FormGroup>

              {draft.frequency === "weekly" ? (
                <FormGroup>
                  <Label for="income-weekday" className="small fw-medium">
                    {t("incomes.form.weekday")}
                  </Label>
                  <Input id="income-weekday" type="select" value={draft.day} onChange={(e) => set("day", e.target.value)} invalid={!!errors.day}>
                    <option value="">—</option>
                    {[1, 2, 3, 4, 5, 6, 0].map((d) => (
                      <option key={d} value={d}>
                        {weekdayName(f, d)}
                      </option>
                    ))}
                  </Input>
                  <FormFeedback>{error("day")}</FormFeedback>
                </FormGroup>
              ) : (
                <div className="d-flex gap-2">
                  {draft.frequency === "yearly" && (
                    <FormGroup style={{ flex: 1.4 }}>
                      <Label for="income-month" className="small fw-medium">
                        {t("incomes.form.month")}
                      </Label>
                      <Input id="income-month" type="select" value={draft.month} onChange={(e) => set("month", e.target.value)} invalid={!!errors.month}>
                        {months.map((m, i) => (
                          <option key={m} value={i}>
                            {m}
                          </option>
                        ))}
                      </Input>
                    </FormGroup>
                  )}
                  <FormGroup style={{ flex: 1 }}>
                    <Label for="income-day" className="small fw-medium">
                      {t("incomes.form.dayOfMonth")}
                    </Label>
                    <Input id="income-day" type="number" min={1} max={31} step={1} inputMode="numeric" value={draft.day} onChange={(e) => set("day", e.target.value)} invalid={!!errors.day} />
                    <FormFeedback>{error("day")}</FormFeedback>
                  </FormGroup>
                </div>
              )}
              {draft.frequency !== "weekly" && (
                <FormText className="d-block mt-n2 mb-3" style={{ fontSize: 11.5 }}>
                  {t("incomes.form.dayHint")}
                </FormText>
              )}

              <FormGroup className="mb-2">
                <Label for="income-start" className="small fw-medium">
                  {t("incomes.form.start")}
                </Label>
                <DateField id="income-start" month={draft.frequency !== "weekly"} value={draft.start} onChange={(v) => set("start", v)} invalid={!!errors.start} />
                {errors.start && <div className="invalid-feedback d-block">{error("start")}</div>}
              </FormGroup>

              {nextDates.length > 0 && (
                <div className="text-body-secondary" style={{ fontSize: 12 }}>
                  {t("incomes.form.nextDates", { dates: nextDates.map((o) => f.weekdayDate.format(o.date)).join(" · ") })}
                </div>
              )}
            </>
          )}

          {view === 3 && (
            <>
              {accounts.length > 0 && (
                <FormGroup>
                  <Label className="small fw-medium d-block">{t("incomes.form.where")}</Label>
                  <div className={segmented.group} role="radiogroup" aria-label={t("incomes.form.where")}>
                    {[...accounts.map((a) => ({ id: a.id, name: `${a.kind === "cash" ? "💵 " : ""}${a.name}` })), { id: "", name: t("incomes.form.noAccount") }].map((option) => (
                      <button
                        key={option.id || "none"}
                        type="button"
                        role="radio"
                        aria-checked={draft.accountId === option.id}
                        className={`${segmented.item} ${draft.accountId === option.id ? segmented.active : ""}`}
                        onClick={() => set("accountId", option.id)}
                      >
                        {option.name}
                      </button>
                    ))}
                  </div>
                </FormGroup>
              )}

              <FormGroup switch className="d-flex align-items-start gap-2">
                <Input id="income-pause" type="switch" role="switch" checked={draft.hasPause} onChange={(e) => set("hasPause", e.target.checked)} />
                <Label for="income-pause" className="small fw-medium mb-0" style={{ cursor: "pointer" }}>
                  {t("incomes.form.pause")}
                </Label>
              </FormGroup>
              {draft.hasPause && (
                <div className="ps-2 mb-3">
                  <div className="d-flex gap-2">
                    <FormGroup className="mb-2" style={{ flex: 1 }}>
                      <Label for="income-pause-from" className="small">
                        {t("incomes.form.pauseFrom")}
                      </Label>
                      <DateField id="income-pause-from" month value={draft.pauseFrom} onChange={(v) => set("pauseFrom", v)} invalid={!!errors.pauseFrom} />
                    </FormGroup>
                    <FormGroup className="mb-2" style={{ flex: 1 }}>
                      <Label for="income-pause-to" className="small">
                        {t("incomes.form.pauseTo")}
                      </Label>
                      <DateField id="income-pause-to" month clearable value={draft.pauseTo} onChange={(v) => set("pauseTo", v)} invalid={!!errors.pauseTo} placeholder={t("incomes.form.pauseForever")} />
                    </FormGroup>
                  </div>
                  {errors.pauseTo && <div className="invalid-feedback d-block mt-n1 mb-2">{error("pauseTo")}</div>}
                  <FormGroup check className="mb-1">
                    <Input id="income-pause-yearly" type="checkbox" checked={draft.pauseYearly} onChange={(e) => set("pauseYearly", e.target.checked)} />
                    <Label for="income-pause-yearly" check className="small">
                      {t("incomes.form.pauseYearly")}
                    </Label>
                  </FormGroup>
                  {pauseYear && pauseYear.rows[0] && (
                    <div className="text-body-secondary" style={{ fontSize: 12 }}>
                      {t("incomes.form.pausePreview", { total: format(pauseYear.total), count: pauseYear.rows[0].count, each: format(pauseYear.rows[0].each) })}
                    </div>
                  )}
                </div>
              )}

              <FormGroup>
                <Label className="small fw-medium d-block">{t("incomes.form.ends")}</Label>
                <div className={`${segmented.group} ${segmented.even}`} role="radiogroup" aria-label={t("incomes.form.ends")}>
                  {[false, true].map((on) => (
                    <button key={String(on)} type="button" role="radio" aria-checked={draft.hasEnd === on} className={`${segmented.item} ${draft.hasEnd === on ? segmented.active : ""}`} onClick={() => set("hasEnd", on)}>
                      {on ? t("incomes.form.endsOn") : t("incomes.form.endsNever")}
                    </button>
                  ))}
                </div>
                {draft.hasEnd && (
                  <div className="mt-2">
                    <DateField month value={draft.end} onChange={(v) => set("end", v)} invalid={!!errors.end} placeholder={toISOMonth(now)} />
                    {errors.end && <div className="invalid-feedback d-block">{error("end")}</div>}
                  </div>
                )}
              </FormGroup>

              <FormGroup switch className="d-flex align-items-start gap-2 mb-0">
                <Input id="income-salary" type="switch" role="switch" checked={draft.isSalary} onChange={(e) => set("isSalary", e.target.checked)} />
                <div>
                  <Label for="income-salary" className="small fw-medium mb-0" style={{ cursor: "pointer" }}>
                    {t("incomes.form.isSalary")}
                  </Label>
                  <div className="text-body-secondary" style={{ fontSize: 11.5 }}>
                    {draft.isSalary && salaryName ? t("incomes.form.isSalaryMoves", { name: salaryName }) : t("incomes.form.isSalaryHint")}
                  </div>
                </div>
              </FormGroup>
            </>
          )}
        </ModalBody>

        <ModalFooter className="justify-content-between">
          {view === "summary" || view === 1 ? (
            <Button type="button" color="secondary" outline onClick={onClose}>
              {t("common.cancel")}
            </Button>
          ) : (
            <Button type="button" color="secondary" outline onClick={() => goTo(isEdit ? "summary" : ((view - 1) as DraftStep))}>
              ‹ {isEdit ? t("incomes.form.toSummary") : t("common.back")}
            </Button>
          )}
          {view === 3 || isEdit ? (
            <Button type="submit" color="primary">
              {t("common.save")}
            </Button>
          ) : (
            <Button type="submit" color="primary">
              {t("common.next")} ›
            </Button>
          )}
        </ModalFooter>
      </form>
    </Modal>
  );
}
