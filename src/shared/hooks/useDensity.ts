import { useLocalStorage } from "./useLocalStorage";

/**
 * How much a list says about each of its rows — «Απλό · Κανονικό · Αναλυτικό»
 * (owner, 2026-11-17; first on a person's debts, Bills next).
 *
 * - `simple`: each row its figure and one line.
 * - `normal`: + its progress, its dates, the last thing that happened.
 * - `detailed`: + its whole history.
 */
export type Density = "simple" | "normal" | "detailed";

export const DENSITIES: readonly Density[] = ["simple", "normal", "detailed"];

const isDensity = (value: unknown): value is Density => typeof value === "string" && (DENSITIES as readonly string[]).includes(value);

/**
 * `[density, setDensity]` for one page, remembered on this device per
 * `pageKey` (`density:<pageKey>` in localStorage — a per-device view choice,
 * never user data). A private window or a full disk keeps it for the visit
 * only; anything stored that is not a density reads as `initial`.
 */
export function useDensity(pageKey: string, initial: Density = "normal"): [Density, (next: Density) => void] {
  const [stored, setStored] = useLocalStorage<unknown>(`density:${pageKey}`, initial);
  return [isDensity(stored) ? stored : initial, setStored];
}
