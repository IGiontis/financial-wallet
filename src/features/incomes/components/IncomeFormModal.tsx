import { useMemo, useState } from "react";
import { Button, FormFeedback, FormGroup, FormText, Input, Label, Modal, ModalBody, ModalFooter, ModalHeader } from "reactstrap";
import { useTranslation } from "react-i18next";
import type { Category } from "../../../shared/types/IndexTypes";
import { DateField } from "../../../shared/components/DateField";
import { useCurrencyConverter } from "../../../shared/hooks/useCurrencyConverter";
import { validationMessage } from "../../../shared/utils/validationMessage";
import { categoryLabel } from "../../../shared/utils/categories";
import { parseISODay, parseISOMonth, standaloneMonthName, toISODay, toISOMonth } from "../../../shared/utils/dates";
import type { MoneyAccount } from "../../accounts/accountsUtils";
import { incomeIcon, incomeOccurrences, incomeYear, kindForCategory, suggestIncomeCategory, type Income } from "../incomesUtils";
import CategoryPicker from "../../categories/CategoryPicker";
import { draftToIncome, validateAll, validateDraft, type DraftErrors, type DraftStep, type IncomeDraft } from "../incomeForm";
import { scheduleText, weekdayName, type IncomeFormats } from "../incomeText";
import segmented from "../../../shared/css/Segmented.module.css";
import { WizardSteps } from "../../transactions/components/WizardSteps";
import { FORM_MODAL } from "../../../shared/components/formModal";
import { YesNoChoice } from "../../../shared/components/YesNoChoice";
import { DeleteButton } from "../../../shared/components/DeleteButton";
import { EveryPicker } from "../../../shared/components/EveryPicker";
import { DayPicker } from "../../../shared/components/DayPicker";
import wiz from "../../../shared/css/Wizard.module.css";

// One sheet for a new income and for changing one, a topic a step, in the
// order of the Bills wizard — what it is → how much, and its category → how
// often, which day, from when → where it lands, «ο μισθός μου», a break, an
// end — then the check.
//
// The steps are the Transactions wizard's rail: numbered circles, back and
// forward. The fourth is the check — everything typed, row by row, each row a
// way back to its step — and it is the only place «Αποθήκευση» is: one button
// forward at a time, never Save beside Next. A change can jump along the rail,
// since everything is filled in already.

export interface IncomeFormModalProps {
  draft: IncomeDraft;
  isEdit: boolean;
  /** Open on this step rather than the first. */
  startStep?: DraftStep;
  categories: Category[];
  accounts: MoneyAccount[];
  /** The income that has «ο μισθός μου» now, if another one does. */
  salaryName?: string;
  f: IncomeFormats;
  now: Date;
  onSave: (income: Income) => void;
  onClose: () => void;
  /** On an edit: delete, far left in the footer (opens the page's own confirm). */
  onDelete?: () => void;
  deleteLocked?: boolean;
  deleteReason?: string;
}

/** Four steps that ask, then the check. */
const STEPS = ["what", "amount", "when", "where", "review"] as const;
type View = (typeof STEPS)[number];

/** Where a caller's «open on step N» of the old three lands. */
const FROM_DRAFT_STEP: Record<DraftStep, View> = { 1: "what", 2: "when", 3: "where" };

/** What each asking step checks, out of the draft's three checks. */
function stepErrors(draft: IncomeDraft, view: View): DraftErrors {
  if (view === "what") {
    const { name } = validateDraft(draft, 1);
    // The category is what the income is (it was asked twice, as «είδος» and as category).
    const categoryId = draft.categoryId ? undefined : "incomes.form.categoryRequired";
    return { ...(categoryId ? { categoryId } : {}), ...(name ? { name } : {}) };
  }
  if (view === "amount") {
    const { amount } = validateDraft(draft, 1);
    return amount ? { amount } : {};
  }
  if (view === "when") return validateDraft(draft, 2);
  if (view === "where") return validateDraft(draft, 3);
  return {};
}

