# ast-grep: no-greater-than

[ast-grep](https://ast-grep.github.io/) rules that flag `>` / `>=` and rewrite to `<` / `<=`.

A grep/lint/codemod hybrid (tree-sitter, Rust). The whole rule is a few lines of YAML.

## Files

- `rules/no-greater-than{,-ts,-tsx}.yml` — `$A > $B` → `($B) < ($A)` for JS / TS / TSX
- `rules/no-greater-or-equal{,-ts,-tsx}.yml` — `$A >= $B` → `($B) <= ($A)` for JS / TS / TSX
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

These limits are *the point of the comparison* — see [`../COMPARISON.md`](../COMPARISON.md).
For this project's "detect precisely, let an agent fix" workflow, ast-grep's
**detection** is excellent; its autofix is best treated as a rough codemod.
