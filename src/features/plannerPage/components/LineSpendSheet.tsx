import { useMemo, useState } from "react";
import { Button, Modal, ModalBody, ModalFooter, ModalHeader } from "reactstrap";
import { useTranslation } from "react-i18next";
import { addMonths, isSameMonth, startOfMonth } from "date-fns";
import { FiChevronDown, FiChevronLeft, FiChevronRight, FiEdit2 } from "react-icons/fi";
import { categoryLabel } from "../../../shared/utils/categories";
import type { Category, Transaction } from "../../../shared/types/IndexTypes";
import { firestoreToDate } from "../../../shared/utils/dates";
import { lineMonthRecords, lineMonthSpend } from "../lineSpending";
import type { BudgetLine } from "../plannerUtils";
import styles from "../css/PlannerPage.module.css";

/** How far back the months go: two years of what a limit took is plenty to compare with. */
const MONTHS_BACK = 24;
/** How many records an opened category shows before «Δείξε άλλες»: a month of groceries can be forty. */
const PAGE = 8;

/**
 * A line with categories, opened: what its month has taken against its limit,
 * category by category, and the way to change it.
 *
 * Read before it is edited — the question that sends someone to a limit is
 * usually "where did it go", and the editor answers nothing. Months step back
 * from this one — or from the month picked on «Μήνας», which it opens on; a
 * month to come has spent nothing yet, and says how much of the limit it has.
 *
 * Each category starts closed — its name and its figure, the answer to "where
 * did it go" at a glance — and opens on the records behind that figure, a few
 * at a time.
 */
