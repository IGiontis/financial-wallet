import { parseISODay, parseISOMonth, toISODay, toISOMonth } from "../../shared/utils/dates";
import { cleanIncome, newIncomeId, type Income, type IncomeFrequency, type IncomeKind } from "./incomesUtils";

// The new-income form and the edit form are one sheet of three steps — «Τι
// μπαίνει», «Πότε», «Πού και ως πότε» — in the order of the Bills form. What it
// holds while being typed is text, as the inputs hand it over; it becomes an
// `Income` only when saved, through `cleanIncome`, so the form can never write
// something the page would then refuse to read.

export interface IncomeDraft {
  id?: string;
  kind: IncomeKind;
  name: string;
  variable: boolean;
  /** In the display currency, as typed. */
  amount: string;
  categoryId: string;
  frequency: IncomeFrequency;
  every: string;
  /** Monthly/yearly: "1"–"31". Weekly: "0"–"6", Sunday first. */
  day: string;
  /** Yearly: "0"–"11". */
  month: string;
  /** "YYYY-MM", or "YYYY-MM-DD" for a weekly income. */
  start: string;
  accountId: string;
  hasPause: boolean;
  pauseFrom: string;
  pauseTo: string;
  pauseYearly: boolean;
  hasEnd: boolean;
  end: string;
  isSalary: boolean;
  active: boolean;
}

export type DraftStep = 1 | 2 | 3;
export type DraftErrors = Partial<Record<keyof IncomeDraft, string>>;

const num = (value: string) => (value.trim() === "" ? NaN : Number(value.replace(",", ".")));

/** A blank form, or one already filled in — from the salary found, or from a day tapped on the calendar. */
export function emptyDraft(now: Date, preset: Partial<IncomeDraft> = {}): IncomeDraft {
  return {
    kind: "salary",
    name: "",
    variable: false,
    amount: "",
    categoryId: "",
    frequency: "monthly",
    every: "1",
    day: "",
    month: String(now.getMonth()),
    start: toISOMonth(now),
    accountId: "",
    hasPause: false,
    pauseFrom: toISOMonth(new Date(now.getFullYear(), now.getMonth() + 1, 1)),
    pauseTo: "",
    pauseYearly: false,
    hasEnd: false,
    end: "",
    isSalary: false,
    active: true,
    ...preset,
  };
}

/** An income back into the form, its amount shown in the display currency. */
export function incomeToDraft(income: Income, toDisplay: (base: number) => number, now: Date): IncomeDraft {
  return emptyDraft(now, {
    id: income.id,
    kind: income.kind,
    name: income.name,
    variable: !!income.variable,
    amount: String(Number(toDisplay(income.amount).toFixed(2))),
    categoryId: income.categoryId ?? "",
    frequency: income.frequency,
    every: String(income.every ?? 1),
    day: income.day === undefined ? "" : String(income.day),
    month: income.month === undefined ? String(now.getMonth()) : String(income.month),
    start: income.start,
    accountId: income.accountId ?? "",
    hasPause: !!income.pause,
    pauseFrom: income.pause?.from ?? toISOMonth(new Date(now.getFullYear(), now.getMonth() + 1, 1)),
    pauseTo: income.pause?.to ?? "",
    pauseYearly: !!income.pause?.yearly,
    hasEnd: !!income.end,
    end: income.end ?? "",
    isSalary: !!income.isSalary,
    active: income.active !== false,
  });
}

/**
 * What is wrong with the fields of one step, as i18n keys. Empty when it can
 * go on. Each step checks only its own fields: the sheet will not move on past
 * a mistake, and a mistake on a later step is not the reader's problem yet.
 */
export function validateDraft(draft: IncomeDraft, step: DraftStep): DraftErrors {
  const errors: DraftErrors = {};
  if (step === 1) {
    if (!draft.name.trim()) errors.name = "validation.nameRequired";
    else if (draft.name.trim().length > 40) errors.name = "validation.maxChars|40";
    const amount = num(draft.amount);
    if (!Number.isFinite(amount)) errors.amount = "validation.amountRequired";
    else if (amount <= 0) errors.amount = "validation.amountPositive";
    else if (amount > 1_000_000) errors.amount = "validation.amountTooLarge";
  }
  if (step === 2) {
    const every = num(draft.every);
    if (!Number.isInteger(every) || every < 1 || every > 24) errors.every = "validation.intervalMax";
    const day = num(draft.day);
    if (draft.frequency === "weekly") {
      if (!Number.isInteger(day) || day < 0 || day > 6) errors.day = "validation.required";
      if (!parseISODay(draft.start)) errors.start = "validation.required";
    } else {
      if (!Number.isInteger(day) || day < 1 || day > 31) errors.day = "incomes.form.dayInvalid";
      if (!parseISOMonth(draft.start) && !parseISODay(draft.start)) errors.start = "validation.required";
    }
    if (draft.frequency === "yearly") {
      const month = num(draft.month);
      if (!Number.isInteger(month) || month < 0 || month > 11) errors.month = "validation.required";
    }
  }
  if (step === 3) {
    if (draft.hasPause) {
      if (!parseISOMonth(draft.pauseFrom)) errors.pauseFrom = "validation.required";
      if (draft.pauseYearly && !parseISOMonth(draft.pauseTo)) errors.pauseTo = "validation.pauseToRequired";
      const from = parseISOMonth(draft.pauseFrom);
      const to = parseISOMonth(draft.pauseTo);
      // A yearly pause may wrap the new year — November to March.
      if (from && to && !draft.pauseYearly && to < from) errors.pauseTo = "validation.pauseEndBeforeStart";
    }
    if (draft.hasEnd) {
      const end = parseISOMonth(draft.end);
      const start = parseISOMonth(draft.start.slice(0, 7));
      if (!end) errors.end = "validation.required";
      else if (start && end < start) errors.end = "incomes.form.endBeforeStart";
    }
  }
  return errors;
}

/** Every step at once — what a save checks. */
export function validateAll(draft: IncomeDraft): DraftErrors {
  return { ...validateDraft(draft, 1), ...validateDraft(draft, 2), ...validateDraft(draft, 3) };
}

/**
 * The draft as the income it describes, or undefined while it does not
 * describe one. `toBase` turns the typed amount into the base currency.
 */
export function draftToIncome(draft: IncomeDraft, toBase: (display: number) => number): Income | undefined {
  if (Object.keys(validateAll(draft)).length > 0) return undefined;
  const weekly = draft.frequency === "weekly";
  // A weekly income counts its weeks from a day; a monthly or yearly one from
  // a month, which is what its form field asks for.
  const start = weekly ? (parseISODay(draft.start) ? draft.start : toISODay(parseISOMonth(draft.start) ?? new Date())) : draft.start.slice(0, 7);
  return cleanIncome({
    id: draft.id ?? newIncomeId(),
    name: draft.name.trim(),
    kind: draft.kind,
    amount: toBase(num(draft.amount)),
    variable: draft.variable,
    frequency: draft.frequency,
    every: num(draft.every),
    day: num(draft.day),
    month: draft.frequency === "yearly" ? num(draft.month) : undefined,
    start,
    end: draft.hasEnd ? draft.end : undefined,
    pause: draft.hasPause ? { from: draft.pauseFrom, to: draft.pauseTo || undefined, yearly: draft.pauseYearly && !!draft.pauseTo } : undefined,
    accountId: draft.accountId || undefined,
    categoryId: draft.categoryId || undefined,
    isSalary: draft.isSalary,
    active: draft.active ? undefined : false,
  });
}
