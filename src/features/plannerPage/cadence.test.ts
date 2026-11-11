import { describe, it, expect } from "vitest";
import { cadenceOf, cadenceProblem, CADENCES, draftFor, lineOf, monthsOfYear, nextTimes, seasonMonths, type Cadence, type EntryMode } from "./cadence";
import { buildPlan, lineRanges, MAX_HORIZON_MONTHS, MAX_REPEAT_MONTHS, oneOffDates, repeatMonths, type OneOff } from "./plannerUtils";
import type { EntryDraft } from "./components/EntryEditor";

// The cadence is only a way of asking: what is stored is the same fields as
// before. So the two directions must agree — every stored shape opens on one
// cadence and saves back unchanged — and what a cadence saves must cost in the
// plan what its sentence says, checked through `buildPlan` rather than through
// the editor's own arithmetic.

const NOW = new Date(2026, 10, 2, 10);
const round2 = (n: number) => Math.round(n * 100) / 100;
const base: EntryDraft = { id: "x", label: "X", amount: "100" };

/** The fields that carry the "when", as stored. */
const when = (d: EntryDraft) => ({ from: d.from, to: d.to, yearly: d.yearly, until: d.until, every: d.every, date: d.date });

describe("stored figure → cadence → stored figure", () => {
  const lines: [EntryDraft, Cadence][] = [
    [{ ...base }, "monthly"],
    [{ ...base, from: "2026-12", to: "2026-12" }, "once"],
    [{ ...base, from: "2027-08", yearly: true }, "yearly"],
    [{ ...base, from: "2027-08", yearly: true, until: "2030-08" }, "yearly"],
    [{ ...base, from: "2026-12", to: "2027-04" }, "season"],
    [{ ...base, from: "2026-12", to: "2027-04", yearly: true, until: "2030-04" }, "season"],
    [{ ...base, from: "2027-01" }, "season"],
    [{ ...base, to: "2027-06" }, "season"],
  ];
  it.each(lines)("an expense line %j opens as %s and saves back as it was", (stored, expected) => {
    const cadence = cadenceOf("line", stored);
    expect(cadence).toBe(expected);
    expect(cadenceProblem("line", cadence, stored)).toBeUndefined();
    expect(when(draftFor("line", cadence, stored))).toEqual(when(stored));
  });

  const dated: [EntryDraft, Cadence][] = [
    [{ ...base, date: "2026-12-20" }, "once"],
    [{ ...base, date: "2026-12-20", every: 1 }, "monthly"],
    [{ ...base, date: "2026-12-20", every: 12, until: "2030-12-20" }, "yearly"],
    [{ ...base, date: "2026-03-15", every: 3 }, "everyN"],
    [{ ...base, date: "2026-03-15", every: 24 }, "everyN"],
  ];
  it.each(dated)("pay on a date %j opens as %s and saves back as it was", (stored, expected) => {
    const cadence = cadenceOf("oneoff", stored);
    expect(cadence).toBe(expected);
    expect(cadenceProblem("oneoff", cadence, stored)).toBeUndefined();
    expect(when(draftFor("oneoff", cadence, stored))).toEqual(when(stored));
  });

  it("only offers what each kind can store, and every offered cadence reads back as itself", () => {
    const filled: EntryDraft = { ...base, from: "2027-02", to: "2027-05", date: "2027-02-10", every: 3, until: "2029-01" };
    for (const mode of ["line", "oneoff"] as EntryMode[]) {
      for (const cadence of CADENCES[mode]) {
        const saved = draftFor(mode, cadence, filled);
        expect(cadenceOf(mode, saved)).toBe(cadence);
        // Saving twice is saving once.
        expect(draftFor(mode, cadence, saved)).toEqual(saved);
      }
    }
    expect(CADENCES.line).not.toContain("everyN");
    expect(CADENCES.oneoff).not.toContain("season");
  });
});

