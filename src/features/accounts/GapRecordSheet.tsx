import { useMemo, useState } from "react";
import { Button, FormGroup, Input, InputGroup, InputGroupText, Label, Modal, ModalBody, ModalFooter, ModalHeader } from "reactstrap";
import { useTranslation } from "react-i18next";
import type { Category, CreateTransactionDTO } from "../../shared/types/IndexTypes";
import { categoryLabel } from "../../shared/utils/categories";
import { parseAmount } from "./accountsUtils";
import { FORM_MODAL } from "../../shared/components/formModal";

/**
 * "Do you know where it went?", asked in the middle of reading the banks.
 *
 * An account reading differs from what the app expected by some amount:
 * money that left, or arrived, without being written down. When the person
 * knows what it was, this writes it there and then, dated today, against that
 * account, instead of making them leave, find the form and come back. When
 * they do not, closing it changes nothing and the difference stays a
 * difference.
 *
 * The record is marked as already in the reading (`inReading`): the reading
 * about to be saved is dated today and already holds it, so it must not be
 * counted a second time on top.
 */
export default function GapRecordSheet({
  accountId,
  accountName,
  change,
  categories,
  baseCurrency,
  formatCurrency,
  onAdd,
  onClose,
}: {
  accountId: string;
  accountName: string;
  /** What the reading found beyond what was expected: negative when money went missing. */
  change: number;
  categories: Category[];
  baseCurrency: string;
  formatCurrency: (n: number) => string;
  onAdd: (data: CreateTransactionDTO) => Promise<unknown>;
  onClose: () => void;
}) {
  const { t, i18n } = useTranslation();
  const type = change < 0 ? "expense" : "income";
  const options = useMemo(() => categories.filter((c) => c.type === type).sort((a, b) => categoryLabel(a.name, t).localeCompare(categoryLabel(b.name, t))), [categories, type, t]);
  const [amount, setAmount] = useState(() => new Intl.NumberFormat(i18n.resolvedLanguage ?? "en", { minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: false }).format(Math.abs(change)));
  const [categoryId, setCategoryId] = useState("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState(false);

  const value = parseAmount(amount);
  const valid = value !== undefined && value > 0 && categoryId !== "";

  const add = async () => {
    if (!valid || value === undefined) return;
    setSaving(true);
    setFailed(false);
    try {
      await onAdd({
        type,
        amount: value,
        categoryId,
        description: description.trim() || categoryLabel(options.find((c) => c.id === categoryId)?.name, t),
        date: new Date(),
        accountId,
        inReading: true,
      });
      onClose();
    } catch {
      setFailed(true);
      setSaving(false);
    }
  };

  return (
    <Modal {...FORM_MODAL} isOpen toggle={onClose} centered scrollable fullscreen="sm">
      <ModalHeader toggle={onClose}>{t(change < 0 ? "accounts.gap.titleOut" : "accounts.gap.titleIn", { amount: formatCurrency(Math.abs(change)) })}</ModalHeader>
      <ModalBody>
        <p className="small text-body-secondary">{t("accounts.gap.hint", { account: accountName })}</p>

        <FormGroup>
          <Label for="gap-amount" className="small fw-medium">
            {t("common.amount")}
          </Label>
          <InputGroup>
            <Input id="gap-amount" type="text" inputMode="decimal" autoComplete="off" value={amount} invalid={value === undefined || value <= 0} onChange={(e) => setAmount(e.target.value)} onFocus={(e) => e.currentTarget.select()} />
            <InputGroupText>{baseCurrency}</InputGroupText>
          </InputGroup>
          {value !== undefined && value > 0 && Math.abs(value - Math.abs(change)) > 0.004 && <div className="form-text">{t("accounts.gap.partial", { rest: formatCurrency(Math.abs(Math.abs(change) - value)) })}</div>}
        </FormGroup>

        <FormGroup>
          <Label for="gap-category" className="small fw-medium">
            {t("common.category")}
          </Label>
          <Input id="gap-category" type="select" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
            <option value="">{t("accounts.gap.pickCategory")}</option>
            {options.map((c) => (
              <option key={c.id} value={c.id}>
                {c.icon ? `${c.icon} ` : ""}
                {categoryLabel(c.name, t)}
              </option>
            ))}
          </Input>
        </FormGroup>

        <FormGroup className="mb-0">
          <Label for="gap-description" className="small fw-medium">
            {t("accounts.gap.description")}
          </Label>
          <Input id="gap-description" value={description} maxLength={80} autoComplete="off" onChange={(e) => setDescription(e.target.value)} />
        </FormGroup>

        {failed && <p className="small text-danger mt-3 mb-0">{t("accounts.gap.failed")}</p>}
      </ModalBody>
      <ModalFooter className="justify-content-between">
        <Button color="secondary" outline onClick={onClose}>
          {t("accounts.gap.skip")}
        </Button>
        <Button color="primary" onClick={add} disabled={!valid || saving}>
          {t("accounts.gap.add")}
        </Button>
      </ModalFooter>
    </Modal>
  );
}
