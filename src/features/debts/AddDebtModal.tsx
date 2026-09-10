import { useState } from "react";
import { Button, Form, FormGroup, Input, InputGroup, InputGroupText, Label, Modal, ModalBody, ModalFooter, ModalHeader } from "reactstrap";
import { useTranslation } from "react-i18next";
import { PayeeInput } from "../transactions/components/PayeeInput";
import { useCurrencyConverter } from "../../shared/hooks/useCurrencyConverter";
import { useCreateDebt } from "./useDebts";
import { monthlyInstalment } from "./debtsUtils";
import { DateField } from "../../shared/components/DateField";
import { RateHelpButton } from "./RateExplainer";
import styles from "./css/DebtsPage.module.css";
import segmented from "../../shared/css/Segmented.module.css";
import type { DebtDirection, DebtRateType } from "../../shared/types/IndexTypes";

const today = () => new Date().toISOString().slice(0, 10);

/**
 * Recording a loan.
 *
 * Direction is a pair of buttons rather than a sign on the amount: "which way
 * did the money go" is the one thing that must never be ambiguous, and a minus
 * sign in a text field is exactly the kind of detail that is misread once and
 * then never noticed again.
 */
export default function AddDebtModal({ knownPeople, onClose }: { knownPeople: string[]; onClose: () => void }) {
  const { t, i18n } = useTranslation();
  const { baseCurrency, format: formatCurrency } = useCurrencyConverter();
  // The same locale the money formatter uses: 3,5% in Greek, 3.5% in English.
  const pct = new Intl.NumberFormat(i18n.resolvedLanguage ?? "en", { maximumFractionDigits: 2 });
  const create = useCreateDebt();

  const [direction, setDirection] = useState<DebtDirection>("owed_by_me");
  const [person, setPerson] = useState("");
  const [label, setLabel] = useState("");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(today);
  const [dueDate, setDueDate] = useState("");
  const [withInterest, setWithInterest] = useState(false);
  const [rateType, setRateType] = useState<DebtRateType>("fixed");
  const [rate, setRate] = useState("");
  const [base, setBase] = useState("");
  const [margin, setMargin] = useState("");
  const [term, setTerm] = useState("");
  const [free, setFree] = useState("");
  const [touched, setTouched] = useState(false);

  const value = parseFloat(amount);
  const termValue = parseInt(term, 10);
  const freeValue = Number.isFinite(parseInt(free, 10)) ? Math.max(parseInt(free, 10), 0) : 0;
  // A term is enough to make it a loan: twelve άτοκες δόσεις charge nothing and
  // are still a fixed payment with a known end.
  const isLoanEntry = withInterest && Number.isFinite(termValue) && termValue > 0;

  // A floating loan is quoted in two parts, and only the second one is the
  // bank's for keeps. What every figure below is worked out from is their sum —
  // which is true today and will be something else at the next reset.
  const floating = rateType === "floating";
  const num = (raw: string) => (Number.isFinite(parseFloat(raw)) ? parseFloat(raw) : 0);
  const allInRate = floating ? Math.max(num(base) + num(margin), 0) : Math.max(num(rate), 0);
  const instalment = isLoanEntry && Number.isFinite(value) ? monthlyInstalment(value, allInRate, termValue, freeValue) : 0;
  const personInvalid = touched && person.trim() === "";
  const amountInvalid = touched && !(Number.isFinite(value) && value > 0);

  // The two cells that appear in both layouts, written once.
  const termField = (
    <FormGroup className="flex-fill">
      <Label className="small fw-medium">{t("debts.termMonths")}</Label>
      <InputGroup>
        <Input type="number" min={1} step="1" inputMode="numeric" value={term} onChange={(e) => setTerm(e.target.value)} placeholder="60" />
        <InputGroupText>{t("debts.monthsUnit")}</InputGroupText>
      </InputGroup>
    </FormGroup>
  );

  const freeField = (
    <FormGroup className="flex-fill">
      <Label className="small fw-medium">{t("debts.interestFree")}</Label>
      <InputGroup>
        <Input type="number" min={0} step="1" inputMode="numeric" value={free} onChange={(e) => setFree(e.target.value)} placeholder="0" />
        <InputGroupText>{t("debts.monthsUnit")}</InputGroupText>
      </InputGroup>
    </FormGroup>
  );

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setTouched(true);
    if (person.trim() === "" || !Number.isFinite(value) || value <= 0) return;

    create.mutate(
      {
        person: person.trim(),
        direction,
        label: label.trim() || undefined,
        amount: value,
        date: new Date(date),
        dueDate: dueDate ? new Date(dueDate) : undefined,
        // Only when both are there: a rate without a term cannot be amortised,
        // and half a loan is worse than none. On a floating loan the stored rate
        // is the sum of the two parts, so anything reading only that still gets
        // the rate in force; the parts are kept beside it so the index can be
        // updated on its own when it moves.
        interestRate: isLoanEntry && allInRate > 0 ? allInRate : undefined,
        termMonths: isLoanEntry ? termValue : undefined,
        interestFreeMonths: isLoanEntry && freeValue > 0 ? freeValue : undefined,
        rateType: isLoanEntry && floating ? "floating" : undefined,
        baseRate: isLoanEntry && floating ? num(base) : undefined,
        margin: isLoanEntry && floating ? num(margin) : undefined,
        rateReviewedAt: isLoanEntry && floating ? new Date() : undefined,
      },
      { onSuccess: onClose },
    );
  };

  return (
    <Modal isOpen toggle={onClose} centered scrollable>
      <ModalHeader toggle={onClose}>{t("debts.add")}</ModalHeader>
      <Form onSubmit={submit}>
        <ModalBody className={direction === "owed_by_me" ? "wash-expense" : "wash-income"}>
          {/* Two answers, half the row each, and the selected side filled in the
              colour that side means everywhere else: red is money you owe. */}
          <div className={`${segmented.group} ${segmented.even} mb-3`} role="group" aria-label={t("debts.direction")}>
            <button
              type="button"
              className={`${segmented.item} ${segmented.owe} ${direction === "owed_by_me" ? segmented.active : ""}`}
              aria-pressed={direction === "owed_by_me"}
              onClick={() => setDirection("owed_by_me")}
            >
              {t("debts.iBorrowed")}
            </button>
            <button
              type="button"
              className={`${segmented.item} ${segmented.lend} ${direction === "owed_to_me" ? segmented.active : ""}`}
              aria-pressed={direction === "owed_to_me"}
              onClick={() => setDirection("owed_to_me")}
            >
              {t("debts.iLent")}
            </button>
          </div>

          <FormGroup>
            <Label className="small fw-medium">{t("debts.person")} *</Label>
            {/* The same picker the payee field uses. It was a native
                `datalist`, which most phone keyboards ignore outright — so on
                the screen where it mattered there were no suggestions at all,
                and a name spelled a shade differently started a second person
                with the same debts split between them. */}
            <PayeeInput
              value={person}
              payees={knownPeople}
              onChange={setPerson}
              invalid={personInvalid}
              placeholder={t("debts.personPlaceholder")}
              wording={{ field: "debts.person", useTyped: "debts.useTypedPerson", empty: "debts.noPersonMatches" }}
            />
          </FormGroup>

          <FormGroup>
            <Label className="small fw-medium">{t("common.amount")} *</Label>
            <InputGroup>
              <InputGroupText>{baseCurrency}</InputGroupText>
              <Input type="number" min={0} step="0.01" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} invalid={amountInvalid} placeholder="0" />
            </InputGroup>
          </FormGroup>

          <FormGroup>
            <Label className="small fw-medium">{t("debts.what")}</Label>
            <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder={t("debts.whatPlaceholder")} />
          </FormGroup>

          {/* A loan, rather than money between two people. Two figures turn one
              into the other, and the cost of it appears before anything is
              saved — which is the moment it is worth knowing. */}
          <FormGroup className="mt-3">
            <div className="form-check form-switch">
              <input className="form-check-input" type="checkbox" role="switch" id="debt-is-loan" checked={withInterest} onChange={(e) => setWithInterest(e.target.checked)} />
              <Label className="form-check-label small fw-medium" for="debt-is-loan">
                {t("debts.withInterest")}
              </Label>
            </div>
            {!withInterest && <small className="text-body-secondary">{t("debts.withInterestHint")}</small>}
          </FormGroup>

          {withInterest && (
            <>
              {/* Fixed or floating, before any figure is typed. Most mortgages
                  here are floating — an index plus a margin, re-read every few
                  months — and a loan recorded as fixed quietly promises a
                  payment the bank never promised. */}
              <div className={`${segmented.group} ${segmented.even} mb-1`} role="group" aria-label={t("debts.interestRate")}>
                <button type="button" className={`${segmented.item} ${!floating ? segmented.active : ""}`} aria-pressed={!floating} onClick={() => setRateType("fixed")}>
                  {t("debts.rateFixed")}
                </button>
                <button type="button" className={`${segmented.item} ${floating ? segmented.active : ""}`} aria-pressed={floating} onClick={() => setRateType("floating")}>
                  {t("debts.rateFloating")}
                </button>
              </div>
              <small className="text-body-secondary d-block mb-2">
                {t("debts.rateTypeHint")}
                <RateHelpButton formatCurrency={formatCurrency} locale={i18n.resolvedLanguage ?? "en"} />
              </small>

              {/* Two fields to a row, never three. At 375px a third one squeezes
                  the number inputs to forty pixels and "300" cannot be read in
                  the box it was typed into. */}
              {floating ? (
                <>
                  <div className="d-flex gap-2">
                    <FormGroup className="flex-fill">
                      <Label className="small fw-medium">{t("debts.baseRate")}</Label>
                      <InputGroup>
                        <Input type="number" min={0} step="0.01" inputMode="decimal" value={base} onChange={(e) => setBase(e.target.value)} placeholder="2.4" />
                        <InputGroupText>%</InputGroupText>
                      </InputGroup>
                    </FormGroup>

                    <FormGroup className="flex-fill">
                      <Label className="small fw-medium">{t("debts.margin")}</Label>
                      <InputGroup>
                        <Input type="number" min={0} step="0.01" inputMode="decimal" value={margin} onChange={(e) => setMargin(e.target.value)} placeholder="1.2" />
                        <InputGroupText>%</InputGroupText>
                      </InputGroup>
                    </FormGroup>
                  </div>

                  <div className="d-flex gap-2">
                    {termField}
                    {freeField}
                  </div>
                </>
              ) : (
                <>
                  <div className="d-flex gap-2">
                    <FormGroup className="flex-fill">
                      <Label className="small fw-medium">{t("debts.interestRate")}</Label>
                      <InputGroup>
                        <Input type="number" min={0} step="0.01" inputMode="decimal" value={rate} onChange={(e) => setRate(e.target.value)} placeholder="7" />
                        <InputGroupText>%</InputGroupText>
                      </InputGroup>
                    </FormGroup>
                    {termField}
                  </div>

                  <div className="d-flex gap-2">
                    {freeField}
                    <div className="flex-fill" />
                  </div>
                </>
              )}
              <small className="text-body-secondary d-block mb-2">{t("debts.interestFreeHint")}</small>

              {instalment > 0 && (
                <div className={styles.loanPreview}>
                  <span className={styles.loanPreviewAmount}>
                    {t("debts.instalmentIs", { amount: formatCurrency(instalment) })}
                    {floating && <span className={styles.loanPreviewNote}> · {t("debts.atTodaysRate")}</span>}
                  </span>
                  <span className={styles.loanPreviewCost}>
                    {t("debts.loanCost", { total: formatCurrency(instalment * termValue), interest: formatCurrency(Math.max(instalment * termValue - value, 0)) })}
                  </span>
                  {floating && <span className={styles.loanPreviewCost}>{t("debts.rateParts", { base: pct.format(num(base)), margin: pct.format(num(margin)) })} = {pct.format(allInRate)}%</span>}
                  {freeValue > 0 && allInRate > 0 && <span className={styles.loanPreviewCost}>{t("debts.freeThenCharged", { free: freeValue, rate: pct.format(allInRate) })}</span>}
                </div>
              )}
            </>
          )}

          <FormGroup>
            <Label className="small fw-medium">{t("debts.when")}</Label>
            <DateField id="debt-date" name="debt-date" value={date} onChange={setDate} placeholder={t("common.date")} />
          </FormGroup>

          <FormGroup className="mb-0">
            <Label className="small fw-medium">{t("debts.dueDate")}</Label>
            <DateField id="debt-due" name="debt-due" clearable value={dueDate} onChange={setDueDate} placeholder={t("debts.dueDate")} />
            <small className="text-body-secondary">{t("debts.dueDateHint")}</small>
          </FormGroup>
        </ModalBody>

        <ModalFooter>
          <Button color="secondary" outline type="button" onClick={onClose} disabled={create.isPending}>
            {t("common.cancel")}
          </Button>
          <Button color="primary" type="submit" disabled={create.isPending}>
            {create.isPending ? t("common.saving") : t("common.save")}
          </Button>
        </ModalFooter>
      </Form>
    </Modal>
  );
}
