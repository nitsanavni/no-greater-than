# Comparison: one rule (now two), three frameworks

The core rule is deliberately tiny ("flag `>` / `>=`, rewrite to `<` / `<=`") so the
frameworks — not the rule — are what's under the microscope. A second rule,
**number-line-range**, reorders a two-sided range into number-line order
(between → `lo < x && x < hi`; outside → `x < lo || hi < x`). All three
implementations run against the same [`fixtures/`](fixtures/) cases.

## What the eval changed

Earlier rounds stress-tested each tool on TypeScript and on range ordering, and the
findings reshaped the implementations:

- **ast-grep was silently broken on TypeScript** — a `language: JavaScript` rule
  matches *nothing* in a `.ts` file. Fixed by adding **TS/TSX rule variants** (own
  tree-sitter parser), which also parse generics (`Array<T>`) and JSX as their own
  node kinds, so they're never mistaken for `>`.
- **Range ordering was added** as a first-class concern across all three tools.
- **Side-effect handling** was made explicit everywhere: ESLint refuses unsafe
  autofixes (suggestion-only), ast-grep gained detect-only `*-impure` companions, and
  Biome is detect-only by design.

## Scoreboard

| | **ESLint** | **ast-grep** | **Biome (GritQL)** |
|---|---|---|---|
| Rule is | JS code (AST visitor + fixer) | YAML pattern + fix template | GritQL snippet + `register_diagnostic` |
| Rules implemented | `no-greater-than` + `number-line-range` (one plugin) | flip + range, in JS/TS/TSX variants (+ `*-impure`) | two plugins: `no-greater-than.grit` + `number-line-range.grit` |
| Detection precision | ✅ exact | ✅ exact | ✅ exact (12/12 ops, 0 false pos) |
| Autofix (flip) | ✅ programmatic | ⚠️ template | ❌ none today |
| Autofix (range) | ✅ programmatic | ⚠️ template (all 4 permutations) | ❌ none today |
| Conditional parens (`a > b > c`) | ✅ only when needed | ⚠️ must always-paren | n/a |
| Side-effect guard | ✅ suggestion-only + pure-call allowlists | ⚠️ detect-only `*-impure` (bound only) | n/a (no fix) |
| Per-site message echoes operands | ✅ yes | ✅ (in diffs) | ❌ static template only |
| TS / TSX | ✅ via `@typescript-eslint/parser` | ✅ dedicated TS/TSX variants | ✅ JS/TS family |
| Multi-language | TS/JS family | ✅ many (tree-sitter) | JS/TS family |
| Editor + CI integration | ✅ mature | ✅ good | ✅ same toolchain as formatter |

## The two guards that separate them

`a > b` always equals `b < a` as a boolean (including strings and `NaN`). So the only
two things a *correct* autofixer must handle are:

### 1. Conditional parenthesization

`a > b > c` parses as `(a > b) > c`. A naive flip gives `c < a > b` → re-parses as
`(c < a) > b`. Wrong.

- **ESLint** inspects the moved operand's node type and adds parens *only when needed*:
  `a > b > c` → `c < (a > b)`; `a > b` stays clean as `b < a`. Prettier-quality output.
- **ast-grep** can't branch in a text template, so to stay correct it must
  **always** parenthesize: `a > b` → `(b) < (a)`. Correct but noisy; a formatter
  cleans it. (Parenthesized source operands like `(a || b)` already carry their parens.)
- **Biome** doesn't fix, so it sidesteps this.

### 2. Side-effect / evaluation-order guard

Swapping operands swaps the order their side effects run.

- **ESLint** checks both operands are side-effect-free; if not (`foo() > b`,
  `count++ > limit`) it **refuses to autofix** and offers a manual *suggestion* instead.
  Provably-pure calls are allowlisted (`Math.*`, `Date.parse`, `a.getTime()`, pure
  `Array`/`String` reads…), so e.g. `a.getTime() >= b.getTime()` still autofixes while
  `Math.random()` / `Date.now()` stay suggestion-only. Controlled by `autofixSafeOnly`.
- **ast-grep** has no "suggestion-only" mode in a single rule, so the side-effect case
  is split out into **detect-only `*-impure` companion rules**: when a *bound* operand
  has a side effect, the rewriting rule is suppressed and the `*-impure` rule reports it
  with no fix. (Limit: a side effect on the *shared* variable `$x` — e.g.
  `x++ > 5 && x < 10` — matches neither, because `$x` must bind identical text twice.)
