import { FormGroup, Label, Input, FormFeedback, Row, Col } from "reactstrap";
import { useTranslation } from "react-i18next";
import type { FuelType } from "../../shared/types/IndexTypes";
import { intlLocale } from "../../i18n";
import { localeUpperCase } from "../../shared/utils/upperCase";
import { validationMessage } from "../../shared/utils/validationMessage";
import { FUEL_TYPES, getUnitLabel } from "./fuelTypes";

interface FuelDetailsPanelProps {
  fuelType: FuelType | "";
  pricePerUnit: number | "";
  quantity: number | "";
  odometer: number | "";
  place: string;
  errors: Partial<{
    fuelType: string;
    pricePerUnit: string;
    quantity: string;
    odometer: string;
    place: string;
  }>;
  touched: Partial<{
    fuelType: boolean;
    pricePerUnit: boolean;
    quantity: boolean;
    odometer: boolean;
    place: boolean;
  }>;
  setFieldValue: (field: string, value: string | number) => void;
  setFieldTouched: (field: string, touched?: boolean) => void;
  displayCurrency: string;
}

export function FuelDetailsPanel({ fuelType, pricePerUnit, quantity, odometer, place, errors, touched, setFieldValue, setFieldTouched, displayCurrency }: FuelDetailsPanelProps) {
  const { t, i18n } = useTranslation();
  const unit = getUnitLabel(fuelType);
  const totalCost = pricePerUnit !== "" && quantity !== "" ? Number(pricePerUnit) * Number(quantity) : null;

  return (
    <div
      style={{
        marginTop: 16,
        padding: "12px 14px",
        background: "color-mix(in srgb, var(--bs-primary) 6%, var(--color-surface))",
        borderRadius: 10,
        border: "1px solid color-mix(in srgb, var(--bs-primary) 25%, transparent)",
      }}
    >
      <p style={{ fontSize: 12, fontWeight: 600, color: "var(--bs-primary)", marginBottom: 12, letterSpacing: "0.05em" }}>⛽ {localeUpperCase(t("transactions.fuelDetails"), i18n.resolvedLanguage)}</p>

      {/* Fuel type + Place */}
      <Row className="g-3">
        <Col xs={6}>
          <FormGroup className="mb-0">
            <Label style={{ fontSize: 13, fontWeight: 500 }}>{t("transactions.fuelType")} *</Label>
            <Input
              type="select"
              value={fuelType}
              onChange={(e) => setFieldValue("fuelType", e.target.value)}
              onBlur={() => setFieldTouched("fuelType", true)}
              invalid={!!(touched.fuelType && errors.fuelType)}
            >
              <option value="">{t("transactions.fuelTypeSelect")}</option>
              {FUEL_TYPES.map((ft) => (
                <option key={ft.value} value={ft.value}>
                  {t(ft.labelKey)}
                </option>
              ))}
            </Input>
            <FormFeedback>{validationMessage(errors.fuelType, t)}</FormFeedback>
          </FormGroup>
        </Col>
        <Col xs={6}>
          <FormGroup className="mb-0">
            <Label style={{ fontSize: 13, fontWeight: 500 }}>{t("transactions.place")}</Label>
            <Input
              type="text"
              placeholder={t("transactions.placePlaceholder")}
              value={place}
              onChange={(e) => setFieldValue("place", e.target.value)}
              onBlur={() => setFieldTouched("place", true)}
              invalid={!!(touched.place && errors.place)}
            />
            <FormFeedback>{validationMessage(errors.place, t)}</FormFeedback>
          </FormGroup>
        </Col>
      </Row>

      {/* Price per unit + Quantity */}
      <Row className="g-3 mt-0">
        <Col xs={6}>
          <FormGroup className="mb-0">
            <Label style={{ fontSize: 13, fontWeight: 500 }}>
              {t("transactions.pricePerUnitLabel", { unit })} ({displayCurrency}) *
            </Label>
            <Input
              type="number"
              min={0.001}
              step={0.001}
              placeholder="0.000"
              value={pricePerUnit}
              onChange={(e) => setFieldValue("pricePerUnit", e.target.value === "" ? "" : Number(e.target.value))}
              onBlur={() => setFieldTouched("pricePerUnit", true)}
              invalid={!!(touched.pricePerUnit && errors.pricePerUnit)}
            />
            <FormFeedback>{validationMessage(errors.pricePerUnit, t)}</FormFeedback>
          </FormGroup>
        </Col>
        <Col xs={6}>
          <FormGroup className="mb-0">
            <Label style={{ fontSize: 13, fontWeight: 500 }}>{t("transactions.quantityFilled", { unit })} *</Label>
            <Input
              type="number"
              min={0.01}
              step={0.01}
              placeholder="0.00"
              value={quantity}
              onChange={(e) => setFieldValue("quantity", e.target.value === "" ? "" : Number(e.target.value))}
              onBlur={() => setFieldTouched("quantity", true)}
              invalid={!!(touched.quantity && errors.quantity)}
            />
            <FormFeedback>{validationMessage(errors.quantity, t)}</FormFeedback>
          </FormGroup>
        </Col>
      </Row>

      {/* Odometer + Auto-total */}
      <Row className="g-3 mt-0">
        <Col xs={6}>
          <FormGroup className="mb-0">
            <Label style={{ fontSize: 13, fontWeight: 500 }}>{t("transactions.odometer")} (km)</Label>
            <Input
              type="number"
              min={0}
              step={1}
              placeholder={t("transactions.odometerPlaceholder")}
              value={odometer}
              onChange={(e) => setFieldValue("odometer", e.target.value === "" ? "" : Number(e.target.value))}
              onBlur={() => setFieldTouched("odometer", true)}
              invalid={!!(touched.odometer && errors.odometer)}
            />
            <FormFeedback>{validationMessage(errors.odometer, t)}</FormFeedback>
          </FormGroup>
        </Col>
        {totalCost !== null && (
          <Col xs={6} className="d-flex align-items-end">
            <div
              style={{
                background: "color-mix(in srgb, var(--bs-primary) 10%, transparent)",
                border: "1px solid color-mix(in srgb, var(--bs-primary) 28%, transparent)",
                borderRadius: 8,
                padding: "8px 12px",
                width: "100%",
              }}
            >
              <p style={{ fontSize: 11, color: "var(--bs-primary)", margin: 0, fontWeight: 500 }}>{t("transactions.fuelTotalAuto")}</p>
              <p style={{ fontSize: 15, fontWeight: 700, color: "var(--bs-primary)", margin: 0 }}>
                {new Intl.NumberFormat(intlLocale(i18n.resolvedLanguage), { style: "currency", currency: displayCurrency, minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(totalCost)}
              </p>
            </div>
          </Col>
        )}
      </Row>
    </div>
  );
}
