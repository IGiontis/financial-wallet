import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { MAX_SEGMENTS, SegmentedBar, segmentLayout, shownPct, type BarSegment } from "./SegmentedBar";

// A bar of many things, a piece per thing. Each check is made twice: the
// shares against the amounts, and the paid share against the amounts summed
// apart from the layout.

const bills: BarSegment[] = [
  { id: "rent", label: "Rent", amount: 400, done: true },
  { id: "power", label: "Power", amount: 63.37, done: false },
  { id: "phone", label: "Phone", amount: 25, done: true },
  { id: "gym", label: "Gym", amount: 33.33, done: false },
];
const describeIt = (s: BarSegment) => `${s.label} · ${s.amount.toFixed(2)} € · ${s.done ? "paid" : "to pay"}`;

describe("segmentLayout", () => {
  it("gives each piece its amount's share, and the shares add up to 100%", () => {
    const layout = segmentLayout(bills, 600);
    expect(layout.mode).toBe("segments");
    expect(layout.parts.reduce((sum, p) => sum + p.pct, 0)).toBeCloseTo(100, 9);
    // Second way: each share is its amount over the sum of the four, worked out here.
    const total = 400 + 63.37 + 25 + 33.33;
    expect(layout.total).toBeCloseTo(total, 9);
    layout.parts.forEach((p) => expect(p.pct).toBeCloseTo((bills.find((b) => b.id === p.id)!.amount / total) * 100, 9));
  });

  it("says the paid share as paid ÷ total", () => {
    const layout = segmentLayout(bills);
    const paid = 400 + 25;
    const total = 400 + 63.37 + 25 + 33.33;
    expect(layout.donePct).toBeCloseTo((paid / total) * 100, 9);
    // Second way: the done pieces' own shares, added.
    expect(layout.parts.filter((p) => p.done).reduce((sum, p) => sum + p.pct, 0)).toBeCloseTo(layout.donePct, 9);
    expect(layout.doneCount).toBe(2);
  });

  it("leaves out what weighs nothing", () => {
    const layout = segmentLayout([...bills, { id: "free", label: "Free", amount: 0, done: false }]);
    expect(layout.parts.map((p) => p.id).sort()).toEqual(["gym", "phone", "power", "rent"]);
  });

  it("falls back to one bar past 24 pieces, or when a piece would be under 3px", () => {
    const many = Array.from({ length: MAX_SEGMENTS + 1 }, (_, i) => ({ id: `b${i}`, label: `B${i}`, amount: 10, done: i < 5 }));
    expect(segmentLayout(many.slice(0, MAX_SEGMENTS), 1000).mode).toBe("segments");
    expect(segmentLayout(many, 1000).mode).toBe("single");
    // 1 € beside 1.000 € on a 300px bar: well under 3px.
    const thin = [
      { id: "big", label: "Big", amount: 1000, done: true },
      { id: "tiny", label: "Tiny", amount: 1, done: false },
    ];
    expect(segmentLayout(thin, 300).mode).toBe("single");
    expect(segmentLayout(thin, 4000).mode).toBe("segments"); // ≈4px each side of the line
  });
});

describe("SegmentedBar", () => {
  it("draws a piece per bill, each naming itself, the paid ones filled", () => {
    render(<SegmentedBar segments={bills} label="2 of 4 paid" describe={describeIt} />);
    const bar = screen.getByRole("list", { name: "2 of 4 paid" });
    const pieces = within(bar).getAllByRole("listitem");
    expect(pieces).toHaveLength(4);
    expect(pieces[0]).toHaveAccessibleName("Rent · 400.00 € · paid");
    expect(pieces[0]).toHaveAttribute("title", "Rent · 400.00 € · paid");
    expect(pieces[2].className).toMatch(/_open_/);
    expect(pieces[0].className).toMatch(/_done_/);
    const grow = pieces.map((p) => Number(p.style.flexGrow));
    expect(grow.reduce((a, b) => a + b, 0)).toBeCloseTo(100, 6);
  });

  it("is one progress bar, filled to the paid share, when there are too many", () => {
    const many = Array.from({ length: 30 }, (_, i) => ({ id: `b${i}`, label: `B${i}`, amount: 10, done: i < 6 }));
    render(<SegmentedBar segments={many} label="6 of 30 paid" describe={describeIt} />);
    const bar = screen.getByRole("progressbar", { name: "6 of 30 paid" });
    expect(bar).toHaveAttribute("aria-valuenow", "20");
    expect((bar.firstElementChild as HTMLElement).style.width).toBe("20%");
    expect(screen.queryByRole("listitem")).toBeNull();
  });
});

