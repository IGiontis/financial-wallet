import { useEffect, useState } from "react";
import { Modal, ModalHeader, ModalBody, ModalFooter, Button } from "reactstrap";
import { useTranslation } from "react-i18next";
import type { CustomRange } from "../overviewUtils";
import styles from "./css/MonthPicker.module.css";

/** Short month names in the active locale, e.g. Jan / Ιαν. */
function useMonthNames(): string[] {
  const { i18n } = useTranslation();
  const fmt = new Intl.DateTimeFormat(i18n.resolvedLanguage ?? "en", { month: "short" });
  return Array.from({ length: 12 }, (_, m) => fmt.format(new Date(2020, m, 1)));
}

// ─── Month grid ───────────────────────────────────────────────────────────────

interface MonthGridProps {
  label: string;
  selectedYear: number;
  onSelectMonth: (m: number) => void;
  onSelectYear: (y: number) => void;
  minYear: number;
  maxYear: number;
  maxMonth: number;
  rangeStart: { month: number; year: number };
  rangeEnd: { month: number; year: number };
}

function MonthGrid({ label, selectedYear, onSelectMonth, onSelectYear, minYear, maxYear, maxMonth, rangeStart, rangeEnd }: MonthGridProps) {
  const months = useMonthNames();

  const isDisabled = (m: number) => selectedYear === maxYear && m > maxMonth;

  const isInRange = (m: number) => {
    const cell = new Date(selectedYear, m, 1).getTime();
    return cell > new Date(rangeStart.year, rangeStart.month, 1).getTime() && cell < new Date(rangeEnd.year, rangeEnd.month, 1).getTime();
  };

  const isEdge = (m: number) => (selectedYear === rangeStart.year && m === rangeStart.month) || (selectedYear === rangeEnd.year && m === rangeEnd.month);

  return (
    <div style={{ flex: "1 1 190px", minWidth: 0 }}>
      <p className="text-uppercase fw-semibold text-body-secondary mb-2" style={{ fontSize: 11, letterSpacing: "0.07em" }}>
        {label}
      </p>

      <div className="d-flex align-items-center justify-content-between mb-2">
        <button type="button" className={styles.navBtn} onClick={() => onSelectYear(Math.max(minYear, selectedYear - 1))} disabled={selectedYear <= minYear} aria-label="Previous year">
          ‹
        </button>
        <span className="fw-medium text-body-emphasis" style={{ fontSize: 14 }}>
          {selectedYear}
        </span>
        <button type="button" className={styles.navBtn} onClick={() => onSelectYear(Math.min(maxYear, selectedYear + 1))} disabled={selectedYear >= maxYear} aria-label="Next year">
          ›
        </button>
      </div>

      <div className={styles.grid}>
        {months.map((name, i) => {
          const disabled = isDisabled(i);
          const classes = [styles.cell, isEdge(i) ? styles.edge : "", !isEdge(i) && isInRange(i) ? styles.inRange : ""].filter(Boolean).join(" ");
          return (
            <button key={name} type="button" className={classes} onClick={() => !disabled && onSelectMonth(i)} disabled={disabled}>
              {name}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ─── Modal ────────────────────────────────────────────────────────────────────

interface CustomRangeModalProps {
  isOpen: boolean;
  onClose: () => void;
  onApply: (range: CustomRange) => void;
  initialRange: CustomRange;
  minYear: number;
}

export function CustomRangeModal({ isOpen, onClose, onApply, initialRange, minYear }: CustomRangeModalProps) {
  const { t } = useTranslation();
  const months = useMonthNames();

  const now = new Date();
  const maxYear = now.getFullYear();
  const maxMonth = now.getMonth();

  const [draft, setDraft] = useState<CustomRange>(initialRange);

  useEffect(() => {
    if (isOpen) setDraft(initialRange);
    // Only reset when the modal opens — editing shouldn't fight the parent.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  const clamp = (month: number, year: number) => (year === maxYear && month > maxMonth ? maxMonth : month);

  // Selecting a start after the end (or an end before the start) drags the other edge with it.
  const updateFrom = (month: number, year: number) =>
    setDraft((prev) => {
      const fm = clamp(month, year);
      const next = { ...prev, fromMonth: fm, fromYear: year };
      if (new Date(year, fm, 1) > new Date(next.toYear, next.toMonth, 1)) {
        next.toMonth = fm;
        next.toYear = year;
      }
      return next;
    });

  const updateTo = (month: number, year: number) =>
    setDraft((prev) => {
      const tm = clamp(month, year);
      const next = { ...prev, toMonth: tm, toYear: year };
      if (new Date(year, tm, 1) < new Date(next.fromYear, next.fromMonth, 1)) {
        next.fromMonth = tm;
        next.fromYear = year;
      }
      return next;
    });

  const fromLabel = `${months[draft.fromMonth]} ${draft.fromYear}`;
  const toLabel = `${months[draft.toMonth]} ${draft.toYear}`;
  const isSame = draft.fromMonth === draft.toMonth && draft.fromYear === draft.toYear;
  const monthCount = (draft.toYear - draft.fromYear) * 12 + (draft.toMonth - draft.fromMonth) + 1;

  const rangeStart = { month: draft.fromMonth, year: draft.fromYear };
  const rangeEnd = { month: draft.toMonth, year: draft.toYear };

  return (
    <Modal isOpen={isOpen} toggle={onClose} centered>
      <ModalHeader toggle={onClose}>{t("overview.customRange")}</ModalHeader>

      <ModalBody>
        <div className="d-flex gap-3 flex-wrap">
          <MonthGrid
            label={t("overview.from")}
            selectedYear={draft.fromYear}
            onSelectMonth={(m) => updateFrom(m, draft.fromYear)}
            onSelectYear={(y) => updateFrom(draft.fromMonth, y)}
            minYear={minYear}
            maxYear={maxYear}
            maxMonth={maxMonth}
            rangeStart={rangeStart}
            rangeEnd={rangeEnd}
          />

          <div className={styles.divider} />

          <MonthGrid
            label={t("overview.to")}
            selectedYear={draft.toYear}
            onSelectMonth={(m) => updateTo(m, draft.toYear)}
            onSelectYear={(y) => updateTo(draft.toMonth, y)}
            minYear={minYear}
            maxYear={maxYear}
            maxMonth={maxMonth}
            rangeStart={rangeStart}
            rangeEnd={rangeEnd}
          />
        </div>

        {/* Summary */}
        <div
          className="d-flex align-items-center justify-content-center flex-wrap mt-3 px-3 py-2"
          style={{ gap: 6, background: "var(--color-background-secondary)", borderRadius: "var(--border-radius-md)" }}
        >
          <span className="fw-medium text-primary" style={{ fontSize: 13 }}>
            {fromLabel}
          </span>
          {!isSame && (
            <>
              <span className="text-body-secondary" style={{ fontSize: 12 }}>
                →
              </span>
              <span className="fw-medium text-primary" style={{ fontSize: 13 }}>
                {toLabel}
              </span>
              <span className="text-body-secondary ms-1" style={{ fontSize: 11 }}>
                ({monthCount} {monthCount === 1 ? t("overview.month") : t("overview.months")})
              </span>
            </>
          )}
        </div>
      </ModalBody>

      <ModalFooter>
        <Button color="secondary" outline size="sm" onClick={onClose}>
          {t("common.cancel")}
        </Button>
        <Button
          color="primary"
          size="sm"
          onClick={() => {
            onApply(draft);
            onClose();
          }}
        >
          {t("overview.apply")}
        </Button>
      </ModalFooter>
    </Modal>
  );
}
