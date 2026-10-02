import { useMemo, useState } from "react";
import { Alert, Button, FormFeedback, FormGroup, Input, Label, Modal, ModalBody, ModalFooter, ModalHeader } from "reactstrap";
import { useTranslation } from "react-i18next";
import { addMonths, startOfDay } from "date-fns";
import type { Category } from "../../../shared/types/IndexTypes";
import { DateField } from "../../../shared/components/DateField";
import { useCurrencyConverter } from "../../../shared/hooks/useCurrencyConverter";
import { parseISODay, toISODay, toISOMonth } from "../../../shared/utils/dates";
import { categoryLabel } from "../../../shared/utils/categories";
import { isPausedOn } from "../../bills/billsUtils";
import type { MoneyAccount } from "../../accounts/accountsUtils";
import { bankAnswerDate, isOnReadingDay, isSettled, type ArrivalInput, type ExpectedAmount, type Income, type IncomeStatus } from "../incomesUtils";
import type { IncomeFormats } from "../incomeText";
import segmented from "../../../shared/css/Segmented.module.css";
import styles from "../css/IncomesPage.module.css";

// «Ήρθε»: four fields and one button.
//
//   Πόσα ήρθαν — the figure, or for a variable income its mean, with the
//                 reminder to write what actually came.
//   Πότε       — today; from the bank question, no later than the reading.
//   Πού μπήκαν — the income's own account, else the main one.
//   Για τον μήνα — which time it settles, like a bill's period: money that
//                 comes early is still for the month it is for.
//
// It writes an ordinary income transaction (see `arrivalTransaction`), so
// there is nothing here that the Transactions page cannot show or undo.

export interface ArrivedSheetProps {
  income: Income;
  /** The time it was opened for. */
  status: IncomeStatus;
  /** Every time of this income the page knows — the choices for «Για τον μήνα». */
  options: IncomeStatus[];
  expected: ExpectedAmount;
  /** Set when opened from «Ναι, ήταν μέσα»: the date may not pass the reading. */
  readingAt?: Date;
  accounts: MoneyAccount[];
  mainAccountId?: string;
  category?: Category;
  f: IncomeFormats;
  onConfirm: (status: IncomeStatus, input: ArrivalInput) => void;
  onClose: () => void;
}

interface Choice {
  key: string;
  label: string;
  status?: IncomeStatus;
  note?: string;
}

/**
 * The times around the one opened: last month, this one, next. A monthly
 * income names them by month and shows a paused month as such («Αύγ · παύση»),
 * so the gap is explained rather than missing; weekly and yearly ones name
 * them by day.
 */
function choicesFor(income: Income, status: IncomeStatus, options: IncomeStatus[], f: IncomeFormats, t: (key: string) => string): Choice[] {
  const mine = options.filter((s) => s.incomeId === income.id);
  if (income.frequency === "monthly") {
    return [-1, 0, 1].flatMap((offset): Choice[] => {
      const month = addMonths(new Date(status.date.getFullYear(), status.date.getMonth(), 1), offset);
      const key = toISOMonth(month);
      const found = offset === 0 ? status : mine.find((s) => s.forMonth === key);
      const label = f.monthShort.format(month);
      if (found) return [{ key: found.key, label, status: found, note: offset !== 0 && isSettled(found) ? t("incomes.arrived.alreadyIn") : undefined }];
      if (isPausedOn({ pause: income.pause }, month)) return [{ key, label, note: t("incomes.arrived.paused") }];
      return [];
    });
  }
  const index = mine.findIndex((s) => s.key === status.key);
  const around = index < 0 ? [status] : mine.slice(Math.max(0, index - 1), index + 2);
  return around.map((s) => ({ key: s.key, label: f.dayMonthShort.format(s.date), status: s, note: s.key !== status.key && isSettled(s) ? t("incomes.arrived.alreadyIn") : undefined }));
}

