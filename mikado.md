# GOAL: all three no-greater-than tools are fair & correct across the corpus

- [x] confirm the corpus ground truth (8 real >/>= sites: 145, 154, 158, 505, 562, 687, 865, 946; 3 TS-generic non-sites correctly ignored: 361, 609, 719)
- [x] eslint: detection correct (TS parser configured, all 8 flagged, generics ignored)
  - [x] eslint: improve fix coverage / documentation
    - [x] auto-fix when RHS is a known-pure builtin call (Date.parse etc.) — done via PURE_STATIC_CALLS allowlist (commit e2c14cc)
    - [x] confirm literal-on-left flips like '0 < x' match the number-line intent (current output correct)
- [ ] biome: reach parity with eslint
  - [x] biome: detection correct (native TS parsing, all 8 flagged, no generic false positives)
  - [!] biome: implement autofix/rewrite — BLOCKED: Biome v2 GritQL plugins cannot emit fixes yet (framework limitation, not ours). Detect-only by design.
  - [x] biome: keep GritQL pattern targeting only relational binary expressions (already confirmed)
- [x] astgrep: fix total false-negative (was broken on every TS site)
  - [x] add TypeScript rule variants so $A > $B / $A >= $B match .ts source (rules/*-ts.yml)
  - [x] regression test: TS parser does NOT match generic type-args (Array<T>, Promise<unknown>, WeakMap<…>) — rule-tests/*-ts-test.yml
  - [x] add Tsx rule variants so .tsx (JSX + arrow-generics) is covered (rules/*-tsx.yml)
