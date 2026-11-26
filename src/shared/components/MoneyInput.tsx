import type { CSSProperties, FocusEventHandler, ReactNode } from "react";
import { Input, InputGroup, InputGroupText } from "reactstrap";
import { useCurrencyConverter } from "../hooks/useCurrencyConverter";
import { currencySymbol } from "../utils/currency";
import styles from "../css/MoneyInput.module.css";

/**
 * Every box an amount of money is typed into (owner, 2026-11-26): the number,
 * and at its END a grey cell with the sign of the money — «€», «$», «£».
 *
 * It replaces two habits. «Ποσό (EUR)» in the label, which on a phone broke
 * the label onto two lines and named the currency by its code; and a hand-made
 * `InputGroupText` per form, nine of them, some saying «EUR», some «€». The
 * sign now lives in one place, and the label says only what the amount is.
 *
 * `currency` is the currency the figure is TYPED in, which is not always the
 * one on screen: a few forms take the base currency (a bank reading, a debt).
 * Leave it out for the display currency, as most forms do.
 *
 * The cell is part of the field, not of the label, so it never wraps away
 * from the number, and it is not read twice: the label names the amount, the
 * cell is marked as the unit.
 */
export interface MoneyInputProps {
  id?: string;
  name?: string;
  value: string | number;
  onChange: (value: string) => void;
  onBlur?: () => void;
  onFocus?: FocusEventHandler<HTMLInputElement>;
  /** The currency the figure is typed in; the display currency when left out. */
  currency?: string;
  /**
   * `"number"` (default) — the browser's number box. `"text"` — free text for a
   * form that reads it with `parseAmount` («1.234,56» as people write it); no
   * min/step then, and no autofill.
   */
  type?: "number" | "text";
  invalid?: boolean;
  placeholder?: string;
  autoFocus?: boolean;
  readOnly?: boolean;
  disabled?: boolean;
  required?: boolean;
  /** Smallest accepted amount; 0.01 unless the form allows zero. `null` = no minimum. */
  min?: number | null;
  /** The number box's step; cents unless the form counts in other units. */
  step?: number | string;
  /** The small field of a compact row (`InputGroup size="sm"`). */
  size?: "sm";
  /** The field's name for a screen reader when no `<Label for>` names it. */
  ariaLabel?: string;
  /** Under the field, inside the group — a `FormFeedback` shows only when it is a sibling of the input. */
  children?: ReactNode;
  /** On the group (width, layout). */
  className?: string;
  /** On the input itself (a large figure, right-aligned numbers). */
  inputClassName?: string;
  inputStyle?: CSSProperties;
}

export function MoneyInput({
  id,
  name,
  value,
  onChange,
  onBlur,
  onFocus,
  currency,
  type = "number",
  invalid,
  placeholder = "0,00",
  autoFocus,
  readOnly,
  disabled,
  required,
  min = 0.01,
  step = "0.01",
  size,
  ariaLabel,
  children,
  className = "",
  inputClassName,
  inputStyle,
}: MoneyInputProps) {
  const { displayCurrency } = useCurrencyConverter();
  const sign = currencySymbol(currency ?? displayCurrency);
  const isNumber = type === "number";
  return (
    <InputGroup size={size} className={`${styles.group} ${className}`}>
      <Input
        id={id}
        name={name}
        type={type}
        inputMode="decimal"
        step={isNumber ? step : undefined}
        min={isNumber && min !== null ? min : undefined}
        autoComplete={isNumber ? undefined : "off"}
        aria-required={required || undefined}
        aria-label={ariaLabel}
        autoFocus={autoFocus}
        readOnly={readOnly}
        disabled={disabled}
        placeholder={placeholder}
        value={value}
        invalid={invalid}
        className={inputClassName}
        style={inputStyle}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onBlur}
        onFocus={onFocus}
      />
      <InputGroupText className={styles.sign} title={currency ?? displayCurrency}>
        {sign}
      </InputGroupText>
      {children}
    </InputGroup>
  );
}

export default MoneyInput;