export default function IncomeFormModal({ draft: initial, isEdit, startStep, categories, accounts, salaryName, f, now, onSave, onClose, onDelete, deleteLocked, deleteReason }: IncomeFormModalProps) {
  const { t } = useTranslation();
  const { convertToBase, baseCurrency, displayCurrency, format } = useCurrencyConverter();
  // An old income saved before it had a category is shown under the one its kind suggested;
  // its edit starts there too, rather than on an empty question it had already answered.
  const [shownCategory] = useState(() => (isEdit && !initial.categoryId ? (suggestIncomeCategory(initial.kind, categories)?.id ?? "") : ""));
  const [draft, setDraft] = useState<IncomeDraft>(() => (shownCategory ? { ...initial, categoryId: shownCategory } : initial));
  const [view, setView] = useState<View>(startStep ? FROM_DRAFT_STEP[startStep] : "what");
  const [errors, setErrors] = useState<DraftErrors>({});
  const toBase = (n: number) => (baseCurrency === displayCurrency ? n : convertToBase(n));
  const set = <K extends keyof IncomeDraft>(key: K, value: IncomeDraft[K]) => setDraft((d) => ({ ...d, [key]: value }));
  const error = (key: keyof IncomeDraft) => validationMessage(errors[key], t);

  // The draft as far as it goes, for the two previews — the next three dates,
  // and what a pause leaves of the year.
  // The name is the user's own and must be typed: nothing is filled in for an
  // empty one. The kind is no longer asked — it is read off the category, and
  // still stored, so whatever reads it keeps working (`kindForCategory`).
  const category = categories.find((c) => c.id === draft.categoryId && c.type === "income");
  // Left on the category it was shown under, an old income is saved as it was — no
  // category written in, its own kind kept; a category picked by hand is stored with its kind.
  const keptAsWas = !!shownCategory && draft.categoryId === shownCategory;
  const named: IncomeDraft = keptAsWas ? { ...draft, categoryId: initial.categoryId, kind: initial.kind } : { ...draft, kind: kindForCategory(category) };
  // What the checks read: the category on screen, whichever is saved.
  const checked: IncomeDraft = { ...named, categoryId: draft.categoryId };

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

  const index = STEPS.indexOf(view);
  const goTo = (target: View) => {
    // Forward only over steps that are complete: jumping from the first to the
    // check stops at the first step with something missing, and says what.
    const to = STEPS.indexOf(target);
    for (const step of STEPS.slice(0, to)) {
      const found = stepErrors(checked, step);
      if (Object.keys(found).length > 0) {
        setErrors(found);
        setView(step);
        return;
      }
    }
    setErrors({});
    setView(target);
  };

  const save = () => {
    const found = { ...validateAll(checked), ...stepErrors(checked, "what") };
    setErrors(found);
    if (Object.keys(found).length > 0) {
      // Back to the first step with something wrong on it.
      const first = STEPS.find((s) => Object.keys(stepErrors(checked, s)).length > 0);
      if (first) setView(first);
      return;
    }
    const income = draftToIncome(named, toBase);
    if (income) onSave(income);
  };

  const months = useMemo(() => Array.from({ length: 12 }, (_, m) => standaloneMonthName(f.lang, new Date(2020, m, 1))), [f.lang]);
  const stepTitle = t({ what: "incomes.form.step1", amount: "incomes.form.stepAmount", when: "incomes.form.step2", where: "incomes.form.step3", review: "incomes.form.step4" }[view]);


  // Every answer of the three steps, said back in words — each row a way back
  // to the step that asked it.
  const savedAs = view === "review" ? draftToIncome(named, toBase) : undefined;
  const categoryName = (() => {
    return category ? `${category.icon ? `${category.icon} ` : ""}${categoryLabel(category.name, t)}` : "—";
  })();
  const monthLabel = (value: string) => {
    const month = parseISOMonth(value);
    return month ? f.monthYearShort.format(month) : value;
  };
  const startLabel = (() => {
    const date = draft.frequency === "weekly" ? parseISODay(draft.start) : parseISOMonth(draft.start);
    return date ? (draft.frequency === "weekly" ? f.dayMonth.format(date) : f.monthYearShort.format(date)) : "—";
  })();
  const reviewRows: { step: View; label: string; value: string }[] = [
    { step: "what", label: t("common.category"), value: categoryName },
    { step: "what", label: t("common.name"), value: named.name.trim() },
    { step: "amount", label: t("common.amount"), value: `${draft.variable ? "≈ " : ""}${format(toBase(Number(draft.amount) || 0))} · ${draft.variable ? t("incomes.form.reviewVariable") : t("incomes.form.reviewFixed")}` },
    { step: "when", label: t("incomes.card.howOften"), value: savedAs ? scheduleText(savedAs, t, f) : "—" },
    { step: "when", label: t("incomes.form.reviewFrom"), value: startLabel },
    ...(nextDates.length > 0 ? [{ step: "when" as View, label: t("incomes.form.reviewNext"), value: nextDates.map((o) => f.dayMonth.format(o.date)).join(" · ") }] : []),
    { step: "where", label: t("incomes.card.where"), value: accounts.find((a) => a.id === draft.accountId)?.name ?? t("incomes.card.noAccount") },
    {
      step: "where",
      label: t("incomes.card.pause"),
      value: draft.hasPause
        ? `${monthLabel(draft.pauseFrom)} – ${draft.pauseTo ? monthLabel(draft.pauseTo) : t("incomes.form.pauseForever")}${draft.pauseYearly ? ` · ${t("incomes.form.reviewYearly")}` : ""}`
        : t("incomes.form.reviewNoPause"),
    },
    { step: "where", label: t("incomes.form.reviewEnds"), value: draft.hasEnd && draft.end ? monthLabel(draft.end) : t("incomes.form.reviewNoEnd") },
    { step: "where", label: t("incomes.form.reviewSalary"), value: draft.isSalary ? t("incomes.form.reviewSalaryYes") : t("incomes.form.reviewSalaryNo") },
  ];

  return (
    <Modal {...FORM_MODAL} isOpen toggle={onClose} centered scrollable>
      <ModalHeader toggle={onClose}>{isEdit ? `${incomeIcon(initial, categories)} ${initial.name}` : t("incomes.form.newTitle")}</ModalHeader>

      <form
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          if (view === "review") save();
          else goTo(STEPS[index + 1]);
        }}
      >
        <ModalBody className="wash-income">
          {/* Across the whole sheet, as on the Transactions form: in the
              header it shrank to the title's width. */}
          <WizardSteps
            steps={STEPS}
            current={view}
            onGo={goTo}
            label={(step) => t({ what: "incomes.form.stepShort1", amount: "incomes.form.stepShortAmount", when: "incomes.form.stepShort2", where: "incomes.form.stepShort3", review: "incomes.form.stepShort4" }[step])}
            open={isEdit}
            large
          />
          <div className="fw-semibold mb-3" style={{ fontSize: 14 }}>
            {stepTitle}
          </div>
          {view === "review" && (
            <div className={wiz.wizCard}>
              {reviewRows.map((row) => (
                <button key={row.label} type="button" className={wiz.wizRow} onClick={() => goTo(row.step)}>
                  <span className={wiz.wizLabel}>{row.label}</span>
                  <span className={wiz.wizValue}>{row.value}</span>
                </button>
              ))}
            </div>
          )}

          {view === "what" && (
            <>
              <FormGroup>
                <Label className="small fw-medium d-block">{t("common.category")} *</Label>
                <CategoryPicker categories={categories} type="income" value={draft.categoryId} manage="link" invalid={!!errors.categoryId} onChange={(id) => set("categoryId", id)} />
                {errors.categoryId && <div className="invalid-feedback d-block">{t(errors.categoryId)}</div>}
              </FormGroup>

              <FormGroup>
                <Label for="income-name" className="small fw-medium">
                  {t("common.name")} *
                </Label>
                <Input id="income-name" value={draft.name} placeholder={t("incomes.form.namePlaceholderExample")} onChange={(e) => set("name", e.target.value)} invalid={!!errors.name} />
                <FormFeedback>{error("name")}</FormFeedback>
              </FormGroup>
            </>
          )}

          {view === "amount" && (
            <>
              <div className="row g-2 mb-3">
                <div className="col-12 col-sm-6">
                  <Label for="income-amount" className="small fw-medium">
                    {draft.variable ? t("incomes.form.estimatedAmount") : t("common.amount")} ({displayCurrency}) *
                  </Label>
                  <Input id="income-amount" type="number" inputMode="decimal" min={0.01} step={0.01} value={draft.amount} onChange={(e) => set("amount", e.target.value)} invalid={!!errors.amount} />
                  <FormFeedback>{error("amount")}</FormFeedback>
                </div>
              </div>
              {/* «Ναι» needs nothing more: the amount above becomes the estimate. */}
              <YesNoChoice className="mb-0" question={<Question text={t("incomes.form.qVariable")} hint={t("incomes.form.variableHint")} />} value={draft.variable} onChange={(yes) => set("variable", yes)} />

            </>
          )}

          {view === "when" && (
            <>
              <FormGroup>
                <EveryPicker
                  id="income-every"
                  label={t("incomes.form.every")}
                  unitAria={t("incomes.form.everyUnit")}
                  unit={draft.frequency}
                  count={Math.max(1, Number(draft.every) || 1)}
                  unitText={(u, n) => t(u === "weekly" ? "incomes.form.unitWeeks" : u === "yearly" ? "incomes.form.unitYears" : "incomes.form.unitMonths", { count: n })}
                  onChange={(freq, n) =>
                    setDraft((d) => ({
                      ...d,
                      frequency: freq,
                      every: String(n),
                      // A weekday and a day of the month are different numbers; a change of
                      // cadence clears it rather than reading the 5th as Friday.
                      day: freq === d.frequency || (freq !== "weekly" && d.frequency !== "weekly") ? d.day : "",
                      start: freq === "weekly" ? (parseISODay(d.start) ? d.start : toISODay(now)) : d.start.slice(0, 7),
                    }))
                  }
                  invalid={!!errors.every}
                />
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
                    <Label id="income-day-label" className="small fw-medium">
                      {t("incomes.form.dayOfMonth")}
                    </Label>
                    <DayPicker id="income-day" aria-labelledby="income-day-label income-day" value={draft.day} onChange={(v) => set("day", v)} invalid={!!errors.day} />
                    {errors.day && <div className="invalid-feedback d-block">{error("day")}</div>}
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

          {view === "where" && (
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

              {/* «Ναι» shows the months of the break, in this step. */}
              <YesNoChoice question={t("incomes.form.qPause")} value={draft.hasPause} onChange={(yes) => set("hasPause", yes)}>
                <div className="ps-2">
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
              </YesNoChoice>

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

              <YesNoChoice
                className="mb-0"
                question={<Question text={t("incomes.form.qSalary")} hint={draft.isSalary && salaryName ? t("incomes.form.isSalaryMoves", { name: salaryName }) : t("incomes.form.isSalaryHint")} />}
                value={draft.isSalary}
                onChange={(yes) => set("isSalary", yes)}
              />
            </>
          )}
        </ModalBody>

        {/* Delete far left, then Back / Cancel; Next / Save alone on the right. */}
        <ModalFooter className="justify-content-between">
          <div className="d-flex gap-2">
            {isEdit && onDelete && <DeleteButton opensConfirm iconOnly onClick={onDelete} disabled={deleteLocked} title={deleteReason} />}
            {view === "what" ? (
              <Button type="button" color="secondary" outline onClick={onClose}>
                {t("common.cancel")}
              </Button>
            ) : (
              <Button type="button" color="secondary" outline onClick={() => setView(STEPS[index - 1])}>
                ‹ {t("common.back")}
              </Button>
            )}
          </div>
          {view === "review" ? (
            <Button type="submit" color="success">
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

/** A yes / no question with the words that explain it under it. */
function Question({ text, hint }: { text: string; hint: string }) {
  return (
    <>
      <span className="d-block">{text}</span>
      <span className="d-block fw-normal text-body-secondary" style={{ fontSize: 11.5 }}>
        {hint}
      </span>
    </>
  );
}
