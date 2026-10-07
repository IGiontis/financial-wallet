import { useEffect, useRef, useState } from "react";
import { Outlet, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";

import { useLocalStorage } from "../../shared/hooks/useLocalStorage";
import { useNarrowScreen } from "../../shared/hooks/useNarrowScreen";
import { Container } from "reactstrap";
import { Sidebar } from "./Sidebar";
import { Topbar } from "./Topbar";
import "./css/MainLayout.css";

/** Below Bootstrap's `lg` the sidebar is a drawer behind ☰; from it up, a fixed bar. */
const DRAWER_QUERY = "(max-width: 991.98px)";

export function MainLayout() {
  const { t } = useTranslation();
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isCollapsed, setIsCollapsed] = useLocalStorage("sidebar-collapsed", false);
  const isDrawer = useNarrowScreen(DRAWER_QUERY);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  // Each page opens at its top. The page scrolls inside `.page-content`, not
  // the window, so the browser's own reset on navigation never reaches it and
  // the next page used to open at the height the last one was left at.
  const pageRef = useRef<HTMLElement>(null);
  const { pathname } = useLocation();
  useEffect(() => {
    if (pageRef.current) pageRef.current.scrollTop = 0;
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
    // menu style itself is `data-nav-style` on <html>, set by ThemeProvider.
    <div className={`main-layout ${isCollapsed ? "sidebar-collapsed" : ""}`}>
      <Sidebar isOpen={drawerOpen} onClose={closeSidebar} isCollapsed={isCollapsed} onToggleCollapse={toggleCollapse} isDesktop={!isDrawer} />

      {/* Inert behind the open drawer: Tab cannot wander off into a page the
          backdrop is covering, and a screen reader does not read it either. */}
      <div className="main-content" inert={drawerOpen}>
        <Topbar toggleSidebar={toggleSidebar} menuButtonRef={menuButtonRef} isDrawerOpen={drawerOpen} />

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
            <div style={{ flex: 1 }}>
              <Outlet />
            </div>
            <p style={{ fontSize: 12, color: "var(--color-text-secondary)", textAlign: "center", margin: 0 }}>
              © {new Date().getFullYear()}{" "}
              <a
                href="https://igiontisportfolio.netlify.app/#home"
                target="_blank"
                rel="noopener noreferrer"
                style={{ color: "inherit", textDecoration: "underline", textUnderlineOffset: 2 }}
              >
                Ilias Giontis
              </a>{" "}
              · MyFiWallet. {t("common.allRightsReserved")}
            </p>
          </Container>
        </main>
      </div>
    </div>
  );
}