describe("the order and the share printed", () => {
  it("puts the paid ones first, then the open ones, the largest first in each", () => {
    expect(segmentLayout(bills).parts.map((p) => p.id)).toEqual(["rent", "phone", "power", "gym"]);
    render(<SegmentedBar segments={bills} label="2 of 4 paid" describe={describeIt} />);
    const names = within(screen.getByRole("list")).getAllByRole("listitem").map((p) => p.getAttribute("title")!.split(" · ")[0]);
    expect(names).toEqual(["Rent", "Phone", "Power", "Gym"]);
  });

  it("prints the share paid beside the bar — paid ÷ total, rounded", () => {
    render(<SegmentedBar segments={bills} label="2 of 4 paid" describe={describeIt} />);
    // 425 of 521.70 is 81.46…%: «81%».
    expect(Math.round((425 / 521.7) * 100)).toBe(81);
    expect(screen.getByTestId("segmented-pct")).toHaveTextContent("81%");
  });

  it("never says 100% with something open, nor 0% with something paid", () => {
    expect(shownPct(99.7)).toBe(99);
    expect(shownPct(0.2)).toBe(1);
    expect(shownPct(0)).toBe(0);
    expect(shownPct(100)).toBe(100);
  });
});

describe("a piece that gets paid", () => {
  const realRect = HTMLElement.prototype.getBoundingClientRect;
  afterEach(() => {
    HTMLElement.prototype.getBoundingClientRect = realRect;
    delete (HTMLElement.prototype as { animate?: unknown }).animate;
  });
  // Each piece 10px wide, placed by where it sits among its siblings.
  const place = () => {
    HTMLElement.prototype.getBoundingClientRect = function (this: HTMLElement) {
      const index = this.parentElement ? [...this.parentElement.children].indexOf(this) : 0;
      return { left: index * 10, width: 10, top: 0, height: 10, right: index * 10 + 10, bottom: 10, x: index * 10, y: 0, toJSON: () => ({}) } as DOMRect;
    };
  };
  const paidPower = bills.map((b) => (b.id === "power" ? { ...b, done: true } : b));

  it("moves over to the paid ones, sliding from where it was", () => {
    place();
    const animate = vi.fn();
    (HTMLElement.prototype as { animate?: unknown }).animate = animate;
    const { rerender } = render(<SegmentedBar segments={bills} label="bar" describe={describeIt} />);
    rerender(<SegmentedBar segments={paidPower} label="bar" describe={describeIt} />);
    const names = within(screen.getByRole("list")).getAllByRole("listitem").map((p) => p.getAttribute("title")!.split(" · ")[0]);
    expect(names).toEqual(["Rent", "Power", "Phone", "Gym"]);
    // Power went from third to second: drawn 10px to the right of where it lands, then let go.
    const slides = animate.mock.calls.map(([frames]) => frames[0].transform);
    expect(slides).toContain("translateX(10px)");
    expect(slides).toContain("translateX(-10px)");
  });

  it("fades instead of sliding with reduced motion", () => {
    place();
    const animate = vi.fn();
    (HTMLElement.prototype as { animate?: unknown }).animate = animate;
    const realMatch = window.matchMedia;
    window.matchMedia = ((query: string) => ({ matches: query.includes("reduce"), media: query, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, onchange: null, dispatchEvent: () => false })) as unknown as typeof window.matchMedia;
    const { rerender } = render(<SegmentedBar segments={bills} label="bar" describe={describeIt} />);
    rerender(<SegmentedBar segments={paidPower} label="bar" describe={describeIt} />);
    window.matchMedia = realMatch;
    expect(animate).toHaveBeenCalled();
    for (const [frames] of animate.mock.calls) expect(frames[0]).toEqual({ opacity: 0.25 });
  });
});
