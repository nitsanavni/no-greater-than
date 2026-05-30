# no-greater-than

A tiny lint rule, built **three ways**, as a hands-on comparison of JS/TS lint frameworks.

## The rule

Inspired by [Llewellyn Falco — "Don't use the greater-than sign in conditionals"](https://llewellynfalco.blogspot.com/2016/02/dont-use-greater-than-sign-in.html).

Find every `>` and `>=` comparison and (where the framework allows) rewrite it to `<` / `<=`,
so conditionals read like a number line:

```js
5 < x && x < 10   // x is between 5 and 10  — reads left-to-right like a number line
x < 5 || 10 < x   // x is outside that range
```

The rule **finds** all `>` / `>=`; it does not bake in opinions about which ones are "bad".
Severity and selective disabling are left to the consumer's config.

### Why the rewrite is safe

In JS, `a > b` always produces the **exact same boolean** as `b < a` (including string and
`NaN` cases). The *only* thing the swap changes is the **evaluation order of side effects**.
So an autofixer is correct as long as it:

1. **Parenthesizes a moved operand** when needed, so `a > b > c` becomes `c < (a > b)`,
   not the mis-associating `c < a > b`.
2. **Only auto-rewrites when both operands are side-effect-free** (else: warn / suggest, don't rewrite).

How well each framework can express those two guards is the whole point of this comparison.

## The three implementations

| Dir            | Framework | Fixer model            | Autofix | Notes |
|----------------|-----------|------------------------|---------|-------|
| [`eslint/`](eslint/)       | ESLint custom rule | programmatic (JS) | ✅ full | Can encode both correctness guards. |
| [`ast-grep/`](ast-grep/)   | ast-grep YAML rule | template / text     | ⚠️ naive | Terse; can't conditionally parenthesize or guard side effects. |
| [`biome/`](biome/)         | Biome GritQL plugin | —                  | ❌ detect-only | GritQL plugins can't fix yet (Biome v2). Detection only. |

> Detection-only is acceptable here by design: the intended workflow is "flag precisely, let an
> AI agent or `eslint --fix` do the rewrite."

## Shared fixtures

[`fixtures/`](fixtures/) holds one set of example cases that all three implementations are run
against, so we can compare what each flags and fixes apples-to-apples.

See [`EXAMPLES.md`](EXAMPLES.md) for a **before → better** table generated from those same cases
(`node scripts/gen-examples.mjs`) — one source of truth for tests *and* docs.

## Status

Exploratory. See per-implementation READMEs for how to run each, and
[`COMPARISON.md`](COMPARISON.md) for the running write-up.
