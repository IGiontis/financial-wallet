import { describe, it, expect, vi, beforeAll } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import i18n from "../../../i18n";
import EntryEditor, { type EntryDraft } from "./EntryEditor";

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

  it("reads a season back as a sentence, and keeps it", async () => {
    setup("line", { id: "ski", label: "Skiing", amount: "200", from: "2026-12", to: "2027-04", yearly: true }, true);
    expect(cadence(/^Only some months/)).toHaveAttribute("aria-checked", "true");
    await next();
    expect(screen.getByText("5 months a year, Dec — Apr: €200.00 a month — €1000.00 a year")).toBeInTheDocument();
    await next();

    expect(within(review()).getByText(/Dec 2026 — Apr 2027 · every year/)).toBeInTheDocument();
    await save();

    expect(onSave.mock.calls[0][0]).toMatchObject({ id: "ski", amount: "200", from: "2026-12", to: "2027-04", yearly: true });
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
    await userEvent.selectOptions(screen.getByLabelText("How many months apart?"), "4");
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
