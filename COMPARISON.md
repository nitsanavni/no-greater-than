# Comparison: one rule, three frameworks

The rule is deliberately tiny ("flag `>` / `>=`, rewrite to `<` / `<=`") so the
frameworks — not the rule — are what's under the microscope. All three run against
the same [`fixtures/`](fixtures/) cases.

## Scoreboard

| | **ESLint** | **ast-grep** | **Biome (GritQL)** |
|---|---|---|---|
| Rule is | JS code (AST visitor + fixer) | YAML pattern + fix template | GritQL snippet + `register_diagnostic` |
| Lines to write | ~120 (with guards) | ~6 | ~10 |
| Detection precision | ✅ exact | ✅ exact | ✅ exact (12/12, 0 false pos) |
| Autofix | ✅ programmatic | ⚠️ template | ❌ none today |
| Conditional parens (`a > b > c`) | ✅ only when needed | ⚠️ must always-paren | n/a |
| Side-effect guard (`foo() > b`) | ✅ suggestion-only | ❌ rewrites & reorders | n/a |
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
- **ast-grep** has no "suggestion-only" mode: `scan -U` rewrites `foo() > b` to
  `(b) < (foo())`, **reordering the call**. (Boolean result is still identical, but
  the eval-order change is real and silent.)
- **Biome** doesn't fix, so again no risk.

## Concrete output on the tricky cases

| Input | ESLint | ast-grep (`-U`, fixpoint) | Biome |
|---|---|---|---|
| `a > b` | `b < a` | `(b) < (a)` | flag only |
| `a + 1 > b * 2` | `(b * 2) < (a + 1)` | `(b * 2) < (a + 1)` | flag only |
| `(a \|\| b) > c` | `c < (a \|\| b)` | `(c) < ((a \|\| b))` | flag only |
| `a > b > c` | `c < (b < a)` | `(c) < ((b) < (a))` | flag ×2 |
| `foo() > b` | **flag + suggest** (no rewrite) | `(b) < (foo())` ⚠️ reordered | flag only |

## Takeaways

- **Want the best autofix?** ESLint. Its programmatic fixer is the only one that can
  express both guards, so it's the only one safe to run unattended (`--fix` in CI).
- **Want the tersest detector / a quick codemod / other languages?** ast-grep. Excellent
  detection in ~6 lines; treat its autofix as a rough codemod and run a formatter after.
- **Already on Biome?** The GritQL plugin gives precise detection in the same toolchain,
  but no fix today — pair it with an agent or `eslint --fix`.

### For *this* project's workflow

The stated goal is "**detect precisely; let an AI agent (or `eslint --fix`) do the
rewrite**." Under that lens, all three are viable detectors, and the autofix-correctness
gap matters less — which is why detection-only Biome is acceptable. The differentiator
becomes **detection precision and false-positive rate**, where all three currently score
perfectly on the fixtures. The next step (below) stress-tests that claim at scale.

## Next: scale verification

"Done = verified thoroughly" → run all three across many real open-source repos and
diff their findings:
- Where do the three **disagree** on what to flag? (Disagreement = likely a parser/edge
  case worth a new fixture.)
- Any **false positives** (e.g. TSX generics `Array<T>`, JSX, type predicates) or
  **false negatives**?
- For ESLint specifically: does `--fix` ever produce code that fails to re-parse or
  changes behavior?

This is a good fit for a Claude Code **Workflow**: fan out one agent per repo to clone +
run the three tools + collect disagreements, then synthesize the edge cases into new
fixtures. (Not built yet — planned phase.)
