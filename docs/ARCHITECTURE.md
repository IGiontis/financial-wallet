# Architecture — how the app is put together

How MyFiWallet boots, routes, loads data, works offline, themes and ships. Where each page
lives: `docs/PROJECT_MAP.md`. Shared UI pieces: `docs/COMPONENTS.md`. Data: `docs/DATABASE.md`,
`docs/DATA_FLOW.md`. Rules: `CLAUDE.md` and `.claude/rules/*.md`. Reasons: `docs/DECISIONS.md`.

- **Keep it updated in the same change** that alters boot, routing, the data layer, auth,
  offline, theming, the build or an external service.
- **The code is the truth.** When this file disagrees with the code, fix this file.

## Stack (`package.json`)

- React 19.2, react-dom 19.2, TypeScript ~5.9, Vite 8 (Rolldown), `@vitejs/plugin-react` 6.
- Routing: react-router-dom 7 (`createBrowserRouter`).
- Server state: `@tanstack/react-query` 5 (+ devtools, dev only).
- Firebase 12: Auth, Firestore (persistent cache), App Check (reCAPTCHA Enterprise), Analytics (after consent).
- UI: Bootstrap 5.3 + Reactstrap 9, react-icons, `@floating-ui/react`, react-loading-skeleton, react-toastify 11.
- Forms: Formik 2 + Yup 1. Dates: date-fns 4, react-datepicker 9.
- Charts: Recharts 3; ECharts 6 (money-flow Sankey only). Tour: driver.js 1.10 (demo).
- i18n: i18next 26, react-i18next 17, i18next-browser-languagedetector.
- PWA: vite-plugin-pwa 1 (Workbox). Tests: Vitest 4, jsdom, Testing Library.
- Hosting: Netlify (`netlify.toml`: `npm run build`, publish `dist`, SPA rewrite to `index.html`).

## Boot

1. `src/main.tsx` — imports `index.css` and `i18n`, calls `installStaleChunkRecovery()`;
   in the demo it first lazy-imports `src/demo/demoSession.ts` and runs `startDemo(i18n, queryClient)`,
   then renders `<App />` in `StrictMode`.
2. `src/App.tsx` — module-level `installModalMotion()`, `installToastDefaults()`, `installMotionEffects()`.
   Providers, outside in: `QueryClientProvider` (`src/lib/queryClient.ts`) → `ThemeProvider`
   (`src/context/ThemeContext.tsx`) → `AuthProvider` (`src/context/AuthContext.tsx`).
3. Inside them: `CategorySeeder` (`src/firebase/seedCategories.ts`), `LanguageSync` (applies
   `users/{uid}.locale`), `RouterProvider`, `OfflineBanner`, `UpdatePrompt`, `CookieBanner`,
   `ToastContainer`, React Query devtools (dev only).
4. `src/lib/router.tsx` — guards from `src/lib/routeGuards.tsx`:
   - `PublicOnlyRoute`: `/login`, `/register`; signed in → `/`.
   - `SessionGate`: wraps the app; signed out → `/login`; shows `WelcomeSplash` on a known
     device; finishes a pending sign-up (`features/auth/pendingSignUp.ts`).
   - `ProtectedRoute`: every app page; shows `PageLoader` while auth resolves.
5. `src/features/layout/MainLayout.tsx` — `PageAddProvider` (the page's own «+»,
   `src/shared/hooks/usePageAdd.ts`), `Sidebar`, `Topbar`, `<Outlet />`, `AppFooter`, `AddFab`,
   `BillAlertPopup`, `TourGate`, `NavPendingBar`; starts `startPagePrefetch()`.

## Routing and code splitting

- Every page is lazy: `src/lib/lazyRoutes.ts` wraps the functions in `src/lib/pageChunks.ts` (the ONE list of page chunks).
- A new page: add its chunk to `pageChunks` (and `APP_PAGES` for prefetch), its lazy component to `lazyRoutes.ts`, its route to `router.tsx`, its row to `PROJECT_MAP.md`.
- Idle prefetch: `src/lib/prefetchPages.ts` — `startPagePrefetch()` loads `APP_PAGES` one by one when idle; skipped on Save-Data / 2G (`prefetchAllowed`); `prefetchPath()` on pointer-enter of a sidebar link. Code only — no Firestore read.
- Library chunks: `build.rolldownOptions.output.codeSplitting.groups` in `vite.config.ts` (firebase, react, query, i18n, echarts, recharts, datepicker, forms, one chunk per locale …).
- Stale chunk after a deploy: `src/lib/staleChunk.ts` reloads once (guard key `myfiwallet:stale-chunk-reload`, 30 s) when a dynamic import fails.

## PWA and updates

