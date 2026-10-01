import { useEffect, useState } from "react";
import { Outlet, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Container } from "reactstrap";

import { useLocalStorage } from "../../shared/hooks/useLocalStorage";
import { useAuth } from "../../shared/hooks/useAuth";
import { useBillsNeedingAttention } from "../bills/useBills";
import { SideNav } from "./SideNav";
import { BottomNav } from "./BottomNav";
import { MenuSheet } from "./MenuSheet";
import { QuickAdd } from "./QuickAdd";
import type { NavBadges } from "./navConfig";
import "./css/MainLayout.css";

const MAIN_ID = "main-content";

/** Somewhere a typed "n" is a letter, not a shortcut. */
const isTyping = (target: EventTarget | null) => target instanceof HTMLElement && (target.isContentEditable || !!target.closest("input, textarea, select"));

/**
 * The shell every signed-in page sits in.
 *
 * Wide screens get the sidebar with every page in view; phones get the bottom
 * bar — Overview, Transactions, «+», Bills, Menu — and a menu sheet with the
 * rest. Both draw from `navConfig`, and both open the same add form.
 */
export function MainLayout() {
  const { t } = useTranslation();
  const { pathname } = useLocation();
  const { currentUser } = useAuth();
  const [isCollapsed, setIsCollapsed] = useLocalStorage("sidebar-collapsed", false);
  const [adding, setAdding] = useState(false);

  // Open for the page it was opened on. Moving to another page — a row in the
  // menu, or the phone's own back gesture — closes it without anything having
  // to remember to.
  const [menuOpenAt, setMenuOpenAt] = useState<string | null>(null);
  const menuOpen = menuOpenAt === pathname;

  const badges: NavBadges = { bills: useBillsNeedingAttention() };
  const canAdd = !!currentUser;

  // N for a new transaction, from anywhere a keyboard is. Matched by key
  // position (`code`), so it is the same key on a Greek layout, where it types
  // "ν". Never while typing, never with a modifier (Ctrl+N is the browser's),
  // and never over a dialog that is already open.
  useEffect(() => {
    if (!canAdd) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.code !== "KeyN" || event.ctrlKey || event.metaKey || event.altKey || event.shiftKey || event.repeat || event.defaultPrevented) return;
      if (isTyping(event.target) || document.querySelector(".modal.show, .offcanvas.show")) return;
      event.preventDefault();
      setAdding(true);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [canAdd]);

  const skipToContent = (event: React.MouseEvent) => {
    // Focus, not a #hash: the router owns the URL, and a hash would stay in it.
    event.preventDefault();
    document.getElementById(MAIN_ID)?.focus();
  };

  return (
    <div className={`main-layout ${isCollapsed ? "sidebar-collapsed" : ""}`}>
      <a href={`#${MAIN_ID}`} className="skip-link visually-hidden-focusable" onClick={skipToContent}>
        {t("nav.skipToContent")}
      </a>

      <SideNav badges={badges} collapsed={isCollapsed} onToggleCollapse={() => setIsCollapsed((prev) => !prev)} onAdd={() => setAdding(true)} />

      <div className="main-content">
        <main id={MAIN_ID} tabIndex={-1} className="page-content">
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

        <BottomNav badges={badges} canAdd={canAdd} onAdd={() => setAdding(true)} menuOpen={menuOpen} onOpenMenu={() => setMenuOpenAt(pathname)} />
      </div>

      <MenuSheet isOpen={menuOpen} onClose={() => setMenuOpenAt(null)} badges={badges} />
      {canAdd && <QuickAdd isOpen={adding} onClose={() => setAdding(false)} />}
    </div>
  );
}
