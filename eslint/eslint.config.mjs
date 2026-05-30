// Demo flat config: lints the shared fixture file with this plugin only.
//   npx eslint -c eslint.config.mjs ../fixtures/sample.js
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const plugin = require("./index.js");
// Syntactic TS/TSX parsing only (no type-aware linting needed): our rule walks
// BinaryExpression nodes, and the TS parser correctly produces type nodes (not
// comparisons) for generics like `Array<T>`, so they're never flagged.
const tsParser = require("@typescript-eslint/parser");

export default [
  {
    plugins: { ngt: plugin },
    rules: { "ngt/no-greater-than": "warn" },
  },
  {
    files: ["**/*.{js,mjs,cjs,jsx}"],
    languageOptions: { ecmaVersion: 2022, sourceType: "module" },
  },
  {
    files: ["**/*.{ts,tsx,mts,cts}"],
    languageOptions: {
      parser: tsParser,
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
  },
];
