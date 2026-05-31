# Project concerns

Whole-project tracker for **no-greater-than** — broader than the per-tool
correctness/fix graph in [`mikado.md`](mikado.md) (which covers tool-level
detection/autofix correctness in Mikado form).

Status markers: `[x]` done · `[~]` in progress · `[ ]` open · `[!]` blocked / decided-no.

---

## Tools

### ESLint (`eslint/`)
- [x] Operator-flip detection + autofix (`>`/`>=` → `<`/`<=`).
- [x] TS/TSX parser configured (generics, JSX correctly ignored).
- [x] Side-effect guard: only auto-rewrites when both operands are side-effect-free; else suggestion-only.
- [x] Pure static-call allowlist (`Math.*`, `Number.*`, `Date.parse`, …) promotes those comparisons to autofix.
- [x] Pure instance getters (`Date` getters) + `Array`/`String` read methods (`indexOf`, `includes`, `charAt`, `slice`, …) promote to autofix.
- [x] number-line-range rule (range reorder).
- [x] Shared helpers in `eslint/rules/_shared.js`.
- [x] Honest test counts: 59 ESLint tests via `node:test`.

### ast-grep (`ast-grep/`)
- [x] JS/TS/TSX rule variants (detection across all three).
- [x] Side-effect guard via `*-impure` detect-only companion rules (call/update/assignment/await operands route here, no fix template).
- [x] Chained / nested edge-case tests (ternary RHS, chained `a > b > c`).
- [~] number-line-range (range-reorder rules) — parallel agent.

### Biome (`biome/`)
- [x] GritQL detect-only plugin.
- [x] `before -> better` template message (`a > b` → `b < a`).
- [~] number-line-range detection — parallel agent.

---

## Shared infra / tests / CI
- [x] Shared `fixtures/cases.json` drives tests **and** the generated `EXAMPLES.md` (`scripts/gen-examples.mjs`) — one source of truth.
- [x] Private GitHub repo: `github.com/nitsanavni/no-greater-than`.
- [x] GitHub Actions CI (green): runs eslint/ast-grep/biome checks + examples-freshness check.

---

## Mikado eval harness
- [x] Pipeline: audit → capability-aware Bash-free judge → graph → worktree attempt → reconcile.
- [x] Autofix verification: apply `--fix`/`-U`, then re-parse to confirm behavior-preserving.
- [x] Run across **ky, zod, preact, express, date-fns, nest, tanstack-query**: 0 false positives, 0 unsafe autofixes; detection converged.

---

## Open / later

### number-line-range fixtures
- [ ] Add a `ranges` section to `fixtures/cases.json` + render it in `EXAMPLES.md`.
  - Must be done **serially** — touches shared files + the CI freshness check.

### Publishing / consumption
- [ ] ESLint lives in the `eslint/` subdir, so `npm i github:nitsanavni/no-greater-than` won't grab it directly. Options: publish the subdir to npm, or restructure the repo.
- ast-grep consumed via `sgconfig` / cloning `rules/`.
- biome consumed via vendored `.grit` path.
- Agents currently just clone + read `EXAMPLES.md`.

### Biome limitations
- [!] Native Biome rule (real autofix + interpolated messages) requires forking/building Biome from source — **DECIDED OUT OF SCOPE**.
- [!] GritQL plugin messages cannot interpolate matched operands (static templates only) — verified; concrete per-site rewrites can't be printed.

### ast-grep cosmetic
- [ ] Always-parenthesize fix noise (e.g. `(0) < (x)`); could add atomic-operand pattern variants to drop redundant parens. Quality, low priority — text templates can't branch.

### Evals
- [ ] More evals — detection is converging (clean everywhere). Options:
  - multi-file-per-repo breadth,
  - deliberately adversarial inputs (decorators, optional-chaining calls, `as` casts),
  - or declare converged and write up.

### Eval workflow refinement
- [ ] The graph agent has occasionally listed already-implemented items as actionable leaves. Mitigated with a verify-before-listing instruction; keep watching.

---

See [`mikado.md`](mikado.md) for the detailed per-tool correctness/fix Mikado graph.
