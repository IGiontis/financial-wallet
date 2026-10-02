import { useMemo, useState } from "react";
import { Modal, ModalHeader, ModalBody, ModalFooter, Button, Input, Label } from "reactstrap";
import { useTranslation } from "react-i18next";
import type { BillWithStatus } from "../../shared/types/IndexTypes";
import { useOfflineGuard } from "../../shared/hooks/useOfflineGuard";
import { billOverdue, getInstallmentCount, type MonthForecastItem } from "./billsUtils";

interface SettleOverdueModalProps {
  bill: BillWithStatus;
  formatCurrency: (n: number) => string;
  onClose: () => void;
  /** The overdue items left ticked, to be marked paid without a transaction. */
  onConfirm: (items: MonthForecastItem[]) => void;
}

/** Stable per item: a period, and which part of it. */
const itemKey = (item: MonthForecastItem) => `${item.periodKey}#${item.installmentIndex ?? 0}`;

/**
 * "I've paid these" — the overdue periods of one bill, marked paid without a
 * transaction.
 *
 * For debt that was never debt: the bank paid the water every month, the app
 * was simply never told. Paying them through the ordinary form would write an
 * expense for each, and take the money out of the balance a second time.
 *
 * Every overdue period or part is listed with its date and amount, all ticked:
 * the usual case is "all of them", and the one exception is unticked rather
 * than everything else ticked by hand. The total follows the ticks, so what is
 * about to be marked is a figure on the screen before it is a fact.
 */
export default function SettleOverdueModal({ bill, formatCurrency, onClose, onConfirm }: SettleOverdueModalProps) {
  const { t, i18n } = useTranslation();
  // Online only: the list is a decision taken against this screen — see `offlinePolicy`.
  const guard = useOfflineGuard("bulk");
  const items = useMemo(() => billOverdue(bill).items, [bill]);
  const [unticked, setUnticked] = useState<Set<string>>(() => new Set());

  const dateFmt = new Intl.DateTimeFormat(i18n.resolvedLanguage ?? "en", { day: "numeric", month: "short", year: "numeric" });
  const split = getInstallmentCount(bill) > 1;
  const chosen = items.filter((item) => !unticked.has(itemKey(item)));
  const total = Math.round(chosen.reduce((sum, item) => sum + item.amount, 0) * 100) / 100;

  const toggle = (item: MonthForecastItem) =>
    setUnticked((previous) => {
      const next = new Set(previous);
      if (next.has(itemKey(item))) next.delete(itemKey(item));
      else next.add(itemKey(item));
      return next;
    });

  return (
    <Modal isOpen toggle={onClose} centered scrollable>
      <ModalHeader toggle={onClose}>{t("bills.settleOverdueTitle", { name: bill.name })}</ModalHeader>

      <ModalBody>
        <p className="mb-3" style={{ fontSize: 13 }}>
          {t("bills.settleOverdueBody")}
        </p>

        <div className="d-flex flex-column gap-1">
          {items.map((item) => {
            const id = `settle-${itemKey(item)}`;
            return (
              <div key={id} className="d-flex align-items-center gap-2 py-1">
                <Input id={id} type="checkbox" className="mt-0 flex-shrink-0" checked={!unticked.has(itemKey(item))} onChange={() => toggle(item)} />
                <Label for={id} className="mb-0 flex-grow-1 d-flex justify-content-between gap-2" style={{ fontSize: 13, cursor: "pointer" }}>
                  <span>
                    {dateFmt.format(item.date)}
                    {split && <span className="text-body-secondary"> · {t("bills.installmentOf", { index: (item.installmentIndex ?? 0) + 1, count: getInstallmentCount(bill) })}</span>}
                  </span>
                  <span style={{ fontVariantNumeric: "tabular-nums" }}>{formatCurrency(item.amount)}</span>
                </Label>
              </div>
            );
          })}
        </div>

        <div className="d-flex justify-content-end mt-2 fw-semibold" style={{ fontSize: 14 }}>
          {t("bills.settleOverdueTotal", { amount: formatCurrency(total) })}
        </div>

        {guard.locked && (
          <p className="mb-0 mt-2" style={{ fontSize: 12, color: "var(--color-text-secondary)" }}>
            {guard.reason}
          </p>
        )}
      </ModalBody>

      <ModalFooter>
        <Button color="secondary" outline onClick={onClose}>
          {t("common.cancel")}
        </Button>
        <Button color="success" disabled={chosen.length === 0 || guard.locked} onClick={() => onConfirm(chosen)}>
          {t("bills.settleOverdueConfirm", { count: chosen.length })}
        </Button>
      </ModalFooter>
    </Modal>
  );
}
