import { useMemo, useState } from "react";
import { useFormik } from "formik";
import * as Yup from "yup";
import { toast } from "react-toastify";
import { Modal, ModalHeader, ModalBody, ModalFooter, Button, FormGroup, Label, Input, FormFeedback, FormText, Alert } from "reactstrap";
import { useTranslation } from "react-i18next";
import { DateField } from "../../shared/components/DateField";
import type { BillWithStatus } from "../../shared/types/IndexTypes";
import { useCurrencyConverter } from "../../shared/hooks/useCurrencyConverter";
import { parseISODay, toISODay } from "../../shared/utils/dates";
import AccountPicker from "../accounts/AccountPicker";
import { useMoneyAccounts } from "../accounts/useMoneyAccounts";
import { expectedByAccount, mainAccount } from "../accounts/accountsUtils";
import { WizardSteps } from "../transactions/components/WizardSteps";
import { formatTable } from "../transactions/transactionDates";
import wizard from "../transactions/components/css/TransactionWizard.module.css";
import { billOverdue, getInstallmentCount, getPeriodOptions, installmentAmount, MAX_ARREARS_LOOKBACK, paidInstallments, type PeriodOption } from "./billsUtils";

interface MarkPaidModalProps {
  bill: BillWithStatus;
  isSaving: boolean;
  /**
   * A period already chosen from the year grid.
   *
   * Shown as a fact rather than a dropdown when set: the month was picked
   * deliberately a moment ago, and re-offering a list of four around today
   * would not even contain it for a payment being filed years back.
   */
  presetPeriodKey?: string;
  /** An instalment already chosen from the year grid. Otherwise the next one owed. */
  presetInstallmentIndex?: number;
  onClose: () => void;
  /**
   * Amount is in base currency; `periodKey` names the period being covered;
   * `accountId` is the card or cash it was paid from, absent for the main account.
   */
  onConfirm: (amountInBase: number, paidDate: Date, periodKey: string, installmentIndex?: number, accountId?: string) => void;
}

/** How many periods forward the user may settle in one go. */
const PERIOD_CHOICES = 4;

/**
 * How many periods back can still be filed against — for recording history,
 * and for paying what is overdue. As far as the late figure itself looks back:
 * at six, water unpaid since ten months ago was counted as owed and could not
 * be chosen here, so the one thing that clears it was out of reach.
 */
const PERIOD_LOOKBACK = MAX_ARREARS_LOOKBACK;

const STEPS = ["amount", "when", "card", "review"] as const;
type Step = (typeof STEPS)[number];

/**
 * "September 2026", "2027", "Week of 14 Sep" — and a range when one period
 * spans several months, as it does for a bill that repeats every 2.
 */
function usePeriodLabel(bill: BillWithStatus) {
  const { t, i18n } = useTranslation();
  const lang = i18n.resolvedLanguage ?? "en";

  return (option: PeriodOption) => {
    if (bill.frequency === "yearly") {
      const years = option.start.getFullYear() === option.end.getFullYear() ? `${option.start.getFullYear()}` : `${option.start.getFullYear()}–${option.end.getFullYear()}`;
      return years;
    }

    const short = new Intl.DateTimeFormat(lang, { day: "numeric", month: "short" });
    if (bill.frequency === "weekly") return t("bills.weekOf", { date: short.format(option.start) });

    const month = new Intl.DateTimeFormat(lang, { month: "long", year: "numeric" });
    const sameMonth = option.start.getMonth() === option.end.getMonth() && option.start.getFullYear() === option.end.getFullYear();
    return sameMonth ? month.format(option.start) : `${new Intl.DateTimeFormat(lang, { month: "short" }).format(option.start)} – ${month.format(option.end)}`;
  };
}

/**
 * Paying a bill, in four steps — how much, when and for which period, from
 * which card, and the check — the only place Save is.
 *
 * The check says what is about to happen before it does: the expense that
 * will be written and the card it comes off, with that card's figure before
 * and after, and the period the bill will show as paid. A toast says what was
 * done once it is.
 *
 * Why the period is a field rather than simply "today's": money is often there
 * well before a bill is, and paying October's rent in September shouldn't have
 * to wait for the calendar to turn over.
 *
 * This is also how variable bills work: electricity might be €50 one month and
 * €120 the next, so the stored amount is only an estimate and the real figure
 * is entered here.
 */
