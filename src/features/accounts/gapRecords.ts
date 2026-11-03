import type { CreateDebtDTO, CreateDebtPaymentDTO, CreateTransactionDTO, Debt, DebtPayment, DebtWithStatus } from "../../shared/types/IndexTypes";
import { parseISODay } from "../../shared/utils/dates";
import { computeDebtStatus } from "../debts/debtsUtils";
import { debtCashRecords, type DebtCashRecord } from "../debts/debtCash";
import { transferRecords, type TransferRecord } from "../transactions/transfers";

// «Ξέρεις πού πήγαν;» — several records for one account's difference.
//
// Reading the banks found an account 73 € short of what the app expected. The
// owner remembers 68 € of it: a coffee, a pharmacy, 50 lent to Nikos. Each is
// written down here, one after another, with its own day, and what nobody
// remembers — the last 5 € — stays the difference the reading reports
// («χωρίς εγγραφή»), as it always has (see `readCheckIns`).
//
// Nothing here is a new way of counting. Every record is the same document its
// own form writes: an expense or an income, a transfer's two halves, a debt
// and the money it moved through the card (`debtCashRecords`), a repayment and
// its money. They move what the app expects for the account the moment they
// are written, so the difference closes by exactly what they add up to.
//
// Counted once. A record dated before the last reading would explain nothing
// (that reading already held it), so the day can go no earlier than the last
// reading's. One dated today is written after a reading that is about to be
// taken today and already holds it, so it carries `inReading` — the same mark
// the bank question on «Έσοδα» puts on its answer (`isAfterReading`). Any
// other day is told apart by the day alone and needs no mark.
//
// Except when the last reading was itself taken today. `inReading` puts a
// record before every reading on its day, so the 09:00 reading would take it
// as already held: the 20:00 gap would not close, and the morning's
// «χωρίς εγγραφή» would shift after the fact. There the time decides
// instead, as for any record: written after 09:00, before the 20:00 reading
// is saved.

/** What a record was, from the side of the account being read. */
export type GapKind = "expense" | "income" | "lent" | "borrowed" | "repaid" | "transferOut" | "transferIn";

export const GAP_KINDS: readonly GapKind[] = ["expense", "income", "lent", "borrowed", "repaid", "transferOut", "transferIn"];

