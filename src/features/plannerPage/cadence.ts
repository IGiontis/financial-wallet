import { addMonths, addYears, startOfMonth } from "date-fns";
import { monthStart, oneOffDate, oneOffDates, repeatMonths, type BudgetLine, type OneOff } from "./plannerUtils";
import type { EntryDraft } from "./components/EntryEditor";
import { startOfDay } from "../../shared/utils/dates";

// How often a figure of the user's own comes round — the one first question of
// the Planner's editor.
//
// The editor used to ask "all year or some months", then "once or repeating",
// then a cadence, then an end, and people could not tell which answer said
// what they meant. Now they pick one cadence in plain words and are asked only
// what that cadence needs. Underneath, nothing changed: the same fields are
// stored as before (`from`/`to`/`yearly`/`until` on an expense line, `date`/
// `every`/`until` on a dated income), so every saved figure opens on the
// cadence it already was, and nothing is migrated.
//
// The two kinds of figure can say different things, and each is offered only
// what it can store:
//   expense line (a rate a month)  once (one month) · monthly · yearly (one month each year) · season
//   dated income (an amount on a day)  once (a date) · monthly · yearly · every N months
// An expense on a date every few months is a bill, and has its own page.

export type EntryMode = "line" | "oneoff";
export type Cadence = "once" | "monthly" | "yearly" | "everyN" | "season";

export const CADENCES: Record<EntryMode, readonly Cadence[]> = {
  line: ["once", "monthly", "yearly", "season"],
  oneoff: ["once", "monthly", "yearly", "everyN"],
};

/** The gaps «Κάθε Ν μήνες» offers: monthly and yearly have their own answers. */
export const EVERY_N_CHOICES: readonly number[] = [2, 3, 4, 6];

/**
 * The gap «Κάθε Ν μήνες» keeps: the one typed, unless it is 1 or 12 — a monthly
 * or yearly figure switched over, whose gap belongs to the cadence it left.
 */
const everyNOf = (every: number | undefined): number => {
  const months = repeatMonths(every);
  return months && months !== 1 && months !== 12 ? months : EVERY_N_CHOICES[0];
};

/** Which cadence a stored figure is. Every stored shape lands on exactly one. */
export function cadenceOf(mode: EntryMode, draft: Pick<EntryDraft, "from" | "to" | "yearly" | "every">): Cadence {
  if (mode === "oneoff") {
    const every = repeatMonths(draft.every);
    if (!every) return "once";
    if (every === 1) return "monthly";
    if (every === 12) return "yearly";
    return "everyN";
  }
  if (!draft.from && !draft.to) return "monthly";
  // A yearly season with no closing month is one month a year (`lineRanges`).
  if (draft.from && draft.yearly && (!draft.to || draft.to === draft.from)) return "yearly";
  if (draft.from && draft.to === draft.from && !draft.yearly) return "once";
  return "season";
}

/**
 * The draft as it is to be stored for a cadence: what that cadence needs, set
 * the way it is read back, and nothing left over from a cadence tried and
 * abandoned — a season left behind by «Κάθε μήνα» would still apply.
 */
export function draftFor(mode: EntryMode, cadence: Cadence, draft: EntryDraft): EntryDraft {
  const clean: EntryDraft = { ...draft };
  delete clean.from;
  delete clean.to;
  delete clean.yearly;
  delete clean.until;
  delete clean.every;
  delete clean.date;

  if (mode === "oneoff") {
    clean.date = draft.date ?? "";
    const every = cadence === "monthly" ? 1 : cadence === "yearly" ? 12 : cadence === "everyN" ? everyNOf(draft.every) : undefined;
    if (every) {
      clean.every = every;
      if (draft.until) clean.until = draft.until;
    }
    return clean;
  }

  // An expense line has no day, so whatever was typed on the dated side is dropped.
  if (cadence === "once" && draft.from) {
    clean.from = draft.from;
    clean.to = draft.from;
  } else if (cadence === "yearly" && draft.from) {
    // One month a year is stored as a yearly season with no closing month,
    // which is how one was always written.
    clean.from = draft.from;
    clean.yearly = true;
    if (draft.until) clean.until = draft.until;
  } else if (cadence === "season") {
    if (draft.from) clean.from = draft.from;
    if (draft.to) clean.to = draft.to;
    if (draft.from && draft.yearly) {
      clean.yearly = true;
      if (draft.until) clean.until = draft.until;
    }
  }
  return clean;
}

