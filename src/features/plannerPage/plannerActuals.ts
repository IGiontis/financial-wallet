import type { DebtWithStatus, Transaction } from "../../shared/types/IndexTypes";
import { firestoreToDate, parseISODay, toISODay } from "../../shared/utils/dates";

// What the plan expected, held up against what actually happened.
//
// The plan is a list of appointments: pay on the 30th, the loan on the 20th, a
// room rent on the 22nd. Money keeps its own diary. Pay lands on the 25th
// because the 30th is a Sunday; the tenant pays on the 1st. A plan that only
// knows the appointments then goes wrong both ways at once — it adds the pay
// again on the 30th although it is already in the account, and it forgets the
// rent altogether once the 22nd has gone by, as if it had come.
//
// So every dated item near today is first looked for among the records: an
// income of about the same size, or a loan repayment, close enough to its day.
// Found, it is done and drops out of what is still to come. Not found and its
// day has passed, it is late and stays in the plan from today. Anything the
// automatic look gets wrong is fixed for that one time in a tap, by an override
// kept per occurrence.
//
// Bills and goals are not handled here: they already know what has been paid,
// through the bill's own payments and the goal's deposits. Nor are the incomes
// of the «Έσοδα» page — the salary among them: they have their own resolver
// (`createIncomeResolver`), the one that page answers "has it come?" with, so
// the two screens cannot answer it differently. `planIncomes` turns its
// answers into the occurrences below.

// The windows are the ones YNAB and Quicken Simplifi settled on for the same
// job: ten days either side of the expected day. Actual Budget's two days would
// miss a salary due on the 30th that lands on the 25th — the case this exists
// for. The amount band is Simplifi's "limited range", ±15%: wide enough for a
// month with overtime, narrow enough that a small refund cannot pass for a
// salary. A wrong match is worse than a missed one, which costs one tap.

/** An arrival up to this many days before its day still counts as it. */
export const EARLY_DAYS = 10;
/** …and up to this many days after. */
export const LATE_DAYS = 10;
/** How far the amount may differ and still be the same thing. */
export const AMOUNT_TOLERANCE = 0.15;
/**
 * How long an item that has not come stays "late" in the plan. Past this it is
 * taken to have happened unrecorded, or not to be coming — either way, not
 * something to keep adding to today.
 */
export const LOOKBACK_DAYS = 25;
/** The stretch in which records of the same kind prove that it is recorded at all. */
export const EVIDENCE_DAYS = 75;

const DAY = 24 * 60 * 60 * 1000;
const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const daysBetween = (a: Date, b: Date) => Math.round((startOfDay(b).getTime() - startOfDay(a).getTime()) / DAY);

/** "income": one time of an income from «Έσοδα» — resolved by `planIncomes`, not here. */
export type OccurrenceSource = "income" | "oneoff" | "loan";

/** One expected arrival or payment, on the day the plan expects it. */
export interface PlannedOccurrence {
  key: string;
  source: OccurrenceSource;
  /** The income's id, the one-off's id, or the debt's id. */
  refId: string;
  label: string;
  /** Signed: positive arrives, negative leaves. */
  amount: number;
  date: Date;
  /** A time of the income marked «ο μισθός μου» — the pay day the plan is cut at. */
  pay?: boolean;
}

/** What the user said about one occurrence, overriding what the records suggest. */
export interface OccurrenceOverride {
  /** "received": it came. "skipped": it is not coming this time. "waiting": ignore what was matched, it has not come yet. */
  state?: "received" | "skipped" | "waiting";
  /** For a received one, when it came; otherwise the day it is now expected. ISO day. */
  date?: string;
  /** This time only. Unsigned. */
  amount?: number;
}

/**
 * `unconfirmed`: money in with no record of it, at a time a bank reading may
 * already hold it — see `mayBeInReading`. Left out of the plan and asked about.
 */
export type OccurrenceStatus = "due" | "late" | "received" | "skipped" | "assumed" | "unconfirmed";

