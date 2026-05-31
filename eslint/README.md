# eslint-plugin-no-greater-than

ESLint custom rules that make comparisons read like a number line. Two rules:

- **`no-greater-than`** — flags `>` / `>=` and rewrites to `<` / `<=` by swapping
  operands, so a single comparison reads smaller-on-left (`a > b` → `b < a`).
- **`number-line-range`** — reorders a two-sided range that shares one variable into
  number-line order:
  - **between** (`&&`): `lo < x && x < hi`
  - **outside** (`||`): `x < lo || hi < x`

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
    rules: {
      "ngt/no-greater-than": "warn",     // or "error"
      "ngt/number-line-range": "warn",
    },
  },
];
```

Or spread the preset (enables both rules): `...ngt.configs.recommended`.

### TypeScript / TSX

To lint `.ts` / `.tsx`, wire `@typescript-eslint/parser` for those files (syntactic
parsing is enough — the rules are type-unaware AST visitors):

```js
import tsParser from "@typescript-eslint/parser";

export default [
  // ...the plugin block above...
  {
    files: ["**/*.{ts,tsx,mts,cts}"],
    languageOptions: {
      parser: tsParser,
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
  },
];
```

The TS parser emits **type nodes** for generics, so `Array<T>` / `Promise<unknown>`
are never mistaken for `>` comparisons and are never flagged. See
[`eslint.config.mjs`](eslint.config.mjs) for the demo wiring.

### Option (both rules)

- `autofixSafeOnly` (default `true`): only autofix when **all moved operands are
  side-effect-free**; otherwise flag + offer a manual *suggestion*. Set `false`
  to autofix unconditionally (accepting that evaluation order may change).

## Why this implementation is the "correct" one

ESLint's fixer is **programmatic JavaScript**, so the rules can inspect the AST and:

1. **Parenthesize a moved operand** when it's itself a binary/logical/ternary/etc.
   expression — so `a > b > c` becomes `c < (a > b)`, never the mis-associating
   `c < a > b`.
2. **Guard side effects** — `foo() > b` is *not* auto-rewritten (swapping would
   reorder the call relative to `b`); it's reported with an opt-in suggestion instead.

These two guards are exactly what the declarative (template-based) fixers in
ast-grep and Biome struggle to express — see [`../COMPARISON.md`](../COMPARISON.md).

### The side-effect guard and pure-call allowlists

The guard is conservative: anything we can't prove side-effect-free is treated as
unsafe (suggestion-only). Two allowlists let provably-pure calls still autofix:

- **`PURE_STATIC_CALLS`** — `Math.*`, `Number.parse*` / `Number.is*`, `Date.parse`,
  `Date.UTC`, `String.fromCharCode` / `fromCodePoint`.
- **`PURE_INSTANCE_METHODS`** — `Date` getters (`getTime`, `valueOf`, `getFullYear`,
  …), plus pure `Array` / `String` reads (`indexOf`, `lastIndexOf`, `includes`,
  `charAt`, `slice`).

So `after >= Date.parse(s)` and `a.getTime() >= b.getTime()` autofix, while
`foo()`, `x++`, `Math.random()`, and `Date.now()` stay suggestion-only.

These helpers (and the parenthesization / operator-flip logic) live in
[`rules/_shared.js`](rules/_shared.js), shared by both rules.

## Test

```bash
npm test   # node --test : RuleTester unit tests + shared-fixtures integration tests
```

The suite reports **63 tests, 0 failures** (RuleTester wired to `node:test` subtests):

- `tests/unit.test.js` — idiomatic `RuleTester` cases for `no-greater-than`.
- `tests/number-line-range.test.js` — `RuleTester` cases for `number-line-range`.
- `tests/fixtures.test.js` — drives the rules from the repo-wide
  [`../fixtures/cases.json`](../fixtures/cases.json).

## Demo

```bash
cp ../fixtures/sample.js ./_demo.js
npx eslint -c eslint.config.mjs --fix ./_demo.js && cat ./_demo.js && rm _demo.js
```
