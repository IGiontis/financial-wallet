import { addDays, addMonths, differenceInCalendarDays, endOfMonth, startOfDay, startOfMonth, subMonths } from "date-fns";
import type { BillPause, Category, CreateTransactionDTO, Transaction } from "../../shared/types/IndexTypes";
import { firestoreToDate, parseISODay, parseISOMonth, toISODay, toISOMonth } from "../../shared/utils/dates";
import { categoryAliases, normalizeCategoryName } from "../../shared/utils/categoryNames";
import { isPausedOn } from "../bills/billsUtils";
import { AMOUNT_TOLERANCE, EARLY_DAYS, LATE_DAYS, LOOKBACK_DAYS, type OccurrenceOverride } from "../plannerPage/plannerActuals";
import { detectSalary, type SalaryPattern } from "./detectSalary";
import { isDebtTransfer } from "../../shared/utils/moneyModel";

// The regular money in: the salary, a rent you collect, an allowance, a
// pension, a steady second job.
//
// The mirror of the Bills page. Where a bill has «Πληρώθηκε», an income has
// «Ήρθε», and the record it writes is an ordinary income transaction carrying
// `incomeId` and `incomeDue` — the way a bill's payment carries `billId`. There
// is no separate collection of receipts: the transaction *is* the receipt, so
// deleting it takes the «Ήρθε» back with it, everywhere, without anything to
// keep in step.
//
// The list itself sits on the user document under `workspace.incomes`, beside
// the Banks & cash accounts and the planner's own state. It is four to ten
// objects of a few hundred bytes that are fetched with the user anyway: no
// extra read, no new collection, no security rule to add in the console.
//
// Everything that decides "has it come?" lives here and is pure, so that the
// Planner and the Overview can ask the same questions in phase 2 and cannot
// reach a different answer from this page.

const round2 = (n: number) => Math.round(n * 100) / 100;

// ─── The shape ───────────────────────────────────────────────────────────────

/** Where the list lives on the user document — see `useWorkspaceSetting`. */
export const INCOMES_KEY = "incomes";
/** The salary suggestions answered «Όχι», so the same one is not offered again. */
export const DECLINED_SALARY_KEY = "incomes-declined-salary";

export const INCOME_KINDS = ["salary", "rent", "allowance", "pension", "work", "other"] as const;
export type IncomeKind = (typeof INCOME_KINDS)[number];

export const INCOME_FREQUENCIES = ["weekly", "monthly", "yearly"] as const;
export type IncomeFrequency = (typeof INCOME_FREQUENCIES)[number];

/** The kind gives the icon, and the category suggested for its records. */
export const KIND_ICON: Record<IncomeKind, string> = {
  salary: "💼",
  rent: "🏠",
  allowance: "🏛️",
  pension: "🧓",
  work: "🎓",
  other: "💰",
};

export interface Income {
  id: string;
  /** As the user says it: «Ιδιαίτερα μαθήματα». */
  name: string;
  kind: IncomeKind;
  /**
   * In base currency. For a variable income this is the estimate the plan uses
   * until three arrivals exist — after that the mean of the last three wins.
   */
  amount: number;
  /** The figure differs every time, so «Ήρθε» asks for it. */
  variable?: boolean;
  frequency: IncomeFrequency;
  /** Every N weeks / months / years, counted from `start`. 1 when absent. */
  every?: number;
  /**
   * Monthly and yearly: the day of the month, 1–31, where a day the month does
   * not have means its last day. Weekly: the weekday, 0 = Sunday … 6 = Saturday.
   * Absent only on what was carried over from the Planner's budget lines, which
   * never had one — see `IncomeOccurrence.undated`.
   */
  day?: number;
  /** Yearly only: the month, 0–11. */
  month?: number;
  /**
   * The first time, "YYYY-MM" (or "YYYY-MM-DD" for a weekly one, which needs a
   * day to count its weeks from). "Every N" is counted from here.
   */
  start: string;
  /** The last month it comes, "YYYY-MM", inclusive. Absent: it does not stop. */
  end?: string;
  /** The same shape as a bill's pause: months when it does not come. */
  pause?: BillPause;
  /** The Banks & cash account the money lands in, when the user said. */
  accountId?: string;
  /** The income category its records are written under. */
  categoryId?: string;
  /** «Αυτό είναι ο μισθός μου» — at most one income has it. */
  isSalary?: boolean;
  /** `false` archives it without losing its history. Absent means active. */
  active?: boolean;
}

export const MAX_EVERY = 24;

/** Every N periods, kept to something sane whatever was stored. */
export const everyOf = (income: Pick<Income, "every">) => {
  const n = Math.round(Number(income.every ?? 1));
  return Number.isFinite(n) ? Math.min(Math.max(n, 1), MAX_EVERY) : 1;
};

export const isActiveIncome = (income: Pick<Income, "active">) => income.active !== false;

/** Firestore refuses `undefined` anywhere in a document, nested objects included. */
const withoutUndefined = <T extends object>(value: T): T => Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined)) as T;

const isMonthKey = (value: unknown): value is string => typeof value === "string" && !!parseISOMonth(value);
const isStartKey = (value: unknown): value is string => typeof value === "string" && (!!parseISOMonth(value) || !!parseISODay(value));

function cleanPause(raw: unknown): BillPause | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const { from, to, yearly } = raw as BillPause;
  if (!isMonthKey(from)) return undefined;
  if (to !== undefined && !isMonthKey(to)) return undefined;
  return withoutUndefined({ from, to, yearly: yearly && to ? true : undefined });
}

