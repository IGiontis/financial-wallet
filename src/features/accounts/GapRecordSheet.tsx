import { useMemo, useRef, useState } from "react";
import { useRunOnce } from "../../shared/hooks/useRunOnce";
import { saveWithoutWaiting } from "../../shared/utils/saveWithoutWaiting";
import { toast } from "react-toastify";
import { celebrateSave } from "../../shared/feedback/saveFeedback";
import { Button, FormGroup, Input, InputGroup, InputGroupText, Label, Modal, ModalBody, ModalHeader } from "reactstrap";
import { useTranslation } from "react-i18next";
import { FiEdit2, FiX } from "react-icons/fi";
import type { Category } from "../../shared/types/IndexTypes";
import { categoryLabel } from "../../shared/utils/categories";
import { parseISODay, toISODay, dateFormat } from "../../shared/utils/dates";
import { DateField } from "../../shared/components/DateField";
import { FORM_MODAL } from "../../shared/components/formModal";
import { DialogFooter } from "../../shared/components/DialogFooter";
import { WizardSteps } from "../transactions/components/WizardSteps";
import { useAuth } from "../../shared/hooks/useAuth";
import { useDebts } from "../debts/useDebts";
import { parseAmount, type MoneyAccount } from "./accountsUtils";
import { GAP_KINDS, gapEffect, gapOverrun, gapRecordProblem, gapRemaining, gapWrites, type GapKind, type GapRecord } from "./gapRecords";
import { gapNewId, useSaveGapRecords } from "./useGapRecords";
import styles from "./css/AccountsPage.module.css";
import { RequiredMark } from "../../shared/components/RequiredMark";

const STEPS = ["1", "2"] as const;
type Step = (typeof STEPS)[number];

interface Draft {
  kind: GapKind;
  amount: string;
  date: string;
  categoryId: string;
  description: string;
  person: string;
  debtId: string;
  otherAccountId: string;
}

/**
 * «Ξέρεις πού πήγαν;», asked in the middle of reading the banks.
 *
 * An account reads differently from what the app expected: money that left,
 * or arrived, without being written down. The owner lists what he remembers of
 * it, one record after another — an expense, an income, money lent or
 * borrowed, a debt paid back, money moved to or from another of his accounts —
 * each with its own day, while a counter says how much is still unexplained.
 * A check lists them all, and Save writes them together (`gapWrites`,
 * `saveGapRecords`). What is left over stays the reading's «χωρίς εγγραφή».
 *
 * Bill payments and goal deposits are not offered: each is written by its own
 * screen together with what it settles, and is recorded there.
 */
