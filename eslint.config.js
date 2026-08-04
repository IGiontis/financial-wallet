import { defineConfig, globalIgnores } from "eslint/config";
import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";

export default defineConfig([
  globalIgnores(["dist"]),
  {
    files: ["**/*.{ts,tsx}"],
    extends: [js.configs.recommended, tseslint.configs.recommended, reactHooks.configs.flat.recommended, reactRefresh.configs.vite],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    rules: {
      // Disable base rule (important!)
      "no-unused-vars": "off",

      // Enable TS version as warning
      "@typescript-eslint/no-unused-vars": "warn",

      // Surface these as warnings rather than hard errors so `npm run lint`
      // stays green while still flagging debt to clean up over time.
      "@typescript-eslint/no-explicit-any": "warn",
      "react-refresh/only-export-components": "warn",
      "react-hooks/static-components": "warn",
    },
  },
]);
