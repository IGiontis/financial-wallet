import { Button, Modal, ModalBody, ModalFooter, ModalHeader } from "reactstrap";
import { useTranslation } from "react-i18next";
import { FiEye, FiEyeOff } from "react-icons/fi";
import type { PlanRow } from "../plannerUtils";
import styles from "../css/PlannerPage.module.css";

/** One fact about a row: what it is called, and its value. */
export type RowFact = [label: string, value: string];

/** A day the row lands on in the window, and what it brings or takes that day. */
export interface RowDate {
  date: Date;
  amount: number;
  /** Its day has gone and it has not happened: held on today. */
  late?: boolean;
}

/** Dates shown before "and N more": a year of a monthly bill would be a page of its own. */
const DATES_SHOWN = 8;

/**
 * What a row in "your figures" is made of: what it adds up to over the window,
 * the figures behind that in boxes of their own, and every day it lands on.
 *
 * The facts used to be a two-column table, each label at the far left and its
 * value at the far right of a wide dialog, so the eye crossed the whole width
 * for every line. Boxes put each label on top of its own figure.
 *
 * The one thing that can be changed here is whether the row counts — the same
 * eye as on the list.
 */
export function PlanRowSheet({
  row,
  facts,
  group,
  share,
  dates,
  formatCurrency,
  dateFmt,
  onToggle,
  onClose,
}: {
  row: PlanRow;
  facts: RowFact[];
  /** Where it comes from: «Πάγια», «Στόχοι»… */
  group?: string;
  /** Its part of everything on its side of the plan, 0–100; undefined when there is nothing to compare with. */
  share?: number;
  dates: RowDate[];
  formatCurrency: (n: number) => string;
  dateFmt: Intl.DateTimeFormat;
  onToggle: () => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const out = row.total < 0 || (row.total === 0 && row.kind !== "income" && row.source !== "income" && row.source !== "oneoff");
  const signed = (n: number) => `${n > 0 ? "+" : n < 0 ? "−" : ""}${formatCurrency(Math.abs(n))}`;
  const tone = !row.enabled ? undefined : out ? "var(--color-expense-text)" : "var(--color-income-text)";

  return (
    <Modal isOpen toggle={onClose} centered scrollable>
      <ModalHeader toggle={onClose}>
        <span className="d-flex align-items-center gap-2 flex-wrap" style={{ fontSize: 15 }}>
          {row.label}
          {group && <span className={styles.sheetGroupChip}>{group}</span>}
        </span>
      </ModalHeader>
      <ModalBody>
        {/* What it comes to over the window, and whether it is counted at all. */}
        <div className={styles.rowHero}>
          <div>
            <div className={styles.rowHeroLabel}>{facts[0]?.[0]}</div>
            <div className={styles.rowHeroValue} style={{ color: tone }}>
              {row.enabled ? signed(row.total) : t("planner.offRow")}
            </div>
          </div>
          <span className={`${styles.rowStatus} ${row.enabled ? styles.rowStatusOn : ""}`}>
            {row.enabled ? <FiEye size={13} aria-hidden /> : <FiEyeOff size={13} aria-hidden />} {t(row.enabled ? "planner.rowCounted" : "planner.rowNotCounted")}
          </span>
        </div>

        {share !== undefined && row.enabled && (
          <div className={styles.rowShare}>
            <div className={styles.rowShareBar} aria-hidden>
              <span style={{ width: `${Math.min(Math.max(share, 0), 100)}%`, background: out ? "var(--color-expense)" : "var(--color-income)" }} />
            </div>
            <span>{t(out ? "planner.shareOfOut" : "planner.shareOfIn", { pct: Math.round(share) })}</span>
          </div>
        )}

        <div className={styles.factGrid}>
          {facts.slice(1).map(([label, value]) => (
            <div key={label} className={styles.factBox}>
              <span className={styles.factBoxLabel}>{label}</span>
              <span className={styles.factBoxValue}>{value}</span>
            </div>
          ))}
        </div>

        {dates.length > 0 && (
          <>
            <div className={styles.rowDatesTitle}>{t("planner.rowDates", { count: dates.length })}</div>
            <ul className={styles.rowDates}>
              {dates.slice(0, DATES_SHOWN).map((d) => (
                <li key={d.date.getTime()}>
                  <span>
                    {dateFmt.format(d.date)}
                    {d.late && <span className={styles.rowLate}>{t("planner.rowLate")}</span>}
                  </span>
                  <strong style={{ color: d.amount < 0 ? "var(--color-expense-text)" : "var(--color-income-text)" }}>{signed(d.amount)}</strong>
                </li>
              ))}
            </ul>
            {dates.length > DATES_SHOWN && <p className={styles.rowMore}>{t("planner.rowMoreDates", { count: dates.length - DATES_SHOWN })}</p>}
          </>
        )}
      </ModalBody>
      <ModalFooter>
        <Button color={row.enabled ? "secondary" : "primary"} outline={row.enabled} className="w-100 d-inline-flex align-items-center justify-content-center gap-2" onClick={onToggle}>
          {row.enabled ? <FiEyeOff size={15} aria-hidden /> : <FiEye size={15} aria-hidden />}
          {t(row.enabled ? "planner.rowTakeOut" : "planner.rowPutIn")}
        </Button>
      </ModalFooter>
    </Modal>
  );
}

export default PlanRowSheet;
