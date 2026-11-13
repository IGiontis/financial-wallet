import { useState } from "react";
import { celebrateSave } from "../../shared/feedback/saveFeedback";
import { Button, FormFeedback, FormGroup, Input, InputGroup, InputGroupText, Label, Modal, ModalBody, ModalFooter, ModalHeader } from "reactstrap";
import { useTranslation } from "react-i18next";
import { DateField } from "../../shared/components/DateField";
import { parseISODay, toISODay } from "../../shared/utils/dates";
import { formatTable } from "../transactions/transactionDates";
import { WizardSteps } from "../transactions/components/WizardSteps";
import { MoneyMovedPicker } from "./MoneyMovedPicker";
import { PaymentNote } from "./PaymentNote";
import { useAccountList } from "../accounts/useMoneyAccounts";
import { accountMissing, chosenAccount, mainAccount } from "../accounts/accountsUtils";
import type { DebtWithStatus } from "../../shared/types/IndexTypes";
import { previewRepayment } from "./debtsUtils";
import { useRecordRepayment } from "./useDebts";
import styles from "./css/DebtsPage.module.css";
import wiz from "../../shared/css/Wizard.module.css";
import { FORM_MODAL } from "../../shared/components/formModal";
import { RequiredMark } from "../../shared/components/RequiredMark";
import { useRunOnce } from "../../shared/hooks/useRunOnce";
import { saveWithoutWaiting } from "../../shared/utils/saveWithoutWaiting";
import { toast } from "react-toastify";

// Recording a repayment, paying a debt back or being paid back, as the same
// four steps as a transaction and an income: how much, when, through which
// card, and then the check. The check is the only place Save is, and it says
// what the payment does before it does it: how it divides into interest and
// debt, what the debt reads afterwards, which card moves.

const STEPS = ["1", "2", "3", "4"] as const;
type Step = (typeof STEPS)[number];