describe("nothing left over from a cadence tried and abandoned", () => {
  const messy: EntryDraft = { ...base, from: "2026-12", to: "2027-04", yearly: true, until: "2030-04", date: "2026-12-01", every: 3 };
  it("every month on a line keeps no season, no date, no repeat", () => {
    expect(when(draftFor("line", "monthly", messy))).toEqual(when(base));
  });
  it("once on a line is the first month alone", () => {
    expect(when(draftFor("line", "once", messy))).toEqual({ ...when(base), from: "2026-12", to: "2026-12" });
  });
  it("once on a date keeps the date and nothing that repeats", () => {
    expect(when(draftFor("oneoff", "once", messy))).toEqual({ ...when(base), date: "2026-12-01" });
  });
  it("a yearly season with no start drops the yearly flag rather than storing a repeat of nothing", () => {
    const saved = draftFor("line", "season", { ...base, to: "2027-04", yearly: true, until: "2029-04" });
    expect(saved.yearly).toBeUndefined();
    expect(saved.until).toBeUndefined();
    expect(cadenceProblem("line", "season", { ...base, to: "2027-04", yearly: true })).toBe("planner.seasonNeedsStart");
  });
});

describe("what is refused", () => {
  it("a month is needed for once and every year; a season needs one end at least", () => {
    expect(cadenceProblem("line", "once", base)).toBe("planner.cadence_monthNeeded");
    expect(cadenceProblem("line", "yearly", base)).toBe("planner.cadence_monthNeeded");
    expect(cadenceProblem("line", "season", base)).toBe("planner.cadence_seasonNeedsMonth");
    expect(cadenceProblem("line", "monthly", base)).toBeUndefined();
  });
  it("ends before starts", () => {
    expect(cadenceProblem("line", "season", { ...base, from: "2027-04", to: "2026-12" })).toBe("planner.seasonBackwards");
    expect(cadenceProblem("line", "yearly", { ...base, from: "2027-08", until: "2027-02" })).toBe("planner.repeatBackwards");
    expect(cadenceProblem("oneoff", "everyN", { ...base, date: "2027-03-01", every: 3, until: "2027-01-01" })).toBe("planner.repeatBackwards");
    expect(cadenceProblem("oneoff", "once", { ...base, date: "2027-02-30" })).toBe("validation.dateRequired");
  });
});

