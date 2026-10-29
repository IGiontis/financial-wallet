import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "bootstrap/dist/css/bootstrap.min.css";
import "react-loading-skeleton/dist/skeleton.css";
import "./index.css";
import i18n from "./i18n";
import { App } from "./App";
import { installStaleChunkRecovery } from "./lib/staleChunk";
import { isDemo } from "./demo/demoMode";
import { queryClient } from "./lib/queryClient";

// Before anything renders: a route imported after a deploy can no longer be
// fetched, and this turns that dead end into a reload onto the new build.
installStaleChunkRecovery();

const render = () =>
  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );

// The demo's made-up account goes into memory before the first screen reads
// it. Loaded only for the demo: someone signed in never downloads it.
if (isDemo()) {
  void import("./demo/demoSession").then(({ startDemo }) => {
    startDemo(i18n, queryClient);
    render();
  });
} else {
  render();
}
