import { describe, it, expect, vi, beforeAll } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import i18n from "../../../i18n";
import EntryEditor, { type EntryDraft } from "./EntryEditor";
import { markedLabels } from "../../../test/requiredMarks";

// The figure wizard: how often, then what and how much, then the check, with
// Save only on the check. What matters is that the stored figure is exactly
// what the check said, that an existing figure opens on the cadence it is, and
// that what one cadence needed does not linger once another is picked.

// The app's calendar is a button that opens a picker; a plain box stands in for
// it here, so a month or a day can be typed.
vi.mock("../../../shared/components/DateField", () => ({
  DateField: ({ id, value, onChange, placeholder }: { id?: string; value: string; onChange: (v: string) => void; placeholder?: string }) => (
    <input id={id} aria-label={id ? undefined : placeholder} value={value} onChange={(e) => onChange(e.target.value)} />
  ),
}));

const fmt = (n: number) => `€${n.toFixed(2)}`;
const onSave = vi.fn();
const onDelete = vi.fn();
const NOW = new Date(2026, 10, 2, 10);

const setup = (mode: "line" | "oneoff", draft: EntryDraft, withDelete = false) => {
  onSave.mockReset();
  onDelete.mockReset();
  return render(<EntryEditor mode={mode} draft={draft} formatCurrency={fmt} onSave={onSave} onClose={() => {}} onDelete={withDelete ? onDelete : undefined} now={NOW} />);
};
const next = () => userEvent.click(screen.getByRole("button", { name: /Next/ }));
const review = () => screen.getByRole("dialog");
const cadence = (name: RegExp) => screen.getByRole("radio", { name });
const save = () => userEvent.click(screen.getByRole("button", { name: "Save" }));

beforeAll(async () => {
  window.matchMedia = ((query: string) => ({ matches: false, media: query, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, onchange: null, dispatchEvent: () => false })) as unknown as typeof window.matchMedia;
  await i18n.changeLanguage("en");
});

