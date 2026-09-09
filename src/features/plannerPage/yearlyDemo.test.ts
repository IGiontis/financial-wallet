import { describe, it, expect } from "vitest";
import { differenceInCalendarDays } from "date-fns";
import { buildPlan, lineRanges, monthsBetween, planPeriods, type BudgetLine } from "./plannerUtils";
import type { BillWithStatus, InvestmentGoalWithStats } from "../../shared/types/IndexTypes";

/**
 * A demonstration, in figures, that a yearly cost is charged once a year.
 *
 * Run it and read the tables:
 *
 *     npx vitest run yearlyDemo --reporter=verbose
 *
 * The doubt this answers is a fair one: a trip entered once, as a season of a
 * single month repeating every year, has to turn into three separate charges on
 * a three-year view — and nothing on the screen proves that it did. Every
 * figure below is checked twice: once against the plan's own row, and once
 * against a count worked out here from the number of windows the season opens.
 */

const TODAY = new Date(2026, 8, 9); // 9 September 2026
const salary = { amount: 1800, dayOfMonth: 25, occurrences: 4 };

/** The plan as described: three trips a year, a ski season, and the food budget. */
const lines: BudgetLine[] = [
  { id: "food", label: "Food", amount: 450, kind: "expense" },
  { id: "ski", label: "Ski", amount: 200, kind: "expense", from: "2026-12", to: "2027-04", yearly: true },
  { id: "trip-aug", label: "Trip: August", amount: 1500, kind: "expense", from: "2027-08", yearly: true },
  { id: "trip-dec", label: "Trip: December", amount: 1200, kind: "expense", from: "2026-12", yearly: true },
  { id: "trip-apr", label: "Trip: April", amount: 800, kind: "expense", from: "2027-04", yearly: true },
];

const base = {
  bills: [] as BillWithStatus[],
  goals: [] as InvestmentGoalWithStats[],
  lines,
  salary,
  openingBalance: 2000,
  now: TODAY,
};

const round = (n: number) => Math.round(n * 100) / 100;
const cost = (id: string, plan: ReturnType<typeof buildPlan>) => Math.abs(plan.rows.find((r) => r.id === id)?.total ?? 0);

