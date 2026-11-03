import tone from "./css/DayTone.module.css";

/**
 * The calendars' colour language as class names — one map for every day or
 * month square in the app (see DayTone.module.css for what each colour says).
 *
 * A side is what lands on the square in one direction: `"todo"` still to come
 * or to pay, `"done"` happened, `"ahead"` later on — coming, not yet due.
 * The square is painted from its sides, so a calendar only says what is on a
 * day and the colours follow; nobody picks a colour.
 */
export type ToneSide = "todo" | "done" | "ahead";

export interface DayToneInput {
  in?: ToneSide;
  out?: ToneSide;
  /** Late, or waiting for an answer: the amber dot. */
  late?: boolean;
  /** Off: a bill paused, a month nothing is owed in. Wins over the sides. */
  off?: boolean;
  today?: boolean;
  selected?: boolean;
  /** For a key's miniature. */
  swatch?: boolean;
}

export function dayTone(input: DayToneInput): string {
  const classes = [tone.cell];
  const sides = [input.in, input.out].filter((side): side is ToneSide => side !== undefined);

  if (input.off) {
    classes.push(tone.off);
  } else if (sides.length > 0 && sides.every((side) => side === "ahead")) {
    // Only later things on it: a dashed edge in the colour of the one there is.
    classes.push(input.out ? tone.aheadOut : tone.aheadIn);
  } else if (sides.length > 0) {
    // "Later" beside something now is drawn as now: the square has business today.
    if (input.in === "done") classes.push(tone.inDone);
    if (input.out === "done") classes.push(tone.outDone);
    classes.push(input.in && input.out ? tone.both : input.in ? tone.in : tone.out);
    if (sides.every((side) => side === "done")) classes.push(tone.allDone);
  }

  if (input.late) classes.push(tone.late);
  if (input.today) classes.push(tone.today);
  if (input.selected) classes.push(tone.selected);
  if (input.swatch) classes.push(tone.swatch);
  return classes.join(" ");
}

/** The class names themselves, for a calendar outside this folder that wants to compose its own. */
export const DAY_TONE = tone;
