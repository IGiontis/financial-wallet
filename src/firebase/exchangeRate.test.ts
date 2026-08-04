import { describe, it, expect } from "vitest";
import { convertAmount } from "./exchangeRate";

// Rates are relative to USD (the pivot): 1 USD = 0.9 EUR = 0.8 GBP
const rates = { USD: 1, EUR: 0.9, GBP: 0.8 };

describe("convertAmount", () => {
  it("returns the same amount when from === to", () => {
    expect(convertAmount(100, "EUR", "EUR", rates)).toBe(100);
  });

  it("converts USD → EUR by multiplying by the target rate", () => {
    expect(convertAmount(100, "USD", "EUR", rates)).toBeCloseTo(90);
  });

  it("converts EUR → USD by dividing by the source rate", () => {
    expect(convertAmount(90, "EUR", "USD", rates)).toBeCloseTo(100);
  });

  it("converts EUR → GBP through the USD pivot", () => {
    // 90 EUR -> 100 USD -> 80 GBP
    expect(convertAmount(90, "EUR", "GBP", rates)).toBeCloseTo(80);
  });

  it("is reversible (round-trips back to the original)", () => {
    const there = convertAmount(250, "GBP", "EUR", rates);
    const back = convertAmount(there, "EUR", "GBP", rates);
    expect(back).toBeCloseTo(250);
  });

  it("falls back to a rate of 1 when a currency is missing", () => {
    expect(convertAmount(100, "USD", "JPY", rates)).toBe(100);
  });
});
