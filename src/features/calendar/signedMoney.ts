/** "+" for a figure that nets in, "−" for one that nets out, nothing at exactly zero. */
export const signOf = (n: number) => (n > 0 ? "+" : n < 0 ? "−" : "");

/** Signed, with its currency: "+70,00 €", "−25,98 €". */
export const signedMoney = (n: number, formatCurrency: (n: number) => string) => `${signOf(n)}${formatCurrency(Math.abs(n))}`;
