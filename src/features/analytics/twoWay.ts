import { startOfMonth, startOfWeek } from "date-fns";
import { firestoreToDate } from "../../shared/utils/dates";
import { isGoalContribution, isInvestmentContribution, isMoneyMove } from "../../shared/utils/moneyModel";
import type { Category, Transaction } from "../../shared/types/IndexTypes";

// One category, both ways: what came in and what went out under it, over time.
//
// The case it is for is the one where money goes both ways under one name —
// betting above all: stakes out, wins back in. But the app files every category
// under one side only: «Sports Betting» is an expense category, and a win is an
// income written under some income category — «Other Income», say — with the
// bookmaker's name on it. So the other side is found two ways, and the card
// says which:
//
//   1. A category of the other side with the same name — one made by hand,
//      «Στοίχημα» once as an expense and once as an income.
//   2. Records of the other side carrying a name used under this category:
//      stakes paid to «Stoiximan», a win from «Stoiximan». Shown by name, with
//      how many, and switched off with one tap when it is not wanted.
//
// What counts is what the rest of the page counts: no transfers, loans,
// goals or investments — money that moved between pockets did not come in or
// go out.

const round2 = (n: number) => Math.round(n * 100) / 100;

/** "Stoiximan ", "stoiximan" and "ΣΤΟΊΧΗΜΑ" alike: trimmed, one space, no case, no accents. */
export const sameName = (s: string | undefined | null) =>
  (s ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();

/** In or out, or neither for what the page does not count as either. */
function sideOf(tx: Transaction): "in" | "out" | undefined {
  if (isMoneyMove(tx) || isGoalContribution(tx) || isInvestmentContribution(tx)) return undefined;
  if (tx.type === "income") return "in";
  if (tx.type === "expense") return "out";
  return undefined;
}

type CategoryLike = Pick<Category, "id" | "name" | "type">;

/** The other side's categories with this one's name. */
function siblingsOf(category: CategoryLike, categories: CategoryLike[]): string[] {
  const name = sameName(category.name);
  return categories.filter((c) => c.id !== category.id && c.type !== category.type && sameName(c.name) === name).map((c) => c.id);
}

export interface LinkedName {
  /** As first written. */
  name: string;
  count: number;
  amount: number;
}

export interface TwoWayBucket {
  key: string;
  start: Date;
  in: number;
  inCount: number;
  out: number;
  outCount: number;
  /** in − out. */
  net: number;
  /** From the start of the window, each. */
  cumIn: number;
  cumOut: number;
  cumNet: number;
}

export interface TwoWay {
  buckets: TwoWayBucket[];
  inCount: number;
  in: number;
  outCount: number;
  out: number;
  net: number;
  /** Of every 1 that went out, how much came back: 0.62. Undefined with nothing out. */
  returned?: number;
  biggestIn?: { amount: number; date: Date; label: string };
  biggestOut?: { amount: number; date: Date; label: string };
  /** The other side's records brought in by name (2 above), whether or not they are switched on. */
  linked: LinkedName[];
  /** Brought in by a category of the same name (1 above). */
  siblingIds: string[];
}

export interface TwoWayOptions {
  /** Start of the window; null for everything on record, from the first record of the topic. */
  from: Date | null;
  now: Date;
  /** Weeks rather than months — for a one-month window, where months are one point. */
  byWeek?: boolean;
  /** Include the other side's records by name. On unless switched off. */
  linkNames?: boolean;
}

/**
 * The records of a category, both ways — the category's own, its same-named
 * twin's, and (with `linkNames`) the other side's carrying one of its names.
 */
function topicRecords(transactions: Transaction[], categories: CategoryLike[], categoryId: string, linkNames: boolean) {
  const category = categories.find((c) => c.id === categoryId);
  const own = new Set([categoryId, ...(category ? siblingsOf(category, categories) : [])]);
  const mine = transactions.filter((tx) => own.has(tx.categoryId) && sideOf(tx));

  // The names used under it, and the sides they were used on.
  const names = new Set(mine.map((tx) => sameName(tx.description)).filter(Boolean));
  const sidesHere = new Set(mine.map(sideOf));
  // Only the side the category does not already have: a stake to «Stoiximan»
  // filed under «Entertainment» is an expense the user put elsewhere on purpose.
  const otherSide = category ? (category.type === "income" ? "out" : "in") : undefined;

  const linkedByName = new Map<string, LinkedName>();
  const linked: Transaction[] = [];
  if (otherSide && names.size > 0) {
    for (const tx of transactions) {
      if (own.has(tx.categoryId) || sideOf(tx) !== otherSide) continue;
      const key = sameName(tx.description);
      if (!key || !names.has(key)) continue;
      linked.push(tx);
      const entry = linkedByName.get(key) ?? { name: tx.description.trim(), count: 0, amount: 0 };
      entry.count += 1;
      entry.amount = round2(entry.amount + Math.abs(tx.amount));
      linkedByName.set(key, entry);
    }
  }

  return {
    records: linkNames ? [...mine, ...linked] : mine,
    linked: [...linkedByName.values()].sort((a, b) => b.count - a.count || b.amount - a.amount),
    siblingIds: [...own].filter((id) => id !== categoryId),
    bothWays: sidesHere.size === 2 || linked.length > 0,
    count: mine.length,
  };
}

const keyOf = (d: Date, byWeek: boolean) => {
  const s = byWeek ? startOfWeek(d, { weekStartsOn: 1 }) : startOfMonth(d);
  return `${s.getFullYear()}-${String(s.getMonth() + 1).padStart(2, "0")}-${String(s.getDate()).padStart(2, "0")}`;
};

/**
 * One category over the window, both ways, per month (or week).
 *
 * Dense, as every series on the page: a month with nothing in it is a month of
 * zeroes, not a gap that joins two distant months into one line.
 */
export function twoWay(transactions: Transaction[], categories: CategoryLike[], categoryId: string, options: TwoWayOptions): TwoWay {
  const { from, now, byWeek = false, linkNames = true } = options;
  const topic = topicRecords(transactions, categories, categoryId, linkNames);
  const rows = topic.records
    .map((tx) => ({ tx, date: firestoreToDate(tx.date), side: sideOf(tx)!, amount: Math.abs(tx.amount) }))
    .filter((r) => (!from || r.date >= from) && r.date <= now);

  const step = (d: Date) => (byWeek ? startOfWeek(d, { weekStartsOn: 1 }) : startOfMonth(d));
  const next = (d: Date) => (byWeek ? new Date(d.getFullYear(), d.getMonth(), d.getDate() + 7) : new Date(d.getFullYear(), d.getMonth() + 1, 1));
  const earliest = rows.reduce<Date | undefined>((min, r) => (!min || r.date < min ? r.date : min), undefined);
  const last = step(now);
  let first = step(from ?? earliest ?? now);
  if (first > last) first = last;

  const buckets: TwoWayBucket[] = [];
  for (let cursor = first; cursor <= last; cursor = next(cursor)) {
    buckets.push({ key: keyOf(cursor, byWeek), start: cursor, in: 0, inCount: 0, out: 0, outCount: 0, net: 0, cumIn: 0, cumOut: 0, cumNet: 0 });
  }
  const byKey = new Map(buckets.map((b) => [b.key, b]));

  let biggestIn: TwoWay["biggestIn"];
  let biggestOut: TwoWay["biggestOut"];
  for (const r of rows) {
    const bucket = byKey.get(keyOf(r.date, byWeek));
    if (!bucket) continue;
    const label = r.tx.description?.trim() ?? "";
    if (r.side === "in") {
      bucket.in += r.amount;
      bucket.inCount += 1;
      if (!biggestIn || r.amount > biggestIn.amount) biggestIn = { amount: round2(r.amount), date: r.date, label };
    } else {
      bucket.out += r.amount;
      bucket.outCount += 1;
      if (!biggestOut || r.amount > biggestOut.amount) biggestOut = { amount: round2(r.amount), date: r.date, label };
    }
  }

  let cumIn = 0;
  let cumOut = 0;
  for (const b of buckets) {
    b.in = round2(b.in);
    b.out = round2(b.out);
    b.net = round2(b.in - b.out);
    cumIn += b.in;
    cumOut += b.out;
    b.cumIn = round2(cumIn);
    b.cumOut = round2(cumOut);
    b.cumNet = round2(cumIn - cumOut);
  }

  const totalIn = round2(cumIn);
  const totalOut = round2(cumOut);
  return {
    buckets,
    inCount: buckets.reduce((s, b) => s + b.inCount, 0),
    in: totalIn,
    outCount: buckets.reduce((s, b) => s + b.outCount, 0),
    out: totalOut,
    net: round2(totalIn - totalOut),
    returned: totalOut > 0 ? totalIn / totalOut : undefined,
    biggestIn,
    biggestOut,
    linked: topic.linked,
    siblingIds: topic.siblingIds,
  };
}

export interface TwoWayOption {
  id: string;
  type: Category["type"];
  /** Its own records, on all of history. */
  count: number;
  /** Money both ways under it: its own two sides, a twin, or names on the other side. */
  bothWays: boolean;
}

/**
 * What the picker offers: every category with a record, the ones with money
 * both ways first, then by how much is in each. Over all of history, not the
 * window, so a choice does not vanish from the list on a narrower range.
 * A twin is offered once, as the side with more records.
 */
export function twoWayOptions(transactions: Transaction[], categories: CategoryLike[]): TwoWayOption[] {
  const options: TwoWayOption[] = [];
  const taken = new Set<string>();
  const counted = categories
    .map((c) => ({ c, topic: topicRecords(transactions, categories, c.id, true) }))
    .filter((x) => x.topic.count > 0)
    .sort((a, b) => b.topic.count - a.topic.count);
  for (const { c, topic } of counted) {
    if (taken.has(c.id)) continue;
    taken.add(c.id);
    for (const id of topic.siblingIds) taken.add(id);
    options.push({ id: c.id, type: c.type, count: topic.count, bothWays: topic.bothWays });
  }
  return [...options.filter((o) => o.bothWays), ...options.filter((o) => !o.bothWays)];
}
