import { Fragment, useId, useState, type ReactNode } from "react";
import { Button, FormFeedback, FormGroup, Input, Label, Modal, ModalBody, ModalFooter, ModalHeader } from "reactstrap";
import { useTranslation } from "react-i18next";
import { toast } from "react-toastify";
import { FiPlus, FiX } from "react-icons/fi";
import { DateField } from "../../shared/components/DateField";
import { DeleteButton } from "../../shared/components/DeleteButton";
import { FORM_MODAL } from "../../shared/components/formModal";
import { RequiredMark } from "../../shared/components/RequiredMark";
import { celebrateSave } from "../../shared/feedback/saveFeedback";
import { useCurrencyConverter } from "../../shared/hooks/useCurrencyConverter";
import { useOfflineGuard } from "../../shared/hooks/useOfflineGuard";
import { useStepTried } from "../../shared/hooks/useStepTried";
import { categoryLabel } from "../../shared/utils/categories";
import { firestoreToDate, parseISODay, toISODay } from "../../shared/utils/dates";
import { matchName } from "../../shared/utils/nameMatch";
import { saveWithoutWaiting } from "../../shared/utils/saveWithoutWaiting";
import { newDocId } from "../../firebase/firestore";
import { WizardSteps } from "../transactions/components/WizardSteps";
import { formatTable } from "../transactions/transactionDates";
import { useCategories, useTransactions } from "../transactions/hooks/useTransactions";
import AccountPicker from "../accounts/AccountPicker";
import ReviewCard from "../accounts/ReviewCard";
import { useAccountList } from "../accounts/useMoneyAccounts";
import { accountMissing, chosenAccount, mainAccount } from "../accounts/accountsUtils";
import type { BusinessEntry, BusinessExpense, Category } from "../../shared/types/IndexTypes";
import { closingFigures, personalMove } from "./businessSummary";
import { categoryName, profitTone, signed } from "./businessFormat";
import { useBusinessCategories, useSaveClosing } from "./useBusiness";
import styles from "./css/Business.module.css";
import wiz from "../../shared/css/Wizard.module.css";

// «Κλείσιμο ημέρας»: the day's turnover, what the business paid out of it, and
// where the day's profit went in the owner's own money — the owner's words:
// «Τζίρος τόσο, έξοδα τόσο, κέρδος τόσο. Και το κέρδος να προστίθεται στα ήδη
// λεφτά μου.» Four steps — the day and its turnover, the expenses (one line
// each, as many as there were, or none), the card or cash, the check — and
// Save only on the check, which shows every figure and what reaches the
// owner's money. A loss comes out of it instead (an expense of the loss).
//
// Nothing starts filled in but today's date; a correction opens on the check,
// every step a tap away, and the check says what changes: before → after.

const STEPS = ["day", "expenses", "account", "review"] as const;
type Step = (typeof STEPS)[number];

const AMOUNT_MAX = 1e9;
const NOTE_MAX = 1000;
const LINE_NOTE_MAX = 80;
/** The most lines one closing keeps — the rules' limit. */
const LINES_MAX = 30;

interface Line {
  key: number;
  categoryId: string;
  amount: string;
  note: string;
}

const parse = (text: string) => parseFloat(text.replace(",", "."));
const blank = (line: Line) => !line.categoryId && !line.amount.trim() && !line.note.trim();