describe("an expense line", () => {
  it("asks how often first, and has no Save before the check", async () => {
    setup("line", { label: "Food", amount: "300" });

    expect(screen.getByRole("radiogroup", { name: "How often" })).toBeInTheDocument();
    // A new line starts on «every month», today's behaviour.
    expect(cadence(/^Every month/)).toHaveAttribute("aria-checked", "true");
    expect(screen.queryByLabelText(/^Amount/)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Save" })).not.toBeInTheDocument();
    await next();
    expect(screen.getByLabelText("Amount each month")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Save" })).not.toBeInTheDocument();
    await next();
    expect(screen.getByRole("button", { name: "Save" })).toBeInTheDocument();
  });

  it("will not leave the amount step without an amount", async () => {
    setup("line", { label: "Food", amount: "" });
    await next();
    await next();

    expect(screen.getByLabelText("Amount each month")).toBeInvalid();
    expect(screen.queryByRole("button", { name: "Save" })).not.toBeInTheDocument();
  });

  it("every month: says so, with the year's sum, and saves with no season at all", async () => {
    setup("line", { label: "Food", amount: "300" });
    await next();
    expect(screen.getByText("Every month: €300.00 — €3600.00 a year")).toBeInTheDocument();
    await next();

    expect(within(review()).getByText("Every month")).toBeInTheDocument();
    expect(within(review()).getByText("€300.00 a month")).toBeInTheDocument();
    await save();

    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSave.mock.calls[0][0]).toEqual({ label: "Food", amount: "300" });
  });

  it("labels the amount by the cadence", async () => {
    setup("line", { label: "Trip", amount: "" });
    await userEvent.click(cadence(/^Every year/));
    await userEvent.type(screen.getByLabelText("Which month?"), "2027-08");
    await next();
    expect(screen.getByLabelText("Amount per year")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /Back/ }));
    await userEvent.click(cadence(/^Once/));
    await next();
    expect(screen.getByLabelText("Amount")).toBeInTheDocument();
  });

  it("once: one month, stored as a season of that month alone", async () => {
    setup("line", { label: "Presents", amount: "400" });
    await userEvent.click(cadence(/^Once/));
    await next();
    // Without a month there is nothing to charge: said at the step that asks it.
    expect(screen.getByText("Pick a month.")).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText("Which month?"), "2026-12");
    await next();
    expect(screen.getByText(/^Once, Dec 2026: €400.00/)).toBeInTheDocument();
    await next();
    await save();
    expect(onSave.mock.calls[0][0]).toEqual({ label: "Presents", amount: "400", from: "2026-12", to: "2026-12" });
  });

  it("every year: one month a year, with its next times", async () => {
    setup("line", { label: "Holiday", amount: "900" });
    await userEvent.click(cadence(/^Every year/));
    await userEvent.type(screen.getByLabelText("Which month?"), "2026-08");
    await next();
    expect(screen.getByText("Once a year, Aug: €900.00")).toBeInTheDocument();
    // August 2026 is behind 2 November 2026: the next ones are the coming Augusts.
    expect(screen.getByText("Next: Aug 2027, Aug 2028, Aug 2029")).toBeInTheDocument();
    await next();
    await save();
    expect(onSave.mock.calls[0][0]).toEqual({ label: "Holiday", amount: "900", from: "2026-08", yearly: true });
  });

  it("asks «every year?» as two tiles, no switch, and saves the answer", async () => {
    setup("line", { id: "ski", label: "Skiing", amount: "200", from: "2026-12", to: "2027-03" }, true);
    expect(cadence(/^Only some months/)).toHaveAttribute("aria-checked", "true");
    expect(screen.queryByRole("switch")).toBeNull();
    const group = screen.getByRole("radiogroup", { name: "Does it come back every year?" });
    expect(within(group).getByRole("radio", { name: /^No/ })).toBeChecked();
    await userEvent.click(within(group).getByRole("radio", { name: /^Yes/ }));
    expect(within(group).getByRole("radio", { name: /^Yes/ })).toBeChecked();
    await next();
    await next();
    await save();
    expect(onSave.mock.calls[0][0]).toMatchObject({ id: "ski", amount: "200", from: "2026-12", to: "2027-03", yearly: true });
  });

  it("starts a one-off's name empty and asks for one: no fallback name is filled in", async () => {
    setup("oneoff", { label: "", amount: "50", date: "2026-12-31" });
    await userEvent.click(cadence(/^Once/));
    await next();
    for (const input of document.querySelectorAll<HTMLInputElement>('input[type="text"], input:not([type])')) if (input.closest(".modal")) expect(input.value === "" || input.value === "50").toBe(true);
    const name = document.querySelector<HTMLInputElement>("#entry-name")!;
    // Not red on arrival; red once Next is pressed with it empty, and the step holds.
    expect(name).not.toHaveClass("is-invalid");
    await next();
    expect(name).toHaveClass("is-invalid");
    expect(screen.getByText(i18n.t("planner.wizard_nameNeeded"))).toBeInTheDocument();
    expect(document.querySelector("[aria-current=step]")?.textContent).toMatch(/2/);
    await userEvent.type(name, "  14ος   μισθός ");
    await next();
    await save();
    expect(onSave.mock.calls[0][0]).toMatchObject({ label: "14ος μισθός", amount: "50" });
  });

  it("keeps «every 6 months» as 6 months, and never snaps a pick back", async () => {
    setup("oneoff", { label: "Coupon", amount: "50", date: "2026-12-31" });
    await userEvent.click(cadence(/^Every few months/));
    for (const months of ["6", "11", "2"]) {
      await userEvent.selectOptions(screen.getByLabelText("Every"), months);
      expect(screen.getByLabelText("Every")).toHaveValue(months);
      expect(screen.getByLabelText("Unit")).toHaveValue("monthly");
    }
    // 2 months to years: the nearest the list holds, 2 years — not 2 snapping to anything else.
    await userEvent.selectOptions(screen.getByLabelText("Unit"), "yearly");
    expect(screen.getByLabelText("Every")).toHaveValue("2");
    // 2 years back to months: 24 months is past the months list, so its largest.
    await userEvent.selectOptions(screen.getByLabelText("Unit"), "monthly");
    expect(screen.getByLabelText("Every")).toHaveValue("11");
    expect(cadence(/^Every few months/)).toHaveAttribute("aria-checked", "true");
  });

  it("asks «every few months» as a number and a unit from lists on one row, stored in months", async () => {
    setup("oneoff", { label: "Coupon", amount: "50", date: "2026-12-31" });
    await userEvent.click(cadence(/^Every few months/));
    const count = screen.getByLabelText("Every") as HTMLSelectElement;
    const unit = screen.getByLabelText("Unit") as HTMLSelectElement;
    expect(count.parentElement).toBe(unit.parentElement);
    // From 2: one month and one year are cadences of their own.
    expect([...count.options].map((o) => o.value)).toEqual(["2", "3", "4", "5", "6", "7", "8", "9", "10", "11"]);
    await userEvent.selectOptions(count, "6");
    // 6 months turned to years is the nearest whole years the list holds — not 6 years.
    await userEvent.selectOptions(unit, "yearly");
    // A repeat reaches as far as the planner looks ahead (ten years), so the years list holds 2–10.
    expect([...(screen.getByLabelText("Every") as HTMLSelectElement).options].map((o) => o.value)).toEqual(["2", "3", "4", "5", "6", "7", "8", "9", "10"]);
    expect(screen.getByLabelText("Every")).toHaveValue("2");
    await userEvent.selectOptions(screen.getByLabelText("Every"), "2");
    expect(screen.queryByRole("option", { name: "weeks" })).toBeNull();
    await next();
    await next();
    await save();
    expect(onSave.mock.calls[0][0]).toMatchObject({ label: "Coupon", every: 24 });
  });

  it("reads a season back as a sentence, and keeps it", async () => {
    setup("line", { id: "ski", label: "Skiing", amount: "200", from: "2026-12", to: "2027-04", yearly: true }, true);
    expect(cadence(/^Only some months/)).toHaveAttribute("aria-checked", "true");
    await next();
    expect(screen.getByText("5 months a year, Dec — Apr: €200.00 a month — €1000.00 a year")).toBeInTheDocument();
    await next();

    expect(within(review()).getByText(/Dec 2026 — Apr 2027 · every year/)).toBeInTheDocument();
    // Read back and nothing changed: Save waits, with the hint («No change, no Save»).
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
    expect(screen.getByText("Nothing has changed")).toBeInTheDocument();

    // 200 → 250: the season is kept with the new amount.
    await userEvent.click(screen.getByRole("button", { name: /Back/ }));
    const amount = screen.getByLabelText(/^Amount/);
    await userEvent.clear(amount);
    await userEvent.type(amount, "250");
    await next();
    await save();

    expect(onSave.mock.calls[0][0]).toMatchObject({ id: "ski", amount: "250", from: "2026-12", to: "2027-04", yearly: true });
  });

  it("No change, no Save: an edit's Save waits for a real change, and changing it back waits again", async () => {
    setup("line", { id: "food", label: "Food", amount: "300" }, true);
    await next();
    await next();
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();

    // A trailing space and 300 written as 300.00: the same figure, still no change.
    await userEvent.click(screen.getByRole("button", { name: /Back/ }));
    const amount = screen.getByLabelText(/^Amount/);
    await userEvent.clear(amount);
    await userEvent.type(amount, "300.00");
    await userEvent.type(document.querySelector<HTMLInputElement>("#entry-name")!, " ");
    await next();
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();

    // A real change enables it…
    await userEvent.click(screen.getByRole("button", { name: /Back/ }));
    await userEvent.clear(screen.getByLabelText(/^Amount/));
    await userEvent.type(screen.getByLabelText(/^Amount/), "320");
    await next();
    expect(screen.getByRole("button", { name: "Save" })).toBeEnabled();
    expect(screen.queryByText("Nothing has changed")).toBeNull();

    // …and back to 300 disables it again.
    await userEvent.click(screen.getByRole("button", { name: /Back/ }));
    await userEvent.clear(screen.getByLabelText(/^Amount/));
    await userEvent.type(screen.getByLabelText(/^Amount/), "300");
    await next();
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(onSave).not.toHaveBeenCalled();
  });

  it("drops the whole season once it is switched to every month", async () => {
    setup("line", { id: "ski", label: "Skiing", amount: "200", from: "2026-12", to: "2027-04", yearly: true, until: "2030-04" }, true);
    await userEvent.click(cadence(/^Every month/));
    await next();
    await next();
    await save();

    const saved = onSave.mock.calls[0][0];
    expect(saved).toEqual({ id: "ski", label: "Skiing", amount: "200" });
    expect(saved).not.toHaveProperty("from");
    expect(saved).not.toHaveProperty("yearly");
    expect(saved).not.toHaveProperty("until");
  });

  it("refuses a season that ends before it starts, at the step that asked it", async () => {
    setup("line", { id: "s", label: "Skiing", amount: "200", from: "2026-12", to: "2026-04" });

    expect(screen.getByText("The last month is before the first.")).toBeInTheDocument();
    await next();
    expect(screen.getByRole("radiogroup", { name: "How often" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Save" })).not.toBeInTheDocument();
  });

  it("keeps the bin to the left, and only for a figure that exists", () => {
    setup("line", { id: "a", label: "Food", amount: "300" }, true);
    expect(screen.getByRole("button", { name: "Delete" })).toBeInTheDocument();
  });

  it("offers no «every few months» for a cost — that is a bill", () => {
    setup("line", { label: "Food", amount: "300" });
    expect(screen.queryByRole("radio", { name: /^Every few months/ })).not.toBeInTheDocument();
    expect(screen.getAllByRole("radio")).toHaveLength(4);
  });
});

describe("pay on a date", () => {
  const draft: EntryDraft = { label: "Bonus", amount: "1400", date: "2026-12-20" };

  it("is once unless another cadence is picked, and saves no repeat", async () => {
    setup("oneoff", draft);
    expect(cadence(/^Once/)).toHaveAttribute("aria-checked", "true");
    await next();
    await next();

    expect(within(review()).getAllByText("€1400.00").length).toBeGreaterThan(0);
    await save();

    const saved = onSave.mock.calls[0][0];
    expect(saved).toMatchObject({ label: "Bonus", amount: "1400", date: "2026-12-20" });
    expect(saved.every).toBeUndefined();
  });

  it("every few months: asks the gap, says the months of the year, and stores it", async () => {
    setup("oneoff", { label: "Coupon", amount: "120", date: "2026-03-15" });
    await userEvent.click(cadence(/^Every few months/));
    await userEvent.selectOptions(screen.getByLabelText("Every"), "4");
    await next();
    expect(screen.getByText("3 times a year: Mar, Jul, Nov — €120.00 each")).toBeInTheDocument();
    // From 2 November 2026: this November's, then March and July of 2027.
    expect(screen.getByText(/^Next: .*2026, .*2027, .*2027$/)).toBeInTheDocument();
    await next();

    expect(within(review()).getByText(/Every 4 months · First one/)).toBeInTheDocument();
    await save();
    expect(onSave.mock.calls[0][0]).toMatchObject({ every: 4, date: "2026-03-15" });
  });

  it("opens a stored repeat on its cadence: 12 months is «every year», 1 is «every month»", () => {
    const { unmount } = setup("oneoff", { id: "y", ...draft, every: 12 });
    expect(cadence(/^Every year/)).toHaveAttribute("aria-checked", "true");
    unmount();
    setup("oneoff", { id: "m", ...draft, every: 1 });
    expect(cadence(/^Every month/)).toHaveAttribute("aria-checked", "true");
  });

  it("turning the repeat back to once takes the cadence and its end with it", async () => {
    setup("oneoff", { id: "c", ...draft, every: 3, until: "2027-12-20" });
    expect(cadence(/^Every few months/)).toHaveAttribute("aria-checked", "true");
    await userEvent.click(cadence(/^Once/));
    await next();
    await next();
    await save();

    const saved = onSave.mock.calls[0][0];
    expect(saved.every).toBeUndefined();
    expect(saved.until).toBeUndefined();
  });
});

// ── Item 97c: a new figure from «+» asks money in or out first ───────────────
describe("a new figure from the page's «+»", () => {
  const fresh = () => {
    onSave.mockReset();
    return render(<EntryEditor draft={{ label: "", amount: "" }} formatCurrency={fmt} onSave={onSave} onClose={() => {}} now={NOW} />);
  };
  const steps = () => [...document.querySelectorAll("[aria-current], button")].filter((b) => b.querySelector("span")?.textContent?.match(/^\d$/)).map((b) => b.textContent);

  it("asks «Money in or money out?» as two tiles, nothing picked, no error until Next", async () => {
    fresh();
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByRole("radiogroup", { name: "Money in or money out?" })).toBeInTheDocument();
    const tiles = within(dialog).getAllByRole("radio");
    expect(tiles.map((r) => r.getAttribute("aria-checked"))).toEqual(["false", "false"]);
    expect(within(dialog).queryByText("Choose money in or money out.")).toBeNull();
    // Four steps now: the kind, then the three of that kind.
    expect(steps()).toEqual(["1Kind", "2When", "3What", "4Review"]);
    await next();
    expect(within(dialog).getByText("Choose money in or money out.")).toBeInTheDocument();
    expect(within(dialog).queryByRole("radiogroup", { name: "How often" })).toBeNull();
  });

  it("«Money out» goes on as a cost line, and is saved as one", async () => {
    fresh();
    await userEvent.click(screen.getByRole("radio", { name: /^Money out/ }));
    await next();
    expect(cadence(/^Every month/)).toHaveAttribute("aria-checked", "true");
    await next();
    await userEvent.type(screen.getByLabelText(/Name/), "Gym");
    await userEvent.type(screen.getByLabelText("Amount each month"), "40");
    await next();
    await save();
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ label: "Gym", amount: "40" }), "line");
  });

  it("«Money in» goes on as pay on a date, and Back returns to the question", async () => {
    fresh();
    await userEvent.click(screen.getByRole("radio", { name: /^Money in/ }));
    await next();
    expect(cadence(/^Once/)).toHaveAttribute("aria-checked", "true");
    await userEvent.click(screen.getByRole("button", { name: /Back/ }));
    expect(screen.getByRole("radio", { name: /^Money in/ })).toHaveAttribute("aria-checked", "true");
    await next();
    await userEvent.type(screen.getByLabelText(/day|date/i), "2026-12-20");
    await next();
    await userEvent.type(screen.getByLabelText(/Name/), "Bonus");
    await userEvent.type(screen.getByLabelText(/Amount/), "500");
    await next();
    await save();
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ label: "Bonus", amount: "500", date: "2026-12-20" }), "oneoff");
  });

  it("editing a figure skips the question: three steps, its kind known", () => {
    setup("line", { id: "l1", label: "Food", amount: "300" });
    expect(screen.queryByRole("radiogroup", { name: "Money in or money out?" })).toBeNull();
    expect(steps()).toEqual(["1When", "2What", "3Review"]);
  });
});

