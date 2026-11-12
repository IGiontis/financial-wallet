import { useEffect, useRef, useState } from "react";
import { Outlet, useLocation } from "react-router-dom";

import { useLocalStorage } from "../../shared/hooks/useLocalStorage";
import { useNarrowScreen } from "../../shared/hooks/useNarrowScreen";
import { Container } from "reactstrap";
import { Sidebar } from "./Sidebar";
import { Topbar } from "./Topbar";
import "./css/MainLayout.css";
import { AppFooter } from "./AppFooter";
import { BillAlertPopup } from "../bills/BillAlertPopup";
import { AddFab } from "./AddFab";
import { PageAddProvider } from "../../shared/components/PageAddProvider";
import { TourGate } from "../tour/TourGate";
import { PAGE_ENTER_MS, pageEnterFrames, prefersReducedMotion } from "./pageEnter";
import { NavPendingBar } from "./NavPendingBar";
import { startPagePrefetch } from "../../lib/prefetchPages";

/** Below Bootstrap's `lg` the sidebar is a drawer behind ☰; from it up, a fixed bar. */
const DRAWER_QUERY = "(max-width: 991.98px)";

export function MainLayout() {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isCollapsed, setIsCollapsed] = useLocalStorage(
    "sidebar-collapsed",
    false,
  );
  const isDrawer = useNarrowScreen(DRAWER_QUERY);

  // Signed in (or the demo): every page's code, fetched while the browser is
  // idle, so the first tap on a page does not wait for its download. Code only
  // — no Firestore read (lib/prefetchPages.ts). Not in tests, which would load
  // every page module for nothing.
  useEffect(() => {
    if (import.meta.env.MODE !== "test") startPagePrefetch();
  }, []);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  // Each page opens at its top. The page scrolls inside `.page-content`, not
  // the window, so the browser's own reset on navigation never reaches it and
  // the next page used to open at the height the last one was left at.
  const pageRef = useRef<HTMLElement>(null);
  const { pathname } = useLocation();
  useEffect(() => {
    if (pageRef.current) pageRef.current.scrollTop = 0;
  }, [pathname]);

  // The page comes in from a little above, fading up, each time it changes —
  // played on the same element rather than remounting it, so nothing on the
  // page loses its state for the sake of the motion. Under reduced motion it
  // only fades (pageEnter.ts).
  const outletRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = outletRef.current;
    if (!el || typeof el.animate !== "function") return;
    el.animate(pageEnterFrames(prefersReducedMotion()), { duration: PAGE_ENTER_MS, easing: "cubic-bezier(0.2, 0.7, 0.3, 1)" });
  }, [pathname]);

  // Open only means something where the bar is a drawer. Left to the raw flag,
  // a drawer opened on a phone-width window and then widened past `lg` would
  // keep the page inert behind a bar that no longer covers it.
  const drawerOpen = isSidebarOpen && isDrawer;

  const toggleSidebar = () => setIsSidebarOpen((prev) => !prev);
  const toggleCollapse = () => setIsCollapsed((prev) => !prev);

  // Dismissed (✕, Esc, the backdrop) the focus goes back to ☰, where the reader
  // was; left through a link it stays with the page that link opened. Not
  // straight away: until the drawer has closed, ☰ is inside the inert page and
  // cannot take focus — so it is asked for here and given once it has.
  const returnFocus = useRef(false);
  const closeSidebar = (dismissed: boolean) => {
    returnFocus.current = dismissed && drawerOpen;
    setIsSidebarOpen(false);
  };

  useEffect(() => {
    if (drawerOpen || !returnFocus.current) return;
    returnFocus.current = false;
    menuButtonRef.current?.focus();
  }, [drawerOpen]);

  useEffect(() => {
    if (!drawerOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      returnFocus.current = true;
      setIsSidebarOpen(false);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [drawerOpen]);

  return (
    // Add "sidebar-collapsed" class to the root so CSS can respond to it. The
    // colourway itself is `data-nav-style` on <html>, set by ThemeProvider.
    <PageAddProvider>
      <div className={`main-layout ${isCollapsed ? "sidebar-collapsed" : ""}`}>
        {/* While a tapped page is on its way, a thin bar says the tap was heard. */}
        <NavPendingBar />
        <Sidebar
          isOpen={drawerOpen}
          onClose={closeSidebar}
          isCollapsed={isCollapsed}
          onToggleCollapse={toggleCollapse}
          isDesktop={!isDrawer}
        />

        {/* Inert behind the open drawer: Tab cannot wander off into a page the
          backdrop is covering, and a screen reader does not read it either. */}
        <div className="main-content" inert={drawerOpen}>
          <Topbar
            toggleSidebar={toggleSidebar}
            menuButtonRef={menuButtonRef}
            isDrawerOpen={drawerOpen}
          />

          <main className="page-content" ref={pageRef}>
            <Container
              fluid
              className="py-2"
              style={{
                backgroundColor: "var(--color-background-primary)",
                display: "flex",
                flexDirection: "column",
                minHeight: "100%",
              }}
            >
              <div
                className="page-outlet"
                ref={outletRef}
                style={{ flex: 1, position: "relative" }}
              >
                <Outlet />
              </div>
              <AppFooter />
            </Container>
          </main>
        </div>

        {/* The bills to pay, once on arrival — here so it is there whichever page the app opens on. */}
        <BillAlertPopup />
        {/* The «+» on every page: the page's own add, or a new transaction. */}
        <AddFab />
        {/* The welcome tour, once — and again when the settings ask. */}
        <TourGate />
      </div>
    </PageAddProvider>
  );
}
