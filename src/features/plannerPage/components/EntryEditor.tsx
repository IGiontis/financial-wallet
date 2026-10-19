import { useState } from "react";
import { Button, FormFeedback, FormGroup, Input, Label, Modal, ModalBody, ModalFooter, ModalHeader } from "reactstrap";
import { useTranslation } from "react-i18next";

import { DateField } from "../../../shared/components/DateField";
import { DeleteButton } from "../../../shared/components/DeleteButton";
import segmented from "../../../shared/css/Segmented.module.css";
import { formatTable } from "../../transactions/transactionDates";
import { WizardSteps } from "../../transactions/components/WizardSteps";
import { oneOffDate, REPEAT_CHOICES, repeatLabel } from "../plannerUtils";
import { categoryLabel } from "../../../shared/utils/categories";
import type { Category } from "../../../shared/types/IndexTypes";
import styles from "../css/PlannerPage.module.css";

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
}

const STEPS = ["1", "2", "3"] as const;
type Step = (typeof STEPS)[number];

/** "2026-12" as "Dec 2026", or undefined for anything else. */
function monthText(key: string | undefined, lang: string): string | undefined {
  const match = /^(\d{4})-(\d{2})$/.exec(key ?? "");
  if (!match) return undefined;
  return new Intl.DateTimeFormat(lang, { month: "short", year: "numeric" }).format(new Date(Number(match[1]), Number(match[2]) - 1, 1));
}

/**
 * One dialog for writing every figure the user owns, in three steps: what it
 * is and how much, when it applies, and the check.
 *
 * It used to be one tall form with everything at once, the season, the yearly
 * repeat and the end date included, so that to add "300 a month in summer" you
 * had to read all of it first. Now the first step is a name and an amount and
 * nothing else; the question of when comes after, and asks one thing at a time:
 * all year or only some months, once or repeating. The last step says the
 * answer in a sentence, and is the only place Save is.
 *
 * Opening an existing figure lets the rail jump, since everything is filled in.
 */
