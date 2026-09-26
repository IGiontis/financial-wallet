import { describe, it, expect, vi, beforeAll, afterEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import i18n from "../../../i18n";
import { useFormik } from "formik";
import * as Yup from "yup";
import { PayeeInput } from "./PayeeInput";

// Picking a payee when the saved list has grown long.
//
// On a phone the keyboard used to come up over the list the moment the field
// was touched, so the only way through a long list was to type. What is pinned
// down here: the usual few are one tap away under the field, and on a phone
// the list opens with nothing covering it — recent first, then by letter.

const PAYEES = ["AB Vasilopoulos", "Aegean", "DEI", "Germanos", "Lidl", "Sklavenitis", "Wolt"];

let narrow = false;
const setScreen = (isNarrow: boolean) => {
  narrow = isNarrow;
  window.matchMedia = ((query: string) => ({ matches: narrow, media: query, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, onchange: null, dispatchEvent: () => false })) as unknown as typeof window.matchMedia;
};

function renderPicker(value = "") {
  const onChange = vi.fn();
  render(<PayeeInput value={value} payees={PAYEES} suggested={["Sklavenitis", "Lidl"]} recent={["Wolt", "DEI"]} onChange={onChange} placeholder="Payee" />);
  return onChange;
}

beforeAll(async () => {
  await i18n.changeLanguage("en");
});

afterEach(() => setScreen(false));

describe("suggestions under the field", () => {
  it("puts the usual payees one tap away", async () => {
    setScreen(false);
    const onChange = renderPicker();

    await userEvent.click(screen.getByRole("button", { name: "Sklavenitis" }));

    expect(onChange).toHaveBeenCalledWith("Sklavenitis");
  });

  it("marks the one already chosen", () => {
    setScreen(false);
    renderPicker("lidl");

    expect(screen.getByRole("button", { name: "Lidl" })).toHaveAttribute("aria-pressed", "true");
  });
});

describe("on a phone", () => {
  it("opens the list, not the keyboard, when the field is tapped", async () => {
    setScreen(true);
    renderPicker();

    const field = screen.getByRole("combobox");
    expect(field).toHaveAttribute("readonly");
    await userEvent.click(field);

    const sheet = screen.getByRole("dialog");
    // Nothing focused inside: the keyboard stays down until the search box is tapped.
    expect(within(sheet).getByRole("searchbox")).not.toHaveFocus();
  });

  it("shows recent payees first, then everything under letters", async () => {
    setScreen(true);
    renderPicker();
    await userEvent.click(screen.getByRole("combobox"));

    const sheet = screen.getByRole("dialog");
    expect(within(sheet).getByText("Recent")).toBeInTheDocument();
    // Once among the recent ones, once under W.
    expect(within(sheet).getAllByRole("button", { name: "Wolt" })).toHaveLength(2);
    for (const letter of ["A", "D", "G", "L", "S", "W"]) expect(within(sheet).getByText(letter)).toBeInTheDocument();
  });

  it("finds a payee by typing in the sheet and picks it", async () => {
    setScreen(true);
    const onChange = renderPicker();
    await userEvent.click(screen.getByRole("combobox"));

    const sheet = screen.getByRole("dialog");
    await userEvent.type(within(sheet).getByRole("searchbox"), "germ");
    expect(within(sheet).queryByText("Lidl")).not.toBeInTheDocument();
    await userEvent.click(within(sheet).getByRole("button", { name: "Germanos" }));

    expect(onChange).toHaveBeenLastCalledWith("Germanos");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("still takes a new name that is not saved", async () => {
    setScreen(true);
    const onChange = renderPicker();
    await userEvent.click(screen.getByRole("combobox"));

    await userEvent.type(within(screen.getByRole("dialog")).getByRole("searchbox"), "Kiosk{Enter}");

    expect(onChange).toHaveBeenLastCalledWith("Kiosk");
  });

  it("opens the same list from 'All…'", async () => {
    setScreen(true);
    renderPicker();

    await userEvent.click(screen.getByRole("button", { name: "All…" }));

    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });
});

describe("inside the transaction form", () => {
  // Wired exactly as the form wires it: required, marked touched on blur.
  function Form() {
    const formik = useFormik({ initialValues: { description: "" }, validationSchema: Yup.object({ description: Yup.string().required() }), onSubmit: () => {} });
    return (
      <PayeeInput
        value={formik.values.description}
        payees={PAYEES}
        suggested={["Sklavenitis", "Lidl"]}
        invalid={!!(formik.touched.description && formik.errors.description)}
        onChange={(v) => formik.setFieldValue("description", v)}
        onBlur={() => formik.setFieldTouched("description", true)}
      />
    );
  }

  it("does not flag the field as missing when a chip fills it in", async () => {
    setScreen(false);
    render(<Form />);

    await userEvent.click(screen.getByRole("button", { name: "Lidl" }));

    const field = screen.getByRole("combobox");
    expect(field).toHaveValue("Lidl");
    // Give the validation that used to misfire every chance to land.
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(field).not.toHaveClass("is-invalid");
  });

  it("does not flag it when picked from the phone's list either", async () => {
    setScreen(true);
    render(<Form />);

    await userEvent.click(screen.getByRole("combobox"));
    await userEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Germanos" }));

    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(screen.getByRole("combobox")).toHaveValue("Germanos");
    expect(screen.getByRole("combobox")).not.toHaveClass("is-invalid");
  });
});
