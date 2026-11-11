import { useMemo, useState } from "react";
import { Button, FormFeedback, FormGroup, Input, Label, Modal, ModalBody, ModalFooter, ModalHeader } from "reactstrap";
import { useTranslation } from "react-i18next";

import { DateField } from "../../../shared/components/DateField";
import { DeleteButton } from "../../../shared/components/DeleteButton";
import { formatTable } from "../../transactions/transactionDates";
import { WizardSteps } from "../../transactions/components/WizardSteps";
import { MAX_REPEAT_MONTHS, monthStart, oneOffDate, repeatLabel } from "../plannerUtils";
import { CADENCES, cadenceOf, cadenceProblem, draftFor, EVERY_N_CHOICES, monthsOfYear, nextTimes, seasonMonths, type Cadence } from "../cadence";
import { categoryLabel } from "../../../shared/utils/categories";
import type { Category } from "../../../shared/types/IndexTypes";
import styles from "../css/PlannerPage.module.css";
import { FORM_MODAL } from "../../../shared/components/formModal";
import { YesNoChoice } from "../../../shared/components/YesNoChoice";
import { EveryPicker } from "../../../shared/components/EveryPicker";
import { useStepTried } from "../../../shared/hooks/useStepTried";
import { cleanLine } from "../../../shared/utils/cleanText";

export interface EntryDraft {
  id?: string;
  label: string;
  /** As typed, so an empty box stays empty instead of reading back as "0". */
  amount: string;
  /** "YYYY-MM-DD". Present only for dated extra pay. */
  date?: string;
  /** Months between repeats of dated extra pay. Absent means it happens once. */
  every?: number;
  /** The last day a dated repeat may land ("YYYY-MM-DD"), or the last month a yearly season runs ("YYYY-MM"). */
  until?: string;
  /** "YYYY-MM". A rate that only runs for part of the year. */
  from?: string;
  to?: string;
  /** The season comes back every year. */
  yearly?: boolean;
  /** A monthly line's categories, which make it a limit — see `BudgetLine.categoryIds`. */
  categoryIds?: string[];
}

interface EntryEditorProps {
  /** A rate per month, or a single dated amount. */
  mode: "line" | "oneoff";
  draft: EntryDraft;
  formatCurrency: (n: number) => string;
  /** For a monthly line: the categories it can pay for. */
  categories?: Category[];
  /** Categories another line already has, with that line's name — one category, one line. */
  takenBy?: Map<string, { id: string; label: string }>;
  /** Absent while creating. */
  onDelete?: () => void;
  onSave: (draft: EntryDraft) => void;
  onClose: () => void;
  /** Today, for the next dates the preview lists; the real one when absent. */
  now?: Date;
}

const STEPS = ["1", "2", "3"] as const;
type Step = (typeof STEPS)[number];

/** "2026-12" as "Dec 2026", or undefined for anything else. */
function monthText(key: string | undefined, lang: string): string | undefined {
  const start = monthStart(key);
  return start ? new Intl.DateTimeFormat(lang, { month: "short", year: "numeric" }).format(start) : undefined;
}

const monthKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;

/**
 * One dialog for writing every figure the user owns, in three steps: how often
 * it comes round, what it is and how much, and the check.
 *
 * How often comes first, as one choice in plain words — «Μία φορά», «Κάθε
 * μήνα», «Κάθε χρόνο», «Κάθε Ν μήνες», «Μόνο κάποιους μήνες» — followed by only
 * the fields that answer needs. It used to ask "all year or some months", then
 * "once or repeating", and the amount before any of it as «Ποσό ανά μήνα»,
 * which presumed monthly while the user may have meant once a year. The amount
 * now comes after, under a name that says what it is for that cadence, and the
 * whole figure is said back as a sentence with its next dates. The last step
 * is the only place Save is.
 *
 * What is stored has not changed — see `cadence.ts` — so an existing figure
 * opens on the cadence it is. Opening one lets the rail jump, since everything
 * is filled in.
 */
