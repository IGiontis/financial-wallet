import { computeDebtStatus, isFloating, loanPayoff, rateOutlook } from "./debtsUtils";
import type { Debt, DebtWithStatus } from "../../shared/types/IndexTypes";

// The worked example behind "how it works".
//
// It is priced through the same functions as everything else on the screen
// rather than written out by hand, because an explanation that quietly stops
// agreeing with the app is worse than no explanation at all. Given a floating
// loan it explains that loan; given none — on the form, before anything has been
// typed — it falls back to an ordinary mortgage, so the answer is there at the
// moment the question comes up.

/** €200,000 over 25 years at 2.30% Euribor + 1.20%. */
export const ILLUSTRATION = { amount: 200000, base: 2.3, margin: 1.2, months: 300 };

export interface RateSide {
  /** The all-in annual rate. */
  rate: number;
  instalment: number;
  /** Interest from here to the end at that rate. */
  interest: number;
}

export interface RateExample {
  /** The reader's own loan, rather than the illustration. */
  yours: boolean;
  amount: number;
  base: number;
  margin: number;
  months: number;
  /** The same on both sides — a rise moves the payment, not the end date. */
  finish: Date;
  now: RateSide;
  up: RateSide;
}

/** A twenty-five-year mortgage taken out today, for anyone who has not recorded one. */
function illustration(asOf: Date): DebtWithStatus {
  return computeDebtStatus(
    {
      id: "illustration",
      userId: "",
      person: "",
      direction: "owed_by_me",
      amount: ILLUSTRATION.amount,
      date: asOf,
      rateType: "floating",
      baseRate: ILLUSTRATION.base,
      margin: ILLUSTRATION.margin,
      interestRate: ILLUSTRATION.base + ILLUSTRATION.margin,
      termMonths: ILLUSTRATION.months,
      createdAt: asOf,
      updatedAt: asOf,
    } as Debt,
    [],
    asOf,
  );
}

function price(subject: DebtWithStatus, yours: boolean, asOf: Date): RateExample | undefined {
  const now = rateOutlook(subject, 0, asOf);
  const up = rateOutlook(subject, 1, asOf);
  const payoff = loanPayoff(subject, 0, asOf);
  if (!now || !up || !payoff) return undefined;

  return {
    yours,
    amount: subject.amount,
    base: subject.baseRate ?? 0,
    margin: subject.margin ?? 0,
    months: now.monthsLeft,
    finish: payoff.finishDate,
    now: { rate: now.rate, instalment: now.instalment, interest: now.interestToCome },
    up: { rate: up.rate, instalment: up.instalment, interest: up.interestToCome },
  };
}

/**
 * The example to show: the reader's loan where there is one, the illustration
 * otherwise — and the illustration too when a real loan cannot be priced,
 * which is a settled one nobody would be reading this from.
 */
export function rateExample(debt?: DebtWithStatus, asOf: Date = new Date()): RateExample | undefined {
  if (debt && isFloating(debt)) {
    const mine = price(debt, true, asOf);
    if (mine) return mine;
  }
  return price(illustration(asOf), false, asOf);
}
