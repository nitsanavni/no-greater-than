# workflows/

Claude Code **Workflow** scripts for scale-verifying the rule.

## `stress-test.mjs`

Fans out one agent per open-source repo to clone it and run all three
implementations (ESLint, ast-grep, Biome), then diffs their findings to surface
**disagreements** (where tools flag different sites — the edge-case signal). A
final synthesis agent clusters those into proposed new fixtures.

It is run via Claude Code's Workflow tool (not a standalone node script — it uses
the `agent()` / `parallel()` / `phase()` workflow globals):

- Default repos: lodash, express, ky, zod, preact, chalk (JS-heavy + TS/TSX-heavy).
- Override by passing `args` = array of `"owner/name"` strings or `{name,url}` objects.

Output: per-repo findings (counts, tool errors, disagreements, eslint `--fix`
re-parse safety) plus a synthesis (edge cases, framework gaps, recommended fixtures).
The orchestrator reviews the synthesis and folds good cases into
[`../fixtures/cases.json`](../fixtures/cases.json).
