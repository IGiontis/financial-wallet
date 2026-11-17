import type { BillWithStatus } from "../../shared/types/IndexTypes";
import {
  amountOwedNow,
  billOverdue,
  currentPause,
  expectedAmount,
  owedNowItems,
  paidThisPeriod,
  startsLater,
} from "./billsUtils";

/**
 * The bills list as one card per BILL (owner, 2026-11-17, `docs/DECISIONS.md`):
 * the card's head is the bill's name and its figure; inside, one line per date,
 * each led by its day — every unpaid period of a late bill on a line of its
 * own, so none hides behind another.
 *
 * Figures only as the list already showed them: what a late bill asks for today,
 * what a paid one paid this period, what any other leaves each time. Nothing new
 * is counted — a late card's lines add up to its figure.
 */

/** The list's groups, as `BillsPage` builds them. */
export type StripSection =
  "outstanding" | "settled" | "later" | "stopped" | "inactive";

/** What a line says beside its day: «Απλήρωτος», «Πληρώθηκε», «Επόμενος», «Ξεκινά», «Σταμάτησε», «Συνεχίζει», «Τελευταία πληρωμή». */
export type StripLineKind =
  "unpaid" | "paid" | "next" | "starts" | "stopped" | "resumes" | "lastPaid";

/** One line of a card: a day and what it is. */
export interface StripLine {
  kind: StripLineKind;
  /** None for a bill with no date to show. */
  date?: Date;
  /** The line's figure, for what is owed or was paid; none for a line that only dates the bill. */
  amount?: number;
  /** A variable bill's estimate, printed with «~». */
  approx: boolean;
  /** Past its deadline: the day block and the line in red. One due but inside its grace days is not. */
  late: boolean;
}

export interface StripCard {
  bill: BillWithStatus;
  /** Oldest first; a late bill has one per unpaid period, adding up to `amount`. */
  lines: StripLine[];
  /** The figure in the card's head. */
  amount: number;
  /** An estimate — a variable bill not yet paid — printed with «~». */
  approx: boolean;
  /** Behind on a payment: the figure in red. */
  late: boolean;
}

/** The icon at a line's right, as the status chips say it: ✓ paid, «!» due and still in time, ⚠ late. */
export type StripLineStatus = "paid" | "due" | "late";

export function lineStatus(line: StripLine): StripLineStatus | undefined {
  if (line.kind === "paid") return "paid";
  if (line.kind === "unpaid") return line.late ? "late" : "due";
  if (line.kind === "next") return "due";
  return undefined;
}

const owedKey = (periodKey: string, index?: number) =>
  `${periodKey}#${index ?? 0}`;

/**
 * One bill's card: its lines and its figure.
 *
 * - late: every payment it asks for now (oldest first), and their sum — the late tile's figure;
 * - paid this period: the day it was last paid, at what this period's payments came to
 *   (a period covered by a payment made ahead has none of its own: its usual figure);
 * - not begun: the day it starts; stopped for good: the month it stopped; paused: the month it comes back;
 * - anything else: its next due day, at what it leaves each time.
 */
export function stripCard(
  bill: BillWithStatus,
  section: StripSection,
  now: Date,
): StripCard {
  const approx = !!bill.isVariableAmount;
  const overdue = billOverdue(bill, now);
  if (overdue.count > 0) {
    const lateKeys = new Set(
      overdue.items.map((item) =>
        owedKey(item.periodKey, item.installmentIndex),
      ),
    );
    const lines = owedNowItems(bill, now).map((item): StripLine => ({
      kind: "unpaid",
      date: item.date,
      amount: item.amount,
      approx: item.isVariable,
      late: lateKeys.has(owedKey(item.periodKey, item.installmentIndex)),
    }));
    return {
      bill,
      lines,
      amount: amountOwedNow(bill, now),
      approx,
      late: true,
    };
  }

  const card = (
    kind: StripLineKind,
    date: Date | undefined,
    amount = expectedAmount(bill),
    estimate = approx,
    figure = true,
  ): StripCard => ({
    bill,
    lines: [
      {
        kind,
        date,
        amount: figure ? amount : undefined,
        approx: estimate,
        late: false,
      },
    ],
    amount,
    approx: estimate,
    late: false,
  });

  if (section === "settled") {
    const paid = paidThisPeriod(bill);
    return card(
      "paid",
      bill.lastPaidDate ?? bill.nextDueDate,
      paid > 0 ? paid : expectedAmount(bill),
      paid > 0 ? false : approx,
    );
  }
  if (section === "later")
    return card(
      "starts",
      startsLater(bill, now) ?? bill.nextDueDate,
      undefined,
      approx,
      false,
    );
  if (section === "stopped") {
    const pause = currentPause(bill, now);
    if (pause?.state === "ended")
      return card("stopped", pause.from, undefined, approx, false);
    if (pause?.state === "paused" && pause.to)
      return card(
        "resumes",
        new Date(pause.to.getFullYear(), pause.to.getMonth() + 1, 1),
        undefined,
        approx,
        false,
      );
  }
  if (section === "inactive")
    return card("lastPaid", bill.lastPaidDate, undefined, approx, false);
  return card("next", bill.nextDueDate);
}

/** A section's cards, by their earliest date (then by name); the cards with no date last. */
export function stripCards(
  bills: BillWithStatus[],
  section: StripSection,
  now: Date,
): StripCard[] {
  const first = (c: StripCard) => c.lines[0]?.date;
  return bills
    .map((bill) => stripCard(bill, section, now))
    .sort((a, b) => {
      const da = first(a);
      const db = first(b);
      return (
        (da ? (db ? da.getTime() - db.getTime() : -1) : db ? 1 : 0) ||
        a.bill.name.localeCompare(b.bill.name)
      );
    });
}
