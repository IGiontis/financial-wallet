import { describe, it, expect, afterEach } from "vitest";
import { act, render, screen } from "@testing-library/react";
import "../../i18n";
import { useOfflineGuard } from "./useOfflineGuard";

// The rule as the reader meets it: a control that stops working, and says why.
//
// The policy itself is tested next to it; what is checked here is the wiring —
// that losing the connection actually reaches the button, that it comes back,
// and that the two kinds of action are not treated the same.

function Panel() {
  const del = useOfflineGuard("delete");
  const entry = useOfflineGuard("entry");

  return (
    <div>
      <button type="button" disabled={del.locked}>
        Delete
      </button>
      <button type="button" disabled={entry.locked}>
        Add expense
      </button>
      {del.reason && <p>{del.reason}</p>}
    </div>
  );
}

const setConnection = (online: boolean) => {
  Object.defineProperty(navigator, "onLine", { value: online, configurable: true });
  act(() => {
    window.dispatchEvent(new Event(online ? "online" : "offline"));
  });
};

describe("useOfflineGuard", () => {
  afterEach(() => setConnection(true));

  it("leaves everything alone while there is a connection", () => {
    render(<Panel />);

    expect(screen.getByRole("button", { name: "Delete" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Add expense" })).toBeEnabled();
  });

  it("holds back the delete when the connection drops, and keeps the entry", () => {
    render(<Panel />);
    setConnection(false);

    expect(screen.getByRole("button", { name: "Delete" })).toBeDisabled();
    // The whole point of the mixed rule: an expense entered with no signal is
    // still worth having.
    expect(screen.getByRole("button", { name: "Add expense" })).toBeEnabled();
  });

  it("says why, rather than just going grey", () => {
    render(<Panel />);
    setConnection(false);

    expect(screen.getByText(/waits for a connection/i)).toBeInTheDocument();
  });

  it("gives the button back when the connection returns", () => {
    render(<Panel />);
    setConnection(false);
    setConnection(true);

    expect(screen.getByRole("button", { name: "Delete" })).toBeEnabled();
    expect(screen.queryByText(/waits for a connection/i)).not.toBeInTheDocument();
  });
});
