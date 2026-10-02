import { describe, it, expect } from "vitest";
import i18next from "i18next";
import { buildPlan, heroSubline } from "./plannerUtils";
import en from "../../i18n/locales/en.json";
import el from "../../i18n/locales/el.json";
import type { BillWithStatus } from "../../shared/types/IndexTypes";

// The words the Planner puts beside its figures, run through i18next itself so
// the plural rules are the library's, not a guess at them.

const translator = (lng: "en" | "el") => {
  const instance = i18next.createInstance();
  void instance.init({ lng, initAsync: false, resources: { en: { translation: en }, el: { translation: el } }, interpolation: { escapeValue: false } });
  return instance.t.bind(instance);
};
const tEn = translator("en");
const tEl = translator("el");

const vars = (text: string) => [...text.matchAll(/{{(\w+)/g)].map((m) => m[1]).sort();

/** Every string in a section, keyed by its dotted path — a section can nest. */
const flatten = (node: unknown, prefix = ""): Record<string, string> =>
  typeof node === "string"
    ? { [prefix]: node }
    : Object.assign({}, ...Object.entries(node as Record<string, unknown>).map(([k, v]) => flatten(v, prefix ? `${prefix}.${k}` : k)));

describe("en and el say the same things", () => {
  for (const section of ["planner", "overview"] as const) {
    it(`have the same ${section} keys, with the same placeholders`, () => {
      const a = flatten(en[section]);
      const b = flatten(el[section]);
      expect(Object.keys(b).sort()).toEqual(Object.keys(a).sort());
      for (const key of Object.keys(a)) expect(vars(b[key]), key).toEqual(vars(a[key]));
    });
  }
});

describe("counts in the Planner's words", () => {
  it("says 1 salary and 3 salaries, «1 μισθός» and «3 μισθοί»", () => {
    expect(tEn("planner.salaries", { count: 1 })).toBe("1 salary");
    expect(tEn("planner.salaries", { count: 3 })).toBe("3 salaries");
    expect(tEl("planner.salaries", { count: 1 })).toBe("1 μισθός");
    expect(tEl("planner.salaries", { count: 3 })).toBe("3 μισθοί");
  });

  it("counts the days a budget line runs over, «1 μέρα» and «30 μέρες»", () => {
    expect(tEl("planner.stepDays", { count: 1 })).toBe("1 μέρα");
    expect(tEl("planner.stepDays", { count: 30 })).toBe("30 μέρες");
    expect(tEn("planner.stepDays", { count: 30 })).toBe("30 days");
  });

  it("picks the plural from the rounded figure it prints, fractions included", () => {
    expect(tEl("planner.timesMonths", { months: "1", count: 1 })).toBe("× 1 μήνας σε αυτό το διάστημα");
    expect(tEl("planner.timesMonths", { months: "1,6", count: 1.6 })).toBe("× 1,6 μήνες σε αυτό το διάστημα");
    expect(tEn("planner.timesMonths", { months: "0.5", count: 0.5 })).toBe("× 0.5 months in this range");
    expect(tEn("planner.timesMonths", { months: "1", count: 1 })).toBe("× 1 month in this range");
  });

  it("counts days of grace the same way", () => {
    expect(tEn("planner.canWaitUntil", { date: "14 Sep", count: 1 })).toBe("can wait to 14 Sep · 1 day of grace");
    expect(tEl("planner.canWaitUntil", { date: "14 Σεπ", count: 1 })).toBe("σηκώνει έως 14 Σεπ · 1 μέρα περιθώριο");
    expect(tEl("planner.canWaitUntil", { date: "14 Σεπ", count: 25 })).toBe("σηκώνει έως 14 Σεπ · 25 μέρες περιθώριο");
  });

  it("leaves no bare key behind for a call that now passes a count", () => {
    // i18next falls back to the bare key when a plural form is missing, so a
    // stale one would quietly win over the plural.
    for (const key of ["salaries", "stepDays", "timesMonths", "canWaitUntil"]) {
      expect((en.planner as Record<string, string>)[key]).toBeUndefined();
      expect((el.planner as Record<string, string>)[key]).toBeUndefined();
    }
  });
});

// ─── The "tight" line ───────────────────────────────────────────────────────
// What the owner saw: «πέφτεις 489,15 € κάτω στις 1 Οκτ» — the deepest figure
// beside the first day under, when 1 October was −69.68 and −489.15 the 29th.

describe("the line under a tight verdict", () => {
  // 30 Sep 2026, 100 in hand. September's card and insurance are paid; October's
  // card (169.68) is on the 1st and insurance (419.47) on the 29th; pay of
  // 1,000 on the 30th. One month runs to 31 October.
  const paidSeptember = (id: string, name: string, amount: number, dueDay: number) =>
    ({
      id,
      userId: "u1",
      name,
      amount,
      dueDay,
      categoryId: "c1",
      frequency: "monthly",
      isActive: true,
      anchorDate: new Date(2026, 0, 1),
      createdAt: new Date(2026, 0, 1),
      updatedAt: new Date(2026, 0, 1),
      currentPeriodKey: "2026-09",
      isPaidThisPeriod: true,
      monthlyEquivalent: amount,
      payments: [{ id: `${id}-sep`, userId: "u1", billId: id, periodKey: "2026-09", amount, paidDate: new Date(2026, 8, 1), createdAt: new Date(2026, 8, 1) }],
    }) as unknown as BillWithStatus;
  const plan = buildPlan({
    bills: [paidSeptember("card", "Card", 169.68, 1), paidSeptember("ins", "Insurance", 419.47, 29)],
    goals: [],
    salary: { amount: 1000, dayOfMonth: 30, occurrences: 4 },
    openingBalance: 100,
    horizon: 1,
    now: new Date(2026, 8, 30, 21),
  });
  const dateFmt = { el: new Intl.DateTimeFormat("el", { day: "numeric", month: "short" }), en: new Intl.DateTimeFormat("en", { day: "numeric", month: "short" }) };
  const money = (n: number) => `${n < 0 ? "−" : ""}${Math.abs(n).toFixed(2).replace(".", ",")} €`;
  const render = (t: typeof tEl, fmt: Intl.DateTimeFormat) => {
    const line = heroSubline(plan);
    if (line.key === "planner.lowestPoint") throw new Error("expected a dip line");
    return t(line.key, { date: fmt.format(line.date), name: line.name, amount: money(line.lowest), lowDate: fmt.format(line.lowestOn) });
  };

  it("is the case: under on the 1st, deepest on the 29th, back above by the end", () => {
    expect(plan.verdict).toBe("tight");
    expect(plan.breaksOn).toEqual(new Date(2026, 9, 1));
    expect(plan.points.find((p) => p.date.getTime() === plan.breaksOn!.getTime())?.balance).toBe(-69.68);
    expect(plan.lowestBalance).toBe(-489.15);
    expect(plan.lowestOn).toEqual(new Date(2026, 9, 29));
    // By hand: 100 − 169.68 − 419.47 = −489.15; then + 1,000 = 510.85.
    expect(plan.endingBalance).toBe(Math.round((100 - 169.68 - 419.47 + 1000) * 100) / 100);
  });

  it("names the first day under with what did it, and the lowest figure with its own day", () => {
    expect(heroSubline(plan)).toEqual({ key: "planner.dipsOnBill", date: new Date(2026, 9, 1), name: "Card", lowest: -489.15, lowestOn: new Date(2026, 9, 29) });

    const greek = render(tEl, dateFmt.el);
    const oct1 = dateFmt.el.format(new Date(2026, 9, 1));
    const oct29 = dateFmt.el.format(new Date(2026, 9, 29));
    // The mockup's wording: «Κάτω από το μηδέν από την Πέμ 1 Οκτ, στο «Ενοίκιο» · πιο χαμηλά −489,15 € την Πέμ 29 Οκτ».
    expect(greek).toBe(`Κάτω από το μηδέν από την ${oct1}, στο «Card» · πιο χαμηλά −489,15 € την ${oct29}`);
    // The figure the owner saw paired with the wrong day can no longer be printed.
    expect(greek).not.toContain(`489,15 € κάτω στις ${oct1}`);
    expect(render(tEn, dateFmt.en)).toBe(`Below zero from ${dateFmt.en.format(new Date(2026, 9, 1))}, at “Card” · lowest −489,15 € on ${dateFmt.en.format(new Date(2026, 9, 29))}`);
  });

  it("says the same two facts for a plan that ends under zero", () => {
    // Short is no longer told by the window's dates: it went under on a day, at something.
    const short = { ...plan, verdict: "short" as const };
    expect(heroSubline(short).key).toBe("planner.dipsOnBill");
  });

  it("names the lowest point and its day when the line never goes under", () => {
    const calm = { ...plan, verdict: "ok" as const, breaksOn: undefined, lowestBalance: 94.35, lowestOn: new Date(2026, 9, 29) };
    expect(heroSubline(calm)).toEqual({ key: "planner.lowestPoint", lowest: 94.35, lowestOn: new Date(2026, 9, 29) });
    expect(tEl("planner.lowestPoint", { amount: "94,35 €", date: "Πέμ 29 Οκτ" })).toBe("Χαμηλότερο σημείο 94,35 € · Πέμ 29 Οκτ");
  });
});