export default function MarkPaidModal({ bill, isSaving, presetPeriodKey, presetInstallmentIndex, onClose, onConfirm }: MarkPaidModalProps) {
  const { t, i18n } = useTranslation();
  const lang = i18n.resolvedLanguage ?? "en";
  const { format, convert, convertToBase, baseCurrency, displayCurrency } = useCurrencyConverter();
  const periodLabel = usePeriodLabel(bill);
  // The cards, and what each holds now — from what is already loaded, without a read of its own.
  const { accounts, latest, transactions } = useMoneyAccounts({ fetch: false });
  const holds = useMemo(() => expectedByAccount(accounts, latest, transactions), [accounts, latest, transactions]);

  const periods = useMemo(() => getPeriodOptions(bill, bill.payments, new Date(), PERIOD_CHOICES, PERIOD_LOOKBACK), [bill]);
  // Behind on anything, the oldest of it comes first. Utilities are settled
  // oldest first, and a payment filed against this month instead left July
  // to September overdue while the bill read as paid — the Overview's "€180
  // late" row opened onto a form for October's €60. Only what is actually
  // overdue is chosen for you this way: a past period that is merely unpaid
  // and not late is still never picked.
  const oldestOverdue = useMemo(() => (presetPeriodKey ? undefined : billOverdue(bill).items[0]), [bill, presetPeriodKey]);
  // Otherwise the first period that still owes something — for a bill already
  // settled this month that is next month, which is the whole point of opening
  // this modal a second time.
  // Only from the current period on: past ones are offered for back-filling,
  // never chosen for you, or an unpaid month from March would quietly become
  // the default in August.
  const defaultPeriodKey =
    presetPeriodKey ?? oldestOverdue?.periodKey ?? (periods.find((p) => p.offset >= 0 && !p.isPaid) ?? periods.find((p) => p.offset === 0) ?? periods[0]).key;

  const isVariable = !!bill.isVariableAmount;
  // Suggest the average of past payments for variable bills — it's a better
  // starting point than a stale estimate.
  const periodTotal = isVariable ? (bill.averagePaidAmount ?? bill.amount) : bill.amount;

  // Which part of the period this settles. Whatever the grid was pressed on,
  // or else the first one still owed — never simply "the first", which would
  // re-file a payment already made.
  const installmentTotal = getInstallmentCount(bill);
  const settledForPeriod = paidInstallments(bill.payments, defaultPeriodKey);
  const installmentIndex =
    presetInstallmentIndex ??
    oldestOverdue?.installmentIndex ??
    Array.from({ length: installmentTotal }, (_, i) => i).find((i) => !settledForPeriod.has(i)) ??
    installmentTotal - 1;

  // The overdue one at what it is owed for — the figure the late list showed
  // for it, which is the part's price unless an earlier part was overpaid.
  const suggestedBase = oldestOverdue ? oldestOverdue.amount : installmentAmount(bill, periodTotal, installmentIndex);
  const suggestedInDisplay = Number(convert(suggestedBase).toFixed(2));

  const validationSchema = useMemo(
    () =>
      Yup.object({
        amount: Yup.number()
          .typeError("validation.amountNumber")
          .required("validation.amountRequired")
          .positive("validation.amountPositive")
          .max(1_000_000, "validation.amountTooLarge"),
        date: Yup.string().required("validation.dateRequired"),
        periodKey: Yup.string().required("validation.periodRequired"),
      }),
    [],
  );

  const [step, setStep] = useState<Step>("amount");
  // The card or cash it was paid from; "" is the main account, as on any expense.
  const [account, setAccount] = useState("");

  const formik = useFormik({
    initialValues: { amount: suggestedInDisplay, date: toISODay(new Date()), periodKey: defaultPeriodKey },
    validationSchema,
    onSubmit: (values) => {
      const typed = Number(values.amount);
      const amountInBase = baseCurrency === displayCurrency ? typed : convertToBase(typed);
      const when = parseISODay(values.date) ?? new Date(values.date);
      const period = periods.find((p) => p.key === values.periodKey);
      onConfirm(amountInBase, when, values.periodKey, installmentTotal > 1 ? installmentIndex : undefined, account || undefined);
      // Said once it is done, for what it is: the bill, how much, from where, for when.
      toast.success(t("bills.pay.done", { name: bill.name, amount: format(typed), card: cardName, period: period ? periodLabel(period) : values.periodKey }));
    },
  });

  const typedAmount = Number(formik.values.amount) || 0;
  const differsFromEstimate = isVariable && Math.abs(typedAmount - suggestedInDisplay) > 0.01;

  const selectedPeriod = periods.find((p) => p.key === formik.values.periodKey);
  const payingAhead = !!selectedPeriod && selectedPeriod.offset > 0;

  // A preset can name a period years outside the offered window, so its label
  // is built from the key itself rather than looked up.
  const presetLabel = presetPeriodKey ? (periods.find((p) => p.key === presetPeriodKey) ? periodLabel(periods.find((p) => p.key === presetPeriodKey)!) : presetPeriodKey) : "";
  const chosenPeriodLabel = selectedPeriod ? periodLabel(selectedPeriod) : presetPeriodKey ? presetLabel : formik.values.periodKey;

  // The trap this catches: a date from a past period filed against the current
  // one. Paying *ahead* also has a date outside its period, which is normal and
  // must not be flagged — so only a date landing in an earlier period counts.
  const chosenDate = parseISODay(formik.values.date);
  const periodForDate = chosenDate ? periods.find((p) => chosenDate >= p.start && chosenDate <= p.end) : undefined;
  const dateBelongsElsewhere = periodForDate && periodForDate.offset < 0 && periodForDate.key !== formik.values.periodKey ? periodForDate : undefined;

  // ── The card, said in words, and what it will hold ──
  const named = accounts.find((a) => a.id === account);
  const main = mainAccount(accounts);
  const cardName = named ? named.name : main ? t("bills.pay.mainCard", { name: main.name }) : t("accounts.noCard");
  const effective = named ?? main;
  const cardNow = effective ? holds[effective.id] : undefined;
  const cardAfter = cardNow !== undefined ? Math.round((cardNow - typedAmount) * 100) / 100 : undefined;

  const index = STEPS.indexOf(step);

  /** Forward only as far as what is filled in allows; back is always free. */
  const goTo = async (target: Step) => {
    const to = STEPS.indexOf(target);
    if (to > index || to > 0) {
      const errors = await formik.validateForm();
      if (errors.amount) {
        formik.setFieldTouched("amount", true);
        return setStep("amount");
      }
      if (to > 1 && (errors.date || errors.periodKey)) {
        formik.setFieldTouched("date", true);
        formik.setFieldTouched("periodKey", true);
        return setStep("when");
      }
    }
    setStep(target);
  };

  const rows: { step: Step; label: string; value: string }[] = [
    { step: "amount", label: t("bills.pay.rowAmount"), value: format(typedAmount) + (installmentTotal > 1 ? ` · ${t("bills.pay.partOf", { index: installmentIndex + 1, count: installmentTotal })}` : "") },
    { step: "when", label: t("common.date"), value: chosenDate ? formatTable(chosenDate, lang) : "—" },
    { step: "when", label: t("bills.pay.rowPeriod"), value: chosenPeriodLabel },
    { step: "card", label: t("bills.pay.rowCard"), value: cardName },
  ];

  return (
    <Modal isOpen toggle={onClose} centered scrollable>
      <ModalHeader toggle={onClose}>
        {t("bills.pay.title")} · {bill.name}
      </ModalHeader>

      <form
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          if (step === "review") formik.submitForm();
          else void goTo(STEPS[index + 1]);
        }}
      >
        <ModalBody>
          <WizardSteps steps={STEPS} current={step} onGo={(s) => void goTo(s)} label={(s) => t(`bills.pay.step_${s}`)} />
          <p className={wizard.prompt}>{t(`bills.pay.ask_${step}`)}</p>

          {step === "amount" && (
            <>
              {installmentTotal > 1 && (
                <Alert color="warning" className="py-2" style={{ fontSize: 12 }}>
                  {t("bills.payingInstallment", {
                    index: installmentIndex + 1,
                    count: installmentTotal,
                    amount: format(installmentAmount(bill, periodTotal, installmentIndex)),
                    total: format(periodTotal),
                  })}
                </Alert>
              )}

              {isVariable && (
                <Alert color="info" className="py-2" style={{ fontSize: 12 }}>
                  {bill.averagePaidAmount ? t("bills.variableHintWithAverage", { amount: format(bill.averagePaidAmount) }) : t("bills.variableHint", { amount: format(bill.amount) })}
                </Alert>
              )}

              <FormGroup className="mb-0">
                <Label for="pay-amount" className="small fw-medium">
                  {t("common.amount")} ({displayCurrency}) *
                </Label>
                <Input
                  id="pay-amount"
                  type="number"
                  name="amount"
                  min={0.01}
                  step={0.01}
                  autoFocus
                  value={formik.values.amount}
                  onChange={formik.handleChange}
                  onBlur={formik.handleBlur}
                  invalid={!!(formik.touched.amount && formik.errors.amount)}
                />
                <FormFeedback>{formik.errors.amount && t(formik.errors.amount)}</FormFeedback>
                {differsFromEstimate && <FormText style={{ fontSize: 11 }}>{t("bills.differsFromEstimate")}</FormText>}
              </FormGroup>
            </>
          )}

          {step === "when" && (
            <>
              <FormGroup>
                <Label className="small fw-medium">{t("common.date")} *</Label>
                <DateField
                  name="date"
                  value={formik.values.date}
                  onChange={(v) => formik.setFieldValue("date", v)}
                  onBlur={() => formik.setFieldTouched("date", true)}
                  invalid={!!(formik.touched.date && formik.errors.date)}
                />
                <FormFeedback>{formik.errors.date && t(formik.errors.date)}</FormFeedback>
              </FormGroup>

              {/* Which period the money settles — separate from the date it left
                  the account, so an early payment lands on the right month. */}
              {presetPeriodKey ? (
                <div className="p-2" style={{ borderRadius: "var(--border-radius-md)", background: "var(--color-background-secondary)", fontSize: 13 }}>
                  {t("bills.payForPeriod", { period: presetLabel })}
                </div>
              ) : (
                <FormGroup className="mb-0">
                  <Label className="small fw-medium">{t("bills.paymentPeriod")}</Label>
                  <Input type="select" name="periodKey" value={formik.values.periodKey} onChange={formik.handleChange} onBlur={formik.handleBlur}>
                    {periods.map((option) => (
                      <option key={option.key} value={option.key} disabled={option.isPaid}>
                        {periodLabel(option)}
                        {option.offset === 0 ? ` — ${t("bills.periodCurrent")}` : ""}
                        {option.offset < 0 ? ` — ${t("bills.periodPast")}` : ""}
                        {option.isPaid ? ` — ${t("bills.periodAlreadyPaid")}` : ""}
                      </option>
                    ))}
                  </Input>
                  <FormText style={{ fontSize: 11 }}>{t("bills.paymentPeriodHint")}</FormText>
                </FormGroup>
              )}

              {dateBelongsElsewhere && (
                <Alert color="warning" className="py-2 mt-2 mb-0" style={{ fontSize: 12 }}>
                  <div className="mb-2">{t("bills.periodDateMismatch", { period: periodLabel(dateBelongsElsewhere) })}</div>
                  <Button type="button" color="warning" size="sm" disabled={dateBelongsElsewhere.isPaid} onClick={() => formik.setFieldValue("periodKey", dateBelongsElsewhere.key)}>
                    {dateBelongsElsewhere.isPaid ? t("bills.periodAlreadyPaid") : t("bills.usePeriod", { period: periodLabel(dateBelongsElsewhere) })}
                  </Button>
                </Alert>
              )}

              {/* Say why a past period is already chosen, so it is not mistaken for
                  a slip — and that it can be changed. */}
              {oldestOverdue && formik.values.periodKey === oldestOverdue.periodKey && selectedPeriod && (
                <Alert color="danger" className="py-2 mt-2 mb-0" style={{ fontSize: 12 }}>
                  {t("bills.payingOldestOverdue", { period: periodLabel(selectedPeriod) })}
                </Alert>
              )}

              {payingAhead && !dateBelongsElsewhere && (
                <Alert color="info" className="py-2 mt-2 mb-0" style={{ fontSize: 12 }}>
                  {t("bills.payingAheadHint", { period: periodLabel(selectedPeriod) })}
                </Alert>
              )}
            </>
          )}

          {step === "card" && <AccountPicker value={account} onChoose={setAccount} income={false} />}

          {step === "review" && (
            <>
              <div className={wizard.reviewRows}>
                {rows.map((row) => (
                  <button key={row.label} type="button" onClick={() => void goTo(row.step)}>
                    <span>{row.label}</span>
                    <strong>{row.value}</strong>
                  </button>
                ))}
              </div>

              {/* What will happen, so nothing is a surprise after Save. */}
              <div className={`${wizard.reviewRows} mt-3`} role="group" aria-label={t("bills.pay.willHappen")}>
                <div>
                  <span>{t("bills.pay.willHappen")}</span>
                </div>
                <div>
                  <span>{t("bills.pay.willExpense")}</span>
                  <strong>
                    −{format(typedAmount)} · {cardName}
                  </strong>
                </div>
                {cardNow !== undefined && cardAfter !== undefined && (
                  <div>
                    <span>{t("bills.pay.willCard")}</span>
                    <strong>
                      {format(cardNow)} → {format(cardAfter)}
                    </strong>
                  </div>
                )}
                <div>
                  <span>{t("bills.pay.willBill")}</span>
                  <strong>{t("bills.pay.paidFor", { period: chosenPeriodLabel })}</strong>
                </div>
              </div>
            </>
          )}
        </ModalBody>

        <ModalFooter className="justify-content-between">
          {step === "amount" ? (
            <Button type="button" color="secondary" outline onClick={onClose} disabled={isSaving}>
              {t("common.cancel")}
            </Button>
          ) : (
            <Button type="button" color="secondary" outline onClick={() => setStep(STEPS[index - 1])} disabled={isSaving}>
              ‹ {t("common.back")}
            </Button>
          )}
          {step === "review" ? (
            <Button type="submit" color="success" disabled={isSaving}>
              {isSaving ? t("common.saving") : t("bills.confirmPaid")}
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