export default function GapRecordSheet({
  accountId,
  accountName,
  change,
  categories,
  accounts,
  earliest,
  baseCurrency,
  formatCurrency,
  onClose,
  now,
}: {
  accountId: string;
  accountName: string;
  /** What the reading found beyond what was expected: negative when money went missing. */
  change: number;
  categories: Category[];
  accounts: MoneyAccount[];
  /** "YYYY-MM-DD": the last reading's day. A record before it would explain nothing — that reading held it. */
  earliest?: string;
  baseCurrency: string;
  formatCurrency: (n: number) => string;
  onClose: () => void;
  now?: Date;
}) {
  const { t, i18n } = useTranslation();
  const lang = i18n.resolvedLanguage ?? "en";
  const { currentUser } = useAuth();
  const { data: allDebts = [] } = useDebts();
  const save = useSaveGapRecords();
  const today = useMemo(() => toISODay(now ?? new Date()), [now]);
  const openDebts = useMemo(() => allDebts.filter((d) => !d.isSettled), [allDebts]);
  const others = accounts.filter((a) => a.id !== accountId);
  const kinds = GAP_KINDS.filter((k) => (k === "repaid" ? openDebts.length > 0 : k === "transferOut" || k === "transferIn" ? others.length > 0 : true));
  const people = useMemo(() => [...new Set(allDebts.map((d) => d.person))].sort(), [allDebts]);
  const asInput = useMemo(() => {
    const fmt = new Intl.NumberFormat(lang, { minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: false });
    return (n: number) => fmt.format(n);
  }, [lang]);

  const [records, setRecords] = useState<GapRecord[]>([]);
  // Each listed record's own key: a running number, never reused within the sheet.
  const seq = useRef(0);
  const remaining = gapRemaining(change, records, openDebts);
  const fresh = (left: number): Draft => ({
    kind: left < 0 ? "expense" : "income",
    amount: Math.abs(left) >= 0.005 ? asInput(Math.abs(left)) : "",
    date: today,
    categoryId: "",
    description: "",
    person: "",
    debtId: "",
    otherAccountId: "",
  });
  const [draft, setDraft] = useState<Draft>(() => fresh(change));
  const [tried, setTried] = useState(false);
  const [step, setStep] = useState<Step>("1");
  const [failed, setFailed] = useState(false);

  const signed = (n: number) => `${n > 0 ? "+" : n < 0 ? "−" : ""}${formatCurrency(Math.abs(n))}`;
  const dayFmt = dateFormat("dayShort", lang);
  const categoryName = (id: string) => categoryLabel(categories.find((c) => c.id === id)?.name, t);
  const accountNameOf = (id: string) => accounts.find((a) => a.id === id)?.name ?? "";
  const options = categories
    .filter((c) => c.type === (draft.kind === "income" ? "income" : "expense"))
    .sort((a, b) => categoryLabel(a.name, t).localeCompare(categoryLabel(b.name, t)));

  const candidate: Omit<GapRecord, "key"> = {
    kind: draft.kind,
    amount: parseAmount(draft.amount) ?? 0,
    date: draft.date,
    ...(draft.kind === "expense" || draft.kind === "income" ? { categoryId: draft.categoryId || undefined } : {}),
    ...(draft.description.trim() ? { description: draft.description.trim() } : {}),
    ...(draft.kind === "lent" || draft.kind === "borrowed" ? { person: draft.person } : {}),
    ...(draft.kind === "repaid" ? { debtId: draft.debtId || undefined } : {}),
    ...(draft.kind === "transferOut" || draft.kind === "transferIn" ? { otherAccountId: draft.otherAccountId || undefined } : {}),
  };
  const problem = gapRecordProblem(candidate, { earliest, today, accountId, debts: openDebts, accounts });
  const afterThis = problem ? undefined : gapRemaining(remaining, [{ ...candidate, key: "draft" }], openDebts);

  const add = () => {
    if (problem) {
      setTried(true);
      return;
    }
    const next = [...records, { ...candidate, key: `r${(seq.current += 1)}` }];
    setRecords(next);
    setDraft(fresh(gapRemaining(change, next, openDebts)));
    setTried(false);
  };
  const remove = (key: string) => setRecords(records.filter((r) => r.key !== key));
  const edit = (record: GapRecord) => {
    remove(record.key);
    setDraft({
      kind: record.kind,
      amount: asInput(record.amount),
      date: record.date,
      categoryId: record.categoryId ?? "",
      description: record.description ?? "",
      person: record.person ?? "",
      debtId: record.debtId ?? "",
      otherAccountId: record.otherAccountId ?? "",
    });
  };

  const describe = (r: GapRecord) => {
    const what =
      r.kind === "expense" || r.kind === "income"
        ? categoryName(r.categoryId!)
        : r.kind === "lent" || r.kind === "borrowed"
          ? r.person!
          : r.kind === "repaid"
            ? (openDebts.find((d) => d.id === r.debtId)?.person ?? "")
            : accountNameOf(r.otherAccountId!);
    return [t(`accounts.gap.kind_${r.kind}`), what, r.description].filter(Boolean).join(" · ");
  };

  // Runs once and never waits for the server (`saveWithoutWaiting`): the
  // records are on screen at once and the sheet closes with the toast; a
  // refusal later puts them back and says so.
  const [run, running] = useRunOnce();
  const working = running;
  const close = () => {
    if (!working) onClose();
  };
  const submit = () => void run(saveAll);
  const saveAll = () => {
    if (records.length === 0) return;
    setFailed(false);
    try {
      const writes = gapWrites(records, {
        accountId,
        today,
        lastReadingDay: earliest,
        userId: currentUser?.uid ?? "",
        debts: openDebts,
        accountName: accountNameOf,
        categoryName,
        newId: gapNewId,
      });
      void saveWithoutWaiting(save, writes, () => toast.error(t("accounts.gap.failed")), [["accounts", accountId]]);
      // The records land on this account: its card rings once the sheet has gone.
      celebrateSave({ collection: "accounts", id: accountId });
      toast.success(t("toasts.gapRecordsSaved", { count: records.length }));
      onClose();
    } catch {
      setFailed(true);
      toast.error(t("accounts.gap.failed"));
    }
  };

  const overrun = gapOverrun(change, remaining);
  const counter = (
    <div className={styles.gapCounter} aria-live="polite">
      <span>{t("accounts.gap.leftUnlogged")}</span>
      <span className={styles.gapFigure}>{signed(remaining)}</span>
    </div>
  );
  const overrunNote = overrun && <div className="alert alert-warning small py-2 px-3 mb-0 mt-2">{t("accounts.gap.overrun", { amount: signed(remaining) })}</div>;

  const list = (editable: boolean) =>
    records.length > 0 && (
      <ul className={styles.gapList} aria-label={t("accounts.gap.listLabel")}>
        {records.map((r) => (
          <li key={r.key}>
            <span className={styles.gapWhat}>
              {describe(r)}
              <span className="d-block small text-body-secondary">{dayFmt.format(parseISODay(r.date)!)}</span>
            </span>
            <span className={styles.gapFigure}>{signed(gapEffect(r, openDebts))}</span>
            {editable && (
              <span className="d-flex gap-1">
                <Button color="link" size="sm" className="p-1" onClick={() => edit(r)} aria-label={t("accounts.gap.editOne", { what: describe(r) })}>
                  <FiEdit2 size={14} aria-hidden />
                </Button>
                <Button color="link" size="sm" className="p-1 text-danger" onClick={() => remove(r.key)} aria-label={t("accounts.gap.removeOne", { what: describe(r) })}>
                  <FiX size={15} aria-hidden />
                </Button>
              </span>
            )}
          </li>
        ))}
      </ul>
    );

  return (
    <Modal {...FORM_MODAL} isOpen toggle={close} keyboard={!working} centered scrollable fullscreen="sm">
      <ModalHeader toggle={working ? undefined : close}>{t(change < 0 ? "accounts.gap.titleOut" : "accounts.gap.titleIn", { amount: formatCurrency(Math.abs(change)) })}</ModalHeader>
      <ModalBody>
        <WizardSteps steps={STEPS} current={step} onGo={(s) => (s === "2" && records.length === 0 ? undefined : setStep(s))} label={(s) => t(`accounts.gap.stepShort${s}`)} />
        {step === "1" && (
          <>
            <p className="small text-body-secondary">{t("accounts.gap.hintMany", { account: accountName })}</p>
            {list(true)}
            {counter}
            {overrunNote}

            <fieldset className={styles.gapForm}>
              <legend className="small fw-semibold">{t(records.length === 0 ? "accounts.gap.firstOne" : "accounts.gap.nextOne")}</legend>
              <div className={styles.gapKinds} role="radiogroup" aria-label={t("accounts.gap.kindLabel")}>
                {kinds.map((k) => (
                  <button
                    key={k}
                    type="button"
                    role="radio"
                    aria-checked={draft.kind === k}
                    className={`btn btn-sm text-start ${draft.kind === k ? "btn-primary" : "btn-outline-secondary"}`}
                    onClick={() => setDraft({ ...draft, kind: k, categoryId: "" })}
                  >
                    {t(`accounts.gap.kind_${k}`)}
                  </button>
                ))}
              </div>

              {/* WHERE before HOW MUCH (owner, 2026-11-12): the other account of a move, then the amount. */}
              {(draft.kind === "transferOut" || draft.kind === "transferIn") && (
                <FormGroup className="mt-3">
                  <Label for="gap-other" className="small fw-medium">
                    {t(draft.kind === "transferOut" ? "accounts.gap.transferTo" : "accounts.gap.transferFrom")}
                    <RequiredMark />
                  </Label>
                  <Input id="gap-other" aria-required type="select" value={draft.otherAccountId} onChange={(e) => setDraft({ ...draft, otherAccountId: e.target.value })}>
                    <option value="">{t("accounts.gap.pickAccount")}</option>
                    {others.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name}
                      </option>
                    ))}
                  </Input>
                </FormGroup>
              )}

              <FormGroup className="mt-3">
                <Label for="gap-amount" className="small fw-medium">
                  {t("common.amount")}
                  <RequiredMark />
                </Label>
                <InputGroup>
                  <Input id="gap-amount" aria-required type="text" inputMode="decimal" autoComplete="off" value={draft.amount} invalid={tried && problem === "accounts.gap.needAmount"} onChange={(e) => setDraft({ ...draft, amount: e.target.value })} onFocus={(e) => e.currentTarget.select()} />
                  <InputGroupText>{baseCurrency}</InputGroupText>
                </InputGroup>
              </FormGroup>

              {(draft.kind === "expense" || draft.kind === "income") && (
                <FormGroup>
                  <Label for="gap-category" className="small fw-medium">
                    {t("common.category")}
                    <RequiredMark />
                  </Label>
                  <Input id="gap-category" aria-required type="select" value={draft.categoryId} onChange={(e) => setDraft({ ...draft, categoryId: e.target.value })}>
                    <option value="">{t("accounts.gap.pickCategory")}</option>
                    {options.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.icon ? `${c.icon} ` : ""}
                        {categoryLabel(c.name, t)}
                      </option>
                    ))}
                  </Input>
                </FormGroup>
              )}

              {(draft.kind === "lent" || draft.kind === "borrowed") && (
                <FormGroup>
                  <Label for="gap-person" className="small fw-medium">
                    {t("accounts.gap.person")}
                    <RequiredMark />
                  </Label>
                  <Input id="gap-person" aria-required list="gap-people" autoComplete="off" value={draft.person} onChange={(e) => setDraft({ ...draft, person: e.target.value })} />
                  <datalist id="gap-people">
                    {people.map((p) => (
                      <option key={p} value={p} />
                    ))}
                  </datalist>
                </FormGroup>
              )}

              {draft.kind === "repaid" && (
                <FormGroup>
                  <Label for="gap-debt" className="small fw-medium">
                    {t("accounts.gap.whichDebt")}
                    <RequiredMark />
                  </Label>
                  <Input id="gap-debt" aria-required type="select" value={draft.debtId} onChange={(e) => setDraft({ ...draft, debtId: e.target.value })}>
                    <option value="">{t("accounts.gap.pickDebt")}</option>
                    {openDebts.map((d) => (
                      <option key={d.id} value={d.id}>
                        {t(d.direction === "owed_to_me" ? "accounts.gap.debtOwedToMe" : "accounts.gap.debtOwedByMe", { who: d.person, amount: formatCurrency(d.remaining) })}
                        {d.label ? ` · ${d.label}` : ""}
                      </option>
                    ))}
                  </Input>
                </FormGroup>
              )}

              <FormGroup>
                <Label for="gap-date" className="small fw-medium">
                  {t("common.date")}
                  <RequiredMark />
                </Label>
                <DateField id="gap-date" name="gap-date" happened value={draft.date} onChange={(v) => setDraft({ ...draft, date: v })} minDate={earliest ? (parseISODay(earliest) ?? undefined) : undefined} maxDate={parseISODay(today) ?? undefined} />
              </FormGroup>

              <FormGroup className="mb-2">
                <Label for="gap-description" className="small fw-medium">
                  {t("accounts.gap.description")}
                </Label>
                <Input id="gap-description" value={draft.description} maxLength={80} autoComplete="off" onChange={(e) => setDraft({ ...draft, description: e.target.value })} />
              </FormGroup>

              {tried && problem && <p className="small text-danger mb-2">{t(problem)}</p>}
              {afterThis !== undefined && <p className="small text-body-secondary mb-2">{t("accounts.gap.afterThis", { amount: signed(afterThis) })}</p>}
              <Button color="primary" outline className="w-100" onClick={add}>
                {t("accounts.gap.addToList")}
              </Button>
            </fieldset>
          </>
        )}

        {step === "2" && (
          <>
            {list(false)}
            <dl className={styles.gapSums}>
              <dt>{t("accounts.gap.sumDifference")}</dt>
              <dd className={styles.gapFigure}>{signed(change)}</dd>
              <dt>{t("accounts.gap.sumRecords", { count: records.length })}</dt>
              <dd className={styles.gapFigure}>{signed(change - remaining)}</dd>
              <dt>{t("accounts.gap.leftUnlogged")}</dt>
              <dd className={styles.gapFigure}>{signed(remaining)}</dd>
            </dl>
            {overrunNote}
            {failed && <p className="small text-danger mt-3 mb-0">{t("accounts.gap.failed")}</p>}
          </>
        )}
      </ModalBody>
      {/* Ακύρωση / Πίσω on the left, the way forward on the right; a delete would go
            first on the left with the rule between them (rule 15b, `DialogFooter`). */}
      <DialogFooter
        back={
          step === "1" ? (
            <Button color="secondary" outline onClick={onClose}>
              {t("accounts.gap.skip")}
            </Button>
          ) : (
            <Button color="secondary" outline onClick={() => setStep("1")} disabled={working}>
              ‹ {t("common.back")}
            </Button>
          )
        }
      >
        {step === "1" ? (
          <Button color="primary" onClick={() => setStep("2")} disabled={records.length === 0}>
            {t("common.next")} ›
          </Button>
        ) : (
          <Button color="primary" onClick={submit} disabled={records.length === 0 || working} aria-busy={working || undefined}>
            {t("accounts.gap.saveAll", { count: records.length })}
          </Button>
        )}
      </DialogFooter>
    </Modal>
  );
}
