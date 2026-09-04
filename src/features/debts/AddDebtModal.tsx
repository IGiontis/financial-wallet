import { useState } from "react";
import { Button, Form, FormGroup, Input, InputGroup, InputGroupText, Label, Modal, ModalBody, ModalFooter, ModalHeader } from "reactstrap";
import { useTranslation } from "react-i18next";
import { useCurrencyConverter } from "../../shared/hooks/useCurrencyConverter";
import { useCreateDebt } from "./useDebts";
import segmented from "../../shared/css/Segmented.module.css";
import type { DebtDirection } from "../../shared/types/IndexTypes";

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
  const { t } = useTranslation();
  const { baseCurrency } = useCurrencyConverter();
  const create = useCreateDebt();

  const [direction, setDirection] = useState<DebtDirection>("owed_by_me");
  const [person, setPerson] = useState("");
  const [label, setLabel] = useState("");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(today);
  const [dueDate, setDueDate] = useState("");
  const [touched, setTouched] = useState(false);

  const value = parseFloat(amount);
  const personInvalid = touched && person.trim() === "";
  const amountInvalid = touched && !(Number.isFinite(value) && value > 0);

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
      },
      { onSuccess: onClose },
    );
  };

  return (
    <Modal isOpen toggle={onClose} centered scrollable>
      <ModalHeader toggle={onClose}>{t("debts.add")}</ModalHeader>
      <Form onSubmit={submit}>
        <ModalBody>
          <div className={`${segmented.group} mb-3`} role="group" aria-label={t("debts.direction")}>
            <button type="button" className={`${segmented.item} ${direction === "owed_by_me" ? segmented.active : ""}`} onClick={() => setDirection("owed_by_me")}>
              {t("debts.iBorrowed")}
            </button>
            <button type="button" className={`${segmented.item} ${direction === "owed_to_me" ? segmented.active : ""}`} onClick={() => setDirection("owed_to_me")}>
              {t("debts.iLent")}
            </button>
          </div>

          <FormGroup>
            <Label className="small fw-medium">{t("debts.person")} *</Label>
            <Input list="debt-people" value={person} onChange={(e) => setPerson(e.target.value)} invalid={personInvalid} placeholder={t("debts.personPlaceholder")} />
            {/* Offers names already on record without ever blocking a new one. */}
            <datalist id="debt-people">
              {knownPeople.map((name) => (
                <option key={name} value={name} />
              ))}
            </datalist>
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

          <FormGroup>
            <Label className="small fw-medium">{t("debts.when")}</Label>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </FormGroup>

          <FormGroup className="mb-0">
            <Label className="small fw-medium">{t("debts.dueDate")}</Label>
            <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
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
