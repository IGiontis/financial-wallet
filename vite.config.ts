/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      /**
       * Ask before switching versions, rather than switching underneath a page
       * that is already running.
       *
       * `autoUpdate` was the crash. The new worker calls `skipWaiting()` and
       * claims the open tab, then `cleanupOutdatedCaches()` deletes the
       * precache that tab was running out of. The already-loaded code is fine;
       * the next lazy route it reaches for is not. That chunk's hashed name
       * belongs to the previous build, so it is gone from the cache, gone from
       * the server — a deploy only serves its own files — and the SPA rewrite
       * hands back index.html with a 200. A module script cannot be HTML, so
       * the import throws and the screen dies. Closing the app and reopening it
       * was the only way out, which is exactly what it felt like.
       *
       * In `prompt` the new worker installs and waits. The running version
       * keeps its own cache, whole, until the reader taps refresh and the page
       * reloads onto the new one — one version per page, start to finish.
       */
      registerType: "prompt",
      workbox: {
        // The page decides when, by posting SKIP_WAITING; see useAppUpdate.
        skipWaiting: false,
        // First install only — it is what makes the app work offline without
        // needing a second launch.
        clientsClaim: true,
        cleanupOutdatedCaches: true,
        // Deep links offline: /bills is not a file, so navigations fall back to
        // the cached shell and the router takes it from there.
        navigateFallback: "index.html",
      },
      manifest: {
        name: "MyFiWallet",
        short_name: "MyFiWallet",
        description: "Track spending, bills, savings goals and investments in one place.",
        theme_color: "#1a1a2e",
        background_color: "#ffffff",
        display: "standalone", // makes it feel like a native app
        start_url: "/",
        icons: [
          {
            src: "/icon-192.png",
            sizes: "192x192",
            type: "image/png",
          },
          {
            src: "/icon-512.png",
            sizes: "512x512",
            type: "image/png",
          },
        ],
      },
    }),
  ],
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
    css: false,
  },
});