export default function ArrivedSheet({ income, status, options, expected, readingAt, accounts, mainAccountId, category, f, onConfirm, onClose }: ArrivedSheetProps) {
  const { t } = useTranslation();
  const { format, convert, convertToBase, baseCurrency, displayCurrency } = useCurrencyConverter();

  const choices = useMemo(() => choicesFor(income, status, options, f, t), [income, status, options, f, t]);
  const [chosenKey, setChosenKey] = useState(status.key);
  const chosen = choices.find((c) => c.key === chosenKey)?.status ?? status;

  const readingDay = readingAt ? startOfDay(readingAt) : undefined;
  const [amount, setAmount] = useState(() => String(Number(convert(status.expected).toFixed(2))));
  const [date, setDate] = useState(() => toISODay(readingAt ? bankAnswerDate(status, readingAt) : new Date()));
  const ownAccount = income.accountId && accounts.some((a) => a.id === income.accountId) ? income.accountId : undefined;
  const [accountId, setAccountId] = useState(ownAccount ?? mainAccountId ?? "");
  const [touched, setTouched] = useState(false);

  const typed = Number(amount.replace(",", "."));
  const amountError = !Number.isFinite(typed) || amount.trim() === "" ? "validation.amountRequired" : typed <= 0 ? "validation.amountPositive" : typed > 1_000_000 ? "validation.amountTooLarge" : undefined;
  const day = parseISODay(date);
  const dateError = !day ? "validation.dateRequired" : readingDay && day > readingDay ? "incomes.arrived.afterReading" : undefined;

  const submit = () => {
    setTouched(true);
    if (amountError || dateError || !day) return;
    onConfirm(chosen, {
      amount: baseCurrency === displayCurrency ? typed : convertToBase(typed),
      date: day,
      categoryId: category?.id ?? income.categoryId ?? "",
      accountId: accountId || undefined,
      inReading: !!readingAt && isOnReadingDay(day, readingAt),
    });
  };

  const range = expected.recent.length > 1 ? { min: Math.min(...expected.recent), max: Math.max(...expected.recent) } : undefined;
  // What was typed, in the display currency as typed — not converted again.
  const display = Number.isFinite(typed) && typed > 0 ? new Intl.NumberFormat(f.lang, { style: "currency", currency: displayCurrency }).format(typed) : "";

  return (
    <Modal isOpen toggle={onClose} centered>
      <ModalHeader toggle={onClose}>
        <span className="d-block">{income.name}</span>
        <span className="d-block fw-normal text-body-secondary" style={{ fontSize: 13 }}>
          {chosen.undated
            ? t("incomes.arrived.subtitleUndated", { month: f.monthName(chosen.date) })
            : t("incomes.arrived.subtitle", { month: f.monthName(chosen.date), date: f.weekdayDate.format(chosen.expectedDate) })}
        </span>
      </ModalHeader>
      <form
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <ModalBody>
          <FormGroup>
            <Label for="arrived-amount" className="small fw-medium">
              {t("incomes.arrived.amount")} ({displayCurrency})
            </Label>
            <Input
              id="arrived-amount"
              type="number"
              inputMode="decimal"
              min={0.01}
              step={0.01}
              className={styles.amountInput}
              autoFocus={!!income.variable}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              invalid={touched && !!amountError}
            />
            <FormFeedback>{amountError && t(amountError)}</FormFeedback>
            {income.variable && (
              <div className="text-body-secondary mt-1" style={{ fontSize: 12 }}>
                {expected.estimated
                  ? t("incomes.arrived.estimateHint", { amount: format(expected.amount) })
                  : range
                    ? t("incomes.arrived.meanRangeHint", { amount: format(expected.amount), min: format(range.min), max: format(range.max) })
                    : t("incomes.arrived.meanHint", { amount: format(expected.amount) })}
              </div>
            )}
          </FormGroup>

          <FormGroup>
            <Label for="arrived-date" className="small fw-medium">
              {t("incomes.arrived.when")}
            </Label>
            <DateField id="arrived-date" value={date} onChange={setDate} maxDate={readingDay} invalid={touched && !!dateError} />
            {touched && dateError && <div className="invalid-feedback d-block">{t(dateError)}</div>}
          </FormGroup>

          {accounts.length > 0 && (
            <FormGroup>
              <Label className="small fw-medium d-block">{t("incomes.arrived.where")}</Label>
              <div className={segmented.group} role="radiogroup" aria-label={t("incomes.arrived.where")}>
                {accounts.map((account) => (
                  <button
                    key={account.id}
                    type="button"
                    role="radio"
                    aria-checked={accountId === account.id}
                    className={`${segmented.item} ${accountId === account.id ? segmented.active : ""}`}
                    onClick={() => setAccountId(account.id)}
                  >
                    {account.kind === "cash" ? "💵 " : ""}
                    {account.name}
                  </button>
                ))}
              </div>
            </FormGroup>
          )}

          {choices.length > 1 && (
            <FormGroup className="mb-0">
              <Label className="small fw-medium d-block">{income.frequency === "monthly" ? t("incomes.arrived.forMonth") : t("incomes.arrived.forTime")}</Label>
              <div className={`${segmented.group} ${segmented.even}`} role="radiogroup" aria-label={t("incomes.arrived.forMonth")}>
                {choices.map((choice) => {
                  const disabled = !choice.status || (choice.key !== status.key && isSettled(choice.status));
                  return (
                    <button
                      key={choice.key}
                      type="button"
                      role="radio"
                      aria-checked={chosenKey === choice.key}
                      disabled={disabled}
                      className={`${segmented.item} ${chosenKey === choice.key ? segmented.active : ""}`}
                      onClick={() => setChosenKey(choice.key)}
                    >
                      {choice.label}
                      {choice.note ? ` · ${choice.note}` : ""}
                    </button>
                  );
                })}
              </div>
            </FormGroup>
          )}

          {readingAt && (
            <Alert color="info" className="py-2 mt-3 mb-0" style={{ fontSize: 12 }}>
              {t("incomes.arrived.bankNote", { date: f.weekdayDate.format(readingAt), amount: display || format(status.expected) })}
            </Alert>
          )}

          <p className="text-body-secondary mb-0 mt-3" style={{ fontSize: 11.5 }}>
            {t("incomes.arrived.willLog", { category: category ? categoryLabel(category.name, t) : t("incomes.arrived.noCategory") })}
          </p>
        </ModalBody>
        <ModalFooter>
          <Button type="button" color="secondary" outline onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button type="submit" color="success">
            {display ? t("incomes.arrived.submit", { amount: display }) : t("incomes.arrived.submitPlain")}
          </Button>
        </ModalFooter>
      </form>
    </Modal>
  );
}
