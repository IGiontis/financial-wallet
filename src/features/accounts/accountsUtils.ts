import type { Transaction } from "../../shared/types/IndexTypes";
import { balanceDelta, isAfterReading, type OpeningBalance } from "../../shared/utils/balance";
import { firestoreToDate } from "../../shared/utils/dates";

// Banks and cash: the money that is really there, read off the banks now and
// then, against the money the app has worked out from what was written down.
//
// The app's balance has only ever been a sum — a starting figure plus every
// record since — so it is exactly as right as the records are complete, and a
// coffee not written down is a coffee the app still thinks you have. Nothing
// inside the app can notice that. Reading the real balances can.
//
// The model is deliberately the light one. Records do not say which bank they
// came out of, and moves between your own accounts — a cash machine, a top-up
// to Revolut — are never entered at all. Only the *total* across banks and
// cash is compared, and a move between two of them does not change it. What
// does change it is money that left without a record: the difference is shown
// as "not written down" for the stretch between two readings, and from each
// reading on the balance starts again from the truth.
//
// Money put into a savings goal (from the Goals screen) is taken to stay in one
// of these banks — it is set aside, not gone — so it neither moves the total nor
// counts as missing. Money put into an investment (from the Investments screen)
// is taken to have left for a broker, like any other payment.

export type MoneyAccountKind = "bank" | "cash";

export interface MoneyAccount {
  id: string;
  name: string;
  kind: MoneyAccountKind;
  /** Where new records are assumed to land between readings. One account has it. */
  main?: boolean;
}

/** One reading of every account's real balance, at one moment. */
export interface BalanceCheckIn {
  id: string;
  /** ISO timestamp. */
  at: string;
  /** Account id → balance read off the bank. */
  amounts: Record<string, number>;
}

/** Kept on the user document with the rest of the workspace — see `useWorkspaceSetting`. */
export const ACCOUNTS_KEY = "money-accounts";
export const CHECK_INS_KEY = "balance-check-ins";

/** After this long without a reading, the screens suggest taking one. */
export const STALE_AFTER_DAYS = 7;

const round2 = (n: number) => Math.round(n * 100) / 100;
const DAY = 24 * 60 * 60 * 1000;

/** Money into a savings goal, still in your banks: +in, −out. */
export function goalHeldDelta(tx: Transaction): number {
  if (!tx.isGoalTransaction) return 0;
  return tx.contributionType === "withdrawal" ? -tx.amount : tx.amount;
}

/**
 * What a record does to the money actually sitting in your banks and wallet.
 *
 * The balance card's own figure (`balanceDelta`) treats a goal deposit as money
 * leaving, because it answers "what can I spend". The banks do not see it
 * leave, so for them it is added back.
 */
export function realDelta(tx: Transaction): number {
  return balanceDelta(tx);
}

/** Only accounts that still exist are counted — a deleted one leaves no trace. */
export function checkInTotal(checkIn: BalanceCheckIn, accountIds?: ReadonlySet<string>): number {
  let total = 0;
  for (const [id, amount] of Object.entries(checkIn.amounts)) {
    if (accountIds && !accountIds.has(id)) continue;
    if (Number.isFinite(amount)) total += amount;
  }
  return round2(total);
}

export const checkInDate = (checkIn: BalanceCheckIn): Date => new Date(checkIn.at);

/** Oldest first; readings with an unreadable date are dropped rather than guessed at. */
export function sortedCheckIns(checkIns: BalanceCheckIn[]): BalanceCheckIn[] {
  return checkIns.filter((c) => !Number.isNaN(checkInDate(c).getTime())).sort((a, b) => checkInDate(a).getTime() - checkInDate(b).getTime());
}

/** Everything in savings goals now, future-dated records included — as the balance card counts them. */
export function goalHeldTotal(transactions: Transaction[]): number {
  return round2(transactions.reduce((sum, tx) => sum + goalHeldDelta(tx), 0));
}

/** Money in savings goals as of a reading: what the reading's total holds that is not yours to spend. */
export function goalHeldAt(transactions: Transaction[], at: Date): number {
  return round2(transactions.reduce((sum, tx) => (isAfterReading(tx, at) ? sum : sum + goalHeldDelta(tx)), 0));
}