const intIn = (value: unknown, min: number, max: number): number | undefined => {
  const n = typeof value === "number" ? value : typeof value === "string" && value.trim() !== "" ? Number(value) : NaN;
  return Number.isInteger(n) && n >= min && n <= max ? n : undefined;
};

/**
 * One stored income, checked before it is trusted, or undefined when it is
 * beyond use.
 *
 * Nobody types the document by hand, but an older version of the page or a
 * half-finished write can leave anything there, and one malformed entry must
 * cost that entry — not the page. Fields that are merely odd are repaired
 * (an unknown kind becomes "other", a day out of range is dropped); only what
 * the dates cannot be worked out without — the id, the amount, how often, and
 * when it began — throws the entry away.
 */
export function cleanIncome(raw: unknown): Income | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const r = raw as Record<string, unknown>;
  if (typeof r.id !== "string" || !r.id || typeof r.name !== "string") return undefined;

  const amount = typeof r.amount === "number" ? r.amount : Number(r.amount);
  if (!Number.isFinite(amount) || amount < 0) return undefined;
  if (!INCOME_FREQUENCIES.includes(r.frequency as IncomeFrequency)) return undefined;
  if (!isStartKey(r.start)) return undefined;

  const frequency = r.frequency as IncomeFrequency;
  return withoutUndefined<Income>({
    id: r.id,
    name: r.name,
    kind: INCOME_KINDS.includes(r.kind as IncomeKind) ? (r.kind as IncomeKind) : "other",
    amount: round2(amount),
    variable: r.variable === true ? true : undefined,
    frequency,
    every: everyOf({ every: r.every as number }) > 1 ? everyOf({ every: r.every as number }) : undefined,
    day: frequency === "weekly" ? intIn(r.day, 0, 6) : intIn(r.day, 1, 31),
    month: frequency === "yearly" ? intIn(r.month, 0, 11) : undefined,
    start: r.start,
    end: isMonthKey(r.end) ? r.end : undefined,
    pause: cleanPause(r.pause),
    accountId: typeof r.accountId === "string" && r.accountId ? r.accountId : undefined,
    categoryId: typeof r.categoryId === "string" && r.categoryId ? r.categoryId : undefined,
    isSalary: r.isSalary === true ? true : undefined,
    active: r.active === false ? false : undefined,
  });
}

/** The stored list, each entry checked. Duplicate ids keep the first. */
export function cleanIncomes(stored: unknown): Income[] {
  if (!Array.isArray(stored)) return [];
  const seen = new Set<string>();
  const result: Income[] = [];
  for (const raw of stored) {
    const income = cleanIncome(raw);
    if (!income || seen.has(income.id)) continue;
    seen.add(income.id);
    result.push(income);
  }
  return result;
}

/**
 * The list with one income added or replaced.
 *
 * «Αυτό είναι ο μισθός μου» belongs to one income only — the Overview counts
 * "to pay day" from it, and two pay days is no answer — so saving one that has
 * it takes it off every other.
 */
export function upsertIncome(list: Income[], income: Income): Income[] {
  const clean = cleanIncome(income);
  if (!clean) return list;
  const others = list.map((i) => (clean.isSalary && i.id !== clean.id && i.isSalary ? withoutUndefined({ ...i, isSalary: undefined }) : i));
  return others.some((i) => i.id === clean.id) ? others.map((i) => (i.id === clean.id ? clean : i)) : [...others, clean];
}

