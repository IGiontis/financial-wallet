import { useState } from "react";
import { Alert, Button, Col, FormGroup, Input, Label, Row, FormText } from "reactstrap";
import { useTranslation } from "react-i18next";
import { DateField } from "../../../shared/components/DateField";
import { useQueryClient } from "@tanstack/react-query";
import type { User } from "../../../shared/types/IndexTypes";
import { setOpeningBalance } from "../../../firebase/firestore";
import { parseISODay, toISODay } from "../../../shared/utils/dates";
import { useAuth } from "../../../shared/hooks/useAuth";
import { useCurrencyConverter, exchangeRateKeys } from "../../../shared/hooks/useCurrencyConverter";

/** Firestore hands this back as a Timestamp, whatever the type says. */
const toInputDate = (d: unknown): string => toISODay(d ?? new Date());

/**
 * Where the user says how much money they already had, and when.
 *
 * The date is not decoration. Someone who has been spending for years and only
 * now starts tracking will type "5000" and then, quite reasonably, backfill the
 * bills they have already paid — at which point a naive balance deducts money
 * that left the account long before the 5000 was counted, and the app tells
 * them they are poorer than they are. Anchoring the figure to a day makes
 * everything before it history: it still shows up in charts and averages, it
 * just doesn't move the balance, because the 5000 already accounts for it.
 */
export default function OpeningBalanceSection({ user, onSaved }: { user: User | null; onSaved: (u: Partial<User>) => void }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { displayCurrency } = useCurrencyConverter();
  const { currentUser } = useAuth();

  const [amount, setAmount] = useState(user?.openingBalance != null ? String(user.openingBalance) : "");
  const [date, setDate] = useState(toInputDate(user?.openingBalanceDate));
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  const parsed = amount.trim() === "" ? null : Number(amount);
  const invalid = parsed !== null && (!Number.isFinite(parsed) || parsed < 0);

  const save = async () => {
    if (invalid || !user) return;
    setSaving(true);
    setError("");
    try {
      // Clearing the amount clears the anchor with it — a date on its own would
      // silently hide history from a balance that has no starting figure.
      const opening = parsed === null ? null : { amount: parsed, date: parseISODay(date) ?? new Date() };
      await setOpeningBalance(user.id, opening);
      onSaved({ openingBalance: opening?.amount, openingBalanceDate: opening?.date });
      // The balance card reads the user document, not the form state.
      await queryClient.invalidateQueries({ queryKey: exchangeRateKeys.user(currentUser?.uid ?? "") });
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch {
      setError(t("errors.generic"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <Row className="g-3">
        <Col xs={12} sm={6}>
          <FormGroup className="mb-0">
            <Label className="small fw-medium">
              {t("settings.openingAmount")} ({displayCurrency})
            </Label>
            <Input
              type="number"
              inputMode="decimal"
              min={0}
              step="0.01"
              placeholder="0.00"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              invalid={invalid}
            />
            <FormText style={{ fontSize: 11 }}>{t("settings.openingAmountHint")}</FormText>
          </FormGroup>
        </Col>
        <Col xs={12} sm={6}>
          <FormGroup className="mb-0">
            <Label className="small fw-medium">{t("settings.openingDate")}</Label>
            <DateField value={date} onChange={setDate} disabled={parsed === null} maxDate={new Date()} />
            <FormText style={{ fontSize: 11 }}>{t("settings.openingDateHint")}</FormText>
          </FormGroup>
        </Col>
      </Row>

      <Alert color="info" className="py-2 mt-3 mb-0" style={{ fontSize: 12 }}>
        {t("settings.openingExplainer")}
      </Alert>

      {error && (
        <Alert color="danger" className="py-2 mt-2 mb-0" style={{ fontSize: 12 }}>
          {error}
        </Alert>
      )}

      <div className="d-flex align-items-center gap-2 mt-3">
        <Button color="primary" onClick={save} disabled={saving || invalid || !user}>
          {saving ? t("common.saving") : t("common.save")}
        </Button>
        {saved && (
          <span style={{ fontSize: 13, color: "var(--color-income)" }}>✓ {t("settings.saved")}</span>
        )}
      </div>
    </>
  );
}
