import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

// One type scale for the whole app — «scale B», picked by the owner on
// 2026-10-26: eight steps in shape.css (`--fs-caption` 11 … `--fs-display` 24
// px at a 16px root), each a multiple of Bootstrap's body size, so one value
// moves them all. Every font size in CSS is one of them (or a `--stat-*` size,
// which aliases them), and every inline `fontSize` in TS/TSX is a
// `"var(--fs-…)"` string. A px size is kept only where it has to stay put, and
// each one is named below with why.

const ROOT = join(__dirname, "..", "..");

/** The eight steps, as multiples of `--bs-body-font-size`. */
const SCALE: Record<string, number> = {
  caption: 0.6875,
  small: 0.75,
  text: 0.8125,
  lead: 0.875,
  body: 1,
  figure: 1.125,
  title: 1.25,
  display: 1.5,
};

const ICON = "an icon or emoji in a fixed box: it must fill the box, not follow the text";
const INPUT = "a 16px input: under 16px iOS zooms the page on focus";
const CELL = "a label under 10px in a fixed calendar, heatmap or chart cell";
const MICRO = "a label under 10px in a fixed-size chip (kept from the worktree port)";
const CIRCLE = "initials or a step number in a fixed circle";
const BADGE = "the sidebar's .nav-badge pills";
const HERO = "the welcome splash's fluid hero type, larger than the scale on purpose";

/** `file :: selector` → why its font size is not a token. */
const CSS_ALLOWED: Record<string, string> = {
  "src/features/accounts/css/AccountsPage.module.css :: .readInput input": INPUT,
  "src/features/accounts/css/AccountsPage.module.css :: .setupAmount input": INPUT,
  "src/features/accounts/css/AccountsPage.module.css :: .chipDot": ICON,
  "src/features/analytics/components/css/Analytics.module.css :: .heatDayLabel": CELL,
  "src/features/analytics/components/css/Analytics.module.css :: .heatMonth": CELL,
  "src/features/analytics/components/css/Dashboard.module.css :: .kpiIcon": ICON,
  "src/features/analytics/components/css/Dashboard.module.css :: .ledgerTag": MICRO,
  "src/features/auth/css/Auth.module.css :: .brandBadge": ICON,
  "src/features/auth/css/WelcomeSplash.module.css :: .badge": ICON,
  "src/features/auth/css/WelcomeSplash.module.css :: .lead": HERO,
  "src/features/auth/css/WelcomeSplash.module.css :: .name": HERO,
  "src/features/bills/css/BillsPage.module.css :: .freqChip": MICRO,
  "src/features/bills/css/BillsPage.module.css :: .metricLabel": MICRO,
  "src/features/bills/css/BillsPage.module.css :: .paidTick": ICON,
  "src/features/bills/css/BillsPage.module.css :: .iconTile": ICON,
  "src/features/bills/css/BillsPage.module.css :: .monthCell": CELL,
  "src/features/bills/css/BillsPage.module.css :: .monthCellPart": CELL,
  "src/features/bills/css/BillsPage.module.css :: .lineIcon": ICON,
  "src/features/budget/components/css/GoalCard.module.css :: .bandIcon": ICON,
  "src/features/budget/components/css/GoalStacks.module.css :: .glyph": ICON,
  "src/features/budget/components/css/GoalStacks.module.css :: .icon": ICON,
  "src/features/calendar/css/CalendarPage.module.css :: .sheetIcon": ICON,
  "src/features/categories/css/CategoryPicker.module.css :: .cardIcon": ICON,
  "src/features/incomes/css/IncomesPage.module.css :: .lineIcon": ICON,
  "src/features/incomes/css/IncomesPage.module.css :: .readIcon": ICON,
  "src/features/layout/css/Sidebar.css :: .nav-badge": BADGE,
  "src/features/layout/css/Sidebar.css :: .nav-badge.nav-badge-word": BADGE,
  "src/features/layout/css/Sidebar.css :: .sidebar.collapsed .nav-badge": BADGE,
  "src/features/layout/css/Topbar.module.css :: .iconButton": ICON,
  "src/features/layout/css/Topbar.module.css :: .userAvatar": CIRCLE,
  "src/features/layout/css/Topbar.module.css :: .userInfoAvatar": CIRCLE,
  "src/features/overview/pages/css/OverviewPage.module.css :: .todayIcon": ICON,
  "src/features/tour/css/WelcomeTour.module.css :: .icon": ICON,
  "src/features/transactions/components/css/TransactionInsights.module.css :: .donutCaption": CELL,
  "src/features/transactions/components/css/TransactionInsights.module.css :: .barLabel": CELL,
  "src/features/transactions/components/css/TransactionWizard.module.css :: .stepsLarge .stepDot": CIRCLE,
  "src/features/transactions/components/css/TransactionWizard.module.css :: .stepDot": CIRCLE,
  "src/features/transactions/pages/css/Ledger.module.css :: .icon": ICON,
  "src/features/transactions/pages/css/TransactionPage.module.css :: .txIcon": ICON,
  "src/index.css :: .react-datepicker__close-icon::after": ICON,
  "src/shared/css/ManageList.module.css :: .icon": ICON,
};

const CHART = "a chart library's own prop (Recharts tick, ECharts): drawn as an SVG/canvas attribute that can't read a CSS variable";

