import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Suspense, lazy } from "react";
import { render, screen, waitFor } from "@testing-library/react";
import { createMemoryRouter, Outlet, RouterProvider } from "react-router-dom";
import "../../i18n";
import { NavPendingBar } from "./NavPendingBar";
import { useShownPathname } from "./usePendingNav";

// A page whose code is still on its way — the slow first visit the bar is for.
// The router runs the navigation in a transition, so React keeps the old page
// on screen until this resolves.
function slowPage() {
  let arrive!: () => void;
  const ready = new Promise<{ default: () => React.JSX.Element }>((resolve) => {
    arrive = () => resolve({ default: () => <p>slow page</p> });
  });
  return { Page: lazy(() => ready), arrive };
}

function Shell() {
  return (
    <>
      <NavPendingBar />
      <span data-testid="menu-current">{useShownPathname()}</span>
      <Outlet />
    </>
  );
}

function setup() {
  const slow = slowPage();
  const router = createMemoryRouter([
    {
      path: "/",
      element: <Shell />,
      children: [
        { index: true, element: <p>old page</p> },
        {
          path: "slow",
          element: (
            <Suspense fallback={<p>loader</p>}>
              <slow.Page />
            </Suspense>
          ),
        },
      ],
    },
  ]);
  render(<RouterProvider router={router} />);
  return { router, arrive: slow.arrive };
}

// Outside `act`: act flushes a transition to the end and commits the fallback,
// which is not what a browser does — there the old page stays. With React's own
// scheduler the test sees what the reader sees.
const actFlag = globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean };
let wasAct: boolean | undefined;
beforeAll(() => {
  wasAct = actFlag.IS_REACT_ACT_ENVIRONMENT;
  actFlag.IS_REACT_ACT_ENVIRONMENT = false;
});
afterAll(() => {
  actFlag.IS_REACT_ACT_ENVIRONMENT = wasAct;
});

describe("NavPendingBar", () => {
  it("is not there when no page is on its way", () => {
    setup();
    expect(screen.getByText("old page")).toBeTruthy();
    expect(screen.queryByRole("progressbar")).toBeNull();
  });

  it("shows while a tapped page is loading, with the menu already on it, and goes once it arrives", async () => {
    const { router, arrive } = setup();

    void router.navigate("/slow");
    // The tap is answered at once, while the old page is still on screen (the transition).
    expect(await screen.findByRole("progressbar", { name: "Opening the page…" })).toBeTruthy();
    expect(screen.getByText("old page")).toBeTruthy();
    expect(screen.queryByText("loader")).toBeNull();
    expect(screen.getByTestId("menu-current").textContent).toBe("/slow");

    arrive();
    expect(await screen.findByText("slow page")).toBeTruthy();
    await waitFor(() => expect(screen.queryByRole("progressbar")).toBeNull());
    expect(screen.queryByText("old page")).toBeNull();
    expect(screen.queryByRole("progressbar")).toBeNull();
    expect(screen.getByTestId("menu-current").textContent).toBe("/slow");
  });
});
