import type { FuelType } from "../../shared/types/IndexTypes";

export const FUEL_TYPES: { value: FuelType; label: string }[] = [
  { value: "petrol", label: "Petrol" },
  { value: "diesel", label: "Diesel" },
  { value: "lpg", label: "LPG" },
  { value: "cng", label: "CNG" },
  { value: "electric", label: "Electric" },
];

export const getUnitLabel = (fuelType: FuelType | ""): string => (fuelType === "electric" ? "kWh" : "L");
