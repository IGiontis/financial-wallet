import { Input, Label } from "reactstrap";

/** The unit a repeat counts in. */
export type EveryUnit = "weekly" | "monthly" | "yearly";

/** How many of each unit «Κάθε πότε» offers: past these the next unit says it better. */
export const EVERY_MAX: Record<EveryUnit, number> = { weekly: 3, monthly: 11, yearly: 10 };

/** A unit's length in months, to carry a gap across when the unit changes. */
const UNIT_MONTHS: Record<EveryUnit, number> = { weekly: 12 / 52, monthly: 1, yearly: 12 };

/**
 * The count in `next` closest to the same gap as `count` of `unit` — 24 months
 * are 2 years, 2 years 24 months when the list holds it — kept inside the
 * new unit's list (`min`–max), so 6 months turned to years is never 6 years.
 */
export function carryEvery(unit: EveryUnit, count: number, next: EveryUnit, min = 1, max = EVERY_MAX[next]): number {
  const gap = count * UNIT_MONTHS[unit];
  return Math.min(Math.max(Math.round(gap / UNIT_MONTHS[next]), min), max);
}

/**
 * «Κάθε πότε»: a number and a unit, both picked from lists on one row, never
 * typed — every 1–3 weeks, 1–11 months or 1–10 years. A count saved before
 * these limits (every 18 months) stays on offer for the record that has it, so
 * opening an old record changes nothing. Changing the unit keeps the number
 * when the new unit holds it, else the largest it does.
 */
export function EveryPicker({
  id,
  label,
  unitAria,
  unit,
  count,
  units = ["weekly", "monthly", "yearly"],
  min,
  max: maxes,
  unitText,
  onChange,
  invalid,
}: {
  id: string;
  label: string;
  /** The unit list's own name — «Μονάδα». */
  unitAria: string;
  unit: EveryUnit;
  count: number;
  units?: readonly EveryUnit[];
  /**
   * The smallest count each unit offers, 1 when unset. The planner's «κάθε Ν»
   * starts at 2: one month or one year is its own cadence there.
   */
  min?: Partial<Record<EveryUnit, number>>;
  /** The largest, when a record can hold less than `EVERY_MAX` (the planner keeps at most 24 months). */
  max?: Partial<Record<EveryUnit, number>>;
  /** The unit's word for this count — «εβδομάδες», «μήνα». */
  unitText: (unit: EveryUnit, count: number) => string;
  onChange: (unit: EveryUnit, count: number) => void;
  invalid?: boolean;
}) {
  const max = maxes?.[unit] ?? EVERY_MAX[unit];
  const low = min?.[unit] ?? 1;
  const counts = Array.from({ length: max - low + 1 }, (_, i) => i + low);
  // A count saved before these limits stays on offer for the record that has it.
  if (count > max) counts.push(count);
  if (count < low) counts.unshift(count);
  return (
    <div>
      <Label className="small fw-medium" for={id}>
        {label}
      </Label>
      <div className="d-flex gap-2">
        <Input id={id} type="select" className="w-auto flex-shrink-0" value={count} invalid={invalid} onChange={(e) => onChange(unit, Number(e.target.value))}>
          {counts.map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </Input>
        <Input
          type="select"
          className="flex-grow-1"
          style={{ minWidth: 0 }}
          value={unit}
          aria-label={unitAria}
          onChange={(e) => {
            const next = e.target.value as EveryUnit;
            onChange(next, carryEvery(unit, count, next, min?.[next] ?? 1, maxes?.[next] ?? EVERY_MAX[next]));
          }}
        >
          {units.map((u) => (
            <option key={u} value={u}>
              {unitText(u, count)}
            </option>
          ))}
        </Input>
      </div>
    </div>
  );
}

/** The days of a month to pick from, 1–31: a day a month lacks falls on its last. */
export const MONTH_DAYS = Array.from({ length: 31 }, (_, i) => i + 1);
