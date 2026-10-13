import { useMemo, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { Button, FormFeedback, FormGroup, Input, InputGroup, InputGroupText, Label, Modal, ModalBody, ModalFooter, ModalHeader } from "reactstrap";
import { useTranslation } from "react-i18next";
import { toast } from "react-toastify";
import { FiCheck } from "react-icons/fi";
import { DateField } from "../../../shared/components/DateField";
import { parseISODay, toISODay } from "../../../shared/utils/dates";
import { saveWithoutWaiting } from "../../../shared/utils/saveWithoutWaiting";
import { useCurrencyConverter } from "../../../shared/hooks/useCurrencyConverter";
import { useMoneyAccounts } from "../../accounts/useMoneyAccounts";
import { expectedByAccount, type MoneyAccount } from "../../accounts/accountsUtils";
import { accountFinishes } from "../../accounts/accountTones";
import { BankCard } from "../../accounts/BankCard";
import cardStyles from "../../accounts/css/BankCard.module.css";
import { WizardSteps } from "./WizardSteps";
import { useSaveTransfer } from "../hooks/useTransfers";
import { transferProblem, transferRecords } from "../transfers";
import { newDocId } from "../../../firebase/firestore";
import { formatTable } from "../transactionDates";
import styles from "./css/TransactionWizard.module.css";

/** A transfer as it stands, to correct it. */
export interface TransferDraft {
  id: string;
  from: string;
  to: string;
  amount: number;
  date: Date;
  note?: string;
  /** When the pair was first written — kept on a correction. */
  createdAt?: Date;
}

const STEPS = ["from", "to", "amount", "review"] as const;
type Step = (typeof STEPS)[number];

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Moving money between two of your own accounts — 200 out of Revolut as cash,
 * 500 from Eurobank to Ethniki — in four steps: from, to, how much and when,
 * and the check, the only place Save is.
 *
 * It writes no income and no expense: the money changes account and the total
 * stays where it was (see `transfers.ts`). The check says so, and shows each
 * account before and after, from the same figures the next bank update starts
 * from.
 *
 * A dialog, or the whole of a page (`asPage`): the menu's «Νέα συναλλαγή»
 * offers it as its third kind, and on the page a saved transfer is confirmed
 * in place, with what went where, until "New transfer".
 */
export default function TransferWizard({
  initial,
  asPage = false,
  onClose,
  onBack,
}: {
  initial?: TransferDraft;
  asPage?: boolean;
  onClose: () => void;
  /** Reached from the choice of kind: the first step goes back to it rather than cancelling. */
  onBack?: () => void;
}) {
  const { t, i18n } = useTranslation();
  const lang = i18n.resolvedLanguage ?? "en";
  const { format: formatCurrency, baseCurrency } = useCurrencyConverter();
  const { accounts, latest, transactions } = useMoneyAccounts();
  const save = useSaveTransfer();
  // What each account holds now — without this transfer, when it is being corrected.
  const holds = useMemo(
    () =>
      expectedByAccount(
        accounts,
        latest,
        initial ? transactions.filter((tx) => tx.transferId !== initial.id) : transactions,
      ),
    [accounts, latest, transactions, initial],
  );
  const finishes = useMemo(() => accountFinishes(accounts), [accounts]);
  const edit = !!initial;

  const [step, setStep] = useState<Step>(edit ? "review" : "from");
  const [from, setFrom] = useState(initial?.from ?? "");
  const [to, setTo] = useState(initial?.to ?? "");
  const [amount, setAmount] = useState(initial ? String(initial.amount) : "");
  const [date, setDate] = useState(toISODay(initial?.date ?? new Date()));
  const [note, setNote] = useState(initial?.note ?? "");
  const [tried, setTried] = useState(false);
  const [saved, setSaved] = useState<{ from: MoneyAccount; to: MoneyAccount; amount: number; date: Date } | null>(null);

  const value = parseFloat(amount);
  const day = parseISODay(date);
  const fromAccount = accounts.find((a) => a.id === from);
  const toAccount = accounts.find((a) => a.id === to);
  const problem = transferProblem({ from, to, amount: value });
  const index = STEPS.indexOf(step);

  const goTo = (target: Step) => {
    const at = STEPS.indexOf(target);
    // Forward only as far as what is filled in allows; back is always free.
    if (at > 0 && !from) return setStep("from");
    if (at > 1 && (!to || to === from)) return setStep("to");
    if (at > 2 && (problem || !day)) {
      setTried(true);
      return setStep("amount");
    }
    setStep(target);
  };

  const reset = () => {
    setSaved(null);
    setStep("from");
    setFrom("");
    setTo("");
    setAmount("");
    setDate(toISODay(new Date()));
    setNote("");
    setTried(false);
  };

  const submit = () => {
    if (problem || !day || !fromAccount || !toAccount) return;
    const records = transferRecords({
      id: initial?.id ?? newDocId("transactions"),
      from,
      to,
      amount: value,
      date: day,
      label: `${fromAccount.name} → ${toAccount.name}`,
      note: note.trim() || undefined,
    });
    void saveWithoutWaiting(save, { records, createdAt: initial?.createdAt }, () => toast.error(t("transactions.transfer.failed")));
    if (asPage && !edit) {
      setSaved({ from: fromAccount, to: toAccount, amount: round2(value), date: day });
      return;
    }
    toast.success(t("transactions.transfer.savedToast"));
    onClose();
  };

  const chooser = (selected: string, onPick: (id: string) => void, exclude?: string) => (
    <div className={cardStyles.grid}>
      {accounts
        .filter((account) => account.id !== exclude)
        .map((account) => (
          <BankCard
            key={account.id}
            name={account.name}
            kind={account.kind}
            finish={finishes[account.id]}
            amount={holds[account.id] !== undefined ? formatCurrency(holds[account.id]) : undefined}
            selected={selected === account.id}
            onClick={() => onPick(account.id)}
            label={holds[account.id] !== undefined ? `${account.name}, ${formatCurrency(holds[account.id])}` : account.name}
          />
        ))}
    </div>
  );

  const before = (id: string) => holds[id];
  const moveText = (id: string, sign: 1 | -1) => {
    const now = before(id);
    if (now === undefined) return undefined;
    return `${formatCurrency(now)} → ${formatCurrency(round2(now + sign * (Number.isFinite(value) ? value : 0)))}`;
  };

  const rows: { step: Step; label: string; value: ReactNode }[] = [
    { step: "from", label: t("transactions.transfer.stepFrom"), value: fromAccount ? <>{fromAccount.name}{moveText(from, -1) && <small className="d-block text-body-secondary fw-normal">{moveText(from, -1)}</small>}</> : "—" },
    { step: "to", label: t("transactions.transfer.stepTo"), value: toAccount ? <>{toAccount.name}{moveText(to, 1) && <small className="d-block text-body-secondary fw-normal">{moveText(to, 1)}</small>}</> : "—" },
    { step: "amount", label: t("common.amount"), value: Number.isFinite(value) ? formatCurrency(round2(value)) : "—" },
    { step: "amount", label: t("common.date"), value: day ? formatTable(day, lang) : "—" },
    ...(note.trim() ? [{ step: "amount" as Step, label: t("transactions.transfer.note"), value: note.trim() }] : []),
  ];

  const overdraw = fromAccount && before(from) !== undefined && Number.isFinite(value) && value > (before(from) as number) + 0.004;

  // ── The frame: a dialog, or the page itself ──
  const title = t(edit ? "transactions.transfer.editTitle" : "transactions.transfer.title");
  const body = (children: ReactNode) => (asPage ? <div className={styles.pageBody}>{children}</div> : <ModalBody>{children}</ModalBody>);
  const footer = (children: ReactNode) => (asPage ? <div className={styles.pageFooter}>{children}</div> : <ModalFooter className="justify-content-between">{children}</ModalFooter>);
  const frame = (children: ReactNode) =>
    asPage ? (
      <div className={styles.page}>{children}</div>
    ) : (
      <Modal isOpen toggle={onClose} centered scrollable>
        <ModalHeader toggle={onClose}>{title}</ModalHeader>
        {children}
      </Modal>
    );

  if (accounts.length < 2) {
    return frame(
      <>
        {body(
          <p className="mb-0">
            {t("transactions.transfer.needTwo")}{" "}
            <Link to="/accounts" onClick={asPage ? undefined : onClose}>
              {t("transactions.transfer.goToBanks")}
            </Link>
          </p>,
        )}
        {!asPage && footer(<Button color="secondary" outline onClick={onClose}>{t("common.close")}</Button>)}
      </>,
    );
  }

  if (saved) {
    return frame(
      <>
        {body(
          <div className={styles.savedPanel} role="status">
            <span className={styles.savedIcon} aria-hidden>
              <FiCheck />
            </span>
            <h2 className={styles.savedTitle}>{t("transactions.transfer.saved")}</h2>
            <p className={styles.savedSub}>{t("transactions.transfer.savedSub")}</p>
            <div className={styles.savedDetails}>
              <div className={styles.reviewRows}>
                <div>
                  <span>{t("transactions.transfer.stepFrom")}</span>
                  <strong>{saved.from.name}</strong>
                </div>
                <div>
                  <span>{t("transactions.transfer.stepTo")}</span>
                  <strong>{saved.to.name}</strong>
                </div>
                <div>
                  <span>{t("common.amount")}</span>
                  <strong>{formatCurrency(saved.amount)}</strong>
                </div>
                <div>
                  <span>{t("common.date")}</span>
                  <strong>{formatTable(saved.date, lang)}</strong>
                </div>
              </div>
            </div>
          </div>,
        )}
        {footer(
          <>
            <Button color="secondary" outline onClick={onClose}>
              {t("nav.allTransactions")}
            </Button>
            <Button color="primary" onClick={reset}>
              + {t("transactions.transfer.newOne")}
            </Button>
          </>,
        )}
      </>,
    );
  }

  return frame(
    <form
      noValidate
      className={asPage ? styles.page : undefined}
      onSubmit={(e) => {
        e.preventDefault();
        if (step === "review") submit();
        else goTo(STEPS[index + 1]);
      }}
    >
      {body(
        <>
          <WizardSteps steps={STEPS} current={step} onGo={goTo} label={(s) => t(`transactions.transfer.step${s[0].toUpperCase()}${s.slice(1)}`)} open={edit} />
          <p className={styles.prompt}>{t(`transactions.transfer.ask${step[0].toUpperCase()}${step.slice(1)}`)}</p>

          {step === "from" &&
            chooser(from, (id) => {
              setFrom(id);
              if (to === id) setTo("");
              setStep("to");
            })}

          {step === "to" &&
            chooser(
              to,
              (id) => {
                setTo(id);
                setStep("amount");
              },
              from,
            )}

          {step === "amount" && (
            <>
              <FormGroup>
                <Label for="transfer-amount" className="small fw-medium">
                  {t("common.amount")}
                </Label>
                <InputGroup>
                  <Input id="transfer-amount" type="number" inputMode="decimal" min={0} step="0.01" autoFocus value={amount} invalid={tried && problem === "amount"} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" />
                  <InputGroupText>{baseCurrency}</InputGroupText>
                  <FormFeedback>{t("transactions.transfer.amountNeeded")}</FormFeedback>
                </InputGroup>
                {overdraw && <div className="form-text">{t("transactions.transfer.moreThanHas", { name: fromAccount!.name, amount: formatCurrency(before(from) as number) })}</div>}
              </FormGroup>
              <FormGroup>
                <Label for="transfer-date" className="small fw-medium">
                  {t("common.date")}
                </Label>
                <DateField id="transfer-date" value={date} onChange={setDate} />
              </FormGroup>
              <FormGroup className="mb-0">
                <Label for="transfer-note" className="small fw-medium">
                  {t("transactions.transfer.note")}
                </Label>
                <Input id="transfer-note" value={note} maxLength={80} placeholder={t("transactions.transfer.notePlaceholder")} onChange={(e) => setNote(e.target.value)} />
              </FormGroup>
            </>
          )}

          {step === "review" && (
            <>
              <div className={styles.reviewRows}>
                {rows.map((row) => (
                  <button key={row.label} type="button" onClick={() => goTo(row.step)}>
                    <span>{row.label}</span>
                    <strong>{row.value}</strong>
                  </button>
                ))}
              </div>
              <p className="small text-body-secondary mt-3 mb-0">{t("transactions.transfer.neither")}</p>
              {overdraw && <p className="small mt-2 mb-0" style={{ color: "var(--color-pending-text)" }}>{t("transactions.transfer.moreThanHas", { name: fromAccount!.name, amount: formatCurrency(before(from) as number) })}</p>}
            </>
          )}
        </>,
      )}

      {/* On the page the first step has no buttons: choosing is the step — unless
          it came from the choice of kind, which it goes back to. The dialog keeps its Cancel. */}
      {!(asPage && step === "from" && !onBack) &&
        footer(
          <>
            {step === "from" ? (
              onBack ? (
                <Button type="button" color="secondary" outline onClick={onBack}>
                  ‹ {t("common.back")}
                </Button>
              ) : (
                <Button type="button" color="secondary" outline onClick={onClose}>
                  {t("common.cancel")}
                </Button>
              )
            ) : (
              <Button type="button" color="secondary" outline onClick={() => setStep(STEPS[index - 1])}>
                ‹ {t("common.back")}
              </Button>
            )}
            {step === "review" ? (
              <Button type="submit" color="primary" disabled={!!problem || !day}>
                {t("transactions.confirmAndSave")}
              </Button>
            ) : step === "amount" ? (
              <Button type="submit" color="primary">
                {t("common.next")} ›
              </Button>
            ) : (
              <span />
            )}
          </>,
        )}
    </form>,
  );
}