export function EntryEditor({ mode, draft, formatCurrency, categories = [], takenBy, onDelete, onSave, onClose }: EntryEditorProps) {
  const { t, i18n } = useTranslation();
  const lang = i18n.resolvedLanguage ?? "en";
  const [value, setValue] = useState<EntryDraft>(draft);
  const [step, setStep] = useState<Step>("1");
  const [tried, setTried] = useState(false);
  // Whether a monthly figure only runs for part of the year; a figure that arrives on a date is its own thing.
  const [seasonal, setSeasonal] = useState(!!(draft.from || draft.to));
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
  const amount = parseFloat(value.amount);
  const dated = mode === "oneoff";
  const amountOk = Number.isFinite(amount) && amount > 0;
  // A season that ends before it starts charges nothing at all, which looks
  // like the app losing the entry rather than refusing it.
  const seasonBackwards = !dated && seasonal && !!value.from && !!value.to && value.to < value.from;
  // A season with no start has nothing to add a year to. Saying so beats
  // storing a repeat that quietly does nothing.
  const yearlyNeedsStart = !dated && seasonal && !!value.yearly && !value.from;
  const seasonEndsEarly = !dated && seasonal && !!value.yearly && !!value.until && value.until < (value.to || value.from || "");
  const repeats = !!value.every;
  const repeatBackwards = dated && repeats && !!value.until && !!value.date && value.until < value.date;
  const dateOk = !dated || !!oneOffDate(value.date ?? "");
  const whenOk = dateOk && !seasonBackwards && !repeatBackwards && !yearlyNeedsStart && !seasonEndsEarly;
  const valid = amountOk && whenOk;

  const index = STEPS.indexOf(step);
  const goTo = (target: Step) => {
    const to = STEPS.indexOf(target);
    // Forward only as far as what is filled in allows; back is always free.
    if (to > 0 && !amountOk) {
      setTried(true);
      setStep("1");
      return;
    }
    if (to > 1 && !whenOk) {
      setTried(true);
      setStep("2");
      return;
    }
    setStep(target);
  };

  const save = () => {
    if (!valid) return;
    // Whatever the switches say is what is stored: a season left behind by "all year" would still apply.
    const clean: EntryDraft = { ...value, label: value.label.trim() };
    // No categories is no limit: nothing stored rather than an empty list.
    if (!clean.categoryIds?.length) delete clean.categoryIds;
    if (!dated && !seasonal) {
      delete clean.from;
      delete clean.to;
      delete clean.yearly;
      delete clean.until;
    }
    onSave(clean);
  };

  const chooseSeasonal = (on: boolean) => {
    setSeasonal(on);
    if (!on) setValue((v) => ({ ...v, from: undefined, to: undefined, yearly: undefined, until: undefined }));
  };

  const chooseRepeats = (on: boolean) => setValue((v) => ({ ...v, every: on ? (v.every ?? 1) : undefined, until: on ? v.until : undefined }));

  // The "when", as the sentence the check shows.
  const whenText = (() => {
    if (dated) {
      const first = oneOffDate(value.date ?? "");
      const day = first ? formatTable(first, lang) : "—";
      if (!repeats) return day;
      const cadence = repeatLabel(value.every!);
      const stop = oneOffDate(value.until ?? "");
      return `${t(cadence.key, { count: cadence.count })} · ${t("planner.repeatFirstDate")} ${day}${stop ? ` · ${t("planner.seasonToOnly", { month: formatTable(stop, lang) })}` : ""}`;
    }
    if (!seasonal) return t("planner.wizard_allYear");
    const from = monthText(value.from, lang);
    const to = monthText(value.to, lang);
    const span = from && to ? `${from} — ${to}` : from ? (value.yearly ? from : t("planner.seasonFromOnly", { month: from })) : to ? t("planner.seasonToOnly", { month: to }) : t("planner.wizard_allYear");
    if (!value.yearly) return span;
    const stop = monthText(value.until, lang);
    return `${span} · ${t("planner.seasonYearlyTag")}${stop ? ` · ${t("planner.seasonToOnly", { month: stop })}` : ""}`;
  })();

  const rows: { step: Step; label: string; value: string }[] = [
    { step: "1", label: t("planner.lineName"), value: value.label.trim() || "—" },
    { step: "1", label: t("common.amount"), value: dated ? formatCurrency(amountOk ? amount : 0) : t("planner.perMonthShort", { amount: formatCurrency(amountOk ? amount : 0) }) },
    { step: "2", label: t("planner.wizard_when"), value: whenText },
    ...(!dated && linkedNames.length > 0 ? [{ step: "1" as Step, label: t("planner.lineCategoriesShort"), value: linkedNames.join(", ") }] : []),
  ];

  return (
    <Modal isOpen toggle={onClose} centered scrollable>
      <ModalHeader toggle={onClose}>
        <span style={{ fontSize: 15 }}>{t(edit ? "planner.editEntry" : dated ? "planner.addOneOff" : "planner.addEntry")}</span>
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
          <WizardSteps steps={STEPS} current={step} onGo={goTo} label={(s) => t(`planner.wizard_stepShort${s}`)} open={edit} large />
          <div className="fw-semibold mb-3" style={{ fontSize: 14 }}>
            {t(`planner.wizard_${dated ? "oneoff" : "line"}${step}`)}
          </div>

          {step === "1" && (
            <>
              <FormGroup>
                <Label className={styles.fieldLabel} htmlFor="entry-name">
                  {t("planner.lineName")}
                </Label>
                <Input
                  id="entry-name"
                  autoFocus
                  value={value.label}
                  onChange={(e) => setValue({ ...value, label: e.target.value })}
                  placeholder={dated ? t("planner.oneOffNamePlaceholder") : t("planner.lineNamePlaceholder")}
                />
              </FormGroup>
              <FormGroup className="mb-0">
                <Label className={styles.fieldLabel} htmlFor="entry-amount">
                  {dated ? t("planner.oneOffAmount") : t("planner.lineAmount")}
                </Label>
                <Input id="entry-amount" type="number" min={0} inputMode="decimal" value={value.amount} invalid={tried && !amountOk} onChange={(e) => setValue({ ...value, amount: e.target.value })} placeholder="0" />
                <FormFeedback>{t("planner.wizard_amountNeeded")}</FormFeedback>
                {!dated && <p className={styles.fieldHint}>{t("planner.perMonthHint")}</p>}
              </FormGroup>

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

          {step === "2" && !dated && (
            <>
              <div className={`${segmented.group} ${segmented.even} mb-3`} role="group" aria-label={t("planner.wizard_when")}>
                {[false, true].map((on) => (
                  <button key={String(on)} type="button" className={`${segmented.item} ${seasonal === on ? segmented.active : ""}`} aria-pressed={seasonal === on} onClick={() => chooseSeasonal(on)}>
                    {t(on ? "planner.wizard_someMonths" : "planner.wizard_allYear")}
                  </button>
                ))}
              </div>

              {!seasonal && <p className={styles.fieldHint}>{t("planner.wizard_allYearHint")}</p>}

              {seasonal && (
                <>
                  <div className="d-flex align-items-center gap-2">
                    <DateField month clearable name="season-from" value={value.from ?? ""} onChange={(v) => setValue({ ...value, from: v })} placeholder={t("planner.seasonFrom")} />
                    <span className={styles.fieldHint} style={{ margin: 0 }}>
                      {t("planner.seasonTo")}
                    </span>
                    <DateField month clearable name="season-to" value={value.to ?? ""} onChange={(v) => setValue({ ...value, to: v })} placeholder={t("planner.seasonToLabel")} />
                  </div>
                  {seasonBackwards ? <p className={styles.fieldError}>{t("planner.seasonBackwards")}</p> : <p className={styles.fieldHint}>{t("planner.wizard_someMonthsHint")}</p>}

                  <FormGroup switch className="mt-2 mb-0">
                    <Input id="season-yearly" type="switch" checked={!!value.yearly} onChange={(e) => setValue({ ...value, yearly: e.target.checked, until: e.target.checked ? value.until : undefined })} />
                    <Label for="season-yearly" check className="small">
                      {t("planner.wizard_everyYear")}
                    </Label>
                  </FormGroup>

                  {value.yearly && (
                    <div className="mt-3">
                      <Label className={styles.fieldLabel} htmlFor="season-until">
                        {t("planner.repeatUntil")}
                      </Label>
                      <DateField id="season-until" month clearable name="season-until" value={value.until ?? ""} onChange={(v) => setValue({ ...value, until: v })} placeholder={t("planner.repeatUntilPlaceholder")} />
                      {yearlyNeedsStart ? (
                        <p className={styles.fieldError}>{t("planner.seasonNeedsStart")}</p>
                      ) : seasonEndsEarly ? (
                        <p className={styles.fieldError}>{t("planner.repeatBackwards")}</p>
                      ) : (
                        <p className={styles.fieldHint}>{t("planner.repeatUntilHint")}</p>
                      )}
                    </div>
                  )}
                </>
              )}
            </>
          )}

          {step === "2" && dated && (
            <>
              <FormGroup>
                <Label className={styles.fieldLabel} htmlFor="entry-date">
                  {repeats ? t("planner.repeatFirstDate") : t("common.date")}
                </Label>
                <DateField id="entry-date" name="entry-date" value={value.date ?? ""} onChange={(v) => setValue({ ...value, date: v })} placeholder={t("common.date")} />
                {tried && !dateOk && <p className={styles.fieldError}>{t("validation.dateRequired")}</p>}
              </FormGroup>

              {/* A cadence rather than a date each time: "a coupon every three
                  months" was four entries a year, rewritten every January.
                  A fixed set rather than a free number: these are every cadence
                  pay actually arrives on, and a list needs no validating. */}
              <div className={`${segmented.group} ${segmented.even} mb-3`} role="group" aria-label={t("planner.repeats")}>
                {[false, true].map((on) => (
                  <button key={String(on)} type="button" className={`${segmented.item} ${repeats === on ? segmented.active : ""}`} aria-pressed={repeats === on} onClick={() => chooseRepeats(on)}>
                    {t(on ? "planner.wizard_repeating" : "planner.wizard_once")}
                  </button>
                ))}
              </div>

              {repeats && (
                <>
                  <Label className={styles.fieldLabel} htmlFor="entry-every">
                    {t("planner.repeats")}
                  </Label>
                  <Input id="entry-every" type="select" value={value.every ?? ""} onChange={(e) => setValue({ ...value, every: Number(e.target.value) })}>
                    {REPEAT_CHOICES.map((months) => {
                      const label = repeatLabel(months);
                      return (
                        <option key={months} value={months}>
                          {t(label.key, { count: label.count })}
                        </option>
                      );
                    })}
                  </Input>

                  <div className="mt-3">
                    <Label className={styles.fieldLabel} htmlFor="entry-until">
                      {t("planner.repeatUntil")}
                    </Label>
                    <DateField id="entry-until" clearable name="entry-until" value={value.until ?? ""} onChange={(v) => setValue({ ...value, until: v })} placeholder={t("planner.repeatUntilPlaceholder")} />
                    {repeatBackwards ? <p className={styles.fieldError}>{t("planner.repeatBackwards")}</p> : <p className={styles.fieldHint}>{t("planner.repeatUntilHint")}</p>}
                  </div>
                </>
              )}
            </>
          )}

          {step === "3" && (
            <div className={styles.wizCard}>
              {rows.map((row) => (
                <button key={row.label} type="button" className={styles.wizRow} onClick={() => goTo(row.step)}>
                  <span className={styles.wizLabel}>{row.label}</span>
                  <span className={styles.wizValue}>{row.value}</span>
                </button>
              ))}
            </div>
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
