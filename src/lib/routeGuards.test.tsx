import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { SessionGate } from "./routeGuards";
import { rememberSession } from "./sessionHint";

// A cold start: Firebase has not yet said who is signed in. A device that was
// signed in sees the app's frame take shape; one that was not sees the sign-in
// form's outline — never the app's sidebar for a moment and then the form.

const auth = vi.hoisted(() => ({ value: { currentUser: null as unknown, loading: true } }));
vi.mock("../shared/hooks/useAuth", () => ({ useAuth: () => auth.value }));

const renderAt = (path = "/") =>
  render(
    <RouterProvider
      router={createMemoryRouter(
        [
          { path: "/login", element: <p>login form</p> },
          { element: <SessionGate />, children: [{ path: "/", element: <p>app frame</p> }] },
        ],
        { initialEntries: [path] },
      )}
    />,
  );

beforeEach(() => {
  localStorage.clear();
  auth.value = { currentUser: null, loading: true };
});

describe("the session gate", () => {
  it("while the session is found, shows a device never signed in the form's outline, not the app", () => {
    renderAt();
    expect(screen.queryByText("app frame")).toBeNull();
    expect(screen.queryByText("login form")).toBeNull();
  });

  it("while the session is found, lets a device that was signed in draw the app's frame", () => {
    rememberSession(true);
    renderAt();
    expect(screen.getByText("app frame")).toBeInTheDocument();
  });

  it("sends the signed out to the sign-in form", () => {
    auth.value = { currentUser: null, loading: false };
    renderAt();
    expect(screen.getByText("login form")).toBeInTheDocument();
  });

  it("lets the signed in through", () => {
    auth.value = { currentUser: { uid: "u" }, loading: false };
    renderAt();
    expect(screen.getByText("app frame")).toBeInTheDocument();
  });

  it("forgets the session on sign-out", () => {
    rememberSession(true);
    rememberSession(false);
    renderAt();
    expect(screen.queryByText("app frame")).toBeNull();
  });
});
