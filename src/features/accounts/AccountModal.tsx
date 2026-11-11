import { useState } from "react";
import { Button, FormFeedback, FormGroup, Input, InputGroup, InputGroupText, Label, Modal, ModalBody, ModalFooter, ModalHeader } from "reactstrap";
import { useTranslation } from "react-i18next";
import segmented from "../../shared/css/Segmented.module.css";
import { useOfflineGuard } from "../../shared/hooks/useOfflineGuard";
import { parseAmount, type MoneyAccount, type MoneyAccountKind } from "./accountsUtils";
import { BankCard } from "./BankCard";
import { CARD_COLORS, CARD_FINISH, type CardColor } from "./accountTones";
import styles from "./css/AccountsPage.module.css";
import wiz from "../../shared/css/Wizard.module.css";
import { DeleteButton } from "../../shared/components/DeleteButton";
import { FORM_MODAL } from "../../shared/components/formModal";
import { YesNoChoice } from "../../shared/components/YesNoChoice";
import { WizardSteps } from "../transactions/components/WizardSteps";
import { useCurrencyConverter } from "../../shared/hooks/useCurrencyConverter";
import { useStepTried } from "../../shared/hooks/useStepTried";

export interface AccountDraft {
  name: string;
  kind: MoneyAccountKind;
  main: boolean;
  /** Only when adding: what it holds now. */
  amount?: number;
  /** A bank's card finish. */
  color?: CardColor;
}

const STEPS = ["what", "details", "review"] as const;
type Step = (typeof STEPS)[number];

