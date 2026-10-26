import { useMemo, useState } from "react";
import { Button, Modal, ModalBody, ModalFooter, ModalHeader } from "reactstrap";
import { useTranslation } from "react-i18next";
import { addMonths, isSameMonth, startOfMonth } from "date-fns";
import { FiChevronLeft, FiChevronRight, FiEdit2 } from "react-icons/fi";
import { categoryLabel } from "../../../shared/utils/categories";
import type { Category, Transaction } from "../../../shared/types/IndexTypes";
import { lineMonthSpend } from "../lineSpending";
import type { BudgetLine } from "../plannerUtils";
import styles from "../css/PlannerPage.module.css";

/** How far back the months go: two years of what a limit took is plenty to compare with. */
const MONTHS_BACK = 24;

/**
 * A line with categories, opened: what its month has taken against its limit,
 * category by category, and the way to change it.
 *
 * Read before it is edited — the question that sends someone to a limit is
 * usually "where did it go", and the editor answers nothing. Months step back
 * from this one — or from the month picked on «Μήνας», which it opens on; a
 * month to come has spent nothing yet, and says how much of the limit it has.
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
            return (
              <li key={categoryId}>
                <span className="text-truncate">
                  <span aria-hidden>{category?.icon ?? "•"}</span> {categoryLabel(category?.name, t) || "—"} <span className="text-body-secondary">({count})</span>
                </span>
                <span className="text-nowrap">
                  {formatCurrency(amount)}
                  {spend.total > 0 && <span className="text-body-secondary small"> · {Math.round((amount / spend.total) * 100)}%</span>}
                </span>
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
