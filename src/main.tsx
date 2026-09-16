import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "bootstrap/dist/css/bootstrap.min.css";
import "react-loading-skeleton/dist/skeleton.css";
import "./index.css";
import "./i18n";
import { App } from "./App";
import { installStaleChunkRecovery } from "./lib/staleChunk";

// Before anything renders: a route imported after a deploy can no longer be
// fetched, and this turns that dead end into a reload onto the new build.
installStaleChunkRecovery();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
