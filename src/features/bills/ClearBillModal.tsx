import { useMemo, useState } from "react";
import { Modal, ModalHeader, ModalBody, Button, FormGroup, Label, Input } from "reactstrap";
import { useTranslation } from "react-i18next";
import type { BillWithStatus } from "../../shared/types/IndexTypes";
import { useCurrencyConverter } from "../../shared/hooks/useCurrencyConverter";
import { DateField } from "../../shared/components/DateField";
import { MoneyInput } from "../../shared/components/MoneyInput";
import { YesNoChoice } from "../../shared/components/YesNoChoice";
import { RequiredMark } from "../../shared/components/RequiredMark";
import { DialogFooter } from "../../shared/components/DialogFooter";
import { FORM_MODAL, moneyToneHead } from "../../shared/components/formModal";
import { useStepTried } from "../../shared/hooks/useStepTried";
import { dateFormat, dayToDate, formatRecordDay, isFutureDay, monthKey, parseISODay, toISODay } from "../../shared/utils/dates";
import AccountPicker from "../accounts/AccountPicker";
import { SpendNote } from "../accounts/SpendNote";
import { useSpendCheck } from "../accounts/useSpendCheck";
import { useMoneyAccounts } from "../accounts/useMoneyAccounts";
import { accountMissing, chosenAccount, expectedByAccount, mainAccount } from "../accounts/accountsUtils";
import { WizardSteps } from "../transactions/components/WizardSteps";
import wiz from "../../shared/css/Wizard.module.css";
import wizard from "../transactions/components/css/TransactionWizard.module.css";
import { clearablePeriods } from "./billsUtils";

const STEPS = ["months", "card", "amount", "when", "review"] as const;
type Step = (typeof STEPS)[number];

interface ClearBillModalProps {
  bill: BillWithStatus;
  onClose: () => void;
  /**
   * Amount in BASE currency; `periodKeys` oldest first (the clearing is filed
   * under the last); `stopFrom` "YYYY-MM" when it was a final bill.
   */
  onConfirm: (vars: { periodKeys: string[]; amount: number; paidDate: Date; accountId?: string; stopFrom?: string }) => void;
}

/**
 * «Ήρθε εκκαθαριστικό» (owner, 2026-11-26): a bill left to pile up — water, say,
 * three months — and then ONE final figure for all of it, paid once from a card.
 *
 * The months it closes come first, all ticked (the usual case is «all of
 * them»), then the card, then the figure on the paper — never filled in for
 * you: the reckoned total is shown beside it as a guide, and it is the one
 * thing the paper always differs on. Then when it was paid, and whether the
 * bill carries on: a final bill for a flat you have left stops the bill from
 * next month, kept in the history.
 *
 * Kept as he chose: one payment with the whole figure on the latest month and
 * one expense; the other months marked «covered» at 0 (`markBillCleared`).
 */
