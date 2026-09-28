import { useMemo, useState } from "react";
import { Button, Input, InputGroup, InputGroupText, Modal, ModalBody, ModalFooter, ModalHeader } from "reactstrap";
import { useTranslation } from "react-i18next";
import { parseAmount, type MoneyAccount } from "./accountsUtils";
import { ACCOUNT_ICON } from "./accountTones";
import styles from "./css/AccountsPage.module.css";

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Reading the banks: one box per account, each already holding what the app
 * expects to be there.
 *
 * Prefilled because most weeks most accounts are right, and typing a figure
 * that is already correct is the kind of chore that ends a habit. Only the ones
 * that differ need touching; each shows its own difference as it is typed, and
 * the total one sits at the foot of the sheet, beside the button that saves it.
 */
export default function CheckInModal({
  accounts,
  expected,
  tones,
  baseCurrency,
  formatCurrency,
  onSave,
  onClose,
}: {
  accounts: MoneyAccount[];
  /** Account id → what the app expects now. Empty when there is nothing to expect. */
  expected: Record<string, number>;
  tones: Record<string, string>;
  baseCurrency: string;
  formatCurrency: (n: number) => string;
  onSave: (amounts: Record<string, number>) => void;
  onClose: () => void;
}) {
  const { t, i18n } = useTranslation();
  // Written the way the keyboard in this language writes it: 1842,30 in Greek.
  const asInput = useMemo(() => {
    const fmt = new Intl.NumberFormat(i18n.resolvedLanguage ?? "en", { minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: false });
    return (n: number | undefined) => (n === undefined ? "" : fmt.format(n));
  }, [i18n.resolvedLanguage]);

  const [values, setValues] = useState<Record<string, string>>(() => Object.fromEntries(accounts.map((a) => [a.id, asInput(expected[a.id])])));

  const parsed = accounts.map((a) => ({ id: a.id, value: parseAmount(values[a.id] ?? "") }));
  const valid = parsed.every((p) => p.value !== undefined);
  const hasExpectation = accounts.some((a) => expected[a.id] !== undefined);
  const expectedTotal = round2(accounts.reduce((sum, a) => sum + (expected[a.id] ?? 0), 0));
  const total = round2(parsed.reduce((sum, p) => sum + (p.value ?? 0), 0));
  const difference = round2(total - expectedTotal);
  const signed = (n: number) => `${n > 0 ? "+" : n < 0 ? "−" : ""}${formatCurrency(Math.abs(n))}`;
  const toneOf = (n: number) => (n < 0 ? "var(--color-expense-text)" : n > 0 ? "var(--color-income-text)" : undefined);

  const save = () => {
    if (!valid) return;
    onSave(Object.fromEntries(parsed.map((p) => [p.id, p.value as number])));
  };

  return (
    <Modal isOpen toggle={onClose} centered scrollable fullscreen="sm">
      <ModalHeader toggle={onClose}>{t("accounts.readTitle")}</ModalHeader>
      <ModalBody>
        <p className="small text-body-secondary mb-2">{t(hasExpectation ? "accounts.readHint" : "accounts.readHintFirst")}</p>

        {accounts.map((account) => {
          const raw = values[account.id] ?? "";
          const value = parseAmount(raw);
          const bad = raw.trim() !== "" && value === undefined;
          const change = value !== undefined && expected[account.id] !== undefined ? round2(value - expected[account.id]) : 0;
          return (
            <div key={account.id} className={styles.row}>
              <span className={styles.tile} style={{ ["--tone" as string]: tones[account.id] }} aria-hidden>
                {ACCOUNT_ICON[account.kind]}
              </span>
              <label htmlFor={`read-${account.id}`} className="flex-grow-1" style={{ minWidth: 0 }}>
                <span className={styles.name}>{account.name}</span>
                {expected[account.id] !== undefined &&
                  (change === 0 ? (
                    <span className={styles.note}>{t("accounts.expectedWas", { amount: formatCurrency(expected[account.id]) })}</span>
                  ) : (
                    <span className={styles.delta} style={{ color: toneOf(change) }}>
                      {t("accounts.changeFrom", { change: signed(change), amount: formatCurrency(expected[account.id]) })}
                    </span>
                  ))}
              </label>
              <InputGroup className={styles.readInput}>
                <Input
                  id={`read-${account.id}`}
                  type="text"
                  inputMode="decimal"
                  autoComplete="off"
                  value={raw}
                  invalid={bad}
                  onFocus={(e) => e.currentTarget.select()}
                  onChange={(e) => setValues((v) => ({ ...v, [account.id]: e.target.value }))}
                />
                <InputGroupText>{baseCurrency}</InputGroupText>
              </InputGroup>
            </div>
          );
        })}

        {hasExpectation && valid && difference !== 0 && (
          <p className="small text-body-secondary mt-3 mb-0">{t(difference < 0 ? "accounts.notWrittenHint" : "accounts.cameUnwrittenHint")}</p>
        )}
      </ModalBody>

      {/* The answer sits by the button, where the eye already is when saving. */}
      <ModalFooter className="d-block">
        <div className="d-flex justify-content-between align-items-baseline gap-2 mb-2" style={{ fontSize: 13 }}>
          <span className="text-body-secondary">
            {hasExpectation ? t("accounts.expectedVsHave", { expected: formatCurrency(expectedTotal), have: valid ? formatCurrency(total) : "—" }) : t("accounts.youHaveTotal", { have: valid ? formatCurrency(total) : "—" })}
          </span>
          {hasExpectation && valid && (
            <span className="fw-semibold text-nowrap" style={{ color: toneOf(difference), fontVariantNumeric: "tabular-nums" }}>
              {difference === 0 ? `✓ ${t("accounts.allWritten")}` : `${difference < 0 ? t("accounts.notWritten") : t("accounts.cameUnwritten")} ${signed(difference)}`}
            </span>
          )}
        </div>
        <div className="d-flex gap-2">
          <Button color="secondary" outline onClick={onClose} className="flex-grow-1">
            {t("common.cancel")}
          </Button>
          <Button color="primary" onClick={save} disabled={!valid} className="flex-grow-1 fw-semibold">
            {t("common.save")}
          </Button>
        </div>
      </ModalFooter>
    </Modal>
  );
}
