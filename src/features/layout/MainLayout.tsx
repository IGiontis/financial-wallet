import { useState } from "react";
import { Outlet } from "react-router-dom";
import { Container } from "reactstrap";
import { Sidebar } from "./Sidebar";
import { Topbar } from "./Topbar";
import "./css/MainLayout.css"

/**
 * MainLayout Component
 *
 * 2025/2026 Best Practice Pattern:
 * - Uses CSS media queries for responsive behavior (no useEffect needed!)
 * - Uses Bootstrap utility classes for conditional visibility
 * - State only tracks user toggle action, not screen size
 */

export function MainLayout() {
  // State ONLY tracks if user manually closed sidebar on mobile
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  // Toggle sidebar function
  const toggleSidebar = () => {
    setIsSidebarOpen((prev) => !prev);
  };

  return (
    <div className="main-layout">
      {/* Sidebar - CSS handles responsive behavior */}
      <Sidebar isOpen={isSidebarOpen} toggleSidebar={toggleSidebar} />

      {/* Main Content Area */}
      <div className="main-content">
        {/* Top Bar with hamburger button */}
        <Topbar toggleSidebar={toggleSidebar} />

        {/* Page Content */}
        <main className="page-content">
          <Container fluid className="py-4">
            <Outlet />
          </Container>
        </main>
      </div>
    </div>
  );
}
