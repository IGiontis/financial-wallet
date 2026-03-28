import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClientProvider } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import { RouterProvider } from "react-router-dom"; // ADD THIS
import "bootstrap/dist/css/bootstrap.min.css";
import "./index.css";
import { initializeMockData } from "./shared/services/mockDataServices";
import { queryClient } from "./lib/queryClient";
import { router } from "./lib/router"; // ADD THIS

// Initialize mock data
initializeMockData();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
      <ReactQueryDevtools initialIsOpen={false} />
    </QueryClientProvider>
  </StrictMode>,
);
