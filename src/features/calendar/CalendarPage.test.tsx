import { describe, it, expect, vi, beforeAll } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import i18n from "../../i18n";
import CalendarPage from "./CalendarPage";
import type { CalendarItem } from "./calendarDays";
import { formatDayMonthWeekday } from "../../shared/utils/dates";

// The «Ημερολόγιο» page drawn through the shared month (MonthCalendar): a day
// tapped on a phone stays open across a trip to the timeline and back.

const NOW = new Date(2026, 10, 20, 12);
const rent: CalendarItem = { id: "rent", date: new Date(2026, 10, 3), kind: "bill", direction: "out", label: "Rent", amount: 500, state: "todo" };

vi.mock("./useCalendarSources", () => ({ useCalendarSources: () => ({ sources: { now: NOW }, first: new Date(2026, 4, 1), last: new Date(2027, 4, 1), isLoading: false }) }));
vi.mock("./calendarDays", async (importOriginal) => ({ ...(await importOriginal<typeof import("./calendarDays")>()), calendarItems: () => [rent] }));
vi.mock("./components/MoneyTimeline", () => ({ MoneyTimeline: () => <p>the timeline</p> }));
vi.mock("../../shared/hooks/useCurrencyConverter", () => ({ useCurrencyConverter: () => ({ format: (n: number) => `€${n.toFixed(2)}` }) }));

beforeAll(async () => {
  // A phone: the day's list sits under the month.
  window.matchMedia = ((query: string) => ({ matches: true, media: query, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, onchange: null, dispatchEvent: () => false })) as unknown as typeof window.matchMedia;
  window.localStorage.removeItem("calendar-view");
  await i18n.changeLanguage("en");
});

describe("CalendarPage", () => {
  it("keeps the tapped day across the switch to the timeline and back", async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <CalendarPage />
      </MemoryRouter>,
    );
    const title = formatDayMonthWeekday(rent.date, "en");
    await user.click(screen.getByRole("button", { name: new RegExp(`^${title}`) }));
    expect(screen.getByText("Rent")).toBeInTheDocument();

    await user.click(screen.getByText(i18n.t("calendar.viewTimeline")));
    expect(screen.getByText("the timeline")).toBeInTheDocument();
    await user.click(screen.getByText(i18n.t("calendar.viewMonth")));

    expect(screen.getByText(title, { selector: "div" })).toBeInTheDocument();
    expect(screen.getByText("Rent")).toBeInTheDocument();
    window.localStorage.removeItem("calendar-view");
  });
});