- `vite.config.ts` → `VitePWA({ registerType: "prompt" })`, Workbox `skipWaiting: false`, `clientsClaim: true`, `cleanupOutdatedCaches: true`, `navigateFallback: "index.html"`; manifest with a «Νέα συναλλαγή» shortcut to `/?quick=expense`.
- `src/shared/components/UpdatePrompt.tsx` — always mounted (it registers the worker); blocks with «Refresh» but waits while another modal (a form) is open.
- `src/shared/hooks/useAppUpdate.ts` — `useRegisterSW`; checks via `src/lib/updateChecks.ts` (hourly, on return to foreground, on reconnect; never hidden/offline).
- Refresh: `useAppUpdate` calls `updateServiceWorker(true)` (SKIP_WAITING), then `src/lib/applyUpdate.ts` `reloadOnNewWorker` reloads on `controllerchange` (3 s fallback).
- The service worker is off under `npm run dev`; use `npm run build` + `npm run preview` to test it.

## Data layer (summary)

Every Firestore call goes through `src/firebase/` (`firestore.ts`, `business.ts`, `names.ts`), which
import the SDK through `src/firebase/firestoreApi.ts` — the switch between real Firestore and the
demo's in-memory store. Firestore opens with a persistent multi-tab IndexedDB cache
(`src/firebase/config.ts`). Lists are read once per device and then by delta on `updatedAt`
(`src/firebase/syncList.ts`, `src/lib/deltaSync.ts`, local store `src/lib/localStore.ts`);
per-user settings live on `users/{uid}` (`src/shared/hooks/useWorkspaceSetting.ts`). React Query
(`src/lib/queryClient.ts`): `staleTime` 5 min, `gcTime` 30 min, `retry: 1`, no refetch on window
focus; failed loads retry silently on 5 s → 10 min backoff (`src/lib/queryAutoRetry.ts`). Saves are
optimistic cache patches (`src/lib/listCache.ts`, `src/shared/utils/saveWithoutWaiting.ts`).
Reads are counted in dev by `src/lib/readMeter.ts`. Details: `docs/DATABASE.md`, `docs/DATA_FLOW.md`.

## Auth

- Firebase Auth, email/password and Google: `src/firebase/auth.ts` (`registerWithEmail`, `loginWithEmail`, `loginWithGoogle`, reauth, email/password change, `deleteAccount`).
- Session state: `AuthProvider` (`src/context/AuthContext.tsx`) → `useAuth()` (`src/shared/hooks/useAuth.ts`); remembers "known device" and "had session" in `src/lib/sessionHint.ts`.
- Sign-out («Αποσύνδεση», Topbar menu and Settings → `useSignOut` in `features/layout/useProfile.ts`) → `signOutToDemo` (`src/firebase/auth.ts`): `logout` (Firebase sign-out + the `sync:` lists), `forgetAccountStorage` (every localStorage key but `DEVICE_KEEPS`, and sessionStorage), `rememberSignedOut` (drops `auth:known-device`, sets `auth:signed-out`), then a full page load to `/` — the public demo. In the demo it leaves for `/login` instead. Tests `src/firebase/signOutToDemo.test.ts`.
- User doc: `createUser` (`src/firebase/firestore.ts`) via `completeSignUp` (`features/auth/pendingSignUp.ts`) from Login/Register pages, or `ensureGoogleProfile` (`features/auth/googleProfile.ts`); an unfinished one is retried by `SessionGate`.
- Default categories: `seedDefaultCategories` once per device (`src/firebase/seedCategories.ts`, list in `defaultCategories.ts`).
- App Check: on only with `VITE_APPCHECK_SITE_KEY`, never in the demo or emulators (`src/firebase/config.ts`).
- Account deletion: `src/firebase/accountDeletion.ts` + `deleteAllUserData` over `OWNED_COLLECTIONS` (`src/firebase/ownedCollections.ts`); writes blocked meanwhile by `src/firebase/deletionGate.ts`. Ends on `/login` (full load), the device still known — unlike a sign-out.

## The public demo

- Decided once per page load in `src/demo/demoMode.ts` (`startsInDemo`): demo unless this device is known (`isKnownDevice`, `src/lib/sessionHint.ts`: signed in, or a session that ended by itself — `auth:known-device`; a deliberate sign-out clears it and sets `auth:signed-out`, so the demo opens) or the path is `/login`, `/register`, `/terms`, `/privacy`. Off in tests (`MODE === "test"`).
- In the demo `src/firebase/config.ts` never creates Auth or Firestore (`notInDemo` throws on use); `firestoreApi.ts` routes every call to `src/demo/memoryFirestore.ts`; `AuthProvider` uses `src/demo/demoUser.ts`.
- Data: `src/demo/fixtures.ts`, seeded per language by `src/demo/demoSession.ts`; `fixtures.test.ts` keeps figures consistent.
- Chrome: `src/demo/DemoChrome.tsx` (badge, account actions), `DemoAuthDialog.tsx`; sign-in from the demo uses `authForDemoSignIn()` + `src/demo/demoSignIn.ts`, then `leaveDemo()` does a full page load.
- Guided tour (driver.js): `src/demo/guidedTour/`.
- Rule: the demo makes zero Firebase calls (exchange rates and analytics included) — `demoIsolation.test.tsx`, `demoSafety.test.ts`.

## Offline

