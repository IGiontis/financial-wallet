import { useState } from "react";
import { Button, Input, InputGroup, InputGroupText, ListGroup, ListGroupItem, Modal, ModalBody, ModalHeader } from "reactstrap";
import { useTranslation } from "react-i18next";
import { FiCalendar, FiCheck, FiEdit3, FiRotateCcw, FiSkipForward } from "react-icons/fi";

import { DateField } from "../../../shared/components/DateField";
import { toISODay } from "../../../shared/utils/dates";
import { parseAmount } from "../../accounts/accountsUtils";
import { daysLate, type OccurrenceOverride, type ResolvedOccurrence } from "../plannerActuals";

/**
 * One salary, one instalment, one rent — and what actually happened to it.
 *
 * Every action here is about this occurrence alone: the next pay day stays on
 * the 30th whatever is said about this one. That is the promise that makes it
 * safe to tap, and the sheet says it in so many words.
 *
 * Nothing asks for arithmetic. "It came" takes today and the expected amount
 * unless told otherwise; a different day or amount is picked, not worked out.
 */
export default function OccurrenceSheet({
  occurrence,
  label,
  override,
  baseCurrency,
  formatCurrency,
  dateFmt,
  onSave,
  onClose,
}: {
  occurrence: ResolvedOccurrence;
  /** Translated — the salary's own label is a row id. */
  label: string;
  override?: OccurrenceOverride;
  baseCurrency: string;
  formatCurrency: (n: number) => string;
  dateFmt: Intl.DateTimeFormat;
  /** Undefined clears what the user had said, back to what the records show. */
  onSave: (override: OccurrenceOverride | undefined) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const outgoing = occurrence.amount < 0;
  const expectedAmount = Math.abs(occurrence.plannedAmount || occurrence.amount);
  const [editing, setEditing] = useState<"date" | "amount" | null>(null);
  const [date, setDate] = useState(() => toISODay(occurrence.plannedDate ?? occurrence.date));
  const [amount, setAmount] = useState("");
  const parsedAmount = parseAmount(amount);

  const open = occurrence.status === "due" || occurrence.status === "late";
  // The same override, with this one thing changed — a moved salary keeps a changed amount.
  const keep = (patch: OccurrenceOverride): OccurrenceOverride => ({ ...(override?.state === "waiting" ? { state: "waiting" as const } : {}), date: override?.date, amount: override?.amount, ...patch });

  const status = (() => {
    if (occurrence.status === "received" && occurrence.matched) {
      const m = occurrence.matched;
      const values = { label: m.label, date: dateFmt.format(m.date), amount: formatCurrency(Math.abs(m.amount)) };
      return m.manual ? t(outgoing ? "planner.occMarkedPaid" : "planner.occMarkedArrived", values) : t("planner.occMatched", values);
    }
    if (occurrence.status === "skipped") return t(outgoing ? "planner.occSkippedPaid" : "planner.occSkipped");
    if (occurrence.status === "late") return t("planner.occLateNote", { count: daysLate(occurrence) });
    return undefined;
  })();

  return (
    <Modal isOpen toggle={onClose} centered fullscreen="sm">
      <ModalHeader toggle={onClose}>
        <span className="d-block">{label}</span>
        <span className="d-block small fw-normal text-body-secondary">
          {t("planner.occExpected", { date: dateFmt.format(occurrence.date), amount: formatCurrency(Math.abs(occurrence.amount)) })}
        </span>
      </ModalHeader>
      <ModalBody>
        {status && <p className="small mb-3" style={{ color: occurrence.status === "received" ? "var(--color-income-text)" : occurrence.status === "late" ? "var(--color-goal-text)" : undefined }}>{status}</p>}

        <ListGroup>
          {open && (
            <ListGroupItem action tag="button" type="button" className="d-flex align-items-center gap-2 py-3" onClick={() => onSave({ state: "received", date: toISODay(new Date()), amount: expectedAmount })}>
              <FiCheck size={18} className="text-success flex-shrink-0" aria-hidden />
              <span>
                <span className="d-block fw-semibold">{t(outgoing ? "planner.occPaid" : "planner.occArrived")}</span>
                <span className="d-block small text-body-secondary">{t("planner.occArrivedHint", { amount: formatCurrency(expectedAmount) })}</span>
                {/* Marking it come takes it out of what is still expected; it
                    only shows up in "what you have now" once it is recorded or
                    the banks are read again. Said, rather than left to surprise. */}
                <span className="d-block small text-body-secondary">{t(outgoing ? "planner.occPaidNote" : "planner.occArrivedNote")}</span>
              </span>
            </ListGroupItem>
          )}

          {open && (
            <ListGroupItem className="py-3">
              <button type="button" className="btn btn-link p-0 text-decoration-none text-body d-flex align-items-center gap-2 w-100 text-start" onClick={() => setEditing(editing === "date" ? null : "date")} aria-expanded={editing === "date"}>
                <FiCalendar size={18} className="text-primary flex-shrink-0" aria-hidden />
                <span className="fw-semibold">{t(outgoing ? "planner.occOtherDayPaid" : "planner.occOtherDay")}</span>
              </button>
              {editing === "date" && (
                <div className="d-flex gap-2 mt-2">
                  <div className="flex-grow-1">
                    <DateField value={date} onChange={setDate} />
                  </div>
                  <Button color="primary" disabled={!date} onClick={() => onSave(keep({ date }))}>
                    {t("common.save")}
                  </Button>
                </div>
              )}
            </ListGroupItem>
          )}

          {open && (
            <ListGroupItem className="py-3">
              <button type="button" className="btn btn-link p-0 text-decoration-none text-body d-flex align-items-center gap-2 w-100 text-start" onClick={() => setEditing(editing === "amount" ? null : "amount")} aria-expanded={editing === "amount"}>
                <FiEdit3 size={18} className="text-primary flex-shrink-0" aria-hidden />
                <span className="fw-semibold">{t("planner.occOtherAmount")}</span>
              </button>
              {editing === "amount" && (
                <div className="d-flex gap-2 mt-2">
                  <InputGroup>
                    <Input type="text" inputMode="decimal" autoComplete="off" placeholder={String(expectedAmount).replace(".", ",")} value={amount} onChange={(e) => setAmount(e.target.value)} style={{ fontSize: 16 }} aria-label={t("planner.occOtherAmount")} />
                    <InputGroupText>{baseCurrency}</InputGroupText>
                  </InputGroup>
                  <Button color="primary" disabled={parsedAmount === undefined || parsedAmount <= 0} onClick={() => parsedAmount && onSave(keep({ amount: parsedAmount }))}>
                    {t("common.save")}
                  </Button>
                </div>
              )}
            </ListGroupItem>
          )}

          {open && (
            <ListGroupItem action tag="button" type="button" className="d-flex align-items-center gap-2 py-3" onClick={() => onSave({ state: "skipped" })}>
              <FiSkipForward size={18} className="text-body-secondary flex-shrink-0" aria-hidden />
              <span className="fw-semibold">{t(outgoing ? "planner.occSkipPaid" : "planner.occSkip")}</span>
            </ListGroupItem>
          )}

          {/* The records said it came, and they were wrong. Not for a record
              written with «Ήρθε» for this very time: that is undone on «Έσοδα»,
              by undoing the record. */}
          {occurrence.status === "received" && occurrence.matched && !occurrence.matched.manual && !occurrence.matched.recorded && (
            <ListGroupItem action tag="button" type="button" className="d-flex align-items-center gap-2 py-3" onClick={() => onSave({ state: "waiting" })}>
              <FiRotateCcw size={18} className="text-body-secondary flex-shrink-0" aria-hidden />
              <span className="fw-semibold">{t("planner.occNotThis")}</span>
            </ListGroupItem>
          )}

          {override && (
            <ListGroupItem action tag="button" type="button" className="d-flex align-items-center gap-2 py-3" onClick={() => onSave(undefined)}>
              <FiRotateCcw size={18} className="text-danger flex-shrink-0" aria-hidden />
              <span className="fw-semibold">{t("planner.occReset")}</span>
            </ListGroupItem>
          )}
        </ListGroup>

        <p className="small text-body-secondary mt-3 mb-0">{t("planner.occOnlyThisTime")}</p>
      </ModalBody>
    </Modal>
  );
}
