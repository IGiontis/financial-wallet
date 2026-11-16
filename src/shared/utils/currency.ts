import type { Currency } from "../types/IndexTypes";

/**
 * The one place a currency's sign is spelled out. Everything else asks:
 * a figure through `useCurrencyConverter().format`, an input's suffix (or a
 * decorative money sign) through `currencySymbol` / `useCurrencyConverter().symbol`.
 * A user keeps his money in dollars, euros or pounds — a «€» typed into a
 * screen is wrong for two of the three (`currency.test.ts` refuses one).
 */
const SYMBOLS: Record<Currency, string> = { EUR: "€", USD: "$", GBP: "£" };

/** Names for the currency picker in Settings («EUR — Euro (€)»). */
const NAMES: Record<Currency, string> = { EUR: "Euro", USD: "US Dollar", GBP: "British Pound" };

export const CURRENCIES = Object.keys(SYMBOLS) as Currency[];

/**
 * The sign a currency is written with: «€», «$», «£». Unknown codes fall back
 * to what the browser calls them (narrow symbol), then to the code itself; no
 * code at all is the app's default, the euro.
 */
export function currencySymbol(currency: string | undefined): string {
  if (!currency) return SYMBOLS.EUR;
  if (Object.hasOwn(SYMBOLS, currency)) return SYMBOLS[currency as Currency];
  try {
    const parts = new Intl.NumberFormat("en", { style: "currency", currency, currencyDisplay: "narrowSymbol" }).formatToParts(0);
    return parts.find((p) => p.type === "currency")?.value ?? currency;
  } catch {
    return currency;
  }
}

/** «EUR — Euro (€)» — the Settings picker's line for a currency. */
export const currencyLabel = (currency: Currency): string => `${currency} — ${NAMES[currency]} (${currencySymbol(currency)})`;

/**
 * Every money sign and currency code an amount may arrive with — typed, pasted
 * from a bank's app or copied off a screen: «214,50 €», «$1,842.30», «£25»,
 * «120 EUR». Strip these, and the spaces, before reading the number.
 */
export const MONEY_MARKS = /[\s\p{Sc}]|EUR|USD|GBP/giu;
