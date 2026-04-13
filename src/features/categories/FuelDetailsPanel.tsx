import { FormGroup, Label, Input, FormFeedback, Row, Col } from "reactstrap";
import type { FuelType } from "../../shared/types/IndexTypes";

export const FUEL_TYPES: { value: FuelType; label: string }[] = [
  { value: "petrol", label: "Petrol" },
  { value: "diesel", label: "Diesel" },
  { value: "lpg", label: "LPG" },
  { value: "cng", label: "CNG" },
  { value: "electric", label: "Electric" },
];

export const getUnitLabel = (fuelType: FuelType | ""): string => (fuelType === "electric" ? "kWh" : "L");

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
  setFieldValue: (field: string, value: any) => void;
  setFieldTouched: (field: string, touched?: boolean) => void;
  displayCurrency: string;
}

export function FuelDetailsPanel({ fuelType, pricePerUnit, quantity, odometer, place, errors, touched, setFieldValue, setFieldTouched, displayCurrency }: FuelDetailsPanelProps) {
  const unit = getUnitLabel(fuelType);
  const totalCost = pricePerUnit !== "" && quantity !== "" ? (Number(pricePerUnit) * Number(quantity)).toFixed(2) : null;

  return (
    <div
      style={{
        marginTop: 16,
        padding: "12px 14px",
        background: "#f8faff",
        borderRadius: 10,
        border: "1.5px solid #dbeafe",
      }}
    >
      <p style={{ fontSize: 12, fontWeight: 600, color: "#3B82F6", marginBottom: 12, letterSpacing: "0.05em" }}>⛽ FUEL DETAILS</p>

      {/* Fuel type + Place */}
      <Row className="g-3">
        <Col xs={6}>
          <FormGroup className="mb-0">
            <Label style={{ fontSize: 13, fontWeight: 500 }}>Fuel type *</Label>
            <Input
              type="select"
              value={fuelType}
              onChange={(e) => setFieldValue("fuelType", e.target.value)}
              onBlur={() => setFieldTouched("fuelType", true)}
              invalid={!!(touched.fuelType && errors.fuelType)}
            >
              <option value="">Select...</option>
              {FUEL_TYPES.map((ft) => (
                <option key={ft.value} value={ft.value}>
                  {ft.label}
                </option>
              ))}
            </Input>
            <FormFeedback>{errors.fuelType}</FormFeedback>
          </FormGroup>
        </Col>
        <Col xs={6}>
          <FormGroup className="mb-0">
            <Label style={{ fontSize: 13, fontWeight: 500 }}>Place</Label>
            <Input
              type="text"
              placeholder='e.g. "Shell - Thessaloniki"'
              value={place}
              onChange={(e) => setFieldValue("place", e.target.value)}
              onBlur={() => setFieldTouched("place", true)}
              invalid={!!(touched.place && errors.place)}
            />
            <FormFeedback>{errors.place}</FormFeedback>
          </FormGroup>
        </Col>
      </Row>

      {/* Price per unit + Quantity */}
      <Row className="g-3 mt-0">
        <Col xs={6}>
          <FormGroup className="mb-0">
            <Label style={{ fontSize: 13, fontWeight: 500 }}>
              Price / {unit} ({displayCurrency}) *
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
            <FormFeedback>{errors.pricePerUnit}</FormFeedback>
          </FormGroup>
        </Col>
        <Col xs={6}>
          <FormGroup className="mb-0">
            <Label style={{ fontSize: 13, fontWeight: 500 }}>{unit} filled *</Label>
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
            <FormFeedback>{errors.quantity}</FormFeedback>
          </FormGroup>
        </Col>
      </Row>

      {/* Odometer + Auto-total */}
      <Row className="g-3 mt-0">
        <Col xs={6}>
          <FormGroup className="mb-0">
            <Label style={{ fontSize: 13, fontWeight: 500 }}>Odometer (km)</Label>
            <Input
              type="number"
              min={0}
              step={1}
              placeholder="e.g. 87450"
              value={odometer}
              onChange={(e) => setFieldValue("odometer", e.target.value === "" ? "" : Number(e.target.value))}
              onBlur={() => setFieldTouched("odometer", true)}
              invalid={!!(touched.odometer && errors.odometer)}
            />
            <FormFeedback>{errors.odometer}</FormFeedback>
          </FormGroup>
        </Col>
        {totalCost && (
          <Col xs={6} className="d-flex align-items-end">
            <div
              style={{
                background: "#EFF6FF",
                border: "1px solid #BFDBFE",
                borderRadius: 8,
                padding: "8px 12px",
                width: "100%",
              }}
            >
              <p style={{ fontSize: 11, color: "#3B82F6", margin: 0, fontWeight: 500 }}>Total (auto-calculated)</p>
              <p style={{ fontSize: 15, fontWeight: 700, color: "#1D4ED8", margin: 0 }}>
                {totalCost} {displayCurrency}
              </p>
            </div>
          </Col>
        )}
      </Row>
    </div>
  );
}
