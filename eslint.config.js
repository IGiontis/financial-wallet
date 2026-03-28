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
    },
  },
]);