export default function RepaymentWizard({
  debt,
  suggested,
  formatCurrency,
  onClose,
}: {
  debt: DebtWithStatus;
  /** What the amount starts as: the month's payment on a loan, else what is left. */
  suggested: number;
  formatCurrency: (n: number) => string;
  onClose: () => void;
}) {
  const { t, i18n } = useTranslation();
  const record = useRecordRepayment();
  const accounts = useAccountList();
  const borrowed = debt.direction === "owed_by_me";

  const [step, setStep] = useState<Step>("1");
  const [amount, setAmount] = useState(String(suggested));
  const [date, setDate] = useState(() => toISODay(new Date()));
  // Did money move, and through which card: asked, never assumed — neither
  // tile starts chosen (`null`), and the card is not even the one the debt
  // itself went through (item 97a). «Όχι» is `undefined`: settled some other way.
  const [account, setAccount] = useState<string | undefined | null>(null);
  const [tried, setTried] = useState(false);
  const [moneyTried, setMoneyTried] = useState(false);
  const moneyMissing = account === null || (account !== undefined && accountMissing(accounts, account));
  // As written: the card chosen, or the only place there is. With no places at all, as before.
  const writtenAccount = account === null ? undefined : account === undefined || accounts.length === 0 ? account : chosenAccount(accounts, account);
  const [notes, setNotes] = useState("");

  const value = parseFloat(amount);
  const amountOk = Number.isFinite(value) && value > 0;
  const when = parseISODay(date);
  const index = STEPS.indexOf(step);

  const goTo = (target: Step) => {
    // Forward only as far as what is filled in allows; back is always free.
    if (STEPS.indexOf(target) > 0 && !amountOk) {
      setTried(true);
      setStep("1");
      return;
    }
    if (STEPS.indexOf(target) > 1 && !when) {
      setStep("2");
      return;
    }
    if (STEPS.indexOf(target) > 2 && moneyMissing) {
      setMoneyTried(true);
      setStep("3");
      return;
    }
    setStep(target);
  };

  const preview = amountOk && when ? previewRepayment(debt, value, when) : undefined;
  const cardName = (() => {
    if (account === undefined) return t("debts.noMoney");
    if (account === null) return "—";
    const named = accounts.find((a) => a.id === writtenAccount);
    if (named) return named.name;
    if (accounts.length > 0) return t("accounts.notChosen");
    const main = mainAccount(accounts);
    return main ? t("debts.wizard.mainCard", { name: main.name }) : t("accounts.noCard");
  })();

  // Runs once and never waits for the server (`saveWithoutWaiting`): the
  // repayment and its money are on screen at once, the dialog closes with the
  // toast; a refusal puts them back and the hook says so.
  const [run, running] = useRunOnce();
  const working = running;
  const close = () => {
    if (!working) onClose();
  };
  const save = () =>
    void run(() => {
      if (!amountOk || !when) return;
      if (moneyMissing) return goTo("4");
      // Paid off by this one: the debt's milestone (confetti).
      const paidOff = !debt.isSettled && !!preview?.settles;
      void saveWithoutWaiting(record, { debtId: debt.id, amount: value, date: when, accountId: writtenAccount, notes: notes.trim() || undefined }, undefined, [["debts", debt.id]]);
      celebrateSave({ collection: "debts", id: debt.id, milestone: paidOff });
      toast.success(t(paidOff ? "toasts.repaymentSettled" : "toasts.repaymentSaved", { amount: formatCurrency(value), who: debt.person }));
      onClose();
    });

  const left = (n: number) => (n > 0 ? t("debts.wizard.remains", { amount: formatCurrency(n) }) : t("debts.wizard.cleared"));

  const rows: { step: Step; label: string; value: string }[] = [
    { step: "1", label: t("common.amount"), value: formatCurrency(amountOk ? value : 0) },
    { step: "2", label: t("debts.when"), value: when ? formatTable(when, i18n.resolvedLanguage ?? "en") : "—" },
    { step: "3", label: t(borrowed ? "debts.paidFrom" : "debts.paidInto"), value: cardName },
    ...(notes.trim() ? [{ step: "3" as Step, label: t("debts.note"), value: `«${notes.trim()}»` }] : []),
  ];

  return (
    <Modal {...FORM_MODAL} isOpen toggle={close} keyboard={!working} centered scrollable>
      <ModalHeader toggle={working ? undefined : close}>
        {t(borrowed ? "debts.wizard.titleOut" : "debts.wizard.titleIn")} · {debt.person}
      </ModalHeader>
      <form
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          if (step === "4") save();
          else goTo(STEPS[index + 1]);
        }}
      >
        <ModalBody>
          <WizardSteps steps={STEPS} current={step} onGo={goTo} label={(s) => t(`debts.wizard.stepShort${s}`)} large />
          <div className="fw-semibold mb-3" style={{ fontSize: "var(--fs-lead)" }}>
            {t(`debts.wizard.${borrowed ? "out" : "in"}${step}`)}
            {/* Steps 1–3 are one asked question each — the amount, the day, the card — with the field's own label hidden. */}
            {step !== "4" && <RequiredMark />}
          </div>

          {step === "1" && (
            <FormGroup>
              <Label htmlFor="repay-amount" className="visually-hidden">
                {t("common.amount")}
              </Label>
              <InputGroup>
                <Input
                  id="repay-amount"
                  aria-required
                  autoFocus
                  type="number"
                  min={0}
                  step="0.01"
                  inputMode="decimal"
                  value={amount}
                  invalid={tried && !amountOk}
                  onChange={(e) => setAmount(e.target.value)}
                />
                <InputGroupText>{t("debts.of", { amount: formatCurrency(debt.remaining) })}</InputGroupText>
                <FormFeedback>{t("debts.wizard.amountNeeded")}</FormFeedback>
              </InputGroup>
              <div className={styles.wizChips}>
                {suggested !== debt.remaining && (
                  <button type="button" className={styles.wizChip} onClick={() => setAmount(String(suggested))}>
                    {t("debts.wizard.chipInstalment", { amount: formatCurrency(suggested) })}
                  </button>
                )}
                <button type="button" className={styles.wizChip} onClick={() => setAmount(String(debt.remaining))}>
                  {t("debts.wizard.chipAll", { amount: formatCurrency(debt.remaining) })}
                </button>
              </div>
              {amountOk && value > debt.remaining + 0.005 && <div className={`${wiz.wizNote} mt-2`}>{t("debts.wizard.overpays")}</div>}
            </FormGroup>
          )}

          {step === "2" && (
            <FormGroup>
              <Label htmlFor="repay-date" className="visually-hidden">
                {t("debts.when")}
              </Label>
              <DateField id="repay-date" value={date} onChange={setDate} placeholder={t("debts.when")} />
            </FormGroup>
          )}

          {step === "3" && (
            <>
              <MoneyMovedPicker
                value={account}
                onChange={(next) => {
                  // A new yes / no answer opens fresh: its card is not wrong before it is asked.
                  if (typeof next !== typeof account) setMoneyTried(false);
                  setAccount(next);
                }}
                income={!borrowed}
                invalid={moneyTried}
                hideQuestion
              />
              <PaymentNote value={notes} onChange={setNotes} className="mt-3" />
            </>
          )}

          {step === "4" && (
            <>
              <div className={wiz.wizCard}>
                {rows.map((row) => (
                  <button key={row.label} type="button" className={wiz.wizRow} onClick={() => goTo(row.step)}>
                    <span className={wiz.wizLabel}>{row.label}</span>
                    <span className={wiz.wizValue}>{row.value}</span>
                  </button>
                ))}
              </div>

              {preview && (
                <div className={`${wiz.wizCard} mt-3`} role="group" aria-label={t("debts.wizard.effect")}>
                  <div className={styles.wizEffectHead}>{t("debts.wizard.effect")}</div>
                  {preview.interest > 0 && (
                    <>
                      <div className={wiz.wizStatic}>
                        <span className={wiz.wizLabel}>{t("debts.wizard.toInterest")}</span>
                        <span className={wiz.wizValue}>{formatCurrency(preview.interest)}</span>
                      </div>
                      <div className={wiz.wizStatic}>
                        <span className={wiz.wizLabel}>{t("debts.wizard.toDebt")}</span>
                        <span className={wiz.wizValue}>{formatCurrency(preview.principal)}</span>
                      </div>
                    </>
                  )}
                  <div className={wiz.wizStatic}>
                    <span className={wiz.wizLabel}>{t("debts.wizard.before")}</span>
                    <span className={wiz.wizValue}>{formatCurrency(preview.remainingBefore)}</span>
                  </div>
                  <div className={wiz.wizStatic}>
                    <span className={wiz.wizLabel}>{t("debts.wizard.after")}</span>
                    <span className={`${wiz.wizValue} ${preview.settles ? styles.wizDone : ""}`}>{left(preview.remainingAfter)}</span>
                  </div>
                </div>
              )}
              {preview?.overpays && <div className={`${wiz.wizNote} mt-2`}>{t("debts.wizard.overpays")}</div>}
            </>
          )}
        </ModalBody>

        <ModalFooter className="justify-content-between">
          {step === "1" ? (
            <Button type="button" color="secondary" outline onClick={onClose}>
              {t("common.cancel")}
            </Button>
          ) : (
            <Button type="button" color="secondary" outline onClick={() => setStep(STEPS[index - 1])} disabled={working}>
              ‹ {t("common.back")}
            </Button>
          )}
          {step === "4" ? (
            <Button type="submit" color="primary" disabled={working || !amountOk || !when} aria-busy={working || undefined}>
              {working ? t("common.saving") : t("common.save")}
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
