# Examples: before → better

> Generated from [`fixtures/cases.json`](fixtures/cases.json) by `scripts/gen-examples.mjs` — do not edit by hand.
> The same cases drive the test suites, so these examples are guaranteed to match real behavior.

## Flagged — flip to read like a number line

| Before | Better | Auto-fixed? | Note |
| --- | --- | --- | --- |
| `a > b` | `b < a` | yes |  |
| `a >= b` | `b <= a` | yes |  |
| `x > 5` | `5 < x` | yes | becomes a Yoda-style single comparison; consumer decides if that's wanted |
| `foo.bar > 10` | `10 < foo.bar` | yes |  |
| `arr[i] >= count` | `count <= arr[i]` | yes |  |
| `a + 1 > b * 2` | `(b * 2) < (a + 1)` | yes | moved operands are binary expressions -> must be parenthesized |
| `(a \|\| b) > c` | `c < (a \|\| b)` | yes | moved logical-expression operand must stay parenthesized |
| `a > b > c` | `c < (a > b)` | yes | re-association hazard: c < a > b would parse as (c < a) > b. Outer node only; inner a>b flagged separately. |
| `5 < x && x > 1` | `5 < x && 1 < x` | yes |  |
| `foo() > b` | `b < foo()` | suggestion only | call has side effects; swapping changes eval order -> flag/suggest, don't auto-rewrite |
| `count++ > limit` | `limit < count++` | suggestion only | update expression mutates; do not auto-rewrite |

“suggestion only” means an operand has a side effect, so the tools that guard for it
(eslint, ast-grep) report the rewrite but don't apply it automatically.

## Left as-is — correctly NOT flagged

| Code | Why |
| --- | --- |
| `a < b` | already less-than |
| `a <= b` | already less-than-or-equal |
| `5 < x && x < 10` | canonical number-line range |
| `a === b` | equality, not relational |
| `a !== b` | inequality, not relational |
| `a >> b` | right shift, not greater-than |
| `a >>> b` | unsigned right shift |
| `a >>= b` | shift-assign |
