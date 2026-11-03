import type { ReactNode } from "react";
import type { LegendEntry } from "../../../shared/components/InfoLegend";
import { dayTone, type DayToneInput } from "../dayTone";

/**
 * One line of a calendar's key: a miniature square drawn with the very classes
 * a day uses (`dayTone`), beside what it means — so the key cannot drift from
 * the squares it explains. Each calendar lists the lines that apply to it, in
 * its own words, and hands them to `InfoLegend`.
 */
export function dayKey(id: string, look: DayToneInput, text: ReactNode): LegendEntry {
  return { id, swatch: <span className={dayTone({ ...look, swatch: true })} />, text };
}