/** The records written between two readings: after the first, not after the second. */
function between(transactions: Transaction[], from: Date | undefined, to: Date): Transaction[] {
  return transactions.filter((tx) => (!from || isAfterReading(tx, from)) && !isAfterReading(tx, to));
}

export interface CheckInReading {
  checkIn: BalanceCheckIn;
  at: Date;
  /** Real total across the accounts at that moment. */
  total: number;
  /** Accounts that first appear in this reading. */
  added: string[];
  /**
   * What the banks should have shown, from the reading before plus the records
   * in between. Absent on the first reading, which has nothing to go on.
   */
  expected?: number;
  /**
   * `total − expected`: negative is money that went without a record, positive
   * money that came in without one.
   *
   * Worked out from the records as they are *now*, not frozen when the reading
   * was taken — so backfilling the forgotten coffee shrinks the figure by the
   * price of the coffee, which is exactly what it should do.
   */
  unlogged?: number;
  /** On the first reading only: the balance the app showed before it, for comparison. */
  appSaid?: number;
}

/**
 * Every reading, with what it found.
 *
 * An account seen for the first time joins without a difference: its money was
 * already yours, just not listed. Counting it as found money would report a
 * windfall every time an account was added.
 */
export function readCheckIns(checkIns: BalanceCheckIn[], accounts: MoneyAccount[], transactions: Transaction[], legacy?: OpeningBalance): CheckInReading[] {
  const ids = new Set(accounts.map((a) => a.id));
  const sorted = sortedCheckIns(checkIns);

  return sorted.map((checkIn, index) => {
    const at = checkInDate(checkIn);
    const total = checkInTotal(checkIn, ids);
    const present = Object.keys(checkIn.amounts).filter((id) => ids.has(id));

    if (index === 0) {
      // What the balance card said before any reading existed, in the same
      // terms as the reading: spendable money plus what sat in goals.
      const counted = transactions.filter((tx) => !isAfterReading(tx, at) && (!legacy || affectsLegacy(tx, legacy)));
      const cash = (legacy?.amount ?? 0) + counted.reduce((sum, tx) => sum + balanceDelta(tx), 0);
      const appSaid = round2(cash + goalHeldAt(transactions, at));
      return { checkIn, at, total, added: present, appSaid };
    }

    const previous = sorted[index - 1];
    const previousAt = checkInDate(previous);
    const added = present.filter((id) => !(id in previous.amounts));
    // Only accounts in both readings carry an expectation from the earlier one.
    const carried = present.filter((id) => id in previous.amounts).reduce((sum, id) => sum + (previous.amounts[id] ?? 0), 0);
    const joined = added.reduce((sum, id) => sum + (checkIn.amounts[id] ?? 0), 0);
    const moved = between(transactions, previousAt, at).reduce((sum, tx) => sum + realDelta(tx), 0);
    const expected = round2(carried + joined + moved);

    return { checkIn, at, total, added, expected, unlogged: round2(total - expected) };
  });
}

/** The Settings figure counts whole days from its date — the rule it has always had. */
function affectsLegacy(tx: Transaction, legacy: OpeningBalance): boolean {
  const day = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  return day(firestoreToDate(tx.date)) >= day(firestoreToDate(legacy.date));
}

/**
 * The points the balance is counted from, oldest first.
 *
 * Each reading becomes one: the money you could spend at that moment — the real
 * total less what was sitting in goals — and the exact time, so the records
 * written after it and only those are added on. The figure typed in Settings is
 * kept in front of them for the months before the first reading, and set aside
 * once readings exist: from then on it is older news than they are.
 */
export function balanceAnchors(readings: CheckInReading[], transactions: Transaction[], legacy?: OpeningBalance): OpeningBalance[] {
  const fromReadings = readings.map((r) => ({ amount: round2(r.total - goalHeldAt(transactions, r.at)), date: r.at, at: r.at }));
  const first = fromReadings[0];
  const keepLegacy = legacy && (!first || firestoreToDate(legacy.date).getTime() < first.at.getTime());
  return keepLegacy ? [legacy, ...fromReadings] : fromReadings;
}

