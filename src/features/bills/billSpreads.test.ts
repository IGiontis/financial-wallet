import { describe, it, expect } from "vitest";
import { billSpreads, computeBillStatus } from "./billsUtils";
import type { Bill, BillPayment } from "../../shared/types/IndexTypes";

// What a bill usually costs, and whether the last charge broke it.
//
// The claim is deliberately narrow: this charge is outside every charge that
// came before it, or it is not. Anything wider — a trend, a percentage against
// last year — would call January's electricity a rise every single January. So
// what these check is that the verdict is measured against the charges *before*
// the latest one, that a bill with nothing to compare stays silent, and that the
// ones that broke their range come first.

const makeBill = (overrides: Partial<Bill> = {}): Bill =>
  ({
    id: "b1",
    userId: "u1",
    name: "Electricity",
    amount: 60,
    categoryId: "c1",
    frequency: "monthly",
    dueDay: 5,
    isVariableAmount: true,
    isActive: true,
    anchorDate: new Date(2026, 0, 1),
    createdAt: new Date(2026, 0, 1),
    updatedAt: new Date(2026, 0, 1),
    ...overrides,
  }) as Bill;

/** Amounts oldest first, as they would have been paid month by month. */
const withCharges = (amounts: number[], overrides: Partial<Bill> = {}) => {
  const bill = makeBill(overrides);
  const payments = amounts.map(
    (amount, i) =>
      ({
        id: `p${i}`,
        userId: "u1",
        billId: bill.id,
        periodKey: `2026-${String(i + 1).padStart(2, "0")}`,
        amount,
        paidDate: new Date(2026, i, 5),
        createdAt: new Date(2026, i, 5),
      }) as BillPayment,
  );
  return computeBillStatus(bill, payments, new Date(2026, amounts.length, 15));
};

describe("billSpreads", () => {
  it("draws the charges oldest first, whatever order they were stored in", () => {
    const [spread] = billSpreads([withCharges([48, 55, 71, 88])]);

    expect(spread.charges.map((charge) => charge.amount)).toEqual([48, 55, 71, 88]);
    expect(spread.latest.amount).toBe(88);
  });

  it("measures the latest against the ones before it, not including itself", () => {
    // Against all four the latest is simply the maximum, which would make every
    // dearest-ever charge "normal". Against the first three it is a new high.
    const [spread] = billSpreads([withCharges([48, 55, 71, 88])]);

    expect(spread.usual).toEqual({ min: 48, max: 71 });
    expect(spread.standing).toBe("above");
    expect(spread.gap).toBe(17);
  });

  it("calls a charge inside the range usual, and claims no gap", () => {
    const [spread] = billSpreads([withCharges([62, 71, 66, 68])]);

    expect(spread.usual).toEqual({ min: 62, max: 71 });
    expect(spread.standing).toBe("usual");
    expect(spread.gap).toBeUndefined();
  });

  it("notices a charge that fell below everything before it", () => {
    const [spread] = billSpreads([withCharges([62, 71, 66, 40])]);

    expect(spread.standing).toBe("below");
    expect(spread.gap).toBe(22);
  });

  it("stays silent when there is nothing to compare against", () => {
    // Three charges leave only two before the latest — too thin to call anything
    // unusual.
    const [spread] = billSpreads([withCharges([48, 55, 88])]);

    expect(spread.charges).toHaveLength(3);
    expect(spread.usual).toBeUndefined();
    expect(spread.standing).toBeUndefined();
  });

  it("leaves out a bill with too little history to have a shape", () => {
    expect(billSpreads([withCharges([48, 88])])).toHaveLength(0);
  });

  it("leaves out a bill that costs the same every time", () => {
    // True of rent, and of every fixed subscription: there is no spread, and a
    // row saying "€25, as always" says nothing.
    expect(billSpreads([withCharges([25, 25, 25, 25, 25])])).toHaveLength(0);
  });

  it("opens with what got dearer, worst first", () => {
    const mild = withCharges([60, 62, 61, 66], { id: "mild", name: "Water" });
    const steep = withCharges([60, 62, 61, 95], { id: "steep", name: "Electricity" });
    const ordinary = withCharges([60, 62, 61, 61], { id: "ok", name: "Gas" });
    const cheaper = withCharges([60, 62, 61, 20], { id: "down", name: "Phone" });

    const order = billSpreads([ordinary, cheaper, mild, steep]).map((spread) => spread.bill.name);

    expect(order).toEqual(["Electricity", "Water", "Gas", "Phone"]);
  });

  it("keeps only the most recent charges when there are many", () => {
    const amounts = Array.from({ length: 20 }, (_, i) => 50 + i);
    const [spread] = billSpreads([withCharges(amounts)], 12);

    expect(spread.charges).toHaveLength(12);
    expect(spread.latest.amount).toBe(69);
    expect(spread.charges[0].amount).toBe(58);
  });
});
