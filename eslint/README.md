# eslint-plugin-no-greater-than

ESLint custom rule: flag `>` / `>=` and rewrite to `<` / `<=`.

## Install (local / workspace)

```bash
cd eslint && npm install
```

## Use (flat config)

```js
// eslint.config.mjs
import { createRequire } from "node:module";
const ngt = createRequire(import.meta.url)("eslint-plugin-no-greater-than");

export default [
  {
    plugins: { ngt },
    rules: { "ngt/no-greater-than": "warn" }, // or "error"
  },
];
```

Or spread the preset: `...ngt.configs.recommended`.

### Option

- `autofixSafeOnly` (default `true`): only autofix when **both operands are
  side-effect-free**; otherwise flag + offer a manual suggestion. Set `false`
  to autofix unconditionally (accepting that evaluation order may change).

## Why this implementation is the "correct" one

ESLint's fixer is **programmatic JavaScript**, so the rule can inspect the AST and:

1. **Parenthesize a moved operand** when it's itself a binary/logical/ternary/etc.
   expression — so `a > b > c` becomes `c < (a > b)`, never the mis-associating
   `c < a > b`.
2. **Guard side effects** — `foo() > b` is *not* auto-rewritten (swapping would
   reorder the call relative to `b`); it's reported with an opt-in suggestion instead.

These two guards are exactly what the declarative (template-based) fixers in
ast-grep and Biome struggle to express — see [`../COMPARISON.md`](../COMPARISON.md).

## Test

```bash
npm test   # node --test : RuleTester unit tests + shared-fixtures integration tests
```

- `tests/unit.test.js` — idiomatic `RuleTester` cases.
- `tests/fixtures.test.js` — drives the rule from the repo-wide
  [`../fixtures/cases.json`](../fixtures/cases.json).

## Demo

```bash
cp ../fixtures/sample.js ./_demo.js
npx eslint -c eslint.config.mjs --fix ./_demo.js && cat ./_demo.js && rm _demo.js
```
