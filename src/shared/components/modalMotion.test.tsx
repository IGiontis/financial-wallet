import { describe, it, expect, beforeAll, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { render, screen, waitFor } from "@testing-library/react";
import { Modal, ModalBody, ModalFooter } from "reactstrap";
import { installModalMotion, MODAL_MS } from "./modalMotion";

beforeAll(() => installModalMotion());

const originalMatchMedia = window.matchMedia;
afterEach(() => {
  window.matchMedia = originalMatchMedia;
});

describe("the dialogs' motion", () => {
  it("is as long in the code as in the stylesheet", () => {
    const shape = readFileSync(join(__dirname, "..", "..", "styles", "shape.css"), "utf8");
    expect(shape).toMatch(new RegExp(`--motion-modal:\\s*${MODAL_MS}ms`));
  });

  it("starts the fade as the dialog arrives — header, body and footer inside the one box that fades", async () => {
    render(
      <Modal isOpen>
        <ModalBody>Body</ModalBody>
        <ModalFooter>
          <button type="button">Save</button>
        </ModalFooter>
      </Modal>,
    );
    const modal = document.querySelector(".modal")!;
    // Reactstrap's own timer kept `.show` off for 300ms; now it is on at once.
    await waitFor(() => expect(modal).toHaveClass("show"), { timeout: 100 });
    expect(modal).toContainElement(screen.getByRole("button", { name: "Save" }));
    expect(document.querySelector(".modal-backdrop")).toHaveClass("fade");
  });

  it("stays in the page until its fade-out is over", async () => {
    const { rerender } = render(
      <Modal isOpen>
        <ModalBody>Going</ModalBody>
      </Modal>,
    );
    await waitFor(() => expect(document.querySelector(".modal")).toHaveClass("show"));
    rerender(
      <Modal isOpen={false}>
        <ModalBody>Going</ModalBody>
      </Modal>,
    );
    expect(document.querySelector(".modal")).not.toHaveClass("show");
    expect(screen.getByText("Going")).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByText("Going")).not.toBeInTheDocument(), { timeout: MODAL_MS + 300 });
  });
});

describe("the dialogs' motion, with less motion asked for", () => {
  // The owner's laptop asks for less motion, and he wants to see dialogs
  // arrive: they still fade, in place (the rise is dropped in shape.css), so a
  // closing one still waits out its fade.
  it("still waits out the fade before a closing dialog goes", async () => {
    window.matchMedia = ((query: string) => ({ matches: query.includes("reduce"), media: query, addEventListener() {}, removeEventListener() {} })) as unknown as typeof window.matchMedia;
    const { rerender } = render(
      <Modal isOpen>
        <ModalBody>Fading</ModalBody>
      </Modal>,
    );
    await waitFor(() => expect(document.querySelector(".modal")).toHaveClass("show"));
    rerender(
      <Modal isOpen={false}>
        <ModalBody>Fading</ModalBody>
      </Modal>,
    );
    expect(document.querySelector(".modal")).not.toHaveClass("show");
    expect(screen.getByText("Fading")).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByText("Fading")).not.toBeInTheDocument(), { timeout: MODAL_MS + 300 });
  });
});