- `src/shared/hooks/useOnlineStatus.ts` — `navigator.onLine` + online/offline events; `App.tsx` shows `OfflineBanner` (with the stored-rates date).
- `src/shared/utils/offlinePolicy.ts` — actions `entry` (allowed, queued by Firestore), `delete`, `settings`, `bulk` (locked offline); `requireConnection` is the data-layer backstop.
- `src/shared/hooks/useOfflineGuard.ts` — `{ locked, reason }` for a control, reason text from `common.offline*` keys.
- Reads offline come from the persistent Firestore cache and the delta-sync local store.

## Theming and motion

- Colourway × mode: `ThemeProvider` sets `data-bs-theme` (light/dark; preference light/dark/system in localStorage `theme-preference`) and `data-nav-style` (`blue` default / `gold`, localStorage `nav-style`) on `<html>`; also the `theme-color` meta.
- Hook `src/shared/hooks/useTheme.ts`; switches: `src/shared/components/ThemeSwitch.tsx` (Settings), Topbar toggle, `features/settings/components/NavStylePicker.tsx` (colourway).
- Tokens: `src/styles/tokens.css` (colours, both colourways × modes), `src/styles/shape.css` (radius, spacing, shadows, motion, `--fs-*`), `src/styles/theme.css` (Bootstrap wiring), `src/index.css` (cascade layers). Checked by tests in `src/styles/`.
- «Κινούμενα εφέ»: `src/shared/hooks/useMotionEffects.ts` (localStorage `motion-effects`), sets `data-motion="off"` → `--loop-play: paused`; setting UI `features/settings/components/MotionEffectsSetting.tsx`.
- Dialog motion `src/shared/components/modalMotion.ts`; toasts `src/lib/toastDefaults.ts`.

## i18n

- `src/i18n/index.ts` — i18next with both bundles inlined, `fallbackLng: "en"`, `load: "languageOnly"`, detection localStorage `app-language` → navigator; keeps `<html lang>` in sync.
- `SUPPORTED_LANGUAGES` (en, el) and `intlLocale()` (en-US / el-GR) for number/date formatting.
- Signed in, `LanguageSync` in `App.tsx` applies the saved `users/{uid}.locale`.

## External services besides Firebase Auth/Firestore

- Exchange rates: `src/firebase/exchangeRate.ts` → `https://v6.exchangerate-api.com/v6/<VITE_EXCHANGE_RATE_API_KEY>/latest/USD`; last rates kept in localStorage `myfiwallet:exchange-rates`; demo uses fixed `DEMO_RATES`. Hook `src/shared/hooks/useCurrencyConverter.ts` (rates `staleTime` 1 h).
- Google Analytics for Firebase: `src/lib/analytics.ts` — only in a production build with `VITE_FIREBASE_MEASUREMENT_ID`, never in the demo, only after «Αποδοχή» in `features/legal/CookieBanner.tsx`. It only enables collection (automatic page views); no custom events, no user id or amounts.
- reCAPTCHA Enterprise via App Check (above); notice in `features/legal/RecaptchaNotice.tsx`.

## Build, run, verify

- `npm run dev` — Vite against the REAL Firebase project (shared free quota).
- `npm run emulators` — `scripts/emulators.mjs`: Auth (9099) + Firestore (8080) emulators, UI 4000 (`firebase.json`), data in `.emulator-data/`; needs firebase-tools and Java.
- `npm run dev:emu` — Vite in `emulator` mode (`.env.emulator`, project `demo-myfiwallet`). For the browser, `.claude/launch.json` → `dev-emu` on http://[::1]:5174 (public demo on an unknown device).
- `npm run build` (= `tsc -b && vite build`), `npm run preview` (service worker on).
- `npm run lint` (`eslint .`), `npm test` (`vitest run`), `test:watch`, `test:ui`, `coverage`.
- Verify as `CLAUDE.md` says: `npx tsc -b` (plain `tsc --noEmit` checks zero files), `npx eslint <changed paths>`, `npx vitest run --dir src` (`--testTimeout=30000` when busy), the browser for anything visible.
- Env vars: `.env.example` (Firebase config, `VITE_EXCHANGE_RATE_API_KEY`, App Check, measurement id).
- Vitest config in `vite.config.ts` (`jsdom`, `src/test/setup.ts`, `css: false`, App Check keys blanked).

## Folder conventions

- One folder per area under `src/features/`; a page at the folder root (`BillsPage.tsx`) or in `pages/` (overview, analytics, transactions, settings).
- Sub-pieces in `components/` where a folder has many; CSS modules in a `css/` folder next to the files that use them (`features/bills/css/`, `shared/components/css/`, `shared/css/`).
- Hooks: `use*.ts` at the feature root; `transactions` alone has a `hooks/` folder. Pure logic in `*Utils.ts` / named modules next to them.
- Tests next to the file they test (`billsUtils.test.ts`); variants as `Name.topic.test.tsx`. Repo-wide style tests in `src/styles/`, the map test in `src/test/docsMap.test.ts`.
- Firebase only from `src/firebase/`; features import `firestore.ts` / `business.ts` / `names.ts`, never the SDK's Firestore directly.
- Shared building blocks in `src/shared/` (catalogue in `docs/COMPONENTS.md`); types in `src/shared/types/IndexTypes.ts`.
