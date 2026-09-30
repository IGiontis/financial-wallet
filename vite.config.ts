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
  build: {
    rolldownOptions: {
      output: {
        /**
         * Libraries in files of their own, so a deploy re-downloads only what
         * changed.
         *
         * Left to itself the bundler put app code inside the library chunks —
         * the Firebase chunk carried `src/firebase`, the React chunk the app
         * shell, the ECharts chunk the one chart that uses it — so a one-line
         * edit to one screen gave most of the files new names, and every
         * installed copy fetched about 800 of its 935 KB again on the next
         * update. With each library group in its own file, an app change
         * renames the app's own chunks and leaves the libraries cached.
         *
         * Groups are only for libraries that change when a dependency does.
         * Nothing shared goes into a chart or form group (tslib, for one, is
         * used by Firebase too): a group is one file, and whatever depends on
         * any part of it loads all of it.
         */
        codeSplitting: {
          groups: [
            { name: "firebase", test: /node_modules[\\/](@firebase|firebase)[\\/]/, priority: 30 },
            { name: "react", test: /node_modules[\\/](react|react-dom|scheduler|react-router|react-router-dom)[\\/]/, priority: 30 },
            { name: "query", test: /node_modules[\\/]@tanstack[\\/]/, priority: 20 },
            { name: "i18n", test: /node_modules[\\/](i18next|react-i18next|i18next-browser-languagedetector)[\\/]/, priority: 20 },
            { name: "echarts", test: /node_modules[\\/](echarts|zrender)[\\/]/, priority: 20 },
            {
              name: "recharts",
              test: /node_modules[\\/](recharts|d3-[^\\/]+|victory-vendor|@reduxjs|redux|react-redux|reselect|immer|decimal\.js-light|internmap|eventemitter3|es-toolkit)[\\/]/,
              priority: 20,
            },
            { name: "datepicker", test: /node_modules[\\/]react-datepicker[\\/]/, priority: 20 },
            // A group takes the libraries its own ones import along with it, so
            // anything the first screen also uses is claimed first, by a group
            // of higher priority — or react-datepicker would carry date-fns and
            // floating-ui, and with them itself, into the initial load.
            { name: "date-fns", test: /node_modules[\\/]date-fns[\\/]/, priority: 40 },
            { name: "shared", test: /node_modules[\\/](clsx|react-is|use-sync-external-store|tslib|prop-types|@babel[\\/]runtime)[\\/]/, priority: 40 },
            { name: "forms", test: /node_modules[\\/](formik|yup|lodash-es|lodash|property-expr|toposort|tiny-case|tiny-warning|react-fast-compare|hoist-non-react-statics)[\\/]/, priority: 20 },
            { name: "floating-ui", test: /node_modules[\\/]@floating-ui[\\/]/, priority: 40 },
            // Each language its own file: the text changes more often than any
            // library, and it no longer drags the transactions hooks along.
            { name: (id: string) => (/[\\/]i18n[\\/]locales[\\/]el\.json/.test(id) ? "locale-el" : /[\\/]i18n[\\/]locales[\\/]en\.json/.test(id) ? "locale-en" : null), priority: 10 },
          ],
        },
      },
    },
  },
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
    css: false,
  },
});