export interface ResolvedOccurrence extends PlannedOccurrence {
  status: OccurrenceStatus;
  /** Where it sits in the plan now, when it still does: today for a late one, the moved day for a moved one. */
  plannedDate?: Date;
  /** Signed, like `amount`. */
  plannedAmount: number;
  /**
   * The record that settled it, or the user's word for it. `recorded`: a record
   * written for this very time with «Ήρθε» — only undoing that record on
   * «Έσοδα» takes it back, so "that wasn't it" is not offered.
   */
  matched?: { date: Date; amount: number; label: string; manual: boolean; recorded?: boolean };
  overridden: boolean;
}

export interface Actuals {
  transactions: Transaction[];
  debts: DebtWithStatus[];
  overrides: Record<string, OccurrenceOverride>;
  /**
   * When the banks were last read (`useMoneyAccounts().latest?.at`). The plan
   * starts from that reading, so anything that had landed by then is already
   * in the money it starts from — recorded or not.
   */
  lastReadingAt?: Date;
}

export const occurrenceKey = (source: OccurrenceSource, refId: string, date: Date) => `${source}:${refId}:${toISODay(date)}`;

/** Money in that is ordinary income — not savings coming back. */
const isPlainIncome = (tx: Transaction) => tx.type === "income" && !tx.isGoalTransaction && !tx.isInvestmentTransaction;

const close = (amount: number, expected: number) => Math.abs(Math.abs(amount) - Math.abs(expected)) <= Math.abs(expected) * AMOUNT_TOLERANCE + 0.005;

interface Candidate {
  id: string;
  date: Date;
  amount: number;
  label: string;
}

/**
 * The function the plan asks about each occurrence, in date order.
 *
 * Stateful on purpose: a record settles one occurrence at most, so a bonus the
 * size of a salary cannot be counted as both.
 *
 * `settled` are records already accounted for before this resolver starts —
 * the ones the incomes found as theirs — so a one-off cannot claim the
 * salary's record a second time. A record written with «Ήρθε» for an income
 * (`incomeId`) is never a match either: the user has already said what it was.
 */
