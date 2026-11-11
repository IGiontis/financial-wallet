import { beforeAll, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import i18n from "../../../i18n";
import { MonthFlowSheet } from "./MonthFlowSheet";
import type { MonthFlowItem, PlanMonth } from "../planMonthView";

// The list itself is `monthFlows`' (tested on its own); here only how a row reads.
const items: MonthFlowItem[] = [
  { key: "e0", kind: "debt", label: "Ταξίδι στη Σίφνο", amount: 160, date: new Date(2026, 11, 12), event: { kind: "goal", label: "Ταξίδι στη Σίφνο", amount: -160, date: new Date(2026, 11, 12), debtId: "d1", paidBy: "Δέσποινα" } },
  { key: "e1", kind: "debt", label: "Αδερφός", amount: 50, date: new Date(2026, 11, 20), event: { kind: "goal", label: "Αδερφός", amount: -50, date: new Date(2026, 11, 20), debtId: "d2" } },
];
vi.mock("../planMonthView", () => ({ monthFlows: () => ({ in: [], out: items }) }));

beforeAll(async () => {
  await i18n.changeLanguage("el");
});

describe("the month's «Βγαίνουν» list", () => {
  it("names a goal a friend paid by the goal, who paid it, and that it is a loan", () => {
    render(<MonthFlowSheet side="out" month={{ in: 0, out: 210 } as PlanMonth} monthDate={new Date(2026, 11, 1)} now={new Date(2026, 10, 11)} formatCurrency={(n) => `${n} €`} locale="el" onClose={() => {}} />);
    const rows = screen.getAllByTestId("flow-item");
    expect(rows[0]).toHaveTextContent("Ταξίδι στη Σίφνο — πλήρωσε Δέσποινα (δάνειο)");
    expect(rows[0]).toHaveTextContent("Στόχος ·");
    // An ordinary debt still reads as before.
    expect(rows[1]).toHaveTextContent("Αδερφός");
    expect(rows[1]).toHaveTextContent("Δάνειο ·");
  });
});
