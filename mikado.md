# GOAL: all three no-greater-than tools are fair & correct across the corpus

- [x] confirm the corpus ground truth (8 real >/>= sites: 145, 154, 158, 505, 562, 687, 865, 946; 3 TS-generic non-sites correctly ignored: 361, 609, 719)
- [x] eslint: detection correct (TS parser configured, all 8 flagged, generics ignored)
  - [ ] eslint: improve fix coverage / documentation
    - [ ] auto-fix line 562 when RHS is a known-pure builtin call (e.g. Date.parse), or document why call-expression operands downgrade to suggestion-only (eslint) @leaf
    - [ ] confirm literal-on-left flips like '0 < x' match the rule's number-line reading intent (current output is correct) (eslint) @leaf
- [ ] biome: reach parity with eslint
  - [x] biome: detection correct (native TS parsing, all 8 flagged, no generic false positives)
  - [ ] biome: implement autofix/rewrite emitting the flipped expression so it can be applied, not just reported (biome) @leaf
  - [ ] biome: keep GritQL pattern targeting only relational binary expressions (>, >=), not type-level syntax (already confirmed) (biome) @leaf
- [ ] astgrep: fix total false-negative (currently broken on every site)
  - [ ] change 'language: JavaScript' to 'language: TypeScript' in both YAML rule files under /Users/nitsanavni/code/no-greater-than/ast-grep/rules/*.yml so $A > $B and $A >= $B patterns match the .ts source (astgrep) @leaf
  - [ ] add a regression test confirming the TS parser does NOT match generic type-args (lines 361/609/719: WeakMap<Response, Request>, Promise<unknown>) as binary comparisons after the language switch (astgrep) @leaf
  - [ ] provide both a TypeScript and a Tsx rule variant (or run with --lang) so .tsx files are also covered (astgrep) @leaf
