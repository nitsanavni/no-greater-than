# ast-grep: no-greater-than

[ast-grep](https://ast-grep.github.io/) rules that flag `>` / `>=` and rewrite to `<` / `<=`.

A grep/lint/codemod hybrid (tree-sitter, Rust). The whole rule is a few lines of YAML.

## Files

- `rules/no-greater-than{,-ts,-tsx}.yml` — `$A > $B` → `($B) < ($A)` for JS / TS / TSX
- `rules/no-greater-or-equal{,-ts,-tsx}.yml` — `$A >= $B` → `($B) <= ($A)` for JS / TS / TSX
- `rules/number-line-range{,-ts,-tsx}.yml` — two-sided **between** range → `($LO) < ($X) && ($X) < ($HI)` for JS / TS / TSX
- `rules/number-line-range-or{,-ts,-tsx}.yml` — two-sided **outside** range → `($X) < ($LO) || ($HI) < ($X)` for JS / TS / TSX
- `rules/number-line-range*-impure.yml` — detect-only companions for ranges whose **bound** operand has a side effect
- `sgconfig.yml` — points ast-grep at `rules/` and the test dir
- `rule-tests/` — `ast-grep test` cases + snapshots

> **TS/TSX variants** exist because ast-grep maps each language to its own parser:
> a `language: JavaScript` rule silently matches **nothing** in a `.ts` file. The eval
> caught this (ast-grep flagged 0/8 real comparisons in a TypeScript file). The TS/TSX
> rules use tree-sitter-typescript, which parses generics (`Array<T>`) and JSX as their
> own node kinds — so they're never mistaken for `>` comparisons.

## Run

```bash
ast-grep scan ../fixtures/sample.js          # detect (shows diffs)
ast-grep scan -U <file>                       # apply fixes in place
ast-grep test                                 # run rule tests
```

## What it does well

- **Terse**: the rule is the pattern `$A > $B` and a fix template. No code.
- **Multi-language out of the box** (tree-sitter): the same idea ports to Python,
  Go, Rust, etc. by changing `language:`.
- **Correct on parenthesized & arithmetic operands**: `(a || b) > c` keeps its
  parens (they're part of the captured source); `a + 1 > b * 2` needs none.
- **Ignores look-alikes**: `>>`, `>>>`, `>>=`, `===` are distinct AST operators
  and are left alone.

## Where it falls short of the ESLint rule

The fixer is a **text/template substitution** — it can't branch on operand shape:

1. **Can't parenthesize conditionally.** ESLint adds parens *only when needed*.
   ast-grep can't, so to stay correct on chained comparisons (`a > b > c`, which
   would otherwise become the mis-associating `c < a > b`) it must
   **always parenthesize** → redundant parens on simple cases: `a > b` → `(b) < (a)`.
   A formatter (Prettier/Biome) cleans those up, but the rule itself can't.
2. **Can't guard side effects.** ESLint refuses to auto-rewrite `foo() > b`
   (swapping reorders the call) and offers a suggestion instead. ast-grep has no
   "suggestion-only" concept — `scan -U` rewrites it to `(b) < (foo())`,
   **changing evaluation order**. (The boolean result is still identical.)
3. **Needs repeated passes for nested matches.** One `scan -U` fixes the outer
   comparison of `a > b > c`; the inner one needs another pass.

## Number-line range ordering

A two-sided range reads clearest as an ascending number line. These rules
normalise the scrambled orderings to a canonical form:

- **between** (`&&`): `lo < x && x < hi`
- **outside** (`||`): `x < lo || hi < x`

Because an ast-grep fix is a single non-branching template, a permutation is
only auto-fixed when every scrambled form maps to the **same** canonical
output. Both `&&` permutations do (both → `($LO) < ($X) && ($X) < ($HI)`), and
both `||` permutations do (both → `($X) < ($LO) || ($HI) < ($X)`), so all four
are covered by a correct fix:

| Pattern | Rule | Status |
| --- | --- | --- |
| `$X > $LO && $X < $HI` | `number-line-range` | **fix** |
| `$X < $HI && $X > $LO` | `number-line-range` | **fix** |
| `$X < $LO \|\| $X > $HI` | `number-line-range-or` | **fix** |
| `$X > $HI \|\| $X < $LO` | `number-line-range-or` | **fix** |
| any of the above with a side-effecting **bound** | `number-line-range*-impure` | **detect-only** (no fix) |

The same side-effect guard as `no-greater-than` applies: when a **bound**
operand (`$LO` / `$HI`) contains a call / update / assignment / await, the
order-reordering fix is suppressed and a detect-only `*-impure` rule reports it
instead. (TS/TSX variants mirror the JS rules.)

**Known gap:** a side effect on the **shared** `$X` operand — e.g.
`x++ > 5 && x < 10` — is matched by *neither* rule. `$X` appears twice in the
pattern and must bind to identical source text on both sides, so `x++`
(left) ≠ `x` (right) and the whole pattern fails to match. This is an inherent
limit of declarative metavar matching, not a fixable template choice.

These limits are *the point of the comparison* — see [`../COMPARISON.md`](../COMPARISON.md).
For this project's "detect precisely, let an agent fix" workflow, ast-grep's
**detection** is excellent; its autofix is best treated as a rough codemod.
