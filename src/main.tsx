import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App.tsx";
import { initializeMockData } from "./shared/services/mockDataServices.ts";

// Initialize mock data
initializeMockData(); // ADD THIS

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