/**
 * Adding an account, or renaming, retyping or removing one — as a short
 * wizard like every other add / edit form: «Τι» (bank or cash, and its name)
 * → «Στοιχεία» (a bank's finish, what a new one holds, whether it is the main)
 * → «Έλεγχος», whose rows jump back. Save only on the review.
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
   * on the fallback and would show «Όχι» for an account that is in fact the
   * main one.
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
  const [step, setStep] = useState<Step>("what");
  const [name, setName] = useState(account?.name ?? "");
  const [kind, setKind] = useState<MoneyAccountKind>(account?.kind ?? "bank");
  // «Is it the main one?»: a new account that is not already the main starts
  // unanswered — neither tile chosen (no prefill, tiles included). The main one
  // is locked on «Ναι»; an edit shows what is stored.
  const [main, setMain] = useState<boolean | undefined>(account || isMain ? isMain : undefined);
  const [color, setColor] = useState<CardColor>(defaultColor && defaultColor !== "cash" ? defaultColor : "blue");
  const [amount, setAmount] = useState("");
  const [confirming, setConfirming] = useState(false);
  const { tried: triedOn, mark: markTried } = useStepTried<Step>();
  const touched = triedOn(step);
  const { format: formatCurrency } = useCurrencyConverter();

  const value = parseAmount(amount);
  const nameOk = name.trim().length > 0;
  const amountOk = !!account || value !== undefined;
  const mainOk = main !== undefined;
  const index = STEPS.indexOf(step);
  // An edit with nothing changed writes nothing: Save waits for a change.
  const unchanged = !!account && name.trim() === account.name && kind === account.kind && main === isMain && (kind !== "bank" || color === (defaultColor && defaultColor !== "cash" ? defaultColor : "blue"));

  // Forward only past what is filled in; back is always free.
  const goTo = (target: Step) => {
    const to = STEPS.indexOf(target);
    if (to > 0 && !nameOk) {
      markTried("what");
      setStep("what");
      return;
    }
    if (to > 1 && (!amountOk || !mainOk)) {
      markTried("details");
      setStep("details");
      return;
    }
    setStep(target);
  };

  const save = () => {
    if (!nameOk) markTried("what");
    if (!amountOk || !mainOk) markTried("details");
    if (!nameOk || !amountOk || !mainOk) return;
    onSave({ name: name.trim(), kind, main: !!main, amount: account ? undefined : value, color: kind === "bank" ? color : undefined });
  };

  const shownName = name.trim() || (kind === "bank" ? t("accounts.namePlaceholderBank") : t("accounts.kindCash"));
  const rows: { step: Step; label: string; value: string }[] = [
    { step: "what", label: t("accounts.kind"), value: kind === "bank" ? t("accounts.kindBank") : t("accounts.kindCash") },
    { step: "what", label: t("accounts.name"), value: name.trim() || "—" },
    ...(kind === "bank" ? [{ step: "details" as Step, label: t("accounts.cardColor"), value: t(`accounts.color.${color}`) }] : []),
    ...(!account ? [{ step: "details" as Step, label: t("accounts.holdsNow"), value: value !== undefined ? formatCurrency(value) : "—" }] : []),
    { step: "details", label: t("accounts.main"), value: main ? t("common.yes") : t("common.no") },
  ];

  return (
    <Modal {...FORM_MODAL} isOpen toggle={onClose} centered scrollable fullscreen="sm">
      <ModalHeader toggle={onClose}>{account ? t("accounts.editTitle") : t("accounts.addTitle")}</ModalHeader>
      <form
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          if (step === "review") {
            if (!unchanged) save();
          }
          else goTo(STEPS[index + 1]);
        }}
      >
        <ModalBody>
          <WizardSteps steps={STEPS} current={step} onGo={goTo} label={(s) => t(`accounts.wizard.step_${s}`)} open={!!account} large />

          {step === "what" && (
            <>
              <div className={`${segmented.group} ${segmented.even} mb-3`} role="group" aria-label={t("accounts.kind")}>
                {(["bank", "cash"] as const).map((k) => (
                  <button key={k} type="button" className={`${segmented.item} ${kind === k ? segmented.active : ""}`} aria-pressed={kind === k} onClick={() => setKind(k)}>
                    {k === "bank" ? `🏦 ${t("accounts.kindBank")}` : `👛 ${t("accounts.kindCash")}`}
                  </button>
                ))}
              </div>
              <FormGroup className="mb-0">
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
            </>
          )}

          {step === "details" && (
            <>
              {/* The card as it will look — a bank's finish is chosen here. */}
              <div className="d-flex gap-3 align-items-center mb-3 flex-wrap">
                <div style={{ width: 150 }}>
                  <BankCard name={shownName} kind={kind} finish={kind === "cash" ? "cash" : color} amount={value !== undefined ? String(value) : undefined} />
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
                    <FormFeedback>{t("accounts.wizard.amountNeeded")}</FormFeedback>
                  </InputGroup>
                  <div className="form-text">{t("accounts.holdsNowHint")}</div>
                </FormGroup>
              )}

              {/* Asked as yes / no, not a switch. Locked on «Ναι» for the main one:
                  there is always exactly one, so it is moved by making another the
                  main, never by answering «Όχι» here. */}
              <YesNoChoice question={t("accounts.mainQuestion")} value={main} onChange={setMain} disabled={isMain} className="mb-0" />
              {touched && !mainOk && <div className="invalid-feedback d-block">{t("validation.answerYesNo")}</div>}
              <div className="form-text">{t(isMain ? "accounts.mainIsHint" : "accounts.mainHint")}</div>
            </>
          )}

          {step === "review" && (
            <>
              <div style={{ width: 150 }} className="mb-3">
                <BankCard name={shownName} kind={kind} finish={kind === "cash" ? "cash" : color} amount={value !== undefined ? String(value) : undefined} />
              </div>
              <div className={wiz.wizCard}>
                {rows.map((row) => (
                  <button key={row.label} type="button" className={wiz.wizRow} onClick={() => goTo(row.step)}>
                    <span className={wiz.wizLabel}>{row.label}</span>
                    <span className={wiz.wizValue}>{row.value}</span>
                  </button>
                ))}
              </div>
            </>
          )}

          {/* Asked only once the bin in the footer is pressed. */}
          {account && onDelete && confirming && (
            <div className="border-top mt-3 pt-3">
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
            </div>
          )}
        </ModalBody>

        {/* The bin far left, then Back / Cancel; Next or Save on the right, away
            from the bin: a slip of the thumb beside Save started the wrong thing. */}
        <ModalFooter className="justify-content-between">
          <div className="d-flex gap-2">
            {account && onDelete && !confirming && <DeleteButton opensConfirm iconOnly label={t("accounts.delete")} onClick={() => setConfirming(true)} />}
            {step === "what" ? (
              <Button type="button" color="secondary" outline onClick={onClose}>
                {t("common.cancel")}
              </Button>
            ) : (
              <Button type="button" color="secondary" outline onClick={() => setStep(STEPS[index - 1])}>
                ‹ {t("common.back")}
              </Button>
            )}
          </div>
          {step === "review" ? (
            <Button type="submit" color="success" disabled={unchanged}>
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
