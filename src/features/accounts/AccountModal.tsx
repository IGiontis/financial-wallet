import { useState } from "react";
import { Button, FormGroup, Input, InputGroup, InputGroupText, Label, Modal, ModalBody, ModalFooter, ModalHeader } from "reactstrap";
import { useTranslation } from "react-i18next";
import segmented from "../../shared/css/Segmented.module.css";
import { useOfflineGuard } from "../../shared/hooks/useOfflineGuard";
import { parseAmount, type MoneyAccount, type MoneyAccountKind } from "./accountsUtils";
import { BankCard } from "./BankCard";
import { CARD_COLORS, CARD_FINISH, type CardColor } from "./accountTones";
import styles from "./css/AccountsPage.module.css";
import { DeleteButton } from "../../shared/components/DeleteButton";
import { FORM_MODAL } from "../../shared/components/formModal";

export interface AccountDraft {
  name: string;
  kind: MoneyAccountKind;
  main: boolean;
  /** Only when adding: what it holds now. */
  amount?: number;
  /** A bank's card finish. */
  color?: CardColor;
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
  isMain,
  defaultColor,
  baseCurrency,
  onSave,
  onDelete,
  onClose,
}: {
  account?: MoneyAccount;
  /**
   * This is the account records land in now: the one marked, or, when none is,
   * the first bank. Read from the list rather than the flag, which is missing
   * on the fallback and would show the switch off for an account that is in
   * fact the main one.
   */
  isMain: boolean;
  /** The finish the card has now, or would get. */
  defaultColor?: CardColor | "cash";
  baseCurrency: string;
  onSave: (draft: AccountDraft) => void;
  onDelete?: () => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const deleteGuard = useOfflineGuard("delete");
  const [name, setName] = useState(account?.name ?? "");
  const [kind, setKind] = useState<MoneyAccountKind>(account?.kind ?? "bank");
  const [main, setMain] = useState(isMain);
  const [color, setColor] = useState<CardColor>(defaultColor && defaultColor !== "cash" ? defaultColor : "blue");
  const [amount, setAmount] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [touched, setTouched] = useState(false);

  const value = parseAmount(amount);
  const nameOk = name.trim().length > 0;
  const amountOk = !!account || value !== undefined;

  const save = () => {
    setTouched(true);
    if (!nameOk || !amountOk) return;
    onSave({ name: name.trim(), kind, main, amount: account ? undefined : value, color: kind === "bank" ? color : undefined });
  };

  return (
    <Modal {...FORM_MODAL} isOpen toggle={onClose} centered scrollable fullscreen="sm">
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

        {/* The card as it will look — a bank's finish is chosen here. */}
        <div className="d-flex gap-3 align-items-center mb-3 flex-wrap">
          <div style={{ width: 150 }}>
            <BankCard name={name.trim() || (kind === "bank" ? t("accounts.namePlaceholderBank") : t("accounts.kindCash"))} kind={kind} finish={kind === "cash" ? "cash" : color} amount={value !== undefined ? String(value) : undefined} />
          </div>
          {kind === "bank" && (
            <div>
              <div className="small fw-medium mb-2">{t("accounts.cardColor")}</div>
              <div className={styles.swatches} role="group" aria-label={t("accounts.cardColor")}>
                {CARD_COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    className={styles.swatch}
                    style={{ ["--card" as string]: CARD_FINISH[c].background }}
                    aria-pressed={color === c}
                    aria-label={t(`accounts.color.${c}`)}
                    onClick={() => setColor(c)}
                  />
                ))}
              </div>
            </div>
          )}
        </div>

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
          {/* Locked on for the main one: there is always exactly one, so it is
              moved by making another the main, never by switching this off. */}
          <Input id="account-main" type="switch" checked={main} disabled={isMain} onChange={(e) => setMain(e.target.checked)} />
          <Label for="account-main" check className="small">
            {t("accounts.main")}
          </Label>
          <div className="form-text">{t(isMain ? "accounts.mainIsHint" : "accounts.mainHint")}</div>
        </FormGroup>

        {/* Asked only once the bin in the footer is pressed. */}
        {account && onDelete && confirming && (
          <div className="border-top mt-3 pt-3">
            {confirming && (
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
            )}
          </div>
        )}
      </ModalBody>
      {/* The bin on its own side of the footer, away from Save: pressed beside
          it, a slip of the thumb would have started the wrong thing. */}
      <ModalFooter className="justify-content-between">
        {account && onDelete && !confirming ? <DeleteButton opensConfirm iconOnly label={t("accounts.delete")} onClick={() => setConfirming(true)} /> : <span />}
        <div className="d-flex gap-2">
          <Button color="secondary" outline onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button color="primary" onClick={save}>
            {t("common.save")}
          </Button>
        </div>
      </ModalFooter>
    </Modal>
  );
}
