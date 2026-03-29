import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "bootstrap/dist/css/bootstrap.min.css";
import "./index.css";
import { App } from "./App";
import { initializeMockData } from "./shared/services/mockDataServices";

// Initialize mock data once at app start
initializeMockData();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