- **Biome** doesn't fix, so again no risk.

## Number-line range ordering

A two-sided range reads clearest ascending. Canonical forms: between →
`lo < x && x < hi`, outside → `x < lo || hi < x`.

- **ESLint** reorders programmatically into the canonical shape (and applies the same
  side-effect guard / `autofixSafeOnly` option as the flip rule).
- **ast-grep** ships `number-line-range{,-or}` rules (JS/TS/TSX): all four scrambled
  permutations map to a single canonical template, so all are auto-fixed; bounds with
  side effects fall to the `*-impure` detect-only variants.
- **Biome** ships `number-line-range.grit`: it **detects** scrambled shared-variable
  ranges and teaches the canonical shape with a static template, and excludes the two
  already-canonical forms.

## Concrete output on the tricky cases

| Input | ESLint | ast-grep (`-U`, fixpoint) | Biome |
|---|---|---|---|
| `a > b` | `b < a` | `(b) < (a)` | flag only |
| `a + 1 > b * 2` | `(b * 2) < (a + 1)` | `(b * 2) < (a + 1)` | flag only |
| `(a \|\| b) > c` | `c < (a \|\| b)` | `(c) < ((a \|\| b))` | flag only |
| `a > b > c` | `c < (b < a)` | `(c) < ((b) < (a))` | flag ×2 |
| `foo() > b` | **flag + suggest** (no rewrite) | **detect-only** (`*-impure`) | flag only |
| `a.getTime() >= b.getTime()` | `b.getTime() <= a.getTime()` (allowlisted) | `(b.getTime()) <= (a.getTime())` | flag only |
| `x > 5 && x < 10` (range) | `5 < x && x < 10` | `(5) < (x) && (x) < (10)` | flag + teach template |

## Messages

- **ESLint** interpolates the matched operands into the report (`Rewrite as: b < a`),
  and offers the fix/suggestion inline.
- **ast-grep** shows the actual rewrite as a diff.
- **Biome** GritQL **cannot interpolate matched operands** into plugin messages
  (Biome v2), so it teaches the rewrite with a **static "before → better" template**
  rather than echoing the specific variable/bounds.

## Takeaways

- **Want the best autofix?** ESLint. Its programmatic fixer is the only one that can
  express both guards, so it's the only one safe to run unattended (`--fix` in CI).
- **Want the tersest detector / a quick codemod / other languages?** ast-grep. Excellent
  detection in a few lines (now correct on TS/TSX too); treat its autofix as a rough
  codemod and run a formatter after.
- **Already on Biome?** The GritQL plugins give precise detection in the same toolchain,
  but no fix today and only static teaching messages — pair them with an agent or
  `eslint --fix`.

### For *this* project's workflow

The stated goal is "**detect precisely; let an AI agent (or `eslint --fix`) do the
rewrite**." Under that lens, all three are viable detectors, and the autofix-correctness
gap matters less — which is why detection-only Biome is acceptable. The differentiator
becomes **detection precision and false-positive rate**, where all three currently score
perfectly on the fixtures (including TS/TSX generics and range cases).

## Scale verification (done)

"Done = verified thoroughly" → a Mikado-driven eval harness (in [`workflows/`](workflows/),
run via Claude Code **Workflows**) audits each tool on real open-source code:
**audit → capability-aware judge → Mikado graph → worktree attempt → reconcile**, with
**autofix verification** (apply `--fix`/`-U`, then re-parse the output and flag any
side-effecting auto-fix).

Run across **ky, zod, preact, express, date-fns, nest, tanstack-query**:
- **0 false positives, 0 unsafe autofixes** — detection converged (TS/TSX generics, JSX,
  shifts, casts all correctly ignored).
- The eval *drove* real fixes: ast-grep's TS variants (it was silently broken on `.ts`),
  ESLint's pure-call/instance allowlists, ast-grep's `*-impure` side-effect guard, and the
  number-line-range feature.

Open eval threads (more breadth, deliberately adversarial inputs) are tracked in
[`internal-docs/CONCERNS.md`](internal-docs/CONCERNS.md); the per-tool Mikado graph lives in
[`internal-docs/mikado.md`](internal-docs/mikado.md).
