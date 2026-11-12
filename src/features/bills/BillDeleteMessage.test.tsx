import { describe, it, expect, afterAll } from "vitest";
import { render, screen } from "@testing-library/react";
import i18n from "../../i18n";
import BillDeleteMessage from "./BillDeleteMessage";
import type { BillPayment } from "../../shared/types/IndexTypes";

// The delete dialog says what goes with the bill: its payments, counted, and
// that the expenses they wrote stay. A bill never paid says nothing more.

const payments = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `p${i}`, billId: "b1" }) as BillPayment);

afterAll(() => i18n.changeLanguage("en"));

describe("the bill delete dialog", () => {
  it("names how many payments go with the bill, in Greek and English", async () => {
    await i18n.changeLanguage("el");
    const { unmount } = render(<BillDeleteMessage bill={{ name: "ΔΕΗ", payments: payments(12) }} />);
    expect(screen.getByText("Να διαγραφεί το «ΔΕΗ»;")).toBeTruthy();
    expect(screen.getByText("Θα σβηστούν και 12 πληρωμές του. Τα έξοδα μένουν στις Συναλλαγές.")).toBeTruthy();
    unmount();

    await i18n.changeLanguage("en");
    render(<BillDeleteMessage bill={{ name: "Power", payments: payments(12) }} />);
    expect(screen.getByText("Its 12 payments will be deleted too. The expenses stay in Transactions.")).toBeTruthy();
  });

  it("uses the singular for one payment", async () => {
    await i18n.changeLanguage("el");
    render(<BillDeleteMessage bill={{ name: "ΔΕΗ", payments: payments(1) }} />);
    expect(screen.getByText("Θα σβηστεί και 1 πληρωμή του. Το έξοδό της μένει στις Συναλλαγές.")).toBeTruthy();
  });

  it("shows no payments line for a bill with none", async () => {
    await i18n.changeLanguage("el");
    const { container } = render(<BillDeleteMessage bill={{ name: "ΔΕΗ", payments: [] }} />);
    expect(container.querySelectorAll("p")).toHaveLength(1);
    expect(container.textContent).toBe("Να διαγραφεί το «ΔΕΗ»;");
  });
});