describe("the sentence's figures against the plan", () => {
  const plan = (draft: EntryDraft, amount: number, horizon: number) =>
    buildPlan({ bills: [], goals: [], incomes: [], lines: [lineOf(draft, amount)], now: NOW, horizon, openingBalance: 0, skipIds: new Set() });
  const charged = (draft: EntryDraft, amount: number, horizon: number) => {
    const p = plan(draft, amount, horizon);
    // Two routes to one figure: the row's total, and what the walk took a day at a time.
    const walked = round2(Array.from(p.daily.lineOut).reduce((s, n) => s + n, 0));
    const row = p.rows.find((r) => r.id === "x");
    expect(round2(-(row?.total ?? 0))).toBe(walked);
    return walked;
  };

  it("once: the whole amount, in that month, and nothing after", () => {
    const saved = draftFor("line", "once", { ...base, from: "2026-12" });
    expect(charged(saved, 400, 12)).toBe(400);
    expect(nextTimes("line", saved, NOW)).toEqual([new Date(2026, 11, 1)]);
  });

  it("every year: one month's amount per year the window holds — as many as the next times say", () => {
    const saved = draftFor("line", "yearly", { ...base, from: "2026-08" });
    const augusts = nextTimes("line", saved, NOW, 10).filter((d) => d < new Date(2028, 10, 1));
    expect(augusts).toEqual([new Date(2027, 7, 1), new Date(2028, 7, 1)]);
    expect(charged(saved, 900, 24)).toBe(900 * augusts.length);
    // A third route: the stretches the plan itself charges, one a summer.
    expect(lineRanges(lineOf(saved, 900), NOW, 730)).toHaveLength(2);
  });

  it("every year with an end stops on it", () => {
    const saved = draftFor("line", "yearly", { ...base, from: "2026-08", until: "2027-08" });
    expect(nextTimes("line", saved, NOW, 5)).toEqual([new Date(2027, 7, 1)]);
    expect(charged(saved, 900, 36)).toBe(900);
  });

  it("a yearly season: its months × the amount, which is the «a year» the sentence gives", () => {
    const saved = draftFor("line", "season", { ...base, from: "2026-12", to: "2027-04", yearly: true });
    expect(seasonMonths(saved.from, saved.to)).toBe(5);
    // From 2 November 2026, twelve months hold exactly one winter.
    expect(charged(saved, 200, 12)).toBe(1000);
    expect(nextTimes("line", saved, NOW, 6).map((d) => d.getMonth())).toEqual([11, 0, 1, 2, 3, 11]);
  });

  it("every month: twelve times the amount a year", () => {
    expect(charged(draftFor("line", "monthly", base), 300, 12)).toBe(round2(300 * 12 + 300 * (29 / 30)));
  });

  it("every few months: the months of the year it names are the ones its dates land on", () => {
    const saved = draftFor("oneoff", "everyN", { ...base, date: "2026-03-15", every: 4 });
    expect(monthsOfYear(saved)).toEqual([2, 6, 10]);
    const entry: OneOff = { id: "c", label: "c", amount: 120, date: saved.date!, every: saved.every };
    const year = oneOffDates(entry, new Date(2027, 0, 1), new Date(2027, 11, 31));
    expect(year.map((d) => d.getMonth())).toEqual(monthsOfYear(saved));
    expect(nextTimes("oneoff", saved, NOW)).toEqual([new Date(2026, 10, 15), new Date(2027, 2, 15), new Date(2027, 6, 15)]);
  });

  it("every year on a date is one month of the year; a two-year gap names none", () => {
    expect(monthsOfYear(draftFor("oneoff", "yearly", { ...base, date: "2026-12-20" }))).toEqual([11]);
    expect(monthsOfYear({ date: "2026-12-20", every: 24 })).toBeUndefined();
  });
});

describe("switching a dated income to «every few months»", () => {
  it("does not keep a monthly or yearly gap, which belongs to the cadence it left", () => {
    expect(draftFor("oneoff", "everyN", { ...base, date: "2026-12-20", every: 1 }).every).toBe(2);
    expect(draftFor("oneoff", "everyN", { ...base, date: "2026-12-20", every: 12 }).every).toBe(2);
    expect(draftFor("oneoff", "everyN", { ...base, date: "2026-12-20" }).every).toBe(2);
    // A gap of its own is kept.
    expect(draftFor("oneoff", "everyN", { ...base, date: "2026-12-20", every: 3 }).every).toBe(3);
    expect(draftFor("oneoff", "everyN", { ...base, date: "2026-12-20", every: 24 }).every).toBe(24);
  });
});

describe("how long a repeat may be", () => {
  it("reaches as far as the planner looks ahead: ten years", () => {
    expect(MAX_REPEAT_MONTHS).toBe(MAX_HORIZON_MONTHS);
    expect(repeatMonths(60)).toBe(60);
    expect(repeatMonths(120)).toBe(120);
    expect(repeatMonths(121)).toBeUndefined();
  });

  it("a «every 5 years» cost lands twice in a ten-year view, five years apart, and nowhere else", () => {
    const entry: OneOff = { id: "r", label: "Roof", amount: 4000, date: "2027-05-10", every: 60 };
    const dates = oneOffDates(entry, new Date(2026, 10, 1), new Date(2036, 9, 31));
    expect(dates).toEqual([new Date(2027, 4, 10), new Date(2032, 4, 10)]);
    // Counted the other way: whole years between the first date and the view end, every fifth.
    expect(Math.floor((2036 - 2027) / 5) + 1).toBe(dates.length);
  });
});