describe("a demonstration: three trips a year, over three years", () => {
  it("prints what every line is charged at one, two and three years", () => {
    for (const horizon of [12, 24, 36]) {
      const plan = buildPlan({ ...base, horizon });
      const days = differenceInCalendarDays(plan.end, TODAY);

      const table = plan.rows
        .filter((r) => r.source === "line")
        .map((row) => {
          const line = lines.find((l) => l.id === row.id)!;
          // The second route: count the windows the season actually opens
          // inside the horizon and multiply, rather than asking the plan.
          const windows = lineRanges(line, TODAY, days);
          const months = windows.reduce((sum, w) => sum + monthsBetween(TODAY, w.from, w.to), 0);

          return {
            line: row.label,
            "per month": line.amount,
            "times charged": windows.length,
            "months billed": round(months),
            "worked out here": round(line.amount * months),
            "what the plan says": Math.abs(row.total),
          };
        });

      const periods = planPeriods(plan);
      const barsOut = round(periods.reduce((sum, p) => sum + p.outgoing, 0));

      console.log(`\n──────── ${horizon} months — to ${plan.end.toDateString()} ────────`);
      console.table(table);
      console.log(`chart bars: in ${round(periods.reduce((sum, p) => sum + p.income, 0))} / out ${barsOut}` + `   ·   plan: in ${plan.incomeTotal} / out ${plan.outgoingTotal}`);

      for (const row of table) expect(row["what the plan says"], `${row.line} at ${horizon} months`).toBeCloseTo(row["worked out here"], 1);
    }
  });

  it("charges each trip once a year, no more and no less", () => {
    const oneYear = buildPlan({ ...base, horizon: 12 });
    const twoYears = buildPlan({ ...base, horizon: 24 });
    const threeYears = buildPlan({ ...base, horizon: 36 });

    // August trip, 1,500 a time.
    expect(cost("trip-aug", oneYear)).toBe(1500);
    expect(cost("trip-aug", twoYears)).toBe(3000);
    expect(cost("trip-aug", threeYears)).toBe(4500);

    // December, 1,200 a time.
    expect(cost("trip-dec", oneYear)).toBe(1200);
    expect(cost("trip-dec", twoYears)).toBe(2400);
    expect(cost("trip-dec", threeYears)).toBe(3600);

    // April, 800 a time.
    expect(cost("trip-apr", oneYear)).toBe(800);
    expect(cost("trip-apr", twoYears)).toBe(1600);
    expect(cost("trip-apr", threeYears)).toBe(2400);

    // And the ski season: five months at 200, every winter.
    expect(cost("ski", oneYear)).toBe(1000);
    expect(cost("ski", twoYears)).toBe(2000);
    expect(cost("ski", threeYears)).toBe(3000);
  });

  it("costs exactly one more of everything for each year added", () => {
    // The property behind the figures above: a yearly line's cost has to be
    // linear in the number of years, or it is being missed or double-counted
    // somewhere in the middle.
    const yearly = ["ski", "trip-aug", "trip-dec", "trip-apr"];
    const [one, two, three] = [12, 24, 36].map((horizon) => buildPlan({ ...base, horizon }));

    for (const id of yearly) {
      expect(round(cost(id, two) - cost(id, one)), id).toBe(cost(id, one));
      expect(round(cost(id, three) - cost(id, two)), id).toBe(cost(id, one));
    }
  });

  it("shows the trips on the chart, not only in the list", () => {
    // The bug this demo was written to find: every cost here is a budget line,
    // and the bars were built from dated events alone — so the chart drew the
    // pay arriving, nothing leaving, and a balance sliding away underneath.
    for (const horizon of [12, 24, 36]) {
      const plan = buildPlan({ ...base, horizon });
      const periods = planPeriods(plan);
      const barsOut = round(periods.reduce((sum, p) => sum + p.outgoing, 0));

      expect(barsOut, `horizon ${horizon}`).toBeGreaterThan(0);
      expect(barsOut, `horizon ${horizon}`).toBeCloseTo(plan.outgoingTotal, 1);
    }
  });

  it("bends the balance in the months the trips land in, and leaves the others alone", () => {
    const withTrips = buildPlan({ ...base, horizon: 36 });
    const without = buildPlan({ ...base, horizon: 36, lines: lines.filter((l) => !l.id.startsWith("trip")) });

    // A stretch with no trip in it costs the same either way; a stretch with
    // one costs exactly that trip more.
    const monthCost = (plan: typeof withTrips, year: number, month: number) => {
      const period = planPeriods(plan).find((p) => p.start.getFullYear() === year && p.start.getMonth() === month);
      return period ? round(period.outgoing) : undefined;
    };

    // Above eighteen months the periods are quarters, so the comparison is
    // quarter against quarter: Q4 2026 holds the December trip, Q1 2027 holds
    // no trip at all.
    expect(round(monthCost(withTrips, 2026, 9)! - monthCost(without, 2026, 9)!)).toBe(1200);
    expect(monthCost(withTrips, 2027, 0)).toBe(monthCost(without, 2027, 0));
    // Q2 2027 holds the April one, Q3 2027 the August one.
    expect(round(monthCost(withTrips, 2027, 3)! - monthCost(without, 2027, 3)!)).toBe(800);
    expect(round(monthCost(withTrips, 2027, 6)! - monthCost(without, 2027, 6)!)).toBe(1500);

    // The whole three years differ by exactly the trips.
    expect(round(withTrips.outgoingTotal - without.outgoingTotal)).toBe(4500 + 3600 + 2400);
  });
});