export interface GapRecord {
  /** The row's own key in the list, before anything is written. */
  key: string;
  kind: GapKind;
  /** Always positive; the kind gives the direction. */
  amount: number;
  /** "YYYY-MM-DD". */
  date: string;
  /** Expense and income only. */
  categoryId?: string;
  description?: string;
  /** Lent or borrowed: who with. */
  person?: string;
  /** Repaid: which open debt. */
  debtId?: string;
  /** A transfer: the other of the owner's accounts. */
  otherAccountId?: string;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Money in for the account read? — the sign of what the record does to it. */
export function gapSign(record: Pick<GapRecord, "kind" | "debtId">, debts: Pick<DebtWithStatus, "id" | "direction">[]): 1 | -1 {
  switch (record.kind) {
    case "income":
    case "borrowed":
    case "transferIn":
      return 1;
    case "repaid":
      // Paid back to me: in. I paid it back: out.
      return debts.find((d) => d.id === record.debtId)?.direction === "owed_to_me" ? 1 : -1;
    default:
      return -1;
  }
}

/** What one record does to the account read, signed. */
export const gapEffect = (record: GapRecord, debts: Pick<DebtWithStatus, "id" | "direction">[]) => round2(gapSign(record, debts) * Math.abs(record.amount));

/**
 * What is left of the difference once these records are in: the part that stays
 * «χωρίς εγγραφή». The difference is the reading less what was expected, so
 * each record, moving the expectation by its effect, takes its effect off it.
 */
export function gapRemaining(change: number, records: GapRecord[], debts: Pick<DebtWithStatus, "id" | "direction">[]): number {
  return round2(change - records.reduce((sum, r) => sum + gapEffect(r, debts), 0));
}

/**
 * The records explain more than the difference — it would now point the
 * other way. Allowed (the owner may know better than his last reading), but
 * said before anything is saved.
 */
export function gapOverrun(change: number, remaining: number): boolean {
  if (Math.abs(remaining) < 0.005) return false;
  if (Math.abs(change) < 0.005) return true;
  return Math.sign(remaining) !== Math.sign(change);
}

/** What stops one record from being added, as the i18n key that says so. */
export function gapRecordProblem(
  record: Omit<GapRecord, "key">,
  ctx: { earliest?: string; today: string; accountId: string; debts: Pick<DebtWithStatus, "id">[]; accounts: { id: string }[] },
): string | undefined {
  if (!(record.amount > 0) || !Number.isFinite(record.amount)) return "accounts.gap.needAmount";
  if (!parseISODay(record.date)) return "validation.dateRequired";
  if (record.date > ctx.today) return "accounts.gap.noFuture";
  if (ctx.earliest && record.date < ctx.earliest) return "accounts.gap.beforeReading";
  if ((record.kind === "expense" || record.kind === "income") && !record.categoryId) return "accounts.gap.pickCategory";
  if ((record.kind === "lent" || record.kind === "borrowed") && !record.person?.trim()) return "accounts.gap.needPerson";
  if (record.kind === "repaid" && !ctx.debts.some((d) => d.id === record.debtId)) return "accounts.gap.needDebt";
  if (record.kind === "transferOut" || record.kind === "transferIn") {
    if (!record.otherAccountId || record.otherAccountId === ctx.accountId || !ctx.accounts.some((a) => a.id === record.otherAccountId)) return "accounts.gap.needOtherAccount";
  }
  return undefined;
}

/** Everything the records are written as, in one batch — see `saveGapRecords`. */
export interface GapWrites {
  transactions: { id: string; data: CreateTransactionDTO }[];
  transfers: (TransferRecord & { inReading?: boolean })[];
  debts: { id: string; data: CreateDebtDTO & { inReading?: boolean } }[];
  payments: { id: string; data: CreateDebtPaymentDTO & { inReading?: boolean } }[];
  /** The money the new debts and repayments move, as their own sync would write it. */
  debtCash: DebtCashRecord[];
}

/**
 * The documents the records are, ready to write together. `newId` names each
 * new document (one per collection, as `newDocId` does); `now` is when they are
 * written, which a debt's money takes as its own creation time.
 */
export function gapWrites(
  records: GapRecord[],
  ctx: {
    accountId: string;
    today: string;
    /** "YYYY-MM-DD": the day of the last reading, the one this difference is measured from. */
    lastReadingDay?: string;
    userId: string;
    debts: DebtWithStatus[];
    accountName: (id: string) => string;
    categoryName: (id: string) => string;
    newId: (collection: "transactions" | "debts" | "debtPayments" | "transfers") => string;
    now?: Date;
  },
): GapWrites {
  const now = ctx.now ?? new Date();
  const writes: GapWrites = { transactions: [], transfers: [], debts: [], payments: [], debtCash: [] };
  // Repayments gathered per debt, so a debt paid twice here is worked out once, with both.
  const repaidDebts = new Map<string, DebtPayment[]>();

  for (const record of records) {
    const date = parseISODay(record.date)!;
    const mark = record.date === ctx.today && ctx.lastReadingDay !== ctx.today ? { inReading: true as const } : {};
    const amount = round2(Math.abs(record.amount));
    const note = record.description?.trim() || undefined;

    if (record.kind === "expense" || record.kind === "income") {
      writes.transactions.push({
        id: ctx.newId("transactions"),
        data: { type: record.kind, amount, categoryId: record.categoryId!, description: note ?? ctx.categoryName(record.categoryId!), date, accountId: ctx.accountId, ...mark },
      });
    } else if (record.kind === "transferOut" || record.kind === "transferIn") {
      const [from, to] = record.kind === "transferOut" ? [ctx.accountId, record.otherAccountId!] : [record.otherAccountId!, ctx.accountId];
      const halves = transferRecords({ id: ctx.newId("transfers"), from, to, amount, date, label: `${ctx.accountName(from)} → ${ctx.accountName(to)}`, ...(note ? { note } : {}) });
      writes.transfers.push(...halves.map((half) => ({ ...half, ...mark })));
    } else if (record.kind === "lent" || record.kind === "borrowed") {
      const id = ctx.newId("debts");
      const data: CreateDebtDTO & { inReading?: boolean } = {
        person: record.person!.trim(),
        direction: record.kind === "lent" ? "owed_to_me" : "owed_by_me",
        amount,
        date,
        accountId: ctx.accountId,
        ...(note ? { notes: note } : {}),
        ...mark,
      };
      writes.debts.push({ id, data });
      const debt = { ...data, id, userId: ctx.userId, createdAt: now } as Debt;
      writes.debtCash.push(...debtCashRecords(computeDebtStatus(debt, [], now), now).records);
    } else {
      const debt = ctx.debts.find((d) => d.id === record.debtId)!;
      const id = ctx.newId("debtPayments");
      const data: CreateDebtPaymentDTO & { inReading?: boolean } = { debtId: debt.id, amount, date, accountId: ctx.accountId, ...(note ? { notes: note } : {}), ...mark };
      writes.payments.push({ id, data });
      repaidDebts.set(debt.id, [...(repaidDebts.get(debt.id) ?? []), { ...data, id, userId: ctx.userId, createdAt: now } as DebtPayment]);
    }
  }

  // A repayment's money as the debt's own sync writes it: the whole debt worked
  // out again with the new repayments in, so on a loan the interest split of
  // every repayment stays the one its sheet shows. Only what the new
  // repayments write is taken; the rest is already there.
  for (const [debtId, added] of repaidDebts) {
    const debt = ctx.debts.find((d) => d.id === debtId)!;
    const status = computeDebtStatus(debt, [...debt.payments, ...added], now);
    const fresh = new Set(added.map((p) => p.id));
    writes.debtCash.push(...debtCashRecords(status, now).records.filter((r) => r.debtPaymentId && fresh.has(r.debtPaymentId)));
  }
  return writes;
}
