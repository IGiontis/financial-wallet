import { describe, it, expect, vi, beforeAll } from "vitest";
import { fireEvent, render } from "@testing-library/react";
import { useState } from "react";
import { BalanceLine } from "./BalanceLine";
import type { ProjectionPoint } from "./plannerUtils";

// On a phone the day under the finger stays where the finger left it. With a
// mouse it followed the pointer everywhere, so moving off to read the figures
// dragged the crosshair along: a click now pins it, as a finger does.

beforeAll(() => {
  // jsdom has no PointerEvent; the chart needs one that says what pointed.
  class TestPointerEvent extends MouseEvent {
    pointerType: string;
    pointerId: number;
    constructor(type: string, init: PointerEventInit = {}) {
      super(type, init);
      this.pointerType = init.pointerType ?? "mouse";
      this.pointerId = init.pointerId ?? 1;
    }
  }
  window.PointerEvent ??= TestPointerEvent as unknown as typeof PointerEvent;
});

const day = (d: number, balance: number): ProjectionPoint => ({ date: new Date(2026, 9, d), balance, events: [], accruedIn: 0, accruedOut: 0 }) as ProjectionPoint;
const POINTS = [day(1, 1000), day(15, 600), day(31, 200)];

function Chart({ onSelect }: { onSelect: (i: number) => void }) {
  const [selected, setSelected] = useState(-1);
  return (
    <BalanceLine
      points={POINTS}
      start={new Date(2026, 9, 1)}
      end={new Date(2026, 9, 31)}
      pointStep="day"
      breaksOnIndex={-1}
      selectedIndex={selected}
      onSelect={(i) => {
        setSelected(i);
        onSelect(i);
      }}
      ariaLabel="Balance"
      locale="en"
    />
  );
}

// Drawn at its fallback width in a test: the first day at the left, the last at the right.
const LEFT = 12;
const RIGHT = 270;

describe("the balance line with a mouse", () => {
  it("previews by hovering, until a click pins the day", () => {
    const onSelect = vi.fn();
    const { getByRole } = render(<Chart onSelect={onSelect} />);
    const svg = getByRole("img", { name: "Balance" });

    fireEvent.pointerMove(svg, { pointerType: "mouse", clientX: RIGHT });
    expect(onSelect).toHaveBeenLastCalledWith(2);

    // Clicked on the first day: it stays there however the pointer moves after.
    fireEvent.pointerDown(svg, { pointerType: "mouse", clientX: LEFT });
    fireEvent.pointerUp(svg, { pointerType: "mouse", clientX: LEFT });
    expect(onSelect).toHaveBeenLastCalledWith(0);
    onSelect.mockClear();
    fireEvent.pointerMove(svg, { pointerType: "mouse", clientX: RIGHT });
    expect(onSelect).not.toHaveBeenCalled();

    // Another click moves it; Escape lets it follow the pointer again.
    fireEvent.pointerDown(svg, { pointerType: "mouse", clientX: RIGHT });
    fireEvent.pointerUp(svg, { pointerType: "mouse", clientX: RIGHT });
    expect(onSelect).toHaveBeenLastCalledWith(2);
    fireEvent.keyDown(svg, { key: "Escape" });
    fireEvent.pointerMove(svg, { pointerType: "mouse", clientX: LEFT });
    expect(onSelect).toHaveBeenLastCalledWith(0);
  });

  it("keeps a finger's way: only a finger that is down moves it", () => {
    const onSelect = vi.fn();
    const { getByRole } = render(<Chart onSelect={onSelect} />);
    const svg = getByRole("img", { name: "Balance" });

    fireEvent.pointerMove(svg, { pointerType: "touch", clientX: RIGHT });
    expect(onSelect).not.toHaveBeenCalled();
    fireEvent.pointerDown(svg, { pointerType: "touch", clientX: LEFT });
    fireEvent.pointerMove(svg, { pointerType: "touch", clientX: RIGHT });
    expect(onSelect).toHaveBeenLastCalledWith(2);
  });
});
