import { Modal, ModalBody, ModalHeader } from "reactstrap";
import { useTranslation } from "react-i18next";
import { FiChevronRight, FiLock } from "react-icons/fi";
import { isHardDeadline, type CashCheckpoint } from "./billsUtils";
import type { BillWithStatus } from "../../shared/types/IndexTypes";
import styles from "./css/BillsPage.module.css";

interface RunwaySheetProps {
  /** The checkpoints the figure adds up — from the first through the one tapped. Empty closes it. */
  checkpoints: CashCheckpoint[];
  title: string;
  formatCurrency: (n: number) => string;
  onClose: () => void;
  onOpenBill: (bill: BillWithStatus) => void;
}

/**
 * What one of the "now / by …" figures is made of — or the next payment's day.
 *
 * The figure first, large, as the box said it; then each day the money is
 * needed, as a dated group with what that day comes to, and under it one row
 * per bill — its name, and what it asks for — that opens the bill. Grouped by
 * day, so "is it only the water on the 14th, or something else too?" is read
 * off the group, not worked out. Kept to a narrow sheet: a name and its amount
 * on one line read together, where a table stretched across a wide screen
 * left them a hand's width apart.
 */
export default function RunwaySheet({
  checkpoints,
  title,
  formatCurrency,
  onClose,
  onOpenBill,
}: RunwaySheetProps) {
  const { t, i18n } = useTranslation();
  const dateFmt = new Intl.DateTimeFormat(i18n.resolvedLanguage ?? "en", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
  const last = checkpoints[checkpoints.length - 1];
  const count = new Set(checkpoints.flatMap((c) => c.bills)).size;
  const late = checkpoints.some((c) => c.overdue);

  return (
    <Modal
      isOpen={checkpoints.length > 0}
      toggle={onClose}
      centered
      scrollable
      contentClassName={styles.runwaySheet}
    >
      <ModalHeader toggle={onClose} className="border-0 pb-0">
        <span className={styles.runwaySheetTitle}>{title}</span>
      </ModalHeader>
      {last && (
        <ModalBody className="pt-1">
          {/* The answer, as the box gave it. */}
          <div className={styles.runwayHero}>
            <span
              className={styles.runwayHeroAmount}
              style={{ color: late ? "var(--color-expense-text)" : undefined }}
            >
              {formatCurrency(last.cumulative)}
            </span>
            <span className={styles.runwayHeroNote}>
              {t("bills.runwayHeroNote", { count })}
            </span>
          </div>

          {checkpoints.map((checkpoint) => {
            const day = checkpoint.overdue
              ? t("bills.runwayOverdueNow")
              : dateFmt.format(checkpoint.date);
            return (
              <section
                key={checkpoint.date.toISOString()}
                className={styles.runwayGroup}
                aria-label={day}
              >
                <div className={styles.runwayGroupHead}>
                  <span
                    className={`${styles.runwayDateChip} ${checkpoint.overdue ? styles.runwayDateChipLate : ""}`}
                  >
                    {day}
                  </span>
                  {/* A day with more than one bill says what the day comes to. */}
                  {checkpoint.items.length > 1 && (
                    <span className={styles.runwayGroupTotal}>
                      {formatCurrency(checkpoint.amount)}
                    </span>
                  )}
                </div>

                {checkpoint.items.map((item) => (
                  <button
                    key={`${item.bill.id}-${item.overdue}`}
                    type="button"
                    className={styles.runwayRow}
                    onClick={() => onOpenBill(item.bill)}
                  >
                    <span className={styles.runwayRowName}>
                      <span className={styles.runwayRowTitle}>
                        {item.bill.name}
                        {isHardDeadline(item.bill) && (
                          <FiLock
                            size={11}
                            className="ms-1"
                            style={{
                              verticalAlign: "-1px",
                              color: "var(--color-expense)",
                            }}
                            title={t("bills.strictHint")}
                          />
                        )}
                      </span>
                      <span
                        className={styles.runwayRowNote}
                        style={{
                          color: item.overdue
                            ? "var(--color-expense-text)"
                            : undefined,
                        }}
                      >
                        {item.overdue
                          ? t("bills.runwayLate")
                          : t(
                              item.bill.isVariableAmount
                                ? "bills.variesNoHistory"
                                : "bills.fixedAmount",
                            )}
                      </span>
                    </span>
                    <span
                      className={styles.runwayRowAmount}
                      style={{
                        color: item.overdue
                          ? "var(--color-expense-text)"
                          : undefined,
                      }}
                    >
                      {formatCurrency(item.amount)}
                    </span>
                    <FiChevronRight
                      size={15}
                      className={styles.runwayRowChevron}
                      aria-hidden
                    />
                  </button>
                ))}
              </section>
            );
          })}
        </ModalBody>
      )}
    </Modal>
  );
}