/** What is wrong with the answers to «Πότε;», as the planner key that says so — or undefined. */
export function cadenceProblem(mode: EntryMode, cadence: Cadence, draft: EntryDraft): string | undefined {
  if (mode === "oneoff") {
    if (!oneOffDate(draft.date ?? "")) return "validation.dateRequired";
    if (cadence !== "once" && draft.until && draft.until < (draft.date ?? "")) return "planner.repeatBackwards";
    return undefined;
  }
  if (cadence === "monthly") return undefined;
  if (cadence === "once" || cadence === "yearly") {
    if (!monthStart(draft.from)) return "planner.cadence_monthNeeded";
    if (cadence === "yearly" && draft.until && draft.until < draft.from!) return "planner.repeatBackwards";
    return undefined;
  }
  // A season.
  if (!draft.from && !draft.to) return "planner.cadence_seasonNeedsMonth";
  if (draft.from && draft.to && draft.to < draft.from) return "planner.seasonBackwards";
  if (draft.yearly && !draft.from) return "planner.seasonNeedsStart";
  if (draft.yearly && draft.until && draft.until < (draft.to || draft.from || "")) return "planner.repeatBackwards";
  return undefined;
}

/** How many months a season spans, both ends counted; 0 when it is open at one end. */
export function seasonMonths(from: string | undefined, to: string | undefined): number {
  const start = monthStart(from);
  const end = monthStart(to);
  if (!start || !end || end < start) return 0;
  return (end.getFullYear() - start.getFullYear()) * 12 + end.getMonth() - start.getMonth() + 1;
}

/**
 * The next few times a stored figure comes round, from `now` on: dates for a
 * dated income, the first day of each month for an expense line (a rate has no
 * day). Empty for a plain monthly line, which is every month.
 */
export function nextTimes(mode: EntryMode, draft: EntryDraft, now: Date, count = 3): Date[] {
  if (mode === "oneoff") {
    const entry: OneOff = { id: "", label: "", amount: 0, date: draft.date ?? "", every: draft.every, until: draft.until };
    // Far enough ahead for the rarest cadence offered to come round `count` times.
    return oneOffDates(entry, startOfDay(now), addYears(now, 2 * count + 2)).slice(0, count);
  }
  const start = monthStart(draft.from);
  const thisMonth = startOfMonth(now);
  if (!start) {
    // Only an end: every month from now to it.
    const end = monthStart(draft.to);
    if (!end) return [];
    const months: Date[] = [];
    for (let m = thisMonth; m <= end && months.length < count; m = addMonths(m, 1)) months.push(m);
    return months;
  }
  const close = monthStart(draft.to) ?? (draft.yearly ? start : undefined);
  const stop = monthStart(draft.until);
  const months: Date[] = [];
  // A one-off season walks its months once; a yearly one a year at a time.
  const years = draft.yearly ? 40 : 1;
  for (let year = 0; year < years && months.length < count; year++) {
    const first = addYears(start, year);
    const last = close ? addYears(close, year) : addMonths(first, count + 12);
    for (let m = first; m <= last && months.length < count; m = addMonths(m, 1)) {
      if (draft.yearly && stop && m > stop) return months;
      if (m >= thisMonth) months.push(m);
    }
  }
  return months;
}


/** The months of the year a dated repeat lands on («Μαρ, Ιούλ, Νοέ»), when its gap divides the year; otherwise undefined. */
export function monthsOfYear(draft: Pick<EntryDraft, "date" | "every">): number[] | undefined {
  const first = oneOffDate(draft.date ?? "");
  const every = repeatMonths(draft.every);
  if (!first || !every || 12 % every !== 0) return undefined;
  return Array.from({ length: 12 / every }, (_, i) => (first.getMonth() + i * every) % 12).sort((a, b) => a - b);
}

/** A line as `buildPlan` reads it, from a draft — for checking the editor against the plan. */
export const lineOf = (draft: EntryDraft, amount: number): BudgetLine => ({
  id: draft.id ?? "draft",
  label: draft.label,
  amount,
  kind: "expense",
  ...(draft.from ? { from: draft.from } : {}),
  ...(draft.to ? { to: draft.to } : {}),
  ...(draft.from && draft.yearly ? { yearly: true } : {}),
  ...(draft.from && draft.yearly && draft.until ? { until: draft.until } : {}),
});