export function createResolver(actuals: Actuals, now: Date = new Date(), settled: Iterable<string> = []) {
  const today = startOfDay(now);
  const used = new Set<string>(settled);
  for (const tx of actuals.transactions) if (tx.incomeId) used.add(tx.id);

  const incomes: Candidate[] = actuals.transactions.filter(isPlainIncome).map((tx) => ({ id: tx.id, date: startOfDay(firestoreToDate(tx.date)), amount: tx.amount, label: tx.description }));
  const repayments = new Map<string, Candidate[]>();
  for (const debt of actuals.debts) {
    repayments.set(
      debt.id,
      (debt.payments ?? []).map((p, i) => ({ id: `${debt.id}#${p.id ?? i}`, date: startOfDay(firestoreToDate(p.date)), amount: p.amount, label: debt.label || debt.person })),
    );
  }

  const candidatesFor = (occurrence: PlannedOccurrence) => (occurrence.source === "loan" ? (repayments.get(occurrence.refId) ?? []) : incomes);

  /**
   * Whether this kind of thing is written down at all. Someone who never
   * records their pay would otherwise see it "late" every month — and counted
   * a second time on top of a balance that already holds it.
   */
  const isRecorded = (occurrence: PlannedOccurrence) => {
    const since = addDays(today, -EVIDENCE_DAYS);
    const recent = candidatesFor(occurrence).filter((c) => c.date >= since && c.date <= today);
    // A one-off is irregular, so any recorded income will do; a loan, any
    // repayment of that loan.
    return recent.length > 0;
  };

  const findMatch = (occurrence: PlannedOccurrence): Candidate | undefined => {
    const from = addDays(occurrence.date, -EARLY_DAYS);
    const to = addDays(occurrence.date, LATE_DAYS);
    let best: Candidate | undefined;
    for (const c of candidatesFor(occurrence)) {
      if (used.has(c.id) || c.date < from || c.date > to || c.date > today || !close(c.amount, occurrence.amount)) continue;
      const better =
        !best ||
        Math.abs(daysBetween(c.date, occurrence.date)) < Math.abs(daysBetween(best.date, occurrence.date)) ||
        (Math.abs(daysBetween(c.date, occurrence.date)) === Math.abs(daysBetween(best.date, occurrence.date)) &&
          Math.abs(Math.abs(c.amount) - Math.abs(occurrence.amount)) < Math.abs(Math.abs(best.amount) - Math.abs(occurrence.amount)));
      if (better) best = c;
    }
    return best;
  };

  /**
   * Whether the last bank reading may already hold this arrival.
   *
   * The plan starts from what the banks said at that reading. Pay that came
   * early and was never written down is in that figure and nowhere else — no
   * record for the match above to find — so the plan used to count it a
   * second time on its own day: the owner's October salary, in on 28 September
   * and only in a reading, was in "what you have now" and again on 1 October.
   *
   * An arrival can be early by up to `EARLY_DAYS`, so a reading taken on or
   * after the first day it could have come may hold it. Counted by the day,
   * like the match window, so a reading on that first day counts.
   *
   * Only for money in. A payment out that has already left is in the reading
   * too, but planning it again only makes the plan more careful than it need
   * be; pay planned again is money that does not exist. The one mistake is a
   * warning a tap clears, the other a promise the plan cannot keep.
   */
  const lastReading = actuals.lastReadingAt ? startOfDay(actuals.lastReadingAt) : undefined;
  const mayBeInReading = (occurrence: PlannedOccurrence) =>
    occurrence.source !== "loan" && occurrence.amount > 0 && !!lastReading && lastReading >= addDays(occurrence.date, -EARLY_DAYS);

  return (occurrence: PlannedOccurrence): ResolvedOccurrence => {
    const override = actuals.overrides[occurrence.key];
    const sign = occurrence.amount < 0 ? -1 : 1;
    const base = { ...occurrence, overridden: !!override };

    if (override?.state === "skipped") return { ...base, status: "skipped", plannedAmount: 0 };
    if (override?.state === "received") {
      const amount = sign * (override.amount ?? Math.abs(occurrence.amount));
      return { ...base, status: "received", plannedAmount: 0, matched: { date: parseISODay(override.date ?? "") ?? occurrence.date, amount, label: occurrence.label, manual: true } };
    }

    const match = override?.state === "waiting" ? undefined : findMatch(occurrence);
    if (match) {
      used.add(match.id);
      return { ...base, status: "received", plannedAmount: 0, matched: { date: match.date, amount: sign * Math.abs(match.amount), label: match.label, manual: false } };
    }

    // Not found among the records, and the user has not said anything about
    // it — but the banks have been read since it could have come. Left out
    // rather than planned: under-counting until the question is answered is a
    // plan that is too careful for a day; double-counting is one that spends
    // a salary twice. "It came" answers it as received, "not yet" as waiting,
    // and either way it is an override, so it is not asked again.
    //
    // Except a day already gone for a kind of income this user never records:
    // that is "assumed" below, which is already left out of the plan, so the
    // question would change no figure and only nag someone who does not write
    // their pay down about last month's.
    const assumedAnyway = occurrence.date < today && !isRecorded(occurrence);
    if (!override && mayBeInReading(occurrence) && !assumedAnyway) return { ...base, status: "unconfirmed", plannedAmount: 0 };

    const amount = sign * (override?.amount ?? Math.abs(occurrence.amount));
    const when = parseISODay(override?.date ?? "") ?? occurrence.date;
    if (when < today) {
      // Nobody said anything, and nothing of the kind is ever recorded: treat
      // it the old way, as having happened. Once the user has spoken about it
      // — even only to say "still waiting" — it is late.
      if (!override && !isRecorded(occurrence)) return { ...base, status: "assumed", plannedAmount: 0 };
      return { ...base, status: "late", plannedDate: today, plannedAmount: amount };
    }
    return { ...base, status: "due", plannedDate: startOfDay(when), plannedAmount: amount };
  };
}

export type OccurrenceResolver = ReturnType<typeof createResolver>;

/** The first day an unfinished occurrence is still looked at. */
export const lookbackStart = (now: Date) => addDays(startOfDay(now), -LOOKBACK_DAYS);

/** Days an occurrence is past its expected day, for "late by N days". */
export const daysLate = (occurrence: Pick<PlannedOccurrence, "date">, now: Date = new Date()) => Math.max(0, daysBetween(occurrence.date, now));