/** file → how many numeric `fontSize`s it keeps, and why. */
const TSX_ALLOWED: Record<string, { count: number; why: string }> = {
  "src/features/analytics/components/chartTheme.ts": { count: 1, why: CHART },
  "src/features/analytics/components/useChartPalette.ts": { count: 1, why: CHART },
  "src/features/analytics/components/MoneyFlowSankey.tsx": { count: 1, why: CHART },
  "src/features/overview/components/CashFlowChart.tsx": { count: 2, why: CHART },
  "src/features/accounts/AccountsPage.tsx": { count: 1, why: INPUT },
  "src/features/plannerPage/components/OccurrenceSheet.tsx": { count: 1, why: INPUT },
  "src/features/bills/BillsPage.tsx": { count: 1, why: ICON },
  "src/features/bills/MonthBreakdownModal.tsx": { count: 1, why: ICON },
  "src/features/budget/components/GoalWizard.tsx": { count: 2, why: ICON },
  "src/features/categories/CategoryModal.tsx": { count: 2, why: ICON },
  "src/features/incomes/IncomesPage.tsx": { count: 1, why: ICON },
  "src/features/overview/pages/OverviewPage.tsx": { count: 1, why: ICON },
  "src/features/transactions/components/TransactionCalendar.tsx": { count: 1, why: ICON },
  "src/features/transactions/pages/TransactionPage.tsx": { count: 2, why: ICON },
  "src/features/settings/pages/SettingsPage.tsx": { count: 1, why: CIRCLE },
  "src/shared/components/SubPageTabs.tsx": { count: 1, why: "a count pill on a tab, sized like the sidebar's .nav-badge" },
};

function files(ext: RegExp): string[] {
  const out: string[] = [];
  const walk = (path: string) => {
    if (statSync(path).isDirectory()) {
      for (const entry of readdirSync(path)) walk(join(path, entry));
    } else if (ext.test(path) && !/\.test\.tsx?$/.test(path)) {
      out.push(path);
    }
  };
  walk(join(ROOT, "src"));
  return out;
}

const rel = (path: string) => relative(ROOT, path).replace(/\\/g, "/");

/** A size made only of scale steps (and viewport units, for a fluid clamp). */
function onScale(value: string): boolean {
  if (value === "inherit" || value === "0") return true;
  const rest = value.replace(/var\(--(fs|stat)-[a-z-]+\)/g, "");
  return !/\d(px|rem|em)\b|var\(--bs-/.test(rest);
}

describe("type scale", () => {
  it("shape.css defines the eight steps of scale B", () => {
    const shape = readFileSync(join(ROOT, "src/styles/shape.css"), "utf8");
    for (const [name, x] of Object.entries(SCALE)) {
      const m = shape.match(new RegExp(`--fs-${name}:\\s*([^;]+);`));
      expect(m, `--fs-${name}`).not.toBeNull();
      const value = m![1].trim();
      if (x === 1) expect(value).toBe("var(--bs-body-font-size)");
      else expect(value).toBe(`calc(var(--bs-body-font-size) * ${x})`);
    }
    // A second reading: the steps in px at a 16px root are the ones he picked.
    expect(Object.values(SCALE).map((x) => x * 16)).toEqual([11, 12, 13, 14, 16, 18, 20, 24]);
  });

  it("the --stat-* sizes alias the scale", () => {
    const index = readFileSync(join(ROOT, "src/index.css"), "utf8");
    const sizes = [...index.matchAll(/--stat-[a-z-]*size:\s*([^;]+);/g)].map((m) => m[1].trim());
    expect(sizes.length).toBeGreaterThan(0);
    for (const size of sizes) expect(size).toMatch(/^var\(--fs-[a-z]+\)$/);
  });

  it("every CSS font size is a step, or a named exception", () => {
    const offenders: string[] = [];
    const used = new Set<string>();
    for (const path of files(/\.css$/)) {
      const source = readFileSync(path, "utf8").replace(/\/\*[\s\S]*?\*\//g, (c) => c.replace(/[^\n]/g, " "));
      for (const m of source.matchAll(/font-size:\s*([^;}]+)/g)) {
        const value = m[1].replace(/\s*!important\s*$/, "").trim();
        if (onScale(value)) continue;
        const open = source.lastIndexOf("{", m.index);
        const start = Math.max(source.lastIndexOf("}", open), source.lastIndexOf("{", open - 1), source.lastIndexOf(";", open));
        const selector = source.slice(start + 1, open).replace(/\s+/g, " ").trim();
        const key = `${rel(path)} :: ${selector}`;
        if (CSS_ALLOWED[key]) used.add(key);
        else offenders.push(`${key} → ${value}`);
      }
    }
    expect(offenders, "use a --fs-* token (src/styles/shape.css)").toEqual([]);
    // An exception nobody needs any more is taken off the list.
    expect(Object.keys(CSS_ALLOWED).filter((k) => !used.has(k))).toEqual([]);
  });

  it('every inline fontSize is a "var(--fs-…)" string, or a named exception', () => {
    const found: Record<string, number> = {};
    for (const path of files(/\.tsx?$/)) {
      const n = (readFileSync(path, "utf8").match(/fontSize:\s*[\d.]/g) ?? []).length;
      if (n) found[rel(path)] = n;
    }
    const expected = Object.fromEntries(Object.entries(TSX_ALLOWED).map(([f, { count }]) => [f, count]));
    expect(found).toEqual(expected);
  });
});