export function LineSpendSheet({
  line,
  categories,
  transactions,
  now,
  formatCurrency,
  locale,
  onEdit,
  onClose,
  initialMonth,
}: {
  line: BudgetLine;
  categories: Category[];
  transactions: Transaction[];
  now: Date;
  formatCurrency: (n: number) => string;
  locale: string;
  onEdit: () => void;
  onClose: () => void;
  /** The month to open on; this one when absent. */
  initialMonth?: Date;
}) {
  const { t } = useTranslation();
  const [month, setMonth] = useState(() => startOfMonth(initialMonth ?? now));
  const thisMonth = isSameMonth(month, now);
  // No further on than this month, or the one it was opened on if that is later.
  const latest = initialMonth && initialMonth > now ? startOfMonth(initialMonth) : startOfMonth(now);
  const toCome = month > startOfMonth(now);
  const oldest = addMonths(startOfMonth(now), -MONTHS_BACK);
  const monthFmt = useMemo(() => new Intl.DateTimeFormat(locale, { month: "long", year: "numeric" }), [locale]);

  const spend = useMemo(() => lineMonthSpend(line, transactions, month), [line, transactions, month]);
  const limit = line.amount;
  const over = spend.total > limit + 0.005;
  const left = Math.max(limit - spend.total, 0);
  const share = limit > 0 ? Math.min((spend.total / limit) * 100, 100) : 0;
  const byId = new Map(categories.map((c) => [c.id, c]));
  const records = useMemo(() => lineMonthRecords(line, transactions, month), [line, transactions, month]);
  // Which categories are open, and how many of each one's records show. A new
  // month starts closed again: its records are other ones.
  const [open, setOpen] = useState<{ month: number; shown: Record<string, number> }>({ month: month.getTime(), shown: {} });
  const shown = open.month === month.getTime() ? open.shown : {};
  const setShown = (categoryId: string, n: number | undefined) => {
    const next = { ...shown };
    if (n === undefined) delete next[categoryId];
    else next[categoryId] = n;
    setOpen({ month: month.getTime(), shown: next });
  };
  const dayFmt = useMemo(() => new Intl.DateTimeFormat(locale, { day: "numeric", month: "short" }), [locale]);

  return (
    <Modal isOpen toggle={onClose} centered scrollable>
      <ModalHeader toggle={onClose}>{line.label}</ModalHeader>
      <ModalBody>
        <div className="d-flex justify-content-between align-items-center mb-2">
          <Button color="link" size="sm" className="p-1" onClick={() => setMonth(addMonths(month, -1))} disabled={month <= oldest} aria-label={t("planner.monthPrev")}>
            <FiChevronLeft aria-hidden />
          </Button>
          <span className="fw-semibold text-capitalize">{monthFmt.format(month)}</span>
          <Button color="link" size="sm" className="p-1" onClick={() => setMonth(addMonths(month, 1))} disabled={month >= latest} aria-label={t("planner.monthNext")}>
            <FiChevronRight aria-hidden />
          </Button>
        </div>

        <div>{t("planner.lineSpentOf", { spent: formatCurrency(spend.total), limit: formatCurrency(limit) })}</div>
        <div className={styles.lineSpendBar} aria-hidden>
          <span style={{ width: `${share}%`, background: over ? "var(--expense-fill)" : "var(--income-fill)" }} />
        </div>
        <div className="small text-body-secondary mb-3">
          {over
            ? t("planner.lineOverBy", { amount: formatCurrency(spend.total - limit) })
            : t(thisMonth || toCome ? "planner.lineLeftThisMonth" : "planner.lineLeftThen", { amount: formatCurrency(left) })}
        </div>

        <ul className={styles.lineSpendList} aria-label={t("planner.lineByCategory")}>
          {spend.byCategory.map(({ categoryId, amount, count }) => {
            const category = byId.get(categoryId);
            const name = categoryLabel(category?.name, t) || "—";
            const rows = records.get(categoryId) ?? [];
            const limitShown = shown[categoryId];
            const expanded = limitShown !== undefined;
            const panelId = `line-cat-${categoryId}`;
            return (
              <li key={categoryId}>
                <button
                  type="button"
                  className={styles.lineSpendHead}
                  aria-expanded={expanded}
                  aria-controls={expanded ? panelId : undefined}
                  disabled={count === 0}
                  onClick={() => setShown(categoryId, expanded ? undefined : PAGE)}
                >
                  <span className={styles.lineSpendName}>
                    <span aria-hidden>{category?.icon ?? "•"}</span> {name} <span className="text-body-secondary">({count})</span>
                  </span>
                  <span className={styles.lineSpendAmount}>
                    {formatCurrency(amount)}
                    {spend.total > 0 && <span className="text-body-secondary small"> · {Math.round((amount / spend.total) * 100)}%</span>}
                  </span>
                  <FiChevronDown size={15} className={`${styles.lineSpendChevron} ${expanded ? styles.lineSpendChevronOpen : ""}`} aria-hidden />
                </button>
                {expanded && (
                  <div id={panelId}>
                    <ul className={styles.lineSpendRecords} aria-label={name}>
                      {rows.slice(0, limitShown).map((tx) => (
                        <li key={tx.id}>
                          <span className={styles.lineSpendRecordName}>{tx.description?.trim() || name}</span>
                          <span className={styles.lineSpendRecordDate}>{dayFmt.format(firestoreToDate(tx.date))}</span>
                          <span className={styles.lineSpendAmount}>{formatCurrency(Math.abs(tx.amount))}</span>
                        </li>
                      ))}
                    </ul>
                    {rows.length > limitShown && (
                      <Button color="link" size="sm" className={styles.lineSpendMore} onClick={() => setShown(categoryId, limitShown + PAGE)}>
                        {t("planner.lineShowMore", { count: Math.min(PAGE, rows.length - limitShown) })}
                      </Button>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </ModalBody>
      <ModalFooter>
        <Button color="secondary" outline className="w-100 d-inline-flex align-items-center justify-content-center gap-2" onClick={onEdit}>
          <FiEdit2 size={15} aria-hidden />
          {t("planner.editEntry")}
        </Button>
      </ModalFooter>
    </Modal>
  );
}

export default LineSpendSheet;
