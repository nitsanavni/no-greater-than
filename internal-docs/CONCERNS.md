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
- [x] `number-line-range` rule (range reorder: `lo < x && x < hi` / `x < lo || hi < x`).
- [x] Shared helpers in `eslint/rules/_shared.js`.
- [x] Honest test counts: **63** ESLint tests via `node:test`.

### ast-grep (`ast-grep/`)
- [x] JS/TS/TSX rule variants (detection across all three).
- [x] Side-effect guard via `*-impure` detect-only companion rules (call/update/assignment/await operands route here, no fix template).
- [x] Chained / nested edge-case tests (ternary RHS, chained `a > b > c`).
- [x] `number-line-range{,-or}` rules (JS/TS/TSX) + `*-impure` companions; 24 ast-grep tests.

### Biome (`biome/`)
- [x] GritQL detect-only plugin.
- [x] `before -> better` template message (`a > b` → `b < a`).
- [x] `number-line-range.grit` detection (scrambled shared-variable ranges; teaches canonical shape).

---

## Shared infra / tests / CI
- [x] Shared `fixtures/cases.json` drives tests **and** generated `EXAMPLES.md` (`scripts/gen-examples.mjs`) — one source of truth.
- [x] `ranges` / `rangesOk` fixtures added + rendered in `EXAMPLES.md`.
- [x] **Public** GitHub repo: `github.com/nitsanavni/no-greater-than`.
- [x] GitHub Actions CI (green): eslint/ast-grep/biome checks + examples-freshness; biome assertion counts operators (12) + ranges (≥1).
- [x] `CONSUMING.md`: verified no-npm-registry install paths (degit-vendor for eslint/biome, clone+`-c sgconfig` for ast-grep).

---

## Mikado eval harness
- [x] Pipeline: audit → capability-aware Bash-free judge → graph → worktree attempt → reconcile.
- [x] Autofix verification: apply `--fix`/`-U`, then re-parse to confirm behavior-preserving.
- [x] Run across **ky, zod, preact, express, date-fns, nest, tanstack-query**: 0 false positives, 0 unsafe autofixes; base detection converged.
- [~] **Breadth predict-then-verify round** (agent reads & guesses flags first, then runs tools, mines surprises — especially false negatives). Done: lodash, axios, rxjs, fastify (~130 sites). Pending: three.js, d3.
  - Base `>`/`>=` detection: **rock-solid** — all three tools agreed on every real site; string-literal `>`, JSDoc `>`, generics, `>>`/`>>>`, `each! > 0` (non-null) all correctly handled. No base false negatives/positives.

---

## Findings from the breadth eval — open bugs/gaps

### ESLint `number-line-range`
- [ ] **FALSE POSITIVE — literal-only shared operand.** `start > 0 || end < 0` (two *different* variables) is rewritten as a range because the only shared operand is the literal `0`. Fix: the shared "variable" must not be a bare `Literal` (and ideally appear in the same structural role). ast-grep avoids this (requires same `$X`). *Correctness bug — highest priority.*
- [ ] **FALSE NEGATIVE — range buried in a 3+ conjunct `&&` chain.** `a && lo <= x && x <= hi` or `lo < x && mid && x < hi`: left-associative parsing splits the two range halves across different `&&` nodes, so the range is missed (the underlying `>`/`>=` is still flagged). Hit in axios `shouldBypassProxy` and lodash `isIndex`.
- [ ] **Over-trigger (sound but maybe misleading).** `maxBodyLength > -1 && data.length > maxBodyLength` shares a middle term, so it's reframed as a range though the intent is two guards. Rewrite is behavior-preserving; decide policy.

### ast-grep / Biome `number-line-range`
- [ ] **Miss inclusive ranges.** Rules match only strict `<`/`>`; they miss `x >= lo && x <= hi` (and mixed/half-open) — e.g. `statusCode >= 100 && statusCode <= 599`. ESLint handles these. Add `>=`/`<=` variants.
- [ ] ast-grep also misses AND-form ranges with call-expression bounds (`x >= min(a,b) && x < max(a,b)`).

### ast-grep impurity tagging
- [ ] **Over-broad.** Every call-operand (even pure `indexOf`) is branded `*-impure` (detect-only, no fix), where ESLint's allowlist would autofix. Harmless (just less helpful); could mirror the pure-call allowlist. Low priority.

### Candidate new fixtures (harvest from eval surprises)
- [ ] `>`/`>=` inside a string literal; inside a JSDoc/block comment — confirm never scanned.
- [ ] Non-null assertion operand: `each! > 0`.
- [ ] Negative-literal bound: `idx > -1` → `-1 < idx`.
- [ ] Inclusive range `x >= 100 && x <= 599`; half-open `x >= 100 && x < 200`.
- [ ] Two-variable OR that looks range-ish: `start > 0 || end < 0` → must NOT range (regression for the FP above).
- [ ] Range buried in 3-conjunct chain → SHOULD range (regression for the FN above).
- [ ] Generics adjacent to a real comparison in one file.

---

## Open / later

### Publishing / consumption
- [x] Repo public; `CONSUMING.md` documents verified install paths without npm-registry publishing.
- [ ] **Recommendation: split `eslint/` into a standalone `eslint-plugin-no-greater-than` repo** so `npm i -D github:owner/repo` works in one step (proven in a throwaway test repo). The subdir layout otherwise forces degit-vendoring. Monorepo stays source-of-truth + mirror-pushes. Decision pending.
- [ ] **Cleanup needed (user):** throwaway public test repo `nitsanavni/ngt-consumer-test-eslint` couldn't be deleted by an agent (token lacks `delete_repo` scope). Delete with `gh auth refresh -h github.com -s delete_repo && gh repo delete nitsanavni/ngt-consumer-test-eslint --yes`.

### Biome limitations
- [!] Native Biome rule (real autofix + interpolated messages) requires forking/building Biome from source — **DECIDED OUT OF SCOPE**.
- [!] GritQL plugin messages cannot interpolate matched operands (static templates only) — verified.

### ast-grep cosmetic
- [ ] Always-parenthesize fix noise (e.g. `(0) < (x)`); could add atomic-operand pattern variants. Quality, low priority — text templates can't branch.

### Eval workflow refinement
- [ ] The graph agent has occasionally listed already-implemented items as actionable leaves. Mitigated with a verify-before-listing instruction; keep watching.
- [x] Concurrent writers (me + agents) each use their own git worktree and push directly to `main` — no serializing on the shared working tree.

---

See [`mikado.md`](mikado.md) for the detailed per-tool correctness/fix Mikado graph.