export default function ClearBillModal({ bill, onClose, onConfirm }: ClearBillModalProps) {
  const { t, i18n } = useTranslation();
  const lang = i18n.resolvedLanguage ?? "en";
  const { format, convertToBase, baseCurrency, displayCurrency } = useCurrencyConverter();
  const { accounts, latest, transactions, isLoading: moneyLoading } = useMoneyAccounts();
  const holds = useMemo(() => expectedByAccount(accounts, latest, transactions), [accounts, latest, transactions]);

  const periods = useMemo(() => clearablePeriods(bill), [bill]);
  const [unticked, setUnticked] = useState<Set<string>>(() => new Set());
  const chosen = periods.filter((p) => !unticked.has(p.periodKey));
  const estimate = Math.round(chosen.reduce((sum, p) => sum + p.estimate, 0) * 100) / 100;

  const [step, setStep] = useState<Step>("months");
  const { tried, mark: markTried } = useStepTried<Step>();
  const [account, setAccount] = useState("");
  const picked = chosenAccount(accounts, account);
  const cardMissing = accountMissing(accounts, account);
  const [amount, setAmount] = useState("");
  const typed = Number(amount);
  const amountOk = Number.isFinite(typed) && typed > 0 && typed <= 1_000_000;
  const [date, setDate] = useState(() => toISODay(new Date()));
  const dateOk = !!date && !isFutureDay(date);
  // «Συνεχίζεται;» starts on «Ναι»: stopping a bill is the rarer answer, and it moves no money.
  const [continues, setContinues] = useState<boolean | undefined>(true);

  // Stopping: from TODAY's month (owner, 2026-11-26 — «πληρώνω σήμερα όλους τους
  // προηγούμενους, άρα σταματάει από σήμερα»). It used to be the bill's NEXT
  // period, which for water billed every two months read «from January» on
  // 26 November. From this month on nothing is asked of it again; the months
  // this clearing closes keep their payments, and the history stays.
  const stopMonth = useMemo(() => monthKey(new Date()), []);

  // Paid from the card picked a step back (rule 22): no account below zero.
  const spend = useSpendCheck(picked || mainAccount(accounts)?.id, amountOk ? (baseCurrency === displayCurrency ? typed : convertToBase(typed)) : 0);

  const monthFmt = dateFormat("monthYear", lang);
  const monthsText = chosen.map((p) => monthFmt.format(p.date)).join(", ");

  const done = (s: Step): boolean => {
    if (s === "months") return chosen.length > 0;
    if (s === "card") return !cardMissing;
    if (s === "amount") return amountOk && !spend.blocked;
    if (s === "when") return dateOk && continues !== undefined;
    return true;
  };
  const index = STEPS.indexOf(step);
  /** Forward only as far as what is filled in allows; back is always free. */
  const goTo = (target: Step) => {
    const to = STEPS.indexOf(target);
    const blocked = STEPS.slice(0, to).find((s) => !done(s));
    if (blocked) {
      markTried(blocked);
      return setStep(blocked);
    }
    setStep(target);
  };

  const named = accounts.find((a) => a.id === picked);
  const main = mainAccount(accounts);
  const cardName = named ? named.name : main ? t("bills.pay.mainCard", { name: main.name }) : t("accounts.noCard");
  const effective = named ?? main;
  const cardNow = effective ? holds[effective.id] : undefined;
  const cardAfter = cardNow !== undefined && amountOk ? Math.round((cardNow - typed) * 100) / 100 : undefined;
  const chosenDate = parseISODay(date);

  const save = () => {
    if (!STEPS.slice(0, -1).every(done)) return;
    onConfirm({
      periodKeys: chosen.map((p) => p.periodKey),
      amount: baseCurrency === displayCurrency ? typed : convertToBase(typed),
      paidDate: dayToDate(date),
      accountId: picked || undefined,
      stopFrom: continues === false ? stopMonth : undefined,
    });
  };

  const toggle = (key: string) =>
    setUnticked((previous) => {
      const next = new Set(previous);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const rows: { step: Step; label: string; value: string; sub: string }[] = [
    { step: "months", label: t("bills.clear.rowMonths"), value: monthsText, sub: t("bills.clear.rowMonthsSub", { count: chosen.length }) },
    { step: "card", label: t("bills.pay.rowCard"), value: cardName, sub: t("bills.clear.rowCardSub") },
    { step: "amount", label: t("bills.clear.amountLabel"), value: format(amountOk ? typed : 0), sub: t("bills.clear.rowAmountSub", { estimate: format(estimate) }) },
    { step: "when", label: t("common.date"), value: chosenDate ? formatRecordDay(chosenDate, lang) : "—", sub: t("bills.clear.rowDateSub") },
    {
      step: "when",
      label: t("bills.clear.continues"),
      value: continues === false ? t("bills.clear.valueStops") : t("common.yes"),
      sub: continues === false ? t("bills.clear.rowStopsSub") : t("bills.clear.rowContinuesSub"),
    },
  ];

  return (
    <Modal {...FORM_MODAL} isOpen toggle={onClose} centered scrollable>
      {/* Money going out: the red tone on the HEADER (rule 15a). */}
      <ModalHeader className={moneyToneHead("expense")} toggle={onClose}>
        {t("bills.clear.title", { name: bill.name })}
      </ModalHeader>
      <form
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          if (step === "review") save();
          else goTo(STEPS[index + 1]);
        }}
      >
        <ModalBody>
          <WizardSteps steps={STEPS} current={step} onGo={goTo} label={(s) => t(`bills.clear.step_${s}`)} />
          <p className={wizard.prompt}>
            {t(`bills.clear.ask_${step}`)}
            {step !== "review" && <RequiredMark />}
          </p>

          {step === "months" && (
            <>
              <p className="mb-3" style={{ fontSize: "var(--fs-text)" }}>
                {t("bills.clear.intro")}
              </p>
              <div className="d-flex flex-column gap-1" role="group" aria-label={t("bills.clear.ask_months")}>
                {periods.map((p) => {
                  const id = `clear-${p.periodKey}`;
                  return (
                    <div key={id} className="d-flex align-items-center gap-2 py-1">
                      <Input id={id} type="checkbox" className="mt-0 flex-shrink-0" checked={!unticked.has(p.periodKey)} onChange={() => toggle(p.periodKey)} />
                      <Label for={id} className="mb-0 flex-grow-1 d-flex justify-content-between gap-2" style={{ fontSize: "var(--fs-text)", cursor: "pointer" }}>
                        <span>
                          {monthFmt.format(p.date)}
                          {p.current && <span className="text-body-secondary"> · {t("bills.clear.current")}</span>}
                        </span>
                        <span className="text-body-secondary" style={{ fontVariantNumeric: "tabular-nums" }}>
                          ~{format(p.estimate)}
                        </span>
                      </Label>
                    </div>
                  );
                })}
              </div>
              {tried("months") && chosen.length === 0 && <div className="invalid-feedback d-block">{t("bills.clear.monthsNeeded")}</div>}
            </>
          )}

          {step === "card" && <AccountPicker value={account} onChoose={setAccount} income={false} invalid={tried("card")} />}

          {step === "amount" && (
            <FormGroup className="mb-0">
              <Label for="clear-amount" className="small fw-medium">
                {t("bills.clear.amountLabel")}
                <RequiredMark />
              </Label>
              <MoneyInput id="clear-amount" required autoFocus value={amount} onChange={setAmount} invalid={(tried("amount") && !amountOk) || spend.blocked}>
                <div className="invalid-feedback">{t("validation.amountPositive")}</div>
              </MoneyInput>
              <div className="form-text">{t("bills.clear.estimateHint", { amount: format(estimate), count: chosen.length })}</div>
              <SpendNote check={spend} />
            </FormGroup>
          )}

          {step === "when" && (
            <>
              <FormGroup>
                <Label className="small fw-medium">
                  {t("common.date")}
                  <RequiredMark />
                </Label>
                <DateField happened name="clear-date" value={date} onChange={setDate} invalid={tried("when") && !dateOk} />
                {tried("when") && !dateOk && <div className="invalid-feedback d-block">{t("validation.notInFuture")}</div>}
              </FormGroup>
              <YesNoChoice className="mb-0" required question={t("bills.clear.continues")} value={continues} onChange={setContinues} />
              <div className="form-text">{continues === false ? t("bills.clear.stopsHint") : t("bills.clear.continuesHint")}</div>
            </>
          )}

          {step === "review" && (
            <>
              <div className={wiz.wizCard}>
                {rows.map((row) => (
                  <button key={row.label} type="button" className={wiz.wizRow} onClick={() => goTo(row.step)}>
                    <span className={wiz.wizLabel}>{row.label}</span>
                    <span className={wiz.wizValue}>
                      {row.value}
                      <span className={wiz.wizSub}>{row.sub}</span>
                    </span>
                  </button>
                ))}
              </div>
              <div className={`${wizard.reviewRows} mt-3`} role="group" aria-label={t("bills.pay.willHappen")}>
                <div>
                  <span>{t("bills.pay.willHappen")}</span>
                </div>
                <div>
                  <span>{t("bills.pay.willExpense")}</span>
                  <strong>
                    −{format(amountOk ? typed : 0)} · {cardName}
                  </strong>
                </div>
                {!moneyLoading && cardNow !== undefined && cardAfter !== undefined && (
                  <div>
                    <span>{t("bills.pay.willCard")}</span>
                    <strong>
                      {format(cardNow)} → {format(cardAfter)}
                    </strong>
                  </div>
                )}
                <div>
                  <span>{t("bills.clear.willMonths")}</span>
                  <strong>{monthsText}</strong>
                </div>
                {continues === false && (
                  <div>
                    <span>{t("bills.clear.willStop")}</span>
                    <strong>{t("bills.clear.willStopWhen")}</strong>
                  </div>
                )}
              </div>
            </>
          )}
        </ModalBody>

        {/* Ακύρωση / Πίσω on the left, the way forward on the right (rule 15b). */}
        <DialogFooter
          back={
            index === 0 ? (
              <Button type="button" color="secondary" outline onClick={onClose}>
                {t("common.cancel")}
              </Button>
            ) : (
              <Button type="button" color="secondary" outline onClick={() => setStep(STEPS[index - 1])}>
                ‹ {t("common.back")}
              </Button>
            )
          }
        >
          {step === "review" ? (
            <Button type="submit" color="primary" disabled={spend.blocked}>
              {t("bills.clear.confirm")}
            </Button>
          ) : (
            <Button type="submit" color="primary" disabled={step === "amount" && spend.blocked}>
              {t("common.next")} ›
            </Button>
          )}
        </DialogFooter>
      </form>
    </Modal>
  );
}
