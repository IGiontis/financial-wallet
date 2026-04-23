import { useState } from "react";
import { Outlet } from "react-router-dom";

import { useLocalStorage } from "../../shared/hooks/useLocalStorage";
import { Container } from "reactstrap";
import { Sidebar } from "./Sidebar";
import { Topbar } from "./Topbar";
import "./css/MainLayout.css";

export function MainLayout() {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isCollapsed, setIsCollapsed] = useLocalStorage("sidebar-collapsed", false);

  const toggleSidebar = () => setIsSidebarOpen((prev) => !prev);
  const toggleCollapse = () => setIsCollapsed((prev) => !prev);

  return (
    // Add "sidebar-collapsed" class to the root so CSS can respond to it
    <div className={`main-layout ${isCollapsed ? "sidebar-collapsed" : ""}`}>
      <Sidebar isOpen={isSidebarOpen} toggleSidebar={toggleSidebar} isCollapsed={isCollapsed} onToggleCollapse={toggleCollapse} />

      <div className="main-content">
        <Topbar toggleSidebar={toggleSidebar} />

        <main className="page-content">
          <Container
            fluid
            className="py-2"
            style={{
              backgroundColor: "#E9ECEF",
              display: "flex",
              flexDirection: "column",
              minHeight: "100%",
            }}
          >
            <div style={{ flex: 1 }}>
              <Outlet />
            </div>
            <p style={{ fontSize: 12, color: "var(--color-text-secondary)", textAlign: "center", margin: 0 }}>
              © {new Date().getFullYear()} Ilias Giontis · MyFiWallet. All rights reserved.
            </p>
          </Container>
        </main>
      </div>
    </div>
  );
}
