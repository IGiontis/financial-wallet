import { Fragment, useId, useMemo, useState, type ReactNode } from "react";
import { Button, FormFeedback, FormGroup, Input, Label, Modal, ModalBody, ModalFooter, ModalHeader } from "reactstrap";
import { useTranslation } from "react-i18next";
import { toast } from "react-toastify";
import { FiPlus, FiX } from "react-icons/fi";
import { DeleteButton } from "../../shared/components/DeleteButton";
import { FORM_MODAL } from "../../shared/components/formModal";
import { NameCheck } from "../../shared/components/NameCheck";
import { RequiredMark } from "../../shared/components/RequiredMark";
import { celebrateSave } from "../../shared/feedback/saveFeedback";
import { useOfflineGuard } from "../../shared/hooks/useOfflineGuard";
import { useCurrencyConverter } from "../../shared/hooks/useCurrencyConverter";
import { cleanLine } from "../../shared/utils/cleanText";
import { matchName, matchNameIn } from "../../shared/utils/nameMatch";
import { WizardSteps } from "../transactions/components/WizardSteps";
import type { Business, BusinessEntry } from "../../shared/types/IndexTypes";
import { LINES_MAX } from "./businessKeys";
import { activeLines } from "./businessFormat";
import { buildBusiness, clashingRows, filledLines, INCOME_LINES_MIN, linesReady, removedLines, type LineDraft } from "./businessEdit";
import { lineUses } from "./businessSummary";
import { newBusinessId, newLineId, useBusinesses } from "./useBusiness";
import styles from "./css/Business.module.css";
import wiz from "../../shared/css/Wizard.module.css";
import { useFormChanged } from "../../shared/hooks/useFormChanged";
import { UnchangedHint } from "../../shared/components/UnchangedHint";

// «Νέα δουλειά» / its correction: the name, its income lines (at least one —
// the first row has no ✕, so a business always keeps a line to write a day's
// takings in, 0 € included), its expense lines (none is fine), and the check —
// Save only there. All of it
// typed by the user, nothing offered ready-made. A rename of the business or of
// a line reaches every closing without touching one (they name lines by id).
// A line that closings use, taken off, says how many and what happens to them
// before the save. Stored on the user document: one write, no read.

const STEPS = ["name", "incomes", "expenses", "review"] as const;
type Step = (typeof STEPS)[number];
const NAME_MAX = 80;

interface Row extends LineDraft {
  key: number;
}

const rowsOf = (lines: { id: string; name: string }[]): Row[] => lines.map((l, i) => ({ key: i, id: l.id, name: l.name }));
const nextKey = (rows: readonly Row[]) => Math.max(-1, ...rows.map((r) => r.key)) + 1;
/** The rows a list starts with: the stored lines, or one empty row to type in. */
const startRows = (lines: { id: string; name: string }[]): Row[] => (lines.length > 0 ? rowsOf(lines) : [{ key: 0, name: "" }]);