/** A fresh id, made on this device: the list is one field, so nothing else can hand one out. */
export const newIncomeId = () => `inc-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

// ─── When it comes ───────────────────────────────────────────────────────────

/** One expected arrival. */
export interface IncomeOccurrence {
  /** `income:{id}:{due}` — the key the Planner's per-occurrence words are kept under. */
  key: string;
  incomeId: string;
  /** The day it is expected, local midnight. The 1st of its month when `undated`. */
  date: Date;
  /** `date` as "YYYY-MM-DD" — what «Ήρθε» writes into `incomeDue`. */
  due: string;
  /** The month it is for, "YYYY-MM". An arrival counts here, whenever it came. */
  forMonth: string;
  /** The income's own figure — see `expectedAmount` for what to plan with. */
  amount: number;
  /**
   * Carried over from the Planner without a day. Expected somewhere in its month,
   * never late, and the page asks for a day so it can tell when it is.
   */
  undated?: boolean;
}

export const incomeOccurrenceKey = (incomeId: string, due: string) => `income:${incomeId}:${due}`;

const monthNumber = (d: Date) => d.getFullYear() * 12 + d.getMonth();

/** A day the month does not have is its last day: the 31st in April is the 30th. */
const clampDay = (year: number, month: number, day: number) => new Date(year, month, Math.min(day, new Date(year, month + 1, 0).getDate()));

/** The first day it can come. */
export function incomeStart(income: Pick<Income, "start">): Date | undefined {
  return parseISODay(income.start) ?? parseISOMonth(income.start) ?? undefined;
}

/** The last day it can come: the end of its last month. */
export function incomeEnd(income: Pick<Income, "end">): Date | undefined {
  const month = income.end ? parseISOMonth(income.end) : null;
  return month ? endOfMonth(month) : undefined;
}

/** A guard on every walk below, so a corrupt value cannot spin for ever. */
const MAX_STEPS = 5000;

/**
 * Every time this income is expected between two days, both included, in order.
 *
 * Stepped from the start's period index rather than by adding a period to the
 * one before, so a salary on the 31st does not walk itself back to the 28th the
 * first time it crosses February and stay there. "Every N" counts from the
 * start; a paused month is skipped, the same months the Bills page pauses
 * (`isPausedOn`); nothing comes before the start or after the end.
 */
export function incomeOccurrences(income: Income, from: Date, to: Date): IncomeOccurrence[] {
  const first = incomeStart(income);
  if (!first) return [];
  const lower = first > startOfDay(from) ? first : startOfDay(from);
  const last = incomeEnd(income);
  const upper = last && last < to ? last : to;
  if (upper < lower) return [];

  const every = everyOf(income);
  const dates: { date: Date; undated: boolean }[] = [];
  const push = (date: Date, undated = false) => {
    if (date >= lower && date <= upper && !isPausedOn({ pause: income.pause }, date)) dates.push({ date, undated });
  };

  switch (income.frequency) {
    case "monthly": {
      const anchor = monthNumber(first);
      // Jump straight to the cycle that reaches the window, rather than walking
      // every month since a salary set up years ago.
      let k = Math.max(0, Math.floor((monthNumber(lower) - anchor) / every));
      for (let step = 0; step < MAX_STEPS; step++, k++) {
        const m = anchor + k * every;
        const year = Math.floor(m / 12);
        const month = m % 12;
        const date = income.day ? clampDay(year, month, income.day) : new Date(year, month, 1);
        if (date > upper) break;
        push(date, !income.day);
      }
      break;
    }
    case "yearly": {
      const month = income.month ?? first.getMonth();
      let k = Math.max(0, Math.floor((lower.getFullYear() - first.getFullYear()) / every));
      for (let step = 0; step < MAX_STEPS; step++, k++) {
        const year = first.getFullYear() + k * every;
        const date = income.day ? clampDay(year, month, income.day) : new Date(year, month, 1);
        if (date > upper) break;
        push(date, !income.day);
      }
      break;
    }
    case "weekly": {
      // The first such weekday on or after the start; "every 2 weeks" counts
      // from that one, which is the only way two people agree which weeks.
      const weekday = income.day ?? first.getDay();
      const firstDay = addDays(first, (weekday - first.getDay() + 7) % 7);
      const stride = 7 * every;
      let k = Math.max(0, Math.floor(differenceInCalendarDays(lower, firstDay) / stride));
      for (let step = 0; step < MAX_STEPS; step++, k++) {
        const date = addDays(firstDay, k * stride);
        if (date > upper) break;
        push(date);
      }
      break;
    }
  }

  return dates.map(({ date, undated }) => {
    const due = toISODay(date);
    return withoutUndefined({ key: incomeOccurrenceKey(income.id, due), incomeId: income.id, date, due, forMonth: toISOMonth(date), amount: income.amount, undated: undated || undefined });
  });
}

/** The next time it comes on or after `from`, looking up to five years ahead. */
export function nextIncomeOccurrence(income: Income, from: Date): IncomeOccurrence | undefined {
  return incomeOccurrences(income, from, addMonths(from, 60))[0];
}

// ─── What it brings ──────────────────────────────────────────────────────────

/** How many arrivals a variable income needs before its own record replaces the estimate. */
export const VARIABLE_MEAN_COUNT = 3;

/** Money in that is ordinary income — not savings coming back. Same test as the Planner's. */
// Borrowed money is never the salary arriving, however close the figure.
const isPlainIncome = (tx: Transaction) => tx.type === "income" && !tx.isGoalTransaction && !tx.isInvestmentTransaction && !isDebtTransfer(tx);

/** One «Ήρθε» per occurrence: two records for the same time (a rent paid in two parts) are one arrival. */
export interface IncomeArrival {
  due: string;
  date: Date;
  amount: number;
  transactions: Transaction[];
}

/** Everything recorded with «Ήρθε» for this income, newest first. */
export function incomeArrivals(income: Pick<Income, "id">, transactions: Transaction[]): IncomeArrival[] {
  const byDue = new Map<string, IncomeArrival>();
  for (const tx of transactions) {
    if (tx.incomeId !== income.id || !isPlainIncome(tx)) continue;
    const date = startOfDay(firestoreToDate(tx.date));
    const due = tx.incomeDue ?? toISODay(date);
    const known = byDue.get(due);
    if (known) {
      known.amount = round2(known.amount + Math.abs(tx.amount));
      if (date < known.date) known.date = date;
      known.transactions.push(tx);
    } else {
      byDue.set(due, { due, date, amount: round2(Math.abs(tx.amount)), transactions: [tx] });
    }
  }
  return [...byDue.values()].sort((a, b) => b.date.getTime() - a.date.getTime() || b.due.localeCompare(a.due));
}

export interface ExpectedAmount {
  /** What to plan with. */
  amount: number;
  /** Still the typed estimate: a variable income without three arrivals yet. */
  estimated: boolean;
  /** The arrivals behind the mean, newest first — and the "usually 300–340" range. */
  recent: number[];
}

/**
 * What one occurrence is expected to bring.
 *
 * A fixed income brings its figure. A variable one brings the estimate typed
 * for it until it has come three times, and from then on the mean of the last
 * three — counted from «Ήρθε» records only, which are the ones the user wrote
 * the real figure into. An untagged record merely found near the day is not
 * taken as one: for a variable income it is matched by category alone, and an
 * unrelated payment in the same category must not move the forecast.
 */
export function expectedAmount(income: Income, transactions: Transaction[]): ExpectedAmount {
  if (!income.variable) return { amount: income.amount, estimated: false, recent: [] };
  const recent = incomeArrivals(income, transactions)
    .slice(0, VARIABLE_MEAN_COUNT)
    .map((a) => a.amount);
  if (recent.length < VARIABLE_MEAN_COUNT) return { amount: income.amount, estimated: true, recent };
  return { amount: round2(recent.reduce((sum, n) => sum + n, 0) / recent.length), estimated: false, recent };
}

/** «Ο μισθός μου»: the one active income marked as the salary, if there is one. */
export function salaryIncome(incomes: Income[]): Income | undefined {
  return incomes.find((i) => i.isSalary && isActiveIncome(i));
}

/**
 * When an income comes in the month `date` falls in, and what it brings —
 * the first time, for a month laid out day by day (the Bills page's and the
 * Overview's month). Undefined when it does not come that month, or has no
 * day to put it on.
 */
export function incomeInMonth(income: Income, transactions: Transaction[], date: Date): { amount: number; dayOfMonth: number } | undefined {
  const first = incomeOccurrences(income, startOfMonth(date), endOfMonth(date))[0];
  if (!first || first.undated) return undefined;
  return { amount: expectedAmount(income, transactions).amount, dayOfMonth: first.date.getDate() };
}

/** Weeks in an average month: 52 a year over 12 months. */
const WEEKS_PER_MONTH = 52 / 12;

/**
 * What one income brings in an average month, at its own rate: a monthly
 * income its figure, «every 2 months» half of it, a weekly one 52 ⁄ 12 of it,
 * a yearly one a twelfth.
 *
 * For the screens that set one month's pay against one month's costs — the
 * Bills page's «τι αφήνουν τα πάγια» and the Allocation page — which used to
 * read the Planner's salary field and now read the salary from here. Pauses
 * are not spread into it: a month's rate, not a year's average.
 */
export function monthlyEquivalent(income: Income, transactions: Transaction[]): number {
  const each = expectedAmount(income, transactions).amount;
  const every = everyOf(income);
  switch (income.frequency) {
    case "weekly":
      return round2((each * WEEKS_PER_MONTH) / every);
    case "yearly":
      return round2(each / (12 * every));
    case "monthly":
      return round2(each / every);
  }
}

// ─── Has it come? ────────────────────────────────────────────────────────────

/** From this many days early, an arrival says so: «5 μέρες νωρίς». One day early is just on time. */
export const EARLY_LABEL_DAYS = 2;

export type IncomeState =
  /** A «Ήρθε» record — or the user said it came. */
  | "arrived"
  /** An income record without a tag, close enough in day and amount. */
  | "found"
  /** «Δεν θα έρθει αυτή τη φορά». */
  | "skipped"
  /** Nothing recorded, but the last bank reading may already hold it: «Ήταν ήδη στην τράπεζα;» */
  | "ask"
  /** Its day has passed, up to `LOOKBACK_DAYS`. */
  | "late"
  /** Past the look-back with nothing recorded — history's «δεν γράφτηκε». */
  | "missed"
  /** Within `EARLY_DAYS` of its day, or undated in its month: «Ήρθε» is offered. */
  | "due"
  /** Further off. */
  | "upcoming";

export interface IncomeStatus extends IncomeOccurrence {
  state: IncomeState;
  /** What this time is expected to bring: the figure, a variable's mean, or what was said for this time. */
  expected: number;
  /** When it is expected now: a day moved for this time only, or its own day. */
  expectedDate: Date;
  /** An estimate — a variable income nobody has given this time's figure for. */
  approximate: boolean;
  /** What settled it, for "arrived" and "found". */
  arrival?: { date: Date; amount: number; transactionIds: string[]; manual: boolean };
  /** Arrived this many days before its day — only from `EARLY_LABEL_DAYS`. */
  earlyDays?: number;
  /** "late": days past its day. "arrived"/"found": days after its day it came. */
  lateDays?: number;
  /** "due"/"upcoming": days to go. 0 is today. */
  daysUntil?: number;
  /** Something was said about this time (a moved day, another amount, "not this time", "wait"). */
  overridden: boolean;
  /** «Ήρθε» is offered on it. */
  canArrive: boolean;
}

export const isSettled = (status: Pick<IncomeStatus, "state">) => status.state === "arrived" || status.state === "found";
/** What the amber badge counts: late, and waiting for an answer about the bank. */
export const needsYou = (status: Pick<IncomeStatus, "state">) => status.state === "late" || status.state === "ask";

export interface IncomeContext {
  transactions: Transaction[];
  /** The words kept per occurrence (`planner-occurrences`), shared with the Planner. */
  overrides?: Record<string, OccurrenceOverride>;
  /** `useMoneyAccounts().latest?.at` — the last time the banks were read. */
  lastReadingAt?: Date;
  now?: Date;
}

interface Candidate {
  id: string;
  date: Date;
  amount: number;
  categoryId: string;
}

const closeTo = (amount: number, expected: number) => Math.abs(amount - expected) <= Math.abs(expected) * AMOUNT_TOLERANCE + 0.005;

/**
 * The function every occurrence is put through, in date order.
 *
 * It answers, in this order — the order the design documents:
 *
 *   1. A record with this `incomeId` for this time: arrived.
 *   2. What the user said about this time: not coming, came, another day,
 *      another amount, or "wait" (which also stops the two guesses below).
 *   3. An income record without a tag inside ±10 days and ±15% of the figure —
 *      for a variable income, the same category and any amount: found.
 *   4. The bank question, when nothing matched but the last reading was taken
 *      on or after the earliest day it could have come (10 days early). Until
 *      it is answered it counts nowhere.
 *   5. Its day has passed: late, for 25 days; after that, missed.
 *   6. Otherwise due within 10 days (when «Ήρθε» appears), or upcoming.
 *
 * The windows are the Planner's own (`plannerActuals`), imported rather than
 * restated, so the two screens cannot drift apart on what "about the same
 * day" means.
 *
 * Stateful on purpose, like the Planner's resolver: an untagged record settles
 * one occurrence at most, so a payment the size of two incomes is not counted
 * as both.
 */
export function createIncomeResolver(incomes: Income[], ctx: IncomeContext) {
  const today = startOfDay(ctx.now ?? new Date());
  const overrides = ctx.overrides ?? {};
  const byId = new Map(incomes.map((i) => [i.id, i]));
  const lastReading = ctx.lastReadingAt ? startOfDay(ctx.lastReadingAt) : undefined;

  const tagged = new Map<string, Transaction[]>();
  const untagged: Candidate[] = [];
  for (const tx of ctx.transactions) {
    if (!isPlainIncome(tx)) continue;
    if (tx.incomeId) {
      // Tagged for another income or none of ours: never a candidate for
      // "found" — the user has already said what it was.
      const list = tagged.get(tx.incomeId) ?? [];
      list.push(tx);
      tagged.set(tx.incomeId, list);
      continue;
    }
    untagged.push({ id: tx.id, date: startOfDay(firestoreToDate(tx.date)), amount: Math.abs(tx.amount), categoryId: tx.categoryId });
  }

  const expectedById = new Map(incomes.map((i) => [i.id, expectedAmount(i, ctx.transactions)]));
  const usedTagged = new Set<string>();
  const usedUntagged = new Set<string>();

  /**
   * The «Ήρθε» records for this time. Its own day first; failing that, for a
   * monthly or yearly income, any record for the same month — so changing the
   * day of a salary from the 30th to the 28th does not orphan September's
   * record, which was written against the 30th.
   */
  const recordsFor = (occurrence: IncomeOccurrence, income: Income | undefined): Transaction[] => {
    const mine = (tagged.get(occurrence.incomeId) ?? []).filter((tx) => !usedTagged.has(tx.id));
    let found = mine.filter((tx) => tx.incomeDue === occurrence.due);
    if (found.length === 0 && income && income.frequency !== "weekly") found = mine.filter((tx) => (tx.incomeDue ?? "").slice(0, 7) === occurrence.forMonth);
    for (const tx of found) usedTagged.add(tx.id);
    return found;
  };

  const findMatch = (occurrence: IncomeOccurrence, income: Income | undefined, expected: number, around: Date): Candidate | undefined => {
    const from = occurrence.undated ? startOfMonth(occurrence.date) : addDays(around, -EARLY_DAYS);
    const to = occurrence.undated ? endOfMonth(occurrence.date) : addDays(around, LATE_DAYS);
    const byCategory = !!income?.variable;
    if (byCategory && !income?.categoryId) return undefined;

    let best: Candidate | undefined;
    for (const c of untagged) {
      if (usedUntagged.has(c.id) || c.date < from || c.date > to || c.date > today) continue;
      if (byCategory ? c.categoryId !== income!.categoryId : !closeTo(c.amount, expected)) continue;
      const distance = Math.abs(differenceInCalendarDays(c.date, around));
      const bestDistance = best ? Math.abs(differenceInCalendarDays(best.date, around)) : Infinity;
      if (distance < bestDistance || (distance === bestDistance && best && Math.abs(c.amount - expected) < Math.abs(best.amount - expected))) best = c;
    }
    return best;
  };

  /** Early or late, against the day it was due — not a day moved for this time. */
  const timing = (arrived: Date, due: Date) => {
    const early = differenceInCalendarDays(due, arrived);
    return { earlyDays: early >= EARLY_LABEL_DAYS ? early : undefined, lateDays: early < 0 ? -early : undefined };
  };

  return (occurrence: IncomeOccurrence): IncomeStatus => {
    const income = byId.get(occurrence.incomeId);
    const override = overrides[occurrence.key];
    const plain = income ? (expectedById.get(income.id)?.amount ?? occurrence.amount) : occurrence.amount;
    const expected = round2(override?.amount ?? plain);
    const expectedDate = override?.state !== "received" ? (parseISODay(override?.date ?? "") ?? occurrence.date) : occurrence.date;
    const base = {
      ...occurrence,
      expected,
      expectedDate,
      approximate: !!income?.variable && override?.amount === undefined,
      overridden: !!override,
      canArrive: false,
    };

    // 1. Its own record.
    const records = recordsFor(occurrence, income);
    if (records.length > 0) {
      const date = records.map((tx) => startOfDay(firestoreToDate(tx.date))).reduce((a, b) => (b < a ? b : a));
      const amount = round2(records.reduce((sum, tx) => sum + Math.abs(tx.amount), 0));
      return { ...base, state: "arrived", arrival: { date, amount, transactionIds: records.map((tx) => tx.id), manual: false }, ...timing(date, occurrence.date) };
    }

    // 2. What was said about this time.
    if (override?.state === "skipped") return { ...base, state: "skipped" };
    if (override?.state === "received") {
      const date = parseISODay(override.date ?? "") ?? occurrence.date;
      return { ...base, state: "arrived", arrival: { date, amount: expected, transactionIds: [], manual: true }, ...timing(date, occurrence.date) };
    }

    // 3. A record without a tag, close enough.
    if (override?.state !== "waiting") {
      const match = findMatch(occurrence, income, expected, expectedDate);
      if (match) {
        usedUntagged.add(match.id);
        return { ...base, state: "found", arrival: { date: match.date, amount: round2(match.amount), transactionIds: [match.id], manual: false }, ...timing(match.date, occurrence.date) };
      }
    }

    // Undated: expected somewhere in its month and never late — there is no
    // day to be late against. Over once the month is.
    if (occurrence.undated) {
      const over = today > endOfMonth(occurrence.date);
      return { ...base, state: over ? "missed" : "due", canArrive: !over };
    }

    const past = differenceInCalendarDays(today, expectedDate);

    // 4. The bank question. Asked only while nothing has been said about this
    // time — "not yet" is itself an answer ("waiting") and is not asked again.
    if (!override && lastReading && expected > 0 && past <= LOOKBACK_DAYS && lastReading >= addDays(expectedDate, -EARLY_DAYS)) {
      return { ...base, state: "ask", canArrive: true };
    }

    // 5. Late, then given up on.
    if (past > LOOKBACK_DAYS) return { ...base, state: "missed", lateDays: past };
    if (past > 0) return { ...base, state: "late", lateDays: past, canArrive: true };

    // 6. Still to come.
    const until = differenceInCalendarDays(expectedDate, today);
    return { ...base, state: until <= EARLY_DAYS ? "due" : "upcoming", daysUntil: until, canArrive: until <= EARLY_DAYS };
  };
}

export type IncomeResolver = ReturnType<typeof createIncomeResolver>;

/** One occurrence on its own. For a whole list use `resolveIncomes`, which shares the matches. */
export function incomeStatus(occurrence: IncomeOccurrence, income: Income, ctx: IncomeContext): IncomeStatus {
  return createIncomeResolver([income], ctx)(occurrence);
}

/**
 * Every occurrence of every active income between two days, resolved together
 * in date order — so an untagged record goes to the earliest occurrence that
 * can claim it, whichever income that is.
 */
export function resolveIncomes(incomes: Income[], ctx: IncomeContext, from: Date, to: Date): IncomeStatus[] {
  const active = incomes.filter(isActiveIncome);
  const order = new Map(active.map((i, index) => [i.id, index]));
  const occurrences = active.flatMap((income) => incomeOccurrences(income, from, to));
  occurrences.sort((a, b) => a.date.getTime() - b.date.getTime() || (order.get(a.incomeId) ?? 0) - (order.get(b.incomeId) ?? 0));
  const resolve = createIncomeResolver(active, ctx);
  return occurrences.map(resolve);
}

/** The stretch the page resolves: a year back, for the card's history and the calendar, to two months ahead. */
export function incomeWindow(now: Date): { from: Date; to: Date } {
  return { from: startOfMonth(subMonths(now, 12)), to: endOfMonth(addMonths(now, 2)) };
}

/** Late or waiting for an answer — what the amber badge in the menu counts. */
export function lateCount(statuses: IncomeStatus[]): number {
  return statuses.filter(needsYou).length;
}

// ─── The month ───────────────────────────────────────────────────────────────

export type SegmentState = "arrived" | "missing" | "ask";

/** One piece of the month's bar: one income, in one state. */
export interface MonthSegment {
  incomeId: string;
  amount: number;
  state: SegmentState;
  approximate: boolean;
}

export interface MonthSummary {
  month: string;
  /** Everything for the month except what is not coming this time, in date order. */
  items: IncomeStatus[];
  /** What came — the real amounts, not the expected ones. */
  arrived: number;
  /** Still to come, late, or never written down: the expected figures. */
  missing: number;
  /** Waiting for the bank question: counted nowhere until answered. */
  asking: number;
  /** arrived + missing + asking. */
  total: number;
  arrivedCount: number;
  count: number;
  /** Something still owed is an estimate, so the totals wear a «≈». */
  approximate: boolean;
  segments: MonthSegment[];
}

/**
 * The month the bar answers about: «ήρθαν 1.920 € από 2.240 €».
 *
 * Arrivals count in the month they are *for* — October's salary paid on 28
 * September is October's — and at the amount that actually came. What has not
 * come is counted at what it is expected to bring. So the three parts always
 * add up to the total, which is what lets the page write the sum out.
 */
export function monthSummary(statuses: IncomeStatus[], month: string): MonthSummary {
  const items = statuses.filter((s) => s.forMonth === month && s.state !== "skipped").sort((a, b) => a.date.getTime() - b.date.getTime());
  let arrived = 0;
  let missing = 0;
  let asking = 0;
  let arrivedCount = 0;
  let approximate = false;
  const segments: MonthSegment[] = [];

  const add = (incomeId: string, amount: number, state: SegmentState, approx: boolean) => {
    const same = segments.find((s) => s.incomeId === incomeId && s.state === state);
    if (same) {
      same.amount = round2(same.amount + amount);
      same.approximate ||= approx;
    } else segments.push({ incomeId, amount: round2(amount), state, approximate: approx });
  };

  for (const item of items) {
    if (isSettled(item) && item.arrival) {
      arrived += item.arrival.amount;
      arrivedCount += 1;
      add(item.incomeId, item.arrival.amount, "arrived", false);
    } else if (item.state === "ask") {
      asking += item.expected;
      approximate ||= item.approximate;
      add(item.incomeId, item.expected, "ask", item.approximate);
    } else {
      missing += item.expected;
      approximate ||= item.approximate;
      add(item.incomeId, item.expected, "missing", item.approximate);
    }
  }

  // Arrived first, so the bar fills from the left the way it is read.
  const rank: Record<SegmentState, number> = { arrived: 0, ask: 1, missing: 2 };
  segments.sort((a, b) => rank[a.state] - rank[b.state]);

  return {
    month,
    items,
    arrived: round2(arrived),
    missing: round2(missing),
    asking: round2(asking),
    total: round2(arrived + missing + asking),
    arrivedCount,
    count: items.length,
    approximate,
    segments,
  };
}

// ─── The list ────────────────────────────────────────────────────────────────

export type RowSection = "waiting" | "arrived" | "later";

/** One income's line on the list, filed under the section it belongs to now. */
export interface IncomeRow {
  income: Income;
  section: RowSection;
  /** The time the row is about: the oldest still open, or this month's last arrival. */
  focus?: IncomeStatus;
  /** Every open time behind "waiting" (late, asked about, or due this month). */
  open: IncomeStatus[];
  /** This month's arrivals behind "arrived". */
  settled: IncomeStatus[];
  /** The time after the focus — «επόμενος Παρ. 30/10». */
  next?: IncomeStatus;
}

/**
 * The list as the Bills page has it, the other way round: «Περιμένεις» for
 * what is open, «Ήρθαν» for what came this month, and the rest — paused, or
 * simply not this month — quietly underneath.
 *
 * Open means late or asked about, whichever month it was for, or still to come
 * this month. Next month's, even inside its ten days, stays with this month's
 * arrival as «επόμενο …»: the list is about this month.
 */
export function incomeRows(incomes: Income[], statuses: IncomeStatus[], now: Date): IncomeRow[] {
  const today = startOfDay(now);
  const month = toISOMonth(today);
  return incomes.filter(isActiveIncome).map((income) => {
    const mine = statuses.filter((s) => s.incomeId === income.id);
    const open = mine.filter((s) => needsYou(s) || ((s.state === "due" || s.state === "upcoming") && s.forMonth <= month));
    const settled = mine.filter((s) => s.forMonth === month && isSettled(s));
    const section: RowSection = open.length > 0 ? "waiting" : settled.length > 0 ? "arrived" : "later";
    const focus = section === "waiting" ? open[0] : section === "arrived" ? settled[settled.length - 1] : (mine.find((s) => s.forMonth === month) ?? mine.find((s) => s.date > today));
    const next = focus ? mine.find((s) => s.date > focus.date && s.date > today && !isSettled(s)) : undefined;
    return { income, section, focus, open, settled, next };
  });
}

// ─── The year ────────────────────────────────────────────────────────────────

export interface IncomeYearRow {
  income: Income;
  /** What one time brings — the variable's mean once it has one. */
  each: number;
  count: number;
  total: number;
  approximate: boolean;
}

export interface IncomeYear {
  from: Date;
  to: Date;
  total: number;
  /** total / 12: what a month brings across the year, pauses included. */
  perMonth: number;
  rows: IncomeYearRow[];
  approximate: boolean;
}

/**
 * The twelve months from this one: what each income brings across them.
 *
 * Counted in real occurrences, so a pause costs exactly the months it covers
 * — the tutoring off July and August brings 10 × 320, not 12 — and a weekly
 * income its 52 or 53 rather than "4 a month".
 */
export function incomeYear(incomes: Income[], transactions: Transaction[], now: Date, months = 12): IncomeYear {
  const from = startOfMonth(now);
  const to = endOfMonth(addMonths(from, months - 1));
  const rows = incomes
    .filter(isActiveIncome)
    .map((income) => {
      const expected = expectedAmount(income, transactions);
      const count = incomeOccurrences(income, from, to).length;
      return { income, each: expected.amount, count, total: round2(expected.amount * count), approximate: !!income.variable };
    })
    .sort((a, b) => b.total - a.total);
  const total = round2(rows.reduce((sum, r) => sum + r.total, 0));
  return { from, to, total, perMonth: round2(total / months), rows, approximate: rows.some((r) => r.approximate && r.count > 0) };
}

// ─── The card's history ──────────────────────────────────────────────────────

export interface HistoryChip {
  key: string;
  /** The month (monthly) or the day (weekly, yearly) the chip stands for. */
  date: Date;
  /** "paused": a month the income is off. "none": nothing expected then. */
  state: IncomeState | "paused" | "none";
  status?: IncomeStatus;
}

/**
 * «Πότε ήρθε, τους τελευταίους 6 μήνες» — or, for a variable income, how much.
 *
 * A monthly income gets one chip per calendar month, so a pause shows as a
 * gap rather than vanishing. Weekly and yearly ones do not fit six months —
 * four chips a month, or one chip in six — so they get their last six times.
 */
export function incomeHistory(income: Income, statuses: IncomeStatus[], now: Date, count = 6): HistoryChip[] {
  const today = startOfDay(now);
  const mine = statuses.filter((s) => s.incomeId === income.id);

  if (income.frequency === "monthly") {
    return Array.from({ length: count }, (_, i) => {
      const monthDate = startOfMonth(subMonths(today, count - 1 - i));
      const key = toISOMonth(monthDate);
      const status = mine.find((s) => s.forMonth === key);
      if (status) return { key, date: monthDate, state: status.state, status };
      const first = incomeStart(income);
      const paused = !!first && monthDate >= startOfMonth(first) && isPausedOn({ pause: income.pause }, monthDate);
      return { key, date: monthDate, state: paused ? "paused" : "none" };
    });
  }

  return mine
    .filter((s) => s.date <= today || isSettled(s))
    .slice(-count)
    .map((status) => ({ key: status.key, date: status.date, state: status.state, status }));
}

// ─── Writing «Ήρθε» ──────────────────────────────────────────────────────────

export interface ArrivalInput {
  /** Base currency. */
  amount: number;
  date: Date;
  categoryId: string;
  accountId?: string;
  /** From the bank question, dated on the reading's own day — see `Transaction.inReading`. */
  inReading?: boolean;
}

/**
 * The transaction «Ήρθε» writes: an ordinary income, plus the two fields that
 * tie it to this income and this time. Nothing else about it is special, so it
 * shows, edits and deletes in Transactions like any other.
 */
export function arrivalTransaction(income: Pick<Income, "id" | "name">, occurrence: Pick<IncomeOccurrence, "due">, input: ArrivalInput): CreateTransactionDTO {
  return withoutUndefined<CreateTransactionDTO>({
    amount: round2(input.amount),
    type: "income",
    categoryId: input.categoryId,
    date: input.date,
    description: income.name,
    incomeId: income.id,
    incomeDue: occurrence.due,
    accountId: input.accountId || undefined,
    inReading: input.inReading ? true : undefined,
  });
}

/**
 * The latest day «Ναι, ήταν μέσα» may be dated: the reading's own. The record
 * goes in before the reading, so the money the banks showed is not counted
 * twice and the «χωρίς εγγραφή» gap shrinks by it instead.
 */
export function bankAnswerDate(status: Pick<IncomeStatus, "expectedDate">, readingAt: Date): Date {
  const readingDay = startOfDay(readingAt);
  return status.expectedDate < readingDay ? startOfDay(status.expectedDate) : readingDay;
}

/** Dated on the reading's own day: it has to be marked as already inside it. */
export const isOnReadingDay = (date: Date, readingAt: Date) => differenceInCalendarDays(date, readingAt) === 0;

// ─── Category ────────────────────────────────────────────────────────────────

/** The seeded income category each kind lands in when the user has none of their own for it. */
const KIND_DEFAULT_CATEGORY: Record<IncomeKind, string | undefined> = {
  salary: "Salary",
  work: "Freelance",
  allowance: "Government Aid",
  pension: undefined,
  rent: undefined,
  other: "Other Income",
};

/** Names a category of the user's own would have for a kind, in both languages. */
const KIND_NAMES: Record<IncomeKind, string[]> = {
  salary: ["Salary", "Μισθός"],
  rent: ["Rent", "Ενοίκιο", "Ενοίκια"],
  allowance: ["Allowance", "Επίδομα", "Επιδόματα"],
  pension: ["Pension", "Σύνταξη"],
  work: ["Freelance", "Work", "Δουλειά"],
  other: ["Other Income"],
};

/**
 * The income category to suggest for a kind.
 *
 * A category the user made for it comes first — someone with "Ενοίκια" means
 * that for the rent they collect — then the seeded one that fits, then "Other
 * Income". A rent or a pension has no seeded income category of its own (the
 * seeded "Rent" is an expense), which is why those two fall through.
 */
export function suggestIncomeCategory(kind: IncomeKind, categories: Category[]): Category | undefined {
  const income = categories.filter((c) => c.type === "income");
  const wanted = new Set(KIND_NAMES[kind].map(normalizeCategoryName));
  const own = income.find((c) => categoryAliases(c.name).some((alias) => wanted.has(normalizeCategoryName(alias))));
  if (own) return own;
  const seeded = KIND_DEFAULT_CATEGORY[kind];
  return (seeded && income.find((c) => c.name === seeded)) || income.find((c) => c.name === "Other Income") || income[0];
}

// ─── The salary found in the records ─────────────────────────────────────────

export interface SalarySuggestion {
  pattern: SalaryPattern;
  /** What «Όχι» remembers: "1450@30". */
  signature: string;
  /** The first month it was seen, "YYYY-MM" — where the history should start. */
  since: string;
}

export const salarySignature = (pattern: Pick<SalaryPattern, "amount" | "dayOfMonth">) => `${pattern.amount}@${pattern.dayOfMonth}`;

/**
 * «Από τις συναλλαγές σου: μισθός 1.450 € γύρω στις 30, 5 μήνες στη σειρά.»
 *
 * The Planner's own `detectSalary`, over the records nobody has tagged yet — a
 * record already written by «Ήρθε» belongs to an income that exists. Only ever
 * a suggestion: nothing is saved until the user says yes, and a «Όχι» is
 * remembered for that amount and day so the same question is not put again.
 */
export function salarySuggestion(transactions: Transaction[], now: Date, declined: readonly string[] = []): SalarySuggestion | undefined {
  const untagged = transactions.filter((tx) => !tx.incomeId);
  const pattern = detectSalary(untagged, now);
  if (!pattern) return undefined;
  const signature = salarySignature(pattern);
  if (declined.includes(signature)) return undefined;

  const earliest = startOfMonth(subMonths(now, 4));
  let since: Date | undefined;
  for (const tx of untagged) {
    if (!isPlainIncome(tx)) continue;
    const date = firestoreToDate(tx.date);
    if (date < earliest || date > now || !closeTo(Math.abs(tx.amount), pattern.amount)) continue;
    if (!since || date < since) since = date;
  }
  return { pattern, signature, since: toISOMonth(since ?? now) };
}
