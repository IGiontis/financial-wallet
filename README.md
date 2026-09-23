# MyFiWallet

A personal finance app built with React and Firebase. Track what comes in and goes out, the bills that recur, what you owe and are owed, and whether the month ahead works — in English or Greek, on a phone or a desktop, online or off.

🔗 **Live app:** [myfiwallet.netlify.app](https://myfiwallet.netlify.app)

---

## Features

- **Overview** — balance, income, expenses and investments at a glance
- **Transactions** — log and categorize income and expenses, with saved payees, a calendar view, insights and a split by category
- **Analytics** — where the money goes, from many angles: net worth, what changed, each category over time, pace of the month, savings rate, committed vs free, and where income comes from
- **Bills** — recurring payments you tick off when paid, with variable amounts, instalments, custom intervals and pauses
- **Planner** — "Will I make it?": the balance day by day over the months ahead, from your pay day, bills and debts
- **Allocation** — split what is left after the unavoidable, and compare the plan with what actually happened
- **Goals & investments** — savings targets with deadlines, deposits and withdrawals
- **Debts & loans** — money between people and bank loans with interest, fixed or floating
- **Statement** — a printable statement for any period ("Save as PDF" from the browser's print dialog)
- **Currencies** — EUR, USD or GBP, with live exchange rates
- **Languages** — English and Greek
- **Themes** — light and dark
- **PWA** — installable, opens offline, updates itself when a new version is published
- **Accounts** — email and password, or Google Sign-In

---

## What's new since 2.0

Everything below arrived after the 2.0 release of 4 August 2026.

### Bills

- **Pause a bill** — for good (you moved out) or every year for some months (the holiday house over the winter). Paused months cost nothing and drop out of every total.
- **Four views** — cards, a compact one-line list, the next 12 months, and **the month as a timeline**: every bill and your pay day in the order they happen, a marker for today, and paid bills struck through. It also says how much has to leave before your pay arrives.
- **Overdue list** — tap the overdue count to see which bills are late, by how many days, and what they add up to.
- **Tabs** — full width with labels on phones, easier to hit.

### Debts & loans

- **Loans with interest** — fixed or floating (index + bank margin), with interest-free months. Shows the monthly payment, payments left, finish date and interest so far, worked out from your actual payments.
- **"What if…"** — how much sooner a loan ends, and how much interest you save, by paying a little more each month; what a rate move would do to a floating loan.
- **One loan at a time** — each person's sheet puts one loan in front: how much is left, how much is paid off, and tabs for payments, "what if" and details. Full screen on a phone, two columns on a desktop.
- **Principal and interest** — every loan payment shows how much came off the debt and how much was interest.
- **Corrections** — edit a loan or a single payment; add a new loan straight from a person's sheet.

### Analytics & planning

- **Analytics rebuilt** — net worth, an income section, categories compared on a shared scale; the separate expense/income tabs are gone.
- **Planner** — the balance chart now lines up both axes at zero, so a positive balance never draws below the line.
- **Pay day** — Bills and the Planner share one pay day, so they never disagree.
- **Allocation** and the **printable statement** are new pages.

### App-wide

- **Updates** — after a deploy the app shows a "New version" prompt instead of crashing or keeping the old version. It waits if you are in the middle of a form.
- **Offline** — everything you have loaded stays readable. New entries are kept and sent when you are back online. Deletions and settings wait for a connection, and say so.
- **Exchange rates offline** — the last rates are kept on the device and used without a connection, with their date shown.
- **Layout** — every page uses the same full width on laptops.
- **Dates** — the app's own calendar on every date and month field, instead of the browser's, which looks and opens differently on every phone.

---

## Tech Stack

| Layer | Tools |
|-------|-------|
| Framework | React 19 + TypeScript |
| Build | Vite, vite-plugin-pwa (Workbox) |
| Server state | TanStack Query (React Query) |
| Forms | Formik + Yup |
| UI | Bootstrap 5 + Reactstrap + React Icons, CSS Modules |
| Charts | Recharts, ECharts (money-flow chart) |
| Dates | date-fns, react-datepicker |
| Languages | i18next (English, Greek) |
| Backend | Firebase (Auth + Firestore, with an on-disk offline cache) |
| Testing | Vitest + Testing Library (1,000+ tests) |

---

## Getting Started

### Prerequisites

- Node.js 18+
- A [Firebase](https://firebase.google.com) project with Auth (email and Google) and Firestore enabled
- An [Exchange Rate API](https://www.exchangerate-api.com) key

### Installation

```bash
git clone https://github.com/IGiontis/financial-wallet.git
cd financial-wallet
npm install
```

### Environment Variables

Create a `.env` file in the root of the project:

```
VITE_FIREBASE_API_KEY=
VITE_FIREBASE_AUTH_DOMAIN=
VITE_FIREBASE_PROJECT_ID=
VITE_FIREBASE_STORAGE_BUCKET=
VITE_FIREBASE_MESSAGING_SENDER_ID=
VITE_FIREBASE_APP_ID=
VITE_EXCHANGE_RATE_API_KEY=
```

Fill in the values from your Firebase project settings and Exchange Rate API dashboard.

### Firestore

The app uses these collections: `users`, `transactions`, `categories`, `budgets`, `investmentGoals`, `investmentContributions`, `bills`, `billPayments`, `debts` and `debtPayments`.

Security rules are not part of this repository — set them in the Firebase Console. Every document carries a `userId`; restrict each collection so users can only read and write their own documents. A new collection does nothing until it has rules.

### Running Locally

```bash
npm run dev
```

The service worker is off in development. To try offline mode and the update prompt, build and preview:

### Building for Production

```bash
npm run build
```

### Preview Production Build

```bash
npm run preview
```

---

## Testing

```bash
npm run test        # run all tests
npm run test:ui     # open Vitest UI
npm run coverage    # generate coverage report
npx tsc -b          # type-check the whole project
```

---

## Deployment

This project is deployed on [Netlify](https://netlify.com). To deploy your own instance:

1. Push the repo to GitHub
2. Connect the repo to Netlify
3. Set the environment variables in **Netlify → Site Settings → Environment Variables**
4. Set the build command to `npm run build` and the publish directory to `dist`

After a deploy, open apps show a "New version" prompt. The first deploy after installing an older version may still need the app to be closed and reopened once.

---

## Project Structure

```
src/
├── features/       # One folder per area: overview, transactions, analytics, bills,
│   │               #   plannerPage, allocation, budget (investments), goals, debts,
│   │               #   statement, categories, settings, auth, layout, errors
│   └── <feature>/  #   pages, components, React Query hooks and pure utils
├── firebase/       # Firebase config, auth, Firestore access, exchange rates
├── shared/         # Cross-feature components, hooks, types and utils
├── i18n/           # English and Greek translations
├── context/        # React context providers (auth, theme)
├── lib/            # Router, query client, update and offline recovery
└── test/           # Vitest setup
```

---

## License

MIT
