import { useMemo, useState } from "react";
import { Button, Input, InputGroup, InputGroupText, Modal, ModalBody, ModalFooter, ModalHeader } from "reactstrap";
import { useTranslation } from "react-i18next";
import { parseAmount, type MoneyAccount } from "./accountsUtils";
import { ACCOUNT_ICON } from "./accountTones";
import styles from "./css/AccountsPage.module.css";

/**
 * Correcting a reading typed wrong — the figures as they were entered that day,
 * to change the ones that were not right.
 *
 * The case it is for: 400 from Stoiximan that was in Revolut, recorded with no
 * card, and Revolut's box left at its old figure. The reading then reported
 * 400 spent with no record, though nothing was missing; the reading was. Undoing
 * it would only work for the latest one, and would mean typing every account
 * again.
 *
 * What the difference becomes is worked out as it is typed by the same sum the
 * page reports (`gapFor`), so what this sheet promises is what the page will say.
 */
export default function EditReadingModal({
  accounts,
  amounts,
  dateLabel,
  tones,
  baseCurrency,
  formatCurrency,
  gapFor,
  onSave,
  onClose,
}: {
  accounts: MoneyAccount[];
  /** The figures as the reading holds them. */
  amounts: Record<string, number>;
  dateLabel: string;
  tones: Record<string, string>;
  baseCurrency: string;
  formatCurrency: (n: number) => string;
  /** What the reading would find with these figures: negative is money missing. */
  gapFor: (amounts: Record<string, number>) => number | undefined;
  onSave: (amounts: Record<string, number>) => void;
  onClose: () => void;
}) {
  const { t, i18n } = useTranslation();
  const asInput = useMemo(() => {
    const fmt = new Intl.NumberFormat(i18n.resolvedLanguage ?? "en", { minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: false });
    return (n: number) => fmt.format(n);
  }, [i18n.resolvedLanguage]);

  // Only the accounts this reading held: one added later was not read that day.
  const shown = accounts.filter((a) => a.id in amounts);
  const [values, setValues] = useState<Record<string, string>>(() => Object.fromEntries(shown.map((a) => [a.id, asInput(amounts[a.id])])));

  const parsed = shown.map((a) => ({ id: a.id, value: parseAmount(values[a.id] ?? "") }));
  const valid = parsed.every((p) => p.value !== undefined);
  const next = valid ? { ...amounts, ...Object.fromEntries(parsed.map((p) => [p.id, p.value as number])) } : undefined;
  const gap = next ? gapFor(next) : undefined;
  const signed = (n: number) => `${n > 0 ? "+" : n < 0 ? "−" : ""}${formatCurrency(Math.abs(n))}`;
  const changed = !!next && shown.some((a) => Math.round((next[a.id] - amounts[a.id]) * 100) !== 0);

  return (
    <Modal isOpen toggle={onClose} centered scrollable fullscreen="sm">
      <ModalHeader toggle={onClose}>{t("accounts.fixTitle", { date: dateLabel })}</ModalHeader>
      <ModalBody>
        <p className="small text-body-secondary mb-2">{t("accounts.fixHint")}</p>
        {shown.map((account) => {
          const raw = values[account.id] ?? "";
          const value = parseAmount(raw);
          const moved = value !== undefined ? Math.round((value - amounts[account.id]) * 100) / 100 : 0;
          return (
            <div key={account.id} className={styles.row}>
              <span className={styles.tile} style={{ ["--tone" as string]: tones[account.id] }} aria-hidden>
                {ACCOUNT_ICON[account.kind]}
              </span>
              <label htmlFor={`fix-${account.id}`} className="flex-grow-1" style={{ minWidth: 0 }}>
                <span className={styles.name}>{account.name}</span>
                <span className={styles.note}>{moved === 0 ? t("accounts.fixWas", { amount: formatCurrency(amounts[account.id]) }) : t("accounts.changeFrom", { change: signed(moved), amount: formatCurrency(amounts[account.id]) })}</span>
              </label>
              <InputGroup className={styles.readInput}>
                <Input
                  id={`fix-${account.id}`}
                  type="text"
                  inputMode="decimal"
                  autoComplete="off"
                  value={raw}
                  invalid={raw.trim() !== "" && value === undefined}
                  onFocus={(e) => e.currentTarget.select()}
                  onChange={(e) => setValues((v) => ({ ...v, [account.id]: e.target.value }))}
                />
                <InputGroupText>{baseCurrency}</InputGroupText>
              </InputGroup>
            </div>
          );
        })}
      </ModalBody>
      <ModalFooter className="d-block">
        <div className="d-flex justify-content-between align-items-baseline gap-2 mb-2" style={{ fontSize: 13 }}>
          <span className="text-body-secondary">{t("accounts.fixGapLabel")}</span>
          <span className="fw-semibold text-nowrap" style={{ fontVariantNumeric: "tabular-nums", color: gap === undefined || gap === 0 ? undefined : gap < 0 ? "var(--color-expense-text)" : "var(--color-income-text)" }}>
            {gap === undefined ? "—" : gap === 0 ? `✓ ${t("accounts.allWritten")}` : signed(gap)}
          </span>
        </div>
        <div className="d-flex gap-2">
          <Button color="secondary" outline onClick={onClose} className="flex-grow-1">
            {t("common.cancel")}
          </Button>
          <Button color="primary" onClick={() => next && onSave(next)} disabled={!valid || !changed} className="flex-grow-1 fw-semibold">
            {t("common.save")}
          </Button>
        </div>
      </ModalFooter>
    </Modal>
  );
}
