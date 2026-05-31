# Biome: no-greater-than (GritQL plugins)

Two [Biome](https://biomejs.dev/) v2 **GritQL plugins**:

- **`no-greater-than.grit`** — flags `>` / `>=` comparisons.
- **`number-line-range.grit`** — flags *scrambled* two-sided ranges that share a
  variable and teaches the canonical number-line shape.

## Detection-only — by design and by limitation

Biome v2's plugin system runs GritQL `.grit` files. As of Biome 2.x, **plugins can
`register_diagnostic` but cannot apply fixes** — there is no rewrite path from a plugin.
So this implementation **only detects**; it never rewrites.

That fits this project's workflow ("flag precisely, let an agent or `eslint --fix` do the
rewrite") and is why we accepted detection-only up front.

### No operand interpolation in messages

A second, separate limitation: **plugin diagnostic messages cannot interpolate the matched
operands** — writing `$x` in a `message` prints the literal text `$x`, not the matched code
(verified). So both plugins teach the rewrite with a **static template** ("better: `lo < x && x < hi`"),
not a per-site message that echoes the actual variable/bounds. The human or agent applies the
shape to the flagged span.

## Number-line range detection

`number-line-range.grit` matches *scrambled* two-sided ranges that share the same middle
variable `$x` and registers a static teaching message:

- **between** (`&&`): better → `lo < x && x < hi`
- **outside** (`||`): better → `x < lo || hi < x`

Matched shapes (all require the same `$x` on both sides — GritQL enforces metavariable
equality, so `x > 1 && y < 10` is *not* matched as a range):

- between: `x > lo && x < hi`, `x < hi && x > lo`, `lo < x && x > hi`, `hi > x && x < lo`
- outside: `x > hi || x < lo`, `x < lo || x > hi`, `hi < x || x < lo`, `x > hi || lo > x`

**Canonical-exclusion worked.** The canonical between form `5 < x && x < 10` and the canonical
outside form `x < 1 || 10 < x` use *only* `<`, while every scrambled shape above involves a `>`
or reorders the clauses — so canonical ranges are **not** flagged. Verified: `5 < x && x < 10`
and `x < 1 || 10 < x` produce no range diagnostic.

Residual limitation: detection keys on syntactic shape, not numeric semantics. A clause-order
variant that happens to already read canonically but uses a different operator arrangement could
in principle slip through or, conversely, an unusual canonical phrasing not in the list above is
simply not matched. The set is tuned to flag scrambled ranges while leaving the two standard
canonical forms clean.

## Files

- `no-greater-than.grit` — flags `$left > $right` and `$left >= $right`
- `number-line-range.grit` — flags scrambled shared-variable ranges (between/outside)
- `biome.json` — registers both plugins; disables recommended rules so plugin output is isolated

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
