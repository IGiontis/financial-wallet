import { describe, it, expect, vi, beforeEach } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { render, screen, fireEvent } from "@testing-library/react";
import { FormFeedback, Label } from "reactstrap";
import { MoneyInput } from "./MoneyInput";

// The one amount field (owner, 2026-11-26): the number, and at its END a grey
// cell with the sign of the currency it is TYPED in — never «Ποσό (EUR)» in the
// label (it broke onto two lines on a phone), never a cell a form makes itself.

const money = vi.hoisted(() => ({ displayCurrency: "USD" }));
vi.mock("../hooks/useCurrencyConverter", () => ({ useCurrencyConverter: () => ({ displayCurrency: money.displayCurrency, baseCurrency: "EUR" }) }));

beforeEach(() => {
  money.displayCurrency = "USD";
});

const field = (props: Partial<Parameters<typeof MoneyInput>[0]> = {}) =>
  render(
    <>
      <Label for="amount">Amount</Label>
      <MoneyInput id="amount" value="" onChange={() => {}} {...props} />
    </>,
  );

describe("MoneyInput", () => {
  it("shows the display currency's sign when no currency is given", () => {
    const { unmount } = field();
    expect(screen.getByLabelText("Amount").nextElementSibling).toHaveTextContent(/^\$$/);
    unmount();
    money.displayCurrency = "GBP";
    field();
    expect(screen.getByLabelText("Amount").nextElementSibling).toHaveTextContent(/^£$/);
  });

  it("shows the sign of the currency the figure is typed in, not the one on screen", () => {
    field({ currency: "EUR" });
    const cell = screen.getByLabelText("Amount").nextElementSibling!;
    expect(cell).toHaveTextContent(/^€$/);
    // The code is still there for whoever hovers it.
    expect(cell).toHaveAttribute("title", "EUR");
  });

  it("puts the cell AFTER the number, inside the field, with the feedback after it", () => {
    field({ invalid: true, children: <FormFeedback>Needed</FormFeedback> });
    const input = screen.getByLabelText("Amount");
    const group = input.parentElement!;
    expect(group).toHaveClass("input-group");
    expect(group.firstElementChild).toBe(input);
    expect(input.nextElementSibling).toHaveClass("input-group-text");
    // A FormFeedback shows only as a sibling of the invalid input.
    expect(group.lastElementChild).toHaveClass("invalid-feedback");
    expect(input).toHaveClass("is-invalid");
  });

  it("needs no currency in its label: the label names the amount, the field reads as one", () => {
    field({ currency: "EUR" });
    const label = screen.getByText("Amount");
    expect(label.textContent).toBe("Amount");
    expect(screen.getByLabelText("Amount")).toHaveAttribute("id", "amount");
    // The sign is not part of the field's accessible name.
    expect(screen.getByRole("spinbutton", { name: "Amount" })).toBeInTheDocument();
  });

  it("hands back what was typed, as text, and keeps the field's own settings", () => {
    const onChange = vi.fn();
    field({ onChange, min: 0, required: true, autoFocus: true });
    const input = screen.getByLabelText("Amount");
    fireEvent.change(input, { target: { value: "12.5" } });
    expect(onChange).toHaveBeenCalledWith("12.5");
    expect(input).toHaveAttribute("type", "number");
    expect(input).toHaveAttribute("min", "0");
    expect(input).toHaveAttribute("step", "0.01");
    expect(input).toHaveAttribute("aria-required", "true");
    expect(input).toHaveFocus();
  });

  it("as free text (read with parseAmount) has no min or step and no autofill", () => {
    field({ type: "text" });
    const input = screen.getByLabelText("Amount");
    expect(input).toHaveAttribute("type", "text");
    expect(input).toHaveAttribute("inputmode", "decimal");
    expect(input).not.toHaveAttribute("min");
    expect(input).not.toHaveAttribute("step");
    expect(input).toHaveAttribute("autocomplete", "off");
  });
});

// The habit it replaced must not come back: a form's own currency cell, or the
// currency in parentheses after a label.
const SRC = join(__dirname, "..", "..");
const files = (dir: string): string[] =>
  readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return files(path);
    return /\.tsx$/.test(name) && !/\.test\.tsx$/.test(name) ? [path] : [];
  });

describe("amount fields across the app", () => {
  it("never hand-build a currency cell nor write the currency after a label", () => {
    const handMadeCell = /<InputGroupText[^>]*>\s*\{\s*(baseCurrency|displayCurrency|sign|symbol|currencySymbol\([^)]*\))\s*\}\s*<\/InputGroupText>/;
    const codeInLabel = /\(\{\s*(displayCurrency|baseCurrency)\s*\}\)|\(\$\{\s*(displayCurrency|baseCurrency)\s*\}\)/;
    const offenders = files(SRC)
      .filter((path) => !path.endsWith(join("shared", "components", "MoneyInput.tsx")))
      .filter((path) => {
        const text = readFileSync(path, "utf8");
        return handMadeCell.test(text) || codeInLabel.test(text);
      })
      .map((path) => relative(SRC, path));
    expect(offenders).toEqual([]);
  });
});