/** The anchor in force at `when`: the latest one taken before it. */
export function anchorAt(anchors: OpeningBalance[], when: Date): OpeningBalance | undefined {
  let found: OpeningBalance | undefined;
  for (const anchor of anchors) {
    const day = firestoreToDate(anchor.date);
    // A copy: the Settings date is the caller's own object.
    const from = anchor.at ?? new Date(day.getFullYear(), day.getMonth(), day.getDate());
    if (from.getTime() < when.getTime()) found = anchor;
  }
  return found;
}

/** The real total now: the last reading plus every record since. */
export function projectedTotal(latest: CheckInReading, transactions: Transaction[]): number {
  return round2(latest.total + transactions.filter((tx) => isAfterReading(tx, latest.at)).reduce((sum, tx) => sum + realDelta(tx), 0));
}

/** The account records are assumed to land in: the one marked, else the first bank, else the first. */
export function mainAccount(accounts: MoneyAccount[]): MoneyAccount | undefined {
  return accounts.find((a) => a.main) ?? accounts.find((a) => a.kind === "bank") ?? accounts[0];
}

/**
 * What each account should show now — the figures a new reading starts from.
 *
 * Every record since the last reading is put against the main account, since
 * records do not say where they came from. The others keep what they were read
 * at. Their sum is the projected total, so saving the reading unchanged finds
 * nothing missing.
 */
export function expectedByAccount(accounts: MoneyAccount[], latest: CheckInReading | undefined, transactions: Transaction[]): Record<string, number> {
  const result: Record<string, number> = {};
  if (!latest) return result;
  for (const account of accounts) result[account.id] = latest.checkIn.amounts[account.id] ?? 0;
  const main = mainAccount(accounts);
  if (main) {
    const moved = transactions.filter((tx) => isAfterReading(tx, latest.at)).reduce((sum, tx) => sum + realDelta(tx), 0);
    result[main.id] = round2((result[main.id] ?? 0) + moved);
  }
  return result;
}

/** Money gone without a record, by the readings that found it, inside a stretch of time. */
export function unloggedBetween(readings: CheckInReading[], from: Date, to: Date): number {
  return round2(readings.reduce((sum, r) => (r.unlogged !== undefined && r.at >= from && r.at <= to ? sum + r.unlogged : sum), 0));
}

/** Whole days since the last reading, or undefined when there is none. */
export function daysSince(latest: CheckInReading | undefined, now: Date = new Date()): number | undefined {
  if (!latest) return undefined;
  return Math.max(0, Math.floor((now.getTime() - latest.at.getTime()) / DAY));
}

/** Removing an account removes it from every reading, and readings left empty go with it. */
export function withoutAccount(checkIns: BalanceCheckIn[], accountId: string): BalanceCheckIn[] {
  return checkIns
    .map((c) => {
      const amounts = { ...c.amounts };
      delete amounts[accountId];
      return { ...c, amounts };
    })
    .filter((c) => Object.keys(c.amounts).length > 0);
}

export const newId = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;

/**
 * Accepts "1.234,56", "1234.56", "1234,56" and "1.234"; undefined for anything
 * else. A dot followed by exactly three digits is a thousands mark — no amount
 * of money has three decimals, and a Greek keyboard writes a thousand that way.
 */
export function parseAmount(raw: string): number | undefined {
  const trimmed = raw.trim().replace(/\s|€/g, "");
  if (trimmed === "") return undefined;
  let normalised = trimmed;
  if (/^-?\d{1,3}(\.\d{3})+$/.test(trimmed)) {
    normalised = trimmed.replace(/\./g, "");
  } else if (trimmed.includes(",") && trimmed.includes(".")) {
    // Whichever comes last is the decimal mark.
    normalised = trimmed.lastIndexOf(",") > trimmed.lastIndexOf(".") ? trimmed.replace(/\./g, "").replace(",", ".") : trimmed.replace(/,/g, "");
  } else if (trimmed.includes(",")) {
    normalised = trimmed.replace(",", ".");
  }
  if (!/^-?\d+(\.\d+)?$/.test(normalised)) return undefined;
  const value = Number(normalised);
  return Number.isFinite(value) ? round2(value) : undefined;
}
