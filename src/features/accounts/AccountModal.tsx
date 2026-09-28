import { useState } from "react";
import { Button, FormGroup, Input, InputGroup, InputGroupText, Label, Modal, ModalBody, ModalFooter, ModalHeader } from "reactstrap";
import { useTranslation } from "react-i18next";
import segmented from "../../shared/css/Segmented.module.css";
import { useOfflineGuard } from "../../shared/hooks/useOfflineGuard";
import { parseAmount, type MoneyAccount, type MoneyAccountKind } from "./accountsUtils";

export interface AccountDraft {
  name: string;
  kind: MoneyAccountKind;
  main: boolean;
  /** Only when adding: what it holds now. */
  amount?: number;
}

/**
 * Adding an account, or renaming, retyping or removing one.
 *
 * A new account asks for what it holds today and joins without a difference —
 * the money was already yours, only not listed. Removing one takes it out of
 * every past reading too, as if it had never been listed; the confirmation
 * says so, since that changes the history on the page.
 */
export default function AccountModal({
  account,
  baseCurrency,
  onSave,
  onDelete,
  onClose,
}: {
  account?: MoneyAccount;
  baseCurrency: string;
  onSave: (draft: AccountDraft) => void;
  onDelete?: () => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const deleteGuard = useOfflineGuard("delete");
  const [name, setName] = useState(account?.name ?? "");
  const [kind, setKind] = useState<MoneyAccountKind>(account?.kind ?? "bank");
  const [main, setMain] = useState(account?.main ?? false);
  const [amount, setAmount] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [touched, setTouched] = useState(false);

  const value = parseAmount(amount);
  const nameOk = name.trim().length > 0;
  const amountOk = !!account || value !== undefined;

  const save = () => {
    setTouched(true);
    if (!nameOk || !amountOk) return;
    onSave({ name: name.trim(), kind, main, amount: account ? undefined : value });
  };

  return (
    <Modal isOpen toggle={onClose} centered fullscreen="sm">
      <ModalHeader toggle={onClose}>{account ? t("accounts.editTitle") : t("accounts.addTitle")}</ModalHeader>
      <ModalBody>
        <div className={`${segmented.group} ${segmented.even} mb-3`} role="group" aria-label={t("accounts.kind")}>
          {(["bank", "cash"] as const).map((k) => (
            <button key={k} type="button" className={`${segmented.item} ${kind === k ? segmented.active : ""}`} aria-pressed={kind === k} onClick={() => setKind(k)}>
              {k === "bank" ? `🏦 ${t("accounts.kindBank")}` : `👛 ${t("accounts.kindCash")}`}
            </button>
          ))}
        </div>

        <FormGroup>
          <Label for="account-name" className="small fw-medium">
            {t("accounts.name")}
          </Label>
          <Input
            id="account-name"
            value={name}
            placeholder={kind === "bank" ? t("accounts.namePlaceholderBank") : t("accounts.kindCash")}
            invalid={touched && !nameOk}
            onChange={(e) => setName(e.target.value)}
            maxLength={40}
          />
        </FormGroup>

        {!account && (
          <FormGroup>
            <Label for="account-amount" className="small fw-medium">
              {t("accounts.holdsNow")}
            </Label>
            <InputGroup>
              <Input id="account-amount" type="text" inputMode="decimal" autoComplete="off" placeholder="0,00" value={amount} invalid={touched && !amountOk} onChange={(e) => setAmount(e.target.value)} />
              <InputGroupText>{baseCurrency}</InputGroupText>
            </InputGroup>
            <div className="form-text">{t("accounts.holdsNowHint")}</div>
          </FormGroup>
        )}

        <FormGroup switch className="mb-0">
          <Input id="account-main" type="switch" checked={main} onChange={(e) => setMain(e.target.checked)} />
          <Label for="account-main" check className="small">
            {t("accounts.main")}
          </Label>
          <div className="form-text">{t("accounts.mainHint")}</div>
        </FormGroup>

        {account && onDelete && (
          <div className="border-top mt-3 pt-3">
            {confirming ? (
              <>
                <p className="small mb-2">{t("accounts.deleteConfirm", { name: account.name })}</p>
                {deleteGuard.locked && <p className="small text-body-secondary mb-2">{deleteGuard.reason}</p>}
                <div className="d-flex gap-2">
                  <Button size="sm" color="secondary" outline onClick={() => setConfirming(false)}>
                    {t("common.cancel")}
                  </Button>
                  <Button size="sm" color="danger" onClick={onDelete} disabled={deleteGuard.locked}>
                    {t("common.delete")}
                  </Button>
                </div>
              </>
            ) : (
              <Button size="sm" color="danger" outline onClick={() => setConfirming(true)}>
                {t("accounts.delete")}
              </Button>
            )}
          </div>
        )}
      </ModalBody>
      <ModalFooter>
        <Button color="secondary" outline onClick={onClose}>
          {t("common.cancel")}
        </Button>
        <Button color="primary" onClick={save}>
          {t("common.save")}
        </Button>
      </ModalFooter>
    </Modal>
  );
}