export default function BusinessWizard({ business, entries, entriesLoaded, onClose, onDelete }: { business?: Business; entries: readonly BusinessEntry[]; entriesLoaded: boolean; onClose: () => void; onDelete?: () => void }) {
  const { t } = useTranslation();
  const { format, displayCurrency } = useCurrencyConverter();
  const [businesses, setBusinesses] = useBusinesses();
  const guard = useOfflineGuard("settings");
  const deleteGuard = useOfflineGuard("delete");
  const nameId = useId();
  const editing = !!business;
  const uses = useMemo(() => lineUses(entries.filter((e) => e.businessId === business?.id)), [entries, business?.id]);

  const [step, setStep] = useState<Step>(editing ? "review" : "name");
  const [tried, setTried] = useState<Set<Step>>(new Set());
  const [name, setName] = useState(business?.name ?? "");
  const [incomes, setIncomes] = useState<Row[]>(() => startRows(business ? activeLines(business.incomeLines) : []));
  const [expenses, setExpenses] = useState<Row[]>(() => (business ? rowsOf(activeLines(business.expenseLines)) : [{ key: 0, name: "" }]));
  const [id] = useState(() => business?.id ?? newBusinessId());

  // ── What has been typed, checked ──
  const typed = cleanLine(name);
  const nameMatch = matchName(typed, businesses, (b) => [b.name], businesses.find((b) => b.id === business?.id));
  const nameOk = !!typed && typed.length <= NAME_MAX && nameMatch?.kind !== "same";
  const incomesOk = linesReady(incomes, INCOME_LINES_MIN, LINES_MAX, NAME_MAX);
  const expensesOk = linesReady(expenses, 0, LINES_MAX, NAME_MAX);
  const goneIncomes = business ? removedLines(business.incomeLines, incomes, uses) : [];
  const goneExpenses = business ? removedLines(business.expenseLines, expenses, uses) : [];

  const built = buildBusiness(business, { id, name, incomes, expenses }, uses, entriesLoaded, newLineId);
  // «No change, no Save»: the business as it would be stored, against the one
  // opened — by meaning, not by text (`useFormChanged`; JSON text differed on
  // the order of a line's fields alone).
  const { unchanged } = useFormChanged(business, built);
  const changed = !unchanged;
  const ready = nameOk && incomesOk && expensesOk;

  const index = STEPS.indexOf(step);
  const mark = (s: Step) => setTried((prev) => new Set(prev).add(s));
  const goTo = (target: Step) => {
    const at = STEPS.indexOf(target);
    if (at > 0 && !nameOk) {
      mark("name");
      return setStep("name");
    }
    if (at > 1 && !incomesOk) {
      mark("incomes");
      return setStep("incomes");
    }
    if (at > 2 && !expensesOk) {
      mark("expenses");
      return setStep("expenses");
    }
    setStep(target);
  };

  const submit = () => {
    if (!ready) return goTo("review");
    if (!changed || guard.locked) return;
    setBusinesses((previous) => (previous.some((b) => b.id === id) ? previous.map((b) => (b.id === id ? built : b)) : [...previous, built]));
    celebrateSave({ collection: "businesses", id: editing ? id : undefined });
    toast.success(t(editing ? "business.businessSaved" : "business.businessMade", { name: built.name }));
    onClose();
  };

  /** One list of line names: a field per line, ✕ to take one off, «+» for another. */
  const lineList = (kind: "incomes" | "expenses", rows: Row[], setRows: (next: Row[]) => void) => {
    const clash = clashingRows(rows);
    const placeholder = t(kind === "incomes" ? "business.incomeLinePlaceholder" : "business.expenseLinePlaceholder");
    const gone = kind === "incomes" ? goneIncomes : goneExpenses;
    return (
      <>
        <ul className={styles.nameRows}>
          {rows.map((row, i) => {
            const others = rows.filter((r) => r.key !== row.key).map((r) => cleanLine(r.name));
            const match = matchNameIn(cleanLine(row.name), others);
            // The first income line stays: a business always has one (it can be 0 € on a day).
            const fixed = kind === "incomes" && i === 0;
            return (
              <li key={row.key}>
                <div className={styles.nameRow}>
                  <Input
                    aria-label={t(kind === "incomes" ? "business.incomeLineN" : "business.expenseLineN", { n: i + 1 })}
                    value={row.name}
                    maxLength={NAME_MAX}
                    placeholder={placeholder}
                    invalid={tried.has(kind) && clash.has(i)}
                    autoFocus={!editing && i === rows.length - 1 && rows.length > 1}
                    onChange={(e) => setRows(rows.map((r) => (r.key === row.key ? { ...r, name: e.target.value } : r)))}
                  />
                  {fixed ? (
                    // The ✕'s room, kept empty so every field lines up.
                    <span className={styles.lineFixed} aria-hidden />
                  ) : (
                    <button type="button" className={styles.lineRemove} onClick={() => setRows(rows.filter((r) => r.key !== row.key))} aria-label={t("business.lineRemove", { n: i + 1 })} title={t("business.lineRemove", { n: i + 1 })}>
                      <FiX aria-hidden />
                    </button>
                  )}
                </div>
                {cleanLine(row.name) && <NameCheck match={match} onUse={match?.kind === "similar" && !fixed ? () => setRows(rows.filter((r) => r.key !== row.key)) : undefined} />}
              </li>
            );
          })}
        </ul>
        <Button type="button" color="primary" outline size="sm" onClick={() => setRows([...rows, { key: nextKey(rows), name: "" }])} disabled={filledLines(rows).length >= LINES_MAX} className="d-inline-flex align-items-center gap-1">
          <FiPlus aria-hidden /> {t(kind === "incomes" ? "business.addIncomeLine" : "business.addExpenseLine")}
        </Button>
        {tried.has(kind) && !(kind === "incomes" ? incomesOk : expensesOk) && (
          <div className="invalid-feedback d-block mt-2">{t(kind === "incomes" && filledLines(rows).length === 0 ? "business.incomeLineNeeded" : "business.lineNamesClash")}</div>
        )}
        {gone.length > 0 && (
          <div className={`${wiz.wizNote} mt-3`} role="status">
            {gone.map(({ line, uses: n }) => (
              <p key={line.id} className="mb-1 d-flex flex-wrap align-items-baseline gap-2">
                <span className="flex-grow-1" style={{ minWidth: 0 }}>
                  {n > 0 ? t("business.lineGoesUsed", { name: line.name, count: n }) : t("business.lineGoes", { name: line.name })}
                </span>
                <button type="button" className={styles.linkButton} onClick={() => setRows([...rows.filter((r) => cleanLine(r.name) || r.id), { key: nextKey(rows), id: line.id, name: line.name }])}>
                  {t("business.lineKeep")}
                </button>
              </p>
            ))}
          </div>
        )}
      </>
    );
  };

  // ── The check ──
  const row = (target: Step, label: string, value: ReactNode, className = "") => (
    <button type="button" className={wiz.wizRow} onClick={() => goTo(target)}>
      <span className={wiz.wizLabel}>{label}</span>
      <span className={`${wiz.wizValue} ${className}`}>{value}</span>
    </button>
  );
  const linesReview = (kind: "incomes" | "expenses", rows: Row[]) => {
    const stored = (kind === "incomes" ? business?.incomeLines : business?.expenseLines) ?? [];
    const filled = filledLines(rows);
    const gone = kind === "incomes" ? goneIncomes : goneExpenses;
    const title = t(kind === "incomes" ? "business.incomeLines" : "business.expenseLines");
    return (
      <div className={`${wiz.wizCard} mt-3`} role="group" aria-label={title}>
        <div className={styles.sideHead}>{title}</div>
        {filled.length === 0 && row(kind, "—", t("business.noExpenseLines"))}
        {filled.map((line, i) => {
          const before = stored.find((l) => l.id === line.id);
          const label = before && before.name !== line.name ? (
            <>
              <s className={styles.was}>{before.name} →</s>
              {line.name}
            </>
          ) : (
            line.name
          );
          return <Fragment key={line.id ?? `new-${i}`}>{row(kind, t("business.lineN", { n: i + 1 }), <>{label}{!before && editing ? ` · ${t("business.newTag")}` : ""}</>)}</Fragment>;
        })}
        {gone.map(({ line }) => (
          <Fragment key={line.id}>{row(kind, t("business.lineRemovedLabel"), <s className="text-body-secondary">{line.name}</s>)}</Fragment>
        ))}
      </div>
    );
  };
  const goneUsed = [...goneIncomes, ...goneExpenses].filter((g) => g.uses > 0);

  return (
    <Modal {...FORM_MODAL} isOpen toggle={onClose} centered scrollable>
      <ModalHeader toggle={onClose}>{t(editing ? "business.editBusinessTitle" : "business.newBusiness")}</ModalHeader>
      <form
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          if (step === "review") submit();
          else goTo(STEPS[index + 1]);
        }}
      >
        <ModalBody>
          <WizardSteps steps={STEPS} current={step} onGo={goTo} open={editing} label={(s) => t(`business.bstep_${s}`)} />
          <div className="fw-semibold mb-1" style={{ fontSize: "var(--fs-lead)" }}>
            {t(`business.bask_${step}`)}
            {step === "incomes" && <RequiredMark />}
          </div>
          <p className="small text-body-secondary mb-3">{t(`business.bhint_${step}`, { amount: format(0, displayCurrency) })}</p>

          {step === "name" && (
            <FormGroup className="mb-0">
              <Label for={nameId} className="small fw-medium mb-1">
                {t("common.name")}
                <RequiredMark />
              </Label>
              <Input
                id={nameId}
                aria-required
                autoFocus={!editing}
                value={name}
                maxLength={NAME_MAX}
                placeholder={t("business.namePlaceholder")}
                invalid={tried.has("name") && !nameOk}
                onChange={(e) => setName(e.target.value)}
              />
              {!typed && <FormFeedback>{t("business.nameNeeded")}</FormFeedback>}
              {typed && <NameCheck match={nameMatch} />}
            </FormGroup>
          )}

          {step === "incomes" && lineList("incomes", incomes, setIncomes)}
          {step === "expenses" && lineList("expenses", expenses, setExpenses)}

          {step === "review" && (
            <>
              <div className={wiz.wizCard}>
                {row(
                  "name",
                  t("common.name"),
                  business && business.name !== typed ? (
                    <>
                      <s className={styles.was}>{business.name} →</s>
                      {typed}
                    </>
                  ) : (
                    typed || "—"
                  ),
                )}
              </div>
              {linesReview("incomes", incomes)}
              {linesReview("expenses", expenses)}
              {goneUsed.length > 0 && (
                <div className={`${wiz.wizNote} mt-3`}>
                  {goneUsed.map(({ line, uses: n }) => (
                    <p key={line.id} className="mb-1">
                      {t("business.lineGoesUsed", { name: line.name, count: n })}
                    </p>
                  ))}
                </div>
              )}
              {business && typed !== business.name && <div className={`${wiz.wizNote} mt-3`}>{t("business.renameKeepsRecords", { name: business.name })}</div>}
              <div className={`${wiz.wizNote} mt-3`}>{changed ? t("business.businessReviewNote") : t("business.nothingChanged")}</div>
            </>
          )}
        </ModalBody>

        <ModalFooter className="justify-content-between">
          <div className="d-flex gap-2">
            {editing && onDelete && <DeleteButton opensConfirm iconOnly onClick={onDelete} disabled={deleteGuard.locked} title={deleteGuard.reason} />}
            {index === 0 || (editing && step === "review") ? (
              <Button type="button" color="secondary" outline onClick={onClose}>
                {t("common.cancel")}
              </Button>
            ) : (
              <Button type="button" color="secondary" outline onClick={() => setStep(STEPS[index - 1])}>
                ‹ {t("common.back")}
              </Button>
            )}
          </div>
          {step === "review" ? (
            <div className="d-flex align-items-center gap-2">
              <UnchangedHint show={unchanged} />
              <Button type="submit" color="primary" disabled={!changed || !ready || guard.locked} title={guard.reason}>
                {t("common.save")}
              </Button>
            </div>
          ) : (
            <Button type="submit" color="primary">
              {t("common.next")} ›
            </Button>
          )}
        </ModalFooter>
      </form>
    </Modal>
  );
}
