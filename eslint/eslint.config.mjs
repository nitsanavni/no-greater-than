// Demo flat config: lints the shared fixture file with this plugin only.
//   npx eslint -c eslint.config.mjs ../fixtures/sample.js
import { createRequire } from "node:module";
const plugin = createRequire(import.meta.url)("./index.js");

export default [
  {
    plugins: { ngt: plugin },
    rules: { "ngt/no-greater-than": "warn" },
    languageOptions: { ecmaVersion: 2022, sourceType: "module" },
  },
];