export function EntryEditor({ mode, draft, formatCurrency, categories = [], takenBy, onDelete, onSave, onClose, now }: EntryEditorProps) {
  const { t, i18n } = useTranslation();
  const lang = i18n.resolvedLanguage ?? "en";
  const [value, setValue] = useState<EntryDraft>(draft);
  const [step, setStep] = useState<Step>("1");
  const { tried: triedOn, mark: markTried } = useStepTried<Step>();
  const tried = triedOn(step);
  const [cadence, setCadence] = useState<Cadence>(() => (draft.id ? cadenceOf(mode, draft) : mode === "line" ? "monthly" : "once"));
  // The categories, open from the start when some are already linked.
  const [linking, setLinking] = useState(!!draft.categoryIds?.length);
  const expenseCategories = categories.filter((c) => c.type === "expense").sort((a, b) => categoryLabel(a.name, t).localeCompare(categoryLabel(b.name, t)));
  const linked = new Set(value.categoryIds ?? []);
  const toggleCategory = (id: string) => {
    const next = new Set(linked);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setValue({ ...value, categoryIds: [...next] });
  };
  const linkedNames = expenseCategories.filter((c) => linked.has(c.id)).map((c) => categoryLabel(c.name, t));

  const edit = !!draft.id;
  const dated = mode === "oneoff";
  const amount = parseFloat(value.amount);
  const amountOk = Number.isFinite(amount) && amount > 0;
  // A line or a one-off is known by its name: it must be typed — nothing is filled in for an empty one.
  const labelOk = cleanLine(value.label) !== "";
  // What would be stored, worked out once: the check, the sentence and Save all read it.
  const stored = useMemo(() => draftFor(mode, cadence, value), [mode, cadence, value]);
  const problem = cadenceProblem(mode, cadence, value);
  const whenOk = !problem;
  const valid = amountOk && labelOk && whenOk;
  const today = useMemo(() => now ?? new Date(), [now]);

  const index = STEPS.indexOf(step);
  const goTo = (target: Step) => {
    const to = STEPS.indexOf(target);
    // Forward only as far as what is filled in allows; back is always free.
    if (to > 0 && !whenOk) {
      markTried("1");
      setStep("1");
      return;
    }
    if (to > 1 && (!amountOk || !labelOk)) {
      markTried("2");
      setStep("2");
      return;
    }
    setStep(target);
  };

  const save = () => {
    if (!valid) return;
    const clean: EntryDraft = { ...stored, label: cleanLine(value.label) };
    // No categories is no limit: nothing stored rather than an empty list.
    if (!clean.categoryIds?.length) delete clean.categoryIds;
    onSave(clean);
  };

  const shortMonth = useMemo(() => new Intl.DateTimeFormat(lang, { month: "short" }), [lang]);
  const monthName = (month: number) => shortMonth.format(new Date(2000, month, 1));
  const money = formatCurrency(amountOk ? amount : 0);
  const times = (n: number) => formatCurrency(amountOk ? amount * n : 0);

  // The "when", as the check's row says it.
  const whenText = (() => {
    const v = stored;
    if (dated) {
      const first = oneOffDate(v.date ?? "");
      const day = first ? formatTable(first, lang) : "—";
      if (!v.every) return day;
      const label = repeatLabel(v.every);
      const stop = oneOffDate(v.until ?? "");
      return `${t(label.key, { count: label.count })} · ${t("planner.repeatFirstDate")} ${day}${stop ? ` · ${t("planner.seasonToOnly", { month: formatTable(stop, lang) })}` : ""}`;
    }
    if (cadence === "monthly") return t("planner.cadence_monthly");
    const from = monthText(v.from, lang);
    if (cadence === "once") return from ?? "—";
    const stop = monthText(v.until, lang);
    const until = stop ? ` · ${t("planner.seasonToOnly", { month: stop })}` : "";
    const start = monthStart(v.from);
    if (cadence === "yearly") return `${start ? monthName(start.getMonth()) : "—"} · ${t("planner.seasonYearlyTag")}${until}`;
    const to = monthText(v.to, lang);
    const span = from && to ? `${from} — ${to}` : from ? (v.yearly ? from : t("planner.seasonFromOnly", { month: from })) : to ? t("planner.seasonToOnly", { month: to }) : "—";
    return v.yearly ? `${span} · ${t("planner.seasonYearlyTag")}${until}` : span;
  })();

  // The whole figure in one sentence: «3 φορές τον χρόνο: Μαρ, Ιούλ, Νοέ — 120 € η καθεμία».
  const preview = (() => {
    if (!whenOk) return undefined;
    const v = stored;
    if (dated) {
      const first = oneOffDate(v.date ?? "");
      if (!first) return undefined;
      if (cadence === "once") return t("planner.preview_onceDate", { date: formatTable(first, lang), amount: money });
      if (cadence === "monthly") return t("planner.preview_monthlyDay", { day: first.getDate(), amount: money, year: times(12) });
      const months = monthsOfYear(v);
      if (months) return t("planner.preview_timesYear", { count: months.length, months: months.map(monthName).join(", "), amount: money });
      const label = repeatLabel(v.every ?? 1);
      return t("planner.preview_everyN", { cadence: t(label.key, { count: label.count }), amount: money });
    }
    if (cadence === "monthly") return t("planner.preview_monthly", { amount: money, year: times(12) });
    const start = monthStart(v.from);
    if (cadence === "once") return t("planner.preview_onceMonth", { month: monthText(v.from, lang), amount: money });
    if (cadence === "yearly" && start) return t("planner.preview_yearlyMonth", { month: monthName(start.getMonth()), amount: money });
    const from = monthText(v.from, lang);
    const to = monthText(v.to, lang);
    if (v.yearly && start) {
      const count = seasonMonths(v.from, v.to || v.from) || 1;
      const span = count > 1 ? `${monthName(start.getMonth())} — ${monthName((start.getMonth() + count - 1) % 12)}` : monthName(start.getMonth());
      return t("planner.preview_seasonYearly", { count, span, amount: money, year: times(count) });
    }
    if (from && to) {
      const count = seasonMonths(v.from, v.to);
      return t("planner.preview_seasonOnce", { count, span: `${from} — ${to}`, amount: money, total: times(count) });
    }
    return from ? t("planner.preview_seasonFrom", { month: from, amount: money }) : t("planner.preview_seasonTo", { month: to, amount: money });
  })();

  const next = whenOk ? nextTimes(mode, stored, today) : [];
  const nextText = next.length > 0 ? t("planner.preview_next", { dates: next.map((d) => (dated ? formatTable(d, lang) : monthText(monthKey(d), lang))).join(", ") }) : undefined;

  const amountLabel = t(cadence === "once" ? "planner.lineAmount" : cadence === "yearly" ? "planner.amount_yearly" : dated ? "planner.amount_each" : "planner.amount_monthly");
  const perMonth = !dated && (cadence === "monthly" || cadence === "season");

  const rows: { step: Step; label: string; value: string }[] = [
    { step: "1", label: t("planner.wizard_when"), value: whenText },
    { step: "2", label: t("planner.lineName"), value: cleanLine(value.label) },
    { step: "2", label: amountLabel, value: perMonth ? t("planner.perMonthShort", { amount: money }) : money },
    ...(!dated && linkedNames.length > 0 ? [{ step: "2" as Step, label: t("planner.lineCategoriesShort"), value: linkedNames.join(", ") }] : []),
  ];

  const sentence = preview ? (
    <div className={styles.cadencePreview}>
      <div className="fw-medium">{preview}</div>
      {nextText && <div className="small text-body-secondary">{nextText}</div>}
    </div>
  ) : null;

  const set = (patch: Partial<EntryDraft>) => setValue({ ...value, ...patch });
  // Two ends that contradict each other are said at once; a missing answer only once Next is pressed.
  const showProblem = !!problem && (tried || problem === "planner.seasonBackwards" || problem === "planner.repeatBackwards");
  const repeatsWithEnd = dated ? cadence !== "once" : cadence === "yearly" || (cadence === "season" && !!value.yearly);

  // «Κάθε Ν»: the gap in months, as stored.
  const everyMonths = stored.every ?? EVERY_N_CHOICES[0];
  return (
    <Modal {...FORM_MODAL} isOpen toggle={onClose} centered scrollable>
      <ModalHeader toggle={onClose}>
        <span style={{ fontSize: "var(--fs-lead)" }}>{t(edit ? "planner.editEntry" : dated ? "planner.addOneOff" : "planner.addEntry")}</span>
      </ModalHeader>

      <form
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          if (step === "3") save();
          else goTo(STEPS[index + 1]);
        }}
      >
        <ModalBody>
          <WizardSteps steps={STEPS} current={step} onGo={goTo} label={(s) => t(`planner.cadence_stepShort${s}`)} open={edit} large />
          <div className="fw-semibold mb-3" style={{ fontSize: "var(--fs-lead)" }}>
            {t(`planner.cadence_${dated ? "oneoff" : "line"}${step}`)}
          </div>

          {step === "1" && (
            <>
              {/* One answer, in plain words; then only what that answer needs. */}
              <div className={styles.cadenceGrid} role="radiogroup" aria-label={t("planner.cadence_question")}>
                {CADENCES[mode].map((c) => (
                  <button
                    key={c}
                    type="button"
                    role="radio"
                    aria-checked={cadence === c}
                    className={`btn text-start ${cadence === c ? "btn-primary" : "btn-outline-secondary"}`}
                    onClick={() => setCadence(c)}
                  >
                    <span className="d-block fw-semibold">{t(`planner.cadence_${c}`)}</span>
                    <span className="d-block small">{t(`planner.cadence_${c}Hint_${mode}`)}</span>
                  </button>
                ))}
              </div>

              <div className="mt-3">
                {!dated && cadence === "monthly" && <p className={styles.fieldHint}>{t("planner.wizard_allYearHint")}</p>}

                {!dated && (cadence === "once" || cadence === "yearly") && (
                  <FormGroup className="mb-0">
                    <Label className={styles.fieldLabel} htmlFor="entry-month">
                      {t("planner.cadence_month")}
                    </Label>
                    <DateField id="entry-month" month name="entry-month" value={value.from ?? ""} onChange={(v) => set({ from: v })} placeholder={t("planner.cadence_month")} />
                  </FormGroup>
                )}

                {!dated && cadence === "season" && (
                  <>
                    <div className="d-flex align-items-center gap-2 flex-wrap">
                      <DateField month clearable name="season-from" value={value.from ?? ""} onChange={(v) => set({ from: v })} placeholder={t("planner.seasonFrom")} />
                      <span className={styles.fieldHint} style={{ margin: 0 }}>
                        {t("planner.seasonTo")}
                      </span>
                      <DateField month clearable name="season-to" value={value.to ?? ""} onChange={(v) => set({ to: v })} placeholder={t("planner.seasonToLabel")} />
                    </div>
                    <p className={styles.fieldHint}>{t("planner.wizard_someMonthsHint")}</p>
                    <YesNoChoice className="mt-2 mb-0" question={t("planner.wizard_qEveryYear")} value={!!value.yearly} onChange={(yes) => set({ yearly: yes })} />
                  </>
                )}

                {dated && (
                  <>
                    {cadence === "everyN" && (
                      // «Κάθε πότε»: a number and a unit from lists, on one row; kept in months.
                      <FormGroup>
                        <EveryPicker
                          id="entry-every"
                          label={t("planner.everyLabel")}
                          unitAria={t("planner.everyUnit")}
                          units={["monthly", "yearly"]}
                          // One month or one year is its own cadence, not «κάθε Ν».
                          min={{ monthly: 2, yearly: 2 }}
                          // A repeat is kept up to MAX_REPEAT_MONTHS: as far as the planner looks ahead (10 years).
                          max={{ yearly: MAX_REPEAT_MONTHS / 12 }}
                          unit={everyMonths % 12 === 0 ? "yearly" : "monthly"}
                          count={everyMonths % 12 === 0 ? everyMonths / 12 : everyMonths}
                          unitText={(u, n) => t(u === "yearly" ? "planner.everyUnitYears" : "planner.everyUnitMonths", { count: n })}
                          onChange={(u, n) => set({ every: u === "yearly" ? n * 12 : n })}
                        />
                      </FormGroup>
                    )}
                    <FormGroup className="mb-0">
                      <Label className={styles.fieldLabel} htmlFor="entry-date">
                        {cadence === "once" ? t("common.date") : t("planner.repeatFirstDate")}
                      </Label>
                      <DateField id="entry-date" name="entry-date" value={value.date ?? ""} onChange={(v) => set({ date: v })} placeholder={t("common.date")} />
                    </FormGroup>
                  </>
                )}

                {/* An end, for whatever comes back. */}
                {repeatsWithEnd && (
                  <div className="mt-3">
                    <Label className={styles.fieldLabel} htmlFor="entry-until">
                      {t("planner.repeatUntil")}
                    </Label>
                    <DateField id="entry-until" month={!dated} clearable name="entry-until" value={value.until ?? ""} onChange={(v) => set({ until: v })} placeholder={t("planner.repeatUntilPlaceholder")} />
                    <p className={styles.fieldHint}>{t("planner.repeatUntilHint")}</p>
                  </div>
                )}
                {showProblem && <p className={styles.fieldError}>{t(problem!)}</p>}
              </div>
            </>
          )}

          {step === "2" && (
            <>
              <FormGroup>
                <Label className={styles.fieldLabel} htmlFor="entry-name">
                  {t("planner.lineName")}
                </Label>
                <Input
                  id="entry-name"
                  autoFocus
                  value={value.label}
                  onChange={(e) => set({ label: e.target.value })}
                  placeholder={dated ? t("planner.oneOffNamePlaceholder") : t("planner.lineNamePlaceholder")}
                  invalid={tried && !labelOk}
                />
                <FormFeedback>{t("planner.wizard_nameNeeded")}</FormFeedback>
              </FormGroup>
              <FormGroup className="mb-0">
                <Label className={styles.fieldLabel} htmlFor="entry-amount">
                  {amountLabel}
                </Label>
                <Input id="entry-amount" type="number" min={0} inputMode="decimal" value={value.amount} invalid={tried && !amountOk} onChange={(e) => set({ amount: e.target.value })} placeholder="0" />
                <FormFeedback>{t("planner.wizard_amountNeeded")}</FormFeedback>
                {!dated && <p className={styles.fieldHint}>{t(perMonth ? "planner.perMonthHint" : "planner.amount_spreadMonth")}</p>}
              </FormGroup>

              {amountOk && sentence && <div className="mt-3">{sentence}</div>}

              {/* What used to be the Allocation page's buckets: the line as a
                  limit, measured against what its categories actually spent. */}
              {!dated && expenseCategories.length > 0 && (
                <div className="mt-3">
                  <button type="button" className={styles.limitToggle} onClick={() => setLinking((v) => !v)} aria-expanded={linking}>
                    {t("planner.lineCategories")}
                    {linkedNames.length > 0 && <span className={styles.limitCount}>{linkedNames.length}</span>}
                  </button>
                  <p className={styles.fieldHint}>{t("planner.lineCategoriesHint")}</p>
                  {linking && (
                    <div className={styles.limitPick} role="group" aria-label={t("planner.lineCategories")}>
                      {expenseCategories.map((category) => {
                        const owner = takenBy?.get(category.id);
                        const taken = !!owner && owner.id !== draft.id;
                        return (
                          <label key={category.id} className={`${styles.limitOption} ${taken ? styles.limitTaken : ""}`}>
                            <Input type="checkbox" checked={linked.has(category.id)} disabled={taken} onChange={() => toggleCategory(category.id)} />
                            <span aria-hidden>{category.icon ?? "🧾"}</span>
                            <span className="flex-grow-1">{categoryLabel(category.name, t)}</span>
                            {taken && <span className={styles.limitTakenBy}>{t("planner.lineCategoryTaken", { name: owner!.label })}</span>}
                          </label>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </>
          )}

          {step === "3" && (
            <>
              <div className={styles.wizCard}>
                {rows.map((row) => (
                  <button key={row.label} type="button" className={styles.wizRow} onClick={() => goTo(row.step)}>
                    <span className={styles.wizLabel}>{row.label}</span>
                    <span className={styles.wizValue}>{row.value}</span>
                  </button>
                ))}
              </div>
              {sentence && <div className="mt-3">{sentence}</div>}
            </>
          )}
        </ModalBody>

        <ModalFooter className="justify-content-between">
          {/* Left, away from Save: the two buttons of a small dialog sitting side
              by side is how a delete gets pressed by accident. */}
          {onDelete ? <DeleteButton iconOnly onClick={onDelete} what={draft.label || undefined} /> : <span />}
          <span className="d-flex gap-2">
            {step === "1" ? (
              <Button type="button" color="secondary" outline onClick={onClose}>
                {t("common.cancel")}
              </Button>
            ) : (
              <Button type="button" color="secondary" outline onClick={() => setStep(STEPS[index - 1])}>
                ‹ {t("common.back")}
              </Button>
            )}
            {step === "3" ? (
              <Button type="submit" color="success" disabled={!valid}>
                {t("common.save")}
              </Button>
            ) : (
              <Button type="submit" color="primary">
                {t("common.next")} ›
              </Button>
            )}
          </span>
        </ModalFooter>
      </form>
    </Modal>
  );
}

export default EntryEditor;