export default function ClosingWizard({ entry, onClose, onDelete }: { entry?: BusinessEntry; onClose: () => void; onDelete?: () => void }) {
  const { t, i18n } = useTranslation();
  const lang = i18n.resolvedLanguage ?? "en";
  const { format, convert, convertToBase, baseCurrency, displayCurrency } = useCurrencyConverter();
  const [categories] = useBusinessCategories();
  const accounts = useAccountList();
  const { data: personalCategories = [] } = useCategories();
  // The personal record being corrected: the shared list, usually held already (delta-synced when not).
  const { data: transactions } = useTransactions();
  const save = useSaveClosing();
  const deleteGuard = useOfflineGuard("delete");
  const { tried, mark } = useStepTried<Step>();
  const ids = { date: useId(), turnover: useId(), notes: useId() };
  const lineId = useId();

  const editing = !!entry;
  const linked = editing ? transactions?.find((tx) => tx.id === entry.linkedTransactionId) : undefined;
  const shown = (n: number) => String(Math.round(convert(n) * 100) / 100);
  const base = (n: number) => Math.round((baseCurrency === displayCurrency ? n : convertToBase(n)) * 100) / 100;

  const [step, setStep] = useState<Step>(editing ? "review" : "day");
  const [date, setDate] = useState(editing ? toISODay(entry.date) : toISODay(new Date()));
  const [turnover, setTurnover] = useState(editing ? shown(entry.turnover) : "");
  const [notes, setNotes] = useState(editing ? (entry.notes ?? "") : "");
  const [lines, setLines] = useState<Line[]>(() =>
    editing && entry.expenses?.length ? entry.expenses.map((l, i) => ({ key: i, categoryId: l.categoryId, amount: shown(l.amount), note: l.note ?? "" })) : [{ key: 0, categoryId: "", amount: "", note: "" }],
  );
  const [account, setAccount] = useState(editing ? (linked?.accountId ?? entry.accountId ?? "") : "");
  // The personal category's id if it has to be made with this save — the same one for the screen and the write.
  const [newCategoryDocId] = useState(() => newDocId("categories"));

  // ── What has been typed, checked ──
  const when = parseISODay(date);
  const turnoverValue = parse(turnover);
  const turnoverOk = turnover.trim() !== "" && Number.isFinite(turnoverValue) && turnoverValue >= 0 && turnoverValue <= AMOUNT_MAX;
  const filled = lines.filter((l) => !blank(l));
  const lineOk = (l: Line) => categories.some((c) => c.id === l.categoryId) && Number.isFinite(parse(l.amount)) && parse(l.amount) > 0 && parse(l.amount) <= AMOUNT_MAX;
  const linesOk = filled.every(lineOk) && filled.length <= LINES_MAX;
  const expenses: BusinessExpense[] = filled.filter(lineOk).map((l) => ({ categoryId: l.categoryId, amount: base(parse(l.amount)), ...(l.note.trim() ? { note: l.note.trim() } : {}) }));
  const figures = closingFigures({ turnover: turnoverOk ? base(turnoverValue) : 0, expenses });
  const move = personalMove(figures.profit);
  const written = accounts.length > 0 ? chosenAccount(accounts, account) : undefined;
  const accountGap = !!move && accountMissing(accounts, account);
  const ready = !!when && turnoverOk && linesOk && !accountGap;

  // ── The personal category the day's profit (or loss) is filed under ──
  const personalCategory = (() => {
    if (!move) return undefined;
    const key = move.type === "income" ? "business.profitCategory" : "business.lossCategory";
    // Kept when the record it was saved under is still the same kind.
    const kept = linked && linked.type === move.type ? personalCategories.find((c) => c.id === linked.categoryId) : undefined;
    if (kept) return { category: kept, isNew: false };
    // Else the one with its name — in either language, as the owner may have switched — or a new one.
    const names = [t(key, { lng: "el" }), t(key, { lng: "en" })];
    const sameSide = personalCategories.filter((c) => c.type === move.type);
    const found = names.map((name) => matchName(name, sameSide, (c: Category) => [c.name, categoryLabel(c.name, t)])).find((m) => m?.kind === "same");
    if (found) return { category: found.item, isNew: false };
    return { category: { id: newCategoryDocId, name: t(key), type: move.type, icon: move.type === "income" ? "🏪" : "📉" } as Category, isNew: true };
  })();

  const index = STEPS.indexOf(step);
  const goTo = (target: Step) => {
    const at = STEPS.indexOf(target);
    if (at > 0 && (!when || !turnoverOk)) {
      mark("day");
      return setStep("day");
    }
    if (at > 1 && !linesOk) {
      mark("expenses");
      return setStep("expenses");
    }
    if (at > 2 && accountGap) {
      mark("account");
      return setStep("account");
    }
    setStep(target);
  };

  const setLine = (key: number, patch: Partial<Line>) => setLines((all) => all.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  const addLine = () => setLines((all) => [...all, { key: Math.max(-1, ...all.map((l) => l.key)) + 1, categoryId: "", amount: "", note: "" }]);
  const removeLine = (key: number) => setLines((all) => all.filter((l) => l.key !== key));

  const submit = () => {
    if (!ready || !when) return goTo("review");
    const personal =
      move && personalCategory
        ? { amount: move.amount, type: move.type, categoryId: personalCategory.category.id, date: when, description: t("business.closingTitle"), accountId: written || undefined }
        : null;
    void saveWithoutWaiting(
      save,
      {
        editing: editing ? { id: entry.id, previousTransactionId: entry.linkedTransactionId, createdAt: firestoreToDate(entry.createdAt) } : undefined,
        closing: { date: when, turnover: base(turnoverValue), expenses, notes: notes.trim() || undefined, accountId: move ? written || undefined : undefined },
        personal,
        newCategory: personal && personalCategory?.isNew ? { id: personalCategory.category.id, data: { name: personalCategory.category.name, type: personalCategory.category.type, icon: personalCategory.category.icon } } : undefined,
      },
      () => toast.error(t("business.saveFailed")),
    );
    celebrateSave({ collection: "businessEntries", id: editing ? entry.id : undefined });
    toast.success(t("business.saved", { day: formatTable(when, lang) }));
    onClose();
  };

  // ── The check ──
  const placeName = (id: string | undefined) => {
    const named = accounts.find((a) => a.id === id);
    if (named) return named.name;
    if (accounts.length > 0) return t("accounts.notChosen");
    return mainAccount(accounts)?.name ?? t("business.mainAccount");
  };
  const moveText = (m: ReturnType<typeof personalMove>, place: string) => (m ? `${signed(m.amount, format, m.type === "income" ? "+" : "−")} · ${place}` : t("business.nothingMoves"));
  const before = editing ? closingFigures(entry) : undefined;
  const beforeMove = before ? personalMove(before.profit) : null;
  const now = {
    date: when ? formatTable(when, lang) : "—",
    turnover: turnoverOk ? signed(base(turnoverValue), format, "+") : "—",
    expenses: signed(figures.expenses, format, "−"),
    profit: signed(figures.profit, format),
    money: moveText(move, placeName(written)),
    notes: notes.trim() || "—",
  };
  const was = before
    ? {
        date: formatTable(firestoreToDate(entry!.date), lang),
        turnover: signed(before.turnover, format, "+"),
        expenses: signed(before.expenses, format, "−"),
        profit: signed(before.profit, format),
        money: moveText(beforeMove, placeName(linked?.accountId ?? entry!.accountId)),
        notes: entry!.notes?.trim() || "—",
      }
    : undefined;
  const linesChanged = editing && JSON.stringify(expenses) !== JSON.stringify((entry.expenses ?? []).map((l) => ({ categoryId: l.categoryId, amount: l.amount, ...(l.note ? { note: l.note } : {}) })));
  const nothingChanged = editing && !linesChanged && !!was && (Object.keys(now) as (keyof typeof now)[]).every((k) => was[k] === now[k]);
  const wasMark = (field: keyof typeof now) => (was && was[field] !== now[field] ? <s className={styles.was}>{was[field]} →</s> : null);
  const row = (target: Step, label: string, value: ReactNode, className = "") => (
    <button type="button" className={wiz.wizRow} onClick={() => goTo(target)}>
      <span className={wiz.wizLabel}>{label}</span>
      <span className={`${wiz.wizValue} ${className}`}>{value}</span>
    </button>
  );

  const title = t(editing ? "business.editClosingTitle" : "business.closingTitle");

  return (
    <Modal {...FORM_MODAL} isOpen toggle={onClose} centered scrollable>
      <ModalHeader toggle={onClose}>{title}</ModalHeader>
      <form
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          if (step === "review") submit();
          else goTo(STEPS[index + 1]);
        }}
      >
        <ModalBody>
          <WizardSteps steps={STEPS} current={step} onGo={goTo} open={editing} label={(s) => t(`business.step_${s}`)} />
          <div className="fw-semibold mb-3" style={{ fontSize: "var(--fs-lead)" }}>
            {step === "account" && move?.type === "expense" ? t("business.ask_accountLoss") : step === "account" && !move ? t("business.ask_accountZero") : t(`business.ask_${step}`)}
          </div>

          {step === "day" && (
            <>
              <FormGroup>
                <Label for={ids.date} className="small fw-medium mb-1">
                  {t("common.date")}
                  <RequiredMark />
                </Label>
                <DateField id={ids.date} value={date} onChange={setDate} invalid={tried("day") && !when} maxDate={new Date()} placeholder={t("common.date")} />
              </FormGroup>
              <FormGroup>
                <Label for={ids.turnover} className="small fw-medium mb-1">
                  {t("business.turnover")} ({displayCurrency})
                  <RequiredMark />
                </Label>
                <Input
                  id={ids.turnover}
                  aria-required
                  autoFocus={!editing}
                  type="number"
                  min={0}
                  step="0.01"
                  inputMode="decimal"
                  placeholder={t("business.turnoverPlaceholder")}
                  value={turnover}
                  invalid={tried("day") && !turnoverOk}
                  onChange={(e) => setTurnover(e.target.value)}
                />
                <FormFeedback>{t("business.turnoverNeeded")}</FormFeedback>
              </FormGroup>
              <FormGroup className="mb-0">
                <Label for={ids.notes} className="small fw-medium mb-1">
                  {t("common.notes")} <span className="text-body-secondary fw-normal">{t("business.optional")}</span>
                </Label>
                <Input id={ids.notes} type="textarea" rows={2} value={notes} maxLength={NOTE_MAX} placeholder={t("business.notesPlaceholder")} onChange={(e) => setNotes(e.target.value)} />
              </FormGroup>
            </>
          )}

          {step === "expenses" && (
            <>
              {categories.length === 0 && <div className={`${wiz.wizNote} mb-3`}>{t("business.noCategoriesForLines")}</div>}
              {/* What a line needs once it is started: its category and its amount; the note is its own choice. */}
              <p className="small text-body-secondary mb-2">
                {t("common.category")}
                <RequiredMark /> · {t("common.amount")}
                <RequiredMark /> · {t("business.lineNote")} {t("business.optional")}
              </p>
              <ul className={styles.lines}>
                {lines.map((l, i) => {
                  const bad = tried("expenses") && !blank(l) && !lineOk(l);
                  return (
                    <li key={l.key} className={styles.line} aria-label={t("business.lineN", { n: i + 1 })}>
                      <Input
                        type="select"
                        aria-label={t("common.category")}
                        aria-required={!blank(l)}
                        value={l.categoryId}
                        invalid={bad && !categories.some((c) => c.id === l.categoryId)}
                        onChange={(e) => setLine(l.key, { categoryId: e.target.value })}
                        disabled={categories.length === 0}
                      >
                        <option value="" disabled>
                          {t("business.linePickCategory")}
                        </option>
                        {categories.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name}
                          </option>
                        ))}
                      </Input>
                      <button type="button" className={styles.lineRemove} onClick={() => removeLine(l.key)} aria-label={t("business.lineRemove", { n: i + 1 })} title={t("business.lineRemove", { n: i + 1 })}>
                        <FiX aria-hidden />
                      </button>
                      <div className={styles.lineBottom}>
                        <Input
                          id={`${lineId}-${l.key}-amount`}
                          type="number"
                          min={0}
                          step="0.01"
                          inputMode="decimal"
                          aria-label={`${t("common.amount")} (${displayCurrency})`}
                          placeholder={t("business.lineAmountPlaceholder")}
                          aria-required={!blank(l)}
                          value={l.amount}
                          invalid={bad && !(parse(l.amount) > 0 && parse(l.amount) <= AMOUNT_MAX)}
                          onChange={(e) => setLine(l.key, { amount: e.target.value })}
                        />
                        <Input aria-label={t("business.lineNote")} placeholder={t("business.lineNotePlaceholder")} maxLength={LINE_NOTE_MAX} value={l.note} onChange={(e) => setLine(l.key, { note: e.target.value })} />
                      </div>
                    </li>
                  );
                })}
              </ul>
              {tried("expenses") && !linesOk && <div className="invalid-feedback d-block mb-2">{t("business.lineNeeded")}</div>}
              <Button type="button" color="primary" outline size="sm" onClick={addLine} disabled={lines.length >= LINES_MAX || categories.length === 0} className="d-inline-flex align-items-center gap-1">
                <FiPlus aria-hidden /> {t("business.addLine")}
              </Button>
              <div className={`${wiz.wizNote} mt-3 d-flex justify-content-between gap-2`}>
                <span>{t("business.expenses")}</span>
                <span className={styles.total}>{signed(figures.expenses, format, "−")}</span>
              </div>
              {lines.length === 0 || filled.length === 0 ? <p className="small text-body-secondary mt-2 mb-0">{t("business.noExpensesOk")}</p> : null}
            </>
          )}

          {step === "account" && (
            <>
              <div className={`${wiz.wizNote} mb-3 d-flex justify-content-between gap-2`}>
                <span>{t("business.profit")}</span>
                <span className={`${styles.total} ${profitTone(figures.profit, styles)}`}>{signed(figures.profit, format)}</span>
              </div>
              {move ? (
                <>
                  <p className="small mb-2">{t(move.type === "income" ? "business.profitGoesInto" : "business.lossComesFrom", { amount: format(move.amount) })}
                    <RequiredMark />
                  </p>
                  <AccountPicker value={account} onChoose={setAccount} income={move.type === "income"} invalid={tried("account")} />
                  {accounts.length === 0 && <div className={wiz.wizNote}>{t("business.noAccounts")}</div>}
                </>
              ) : (
                <div className={wiz.wizNote}>{t("business.nothingMovesExplain")}</div>
              )}
            </>
          )}

          {step === "review" && (
            <>
              <div className={wiz.wizCard}>
                {row("day", t("common.date"), <>{wasMark("date")}{now.date}</>)}
                {row("day", t("business.turnover"), <>{wasMark("turnover")}{now.turnover}</>)}
                {expenses.map((l, i) => (
                  <Fragment key={i}>{row("expenses", [categoryName(categories, l.categoryId, t("business.noCategory")), l.note].filter(Boolean).join(" · "), signed(l.amount, format, "−"))}</Fragment>
                ))}
                {row("expenses", t("business.expenses"), <>{wasMark("expenses")}{now.expenses}</>, styles.total)}
                {row("expenses", t("business.profit"), <>{wasMark("profit")}{now.profit}</>, `${styles.total} ${profitTone(figures.profit, styles)}`)}
                {row("day", t("common.notes"), <>{wasMark("notes")}{now.notes}</>)}
              </div>

              {/* What reaches the owner's own money. */}
              <div className={`${wiz.wizCard} mt-3`} role="group" aria-label={t("business.sidePersonal")}>
                <div className={styles.sideHead}>{t("business.sidePersonal")}</div>
                {row("account", t(move?.type === "expense" ? "business.moneyOut" : "business.moneyIn"), <>{wasMark("money")}{now.money}</>, move ? (move.type === "income" ? styles.positive : styles.negative) : "")}
                {move && personalCategory && row("account", t("common.category"), `${personalCategory.category.icon ?? ""} ${categoryLabel(personalCategory.category.name, t)}${personalCategory.isNew ? ` · ${t("business.newCategoryTag")}` : ""}`.trim())}
              </div>
              {move && written && !editing && <ReviewCard accountId={written} income={move.type === "income"} delta={move.type === "income" ? move.amount : -move.amount} />}
              <div className={`${wiz.wizNote} mt-3`}>{nothingChanged ? t("business.nothingChanged") : t("business.onlyProfitNote")}</div>
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
            <Button type="submit" color="primary" disabled={nothingChanged || !ready}>
              {t("common.save")}
            </Button>
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
