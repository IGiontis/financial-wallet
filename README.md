# MyFiWallet

A personal finance tracker built with React and Firebase. Track income, expenses, savings goals, and investments in one place — with charts, real-time exchange rates, and offline support via PWA.

🔗 **Live Demo:** [myfiwallet.netlify.app](https://myfiwallet.netlify.app)

---

## Features

- **Income & Expenses** — log transactions and categorize them
- **Goals** — set savings targets and track progress
- **Investments** — monitor your portfolio
- **Charts** — visual breakdowns powered by Recharts
- **Currency conversion** — live exchange rates via Exchange Rate API
- **PWA** — installable, works offline
- **Authentication** — Google Sign-In via Firebase Auth

---

## Tech Stack

| Layer | Tools |
|-------|-------|
| Framework | React 19 + TypeScript |
| Build | Vite |
| State | Redux Toolkit + React Query |
| Forms | Formik + Yup |
| UI | Bootstrap 5 + Reactstrap + React Icons |
| Backend | Firebase (Auth + Firestore) |
| Testing | Vitest + Testing Library |

---

## Getting Started

### Prerequisites

- Node.js 18+
- A [Firebase](https://firebase.google.com) project with Auth and Firestore enabled
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

### Running Locally

```bash
npm run dev
```

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
```

---

## Deployment

This project is deployed on [Netlify](https://netlify.com). To deploy your own instance:

1. Push the repo to GitHub
2. Connect the repo to Netlify
3. Set the environment variables in **Netlify → Site Settings → Environment Variables**
4. Set the build command to `npm run build` and the publish directory to `dist`

---

## Project Structure

```
src/
├── components/     # Reusable UI components
├── pages/          # Route-level views (income, expenses, goals, investments)
├── store/          # Redux slices
├── hooks/          # Custom React Query hooks
├── services/       # Firebase and API integrations
└── utils/          # Helpers and formatters
```

---

## License

MIT