describe("«every year?» on a new cost of some months", () => {
  it("starts with neither tile chosen, asks for an answer on Next, and saves «No» as no repeat", async () => {
    setup("line", { label: "Ski", amount: "200" });
    await userEvent.click(cadence(/^Only some months/));
    const group = screen.getByRole("radiogroup", { name: "Does it come back every year?" });
    expect(within(group).getByRole("radio", { name: /^Yes/ })).not.toBeChecked();
    expect(within(group).getByRole("radio", { name: /^No/ })).not.toBeChecked();
    expect(screen.queryByText("Pick Yes or No")).toBeNull();
    await userEvent.type(screen.getAllByRole("textbox")[0], "2026-12");
    await next();
    expect(screen.getByText("Pick Yes or No")).toBeInTheDocument();
    expect(screen.queryByLabelText(/^Amount/)).toBeNull();
    await userEvent.click(within(group).getByRole("radio", { name: /^No/ }));
    await next();
    await next();
    await save();
    expect(onSave.mock.calls[0][0].yearly).toBeUndefined();
  });
});

describe("the figure wizard's required fields", () => {
  it("money in or out: one question, asked in the title", () => {
    render(<EntryEditor draft={{ label: "", amount: "" }} formatCurrency={fmt} onSave={onSave} onClose={() => {}} now={NOW} />);
    expect(markedLabels(review())).toEqual(["Money in or money out?"]);
    expect(screen.getByRole("radiogroup")).toHaveAttribute("aria-required", "true");
  });

  it("an expense line: what each cadence needs, then its name and amount", async () => {
    setup("line", { label: "Food", amount: "300" });
    // How often always has an answer; every month needs nothing more.
    expect(markedLabels(review())).toEqual([]);
    await userEvent.click(cadence(/^Once/));
    expect(markedLabels(review())).toEqual(["Which month?"]);
    await userEvent.click(cadence(/^Every year/));
    expect(markedLabels(review())).toEqual(["Which month?"]);
    // Some months: its «every year?» is asked; the ends are given as «from» and «to», one of them at least. «Until» is optional.
    await userEvent.click(cadence(/^Only some months/));
    expect(markedLabels(review())).toEqual(["Does it come back every year?"]);
    await userEvent.click(cadence(/^Every month/));
    await next();
    expect(markedLabels(review())).toEqual(["Name", "Amount each month"]);
    expect(screen.getByLabelText("Name")).toHaveAttribute("aria-required", "true");
    expect(screen.getByLabelText("Amount each month")).toHaveAttribute("aria-required", "true");
  });

  it("money coming in: its day, and how often when it repeats every few months", async () => {
    setup("oneoff", { label: "Bonus", amount: "500" });
    expect(markedLabels(review())).toEqual(["Date"]);
    await userEvent.click(cadence(/^Every few months/));
    expect(markedLabels(review())).toEqual(["Every", "First one"]);
  });
});

