# Biome: no-greater-than (GritQL plugin)

A [Biome](https://biomejs.dev/) v2 **GritQL plugin** that flags `>` / `>=` comparisons.

## Detection-only — by design and by limitation

Biome v2's plugin system runs GritQL `.grit` files. As of Biome 2.x, **plugins can
`register_diagnostic` but cannot apply fixes** — there is no rewrite path from a plugin.
So this implementation **only detects**; it never rewrites.

That fits this project's workflow ("flag precisely, let an agent or `eslint --fix` do the
rewrite") and is why we accepted detection-only up front.

## Files

- `no-greater-than.grit` — the GritQL pattern (matches `$left > $right` and `$left >= $right`)
- `biome.json` — registers the plugin; disables recommended rules so plugin output is isolated

## Run

```bash
cp ../fixtures/sample.js ./_demo.js
biome lint ./_demo.js        # reports one "plugin" diagnostic per > / >=
rm _demo.js
```

## Results on the shared fixture

Flags **exactly** the 12 `>` / `>=` operators (the 11 should-flag cases, with `a > b > c`
counted twice — outer and inner), and **nothing** on the should-not-flag lines
(`<`, `<=`, `===`, `!==`, `>>`, `>>>`, `>>=`). Precise detection, no false positives.

## How it compares

- **Authoring**: as terse as ast-grep — a snippet pattern plus a `register_diagnostic`.
- **Speed**: Rust, integrated into the same toolchain as the formatter.
- **Ceiling**: lowest of the three for *this* task — no autofix at all today. If/when
  Biome adds plugin fixes, the same pattern could gain a rewrite. See
  [`../COMPARISON.md`](../COMPARISON.md).
