import type { FuelType } from "../../shared/types/IndexTypes";

// Labels are i18n keys — this module has no `t`, so callers translate them.
export const FUEL_TYPES: { value: FuelType; labelKey: string }[] = [
  { value: "petrol", labelKey: "transactions.fuelPetrol" },
  { value: "diesel", labelKey: "transactions.fuelDiesel" },
  { value: "lpg", labelKey: "transactions.fuelLpg" },
  { value: "cng", labelKey: "transactions.fuelCng" },
  { value: "electric", labelKey: "transactions.fuelElectric" },
];

/** The i18n key naming a stored fuel type; an unknown value comes back as itself. */
export const fuelTypeLabelKey = (fuelType: string): string => FUEL_TYPES.find((ft) => ft.value === fuelType)?.labelKey ?? fuelType;

export const getUnitLabel = (fuelType: FuelType | ""): string => (fuelType === "electric" ? "kWh" : "L");

/**
 * A pump price, e.g. €1.859 / 1,859 €. Fuel is priced to the tenth of a cent,
 * so up to three decimals survive where an amount of money would stop at two.
 */
export const formatUnitPrice = (value: number, currency: string, locale: string): string =>
  new Intl.NumberFormat(locale, { style: "currency", currency, minimumFractionDigits: 2, maximumFractionDigits: 3 }).format(value);
