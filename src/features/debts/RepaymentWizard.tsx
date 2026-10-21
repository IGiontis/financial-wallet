import { useState } from "react";
import { Button, FormFeedback, FormGroup, Input, InputGroup, InputGroupText, Label, Modal, ModalBody, ModalFooter, ModalHeader } from "reactstrap";
import { useTranslation } from "react-i18next";
import { DateField } from "../../shared/components/DateField";
import { parseISODay, toISODay } from "../../shared/utils/dates";
import { formatTable } from "../transactions/transactionDates";
import { WizardSteps } from "../transactions/components/WizardSteps";
import { MoneyMovedPicker } from "./MoneyMovedPicker";
import { PaymentNote } from "./PaymentNote";
import { useAccountList } from "../accounts/useMoneyAccounts";
import { mainAccount } from "../accounts/accountsUtils";
import type { DebtWithStatus } from "../../shared/types/IndexTypes";
import { previewRepayment } from "./debtsUtils";
import { useRecordRepayment } from "./useDebts";
import styles from "./css/DebtsPage.module.css";

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
  // The card the debt itself went through is the likeliest one for paying it
  // back. A debt that moved no money still starts as money moving: someone who
  // owes you for a dinner you paid usually pays you back in money. Switched off
  // only when it was settled some other way.
  const [account, setAccount] = useState<string | undefined>(debt.accountId ?? "");
  const [tried, setTried] = useState(false);
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
    setStep(target);
  };

  const preview = amountOk && when ? previewRepayment(debt, value, when) : undefined;
  const cardName = (() => {
    if (account === undefined) return t("debts.noMoney");
    const named = accounts.find((a) => a.id === account);
    if (named) return named.name;
    const main = mainAccount(accounts);
    return main ? t("debts.wizard.mainCard", { name: main.name }) : t("accounts.noCard");
  })();

  const save = () => {
    if (!amountOk || !when) return;
    record.mutate({ debtId: debt.id, amount: value, date: when, accountId: account, notes: notes.trim() || undefined }, { onSuccess: onClose });
  };

  const left = (n: number) => (n > 0 ? t("debts.wizard.remains", { amount: formatCurrency(n) }) : t("debts.wizard.cleared"));

  const rows: { step: Step; label: string; value: string }[] = [
    { step: "1", label: t("common.amount"), value: formatCurrency(amountOk ? value : 0) },
    { step: "2", label: t("debts.when"), value: when ? formatTable(when, i18n.resolvedLanguage ?? "en") : "—" },
    { step: "3", label: t(borrowed ? "debts.paidFrom" : "debts.paidInto"), value: cardName },
    ...(notes.trim() ? [{ step: "3" as Step, label: t("debts.note"), value: `«${notes.trim()}»` }] : []),
  ];

  return (
    <Modal isOpen toggle={onClose} centered scrollable>
      <ModalHeader toggle={onClose}>
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
          <div className="fw-semibold mb-3" style={{ fontSize: 14 }}>
            {t(`debts.wizard.${borrowed ? "out" : "in"}${step}`)}
          </div>

          {step === "1" && (
            <FormGroup>
              <Label htmlFor="repay-amount" className="visually-hidden">
                {t("common.amount")}
              </Label>
              <InputGroup>
                <Input
                  id="repay-amount"
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
              {amountOk && value > debt.remaining + 0.005 && <div className={`${styles.wizNote} mt-2`}>{t("debts.wizard.overpays")}</div>}
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
              <MoneyMovedPicker value={account} onChange={setAccount} income={!borrowed} />
              <PaymentNote value={notes} onChange={setNotes} className="mt-3" />
            </>
          )}

          {step === "4" && (
            <>
              <div className={styles.wizCard}>
                {rows.map((row) => (
                  <button key={row.label} type="button" className={styles.wizRow} onClick={() => goTo(row.step)}>
                    <span className={styles.wizLabel}>{row.label}</span>
                    <span className={styles.wizValue}>{row.value}</span>
                  </button>
                ))}
              </div>

              {preview && (
                <div className={`${styles.wizCard} mt-3`} role="group" aria-label={t("debts.wizard.effect")}>
                  <div className={styles.wizEffectHead}>{t("debts.wizard.effect")}</div>
                  {preview.interest > 0 && (
                    <>
                      <div className={styles.wizStatic}>
                        <span className={styles.wizLabel}>{t("debts.wizard.toInterest")}</span>
                        <span className={styles.wizValue}>{formatCurrency(preview.interest)}</span>
                      </div>
                      <div className={styles.wizStatic}>
                        <span className={styles.wizLabel}>{t("debts.wizard.toDebt")}</span>
                        <span className={styles.wizValue}>{formatCurrency(preview.principal)}</span>
                      </div>
                    </>
                  )}
                  <div className={styles.wizStatic}>
                    <span className={styles.wizLabel}>{t("debts.wizard.before")}</span>
                    <span className={styles.wizValue}>{formatCurrency(preview.remainingBefore)}</span>
                  </div>
                  <div className={styles.wizStatic}>
                    <span className={styles.wizLabel}>{t("debts.wizard.after")}</span>
                    <span className={`${styles.wizValue} ${preview.settles ? styles.wizDone : ""}`}>{left(preview.remainingAfter)}</span>
                  </div>
                </div>
              )}
              {preview?.overpays && <div className={`${styles.wizNote} mt-2`}>{t("debts.wizard.overpays")}</div>}
            </>
          )}
        </ModalBody>

        <ModalFooter className="justify-content-between">
          {step === "1" ? (
            <Button type="button" color="secondary" outline onClick={onClose}>
              {t("common.cancel")}
            </Button>
          ) : (
            <Button type="button" color="secondary" outline onClick={() => setStep(STEPS[index - 1])}>
              ‹ {t("common.back")}
            </Button>
          )}
          {step === "4" ? (
            <Button type="submit" color="success" disabled={record.isPending || !amountOk || !when}>
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
