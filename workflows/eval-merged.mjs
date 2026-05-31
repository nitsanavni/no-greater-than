export const meta = {
  name: "ngt-eval-merged",
  description: "Merged eval: per-FILE Scout(grep+predict) -> Verify(run 3 tools) -> Judge(surprises) ; then Graph -> Fix(worktree, commit if green) -> Reconcile. Predict-first is the audit oracle.",
  phases: [
    { title: "Discover", detail: "clone repo, grep files containing > / >=" },
    { title: "Scout+Verify+Judge", detail: "per file: predict-first, run tools, diff into surprises" },
    { title: "Graph", detail: "fold confirmed findings into mikado.md" },
    { title: "Fix", detail: "attempt the top fixable finding in a worktree; commit if green" },
    { title: "Reconcile", detail: "fold the attempt back into the graph" },
  ],
};

const REPO_DIR = "/Users/nitsanavni/code/no-greater-than";
const ESLINT_DIR = REPO_DIR + "/eslint";
const ESLINT_BIN = ESLINT_DIR + "/node_modules/.bin/eslint";
const ASTGREP_CFG = REPO_DIR + "/ast-grep/sgconfig.yml";
const BIOME_CFG = REPO_DIR + "/biome/biome.json";
const GRAPH = REPO_DIR + "/internal-docs/mikado.md";
const TMP = "/Users/nitsanavni/.claude/jobs/23be6a4b/tmp";

const REPO = args && args.url ? args : { name: "immer", url: "https://github.com/immerjs/immer" };
const MAX_FILES = (args && args.maxFiles) || 5;

const ESLINT_CONFIG = `import { createRequire } from "node:module";
const require = createRequire("${ESLINT_DIR}/package.json");
const ngt = require("./index.js");
const tsParser = require("@typescript-eslint/parser");
export default [
  { plugins: { ngt }, rules: { "ngt/no-greater-than": "warn", "ngt/number-line-range": "warn" } },
  { files: ["**/*.{js,mjs,cjs,jsx}"], languageOptions: { ecmaVersion: 2022, sourceType: "module" } },
  { files: ["**/*.{ts,tsx,mts,cts}"], languageOptions: { parser: tsParser, parserOptions: { ecmaFeatures: { jsx: true } } } },
];`;

const DISCOVER_SCHEMA = {
  type: "object", additionalProperties: false, required: ["repo_dir", "config_path", "files"],
  properties: {
    repo_dir: { type: "string" }, config_path: { type: "string" },
    files: { type: "array", items: { type: "string" }, description: "absolute paths, most >/>=-dense first" },
  },
};
const SCOUT_SCHEMA = {
  type: "object", additionalProperties: false, required: ["file", "predictions"],
  properties: {
    file: { type: "string" },
    predictions: { type: "array", items: {
      type: "object", additionalProperties: false, required: ["line", "code", "should_flag", "is_range", "side_effecting"],
      properties: {
        line: { type: "number" }, code: { type: "string" },
        should_flag: { type: "boolean", description: "real >/>= comparison (not generic/JSX/shift/string/comment)" },
        rewrite: { type: "string", description: "the < / <= number-line rewrite you expect, if any" },
        is_range: { type: "boolean" }, side_effecting: { type: "boolean" },
      } } },
  },
};
const VERIFY_SCHEMA = {
  type: "object", additionalProperties: false, required: ["file", "eslint", "astgrep", "biome"],
  properties: {
    file: { type: "string" },
    eslint: { $ref: "#/$defs/flags" }, astgrep: { $ref: "#/$defs/flags" }, biome: { $ref: "#/$defs/flags" },
  },
  $defs: { flags: { type: "array", items: {
    type: "object", additionalProperties: false, required: ["line", "code"],
    properties: { line: { type: "number" }, code: { type: "string" }, fix: { type: "string" }, rule: { type: "string" } } } } },
};
const JUDGE_SCHEMA = {
  type: "object", additionalProperties: false, required: ["file", "surprises", "findings"],
  properties: {
    file: { type: "string" },
    surprises: { type: "array", items: {
      type: "object", additionalProperties: false, required: ["line", "code", "type", "tools", "insight"],
      properties: {
        line: { type: "number" }, code: { type: "string" },
        type: { type: "string", enum: ["false_negative", "false_positive", "fix_wrong", "range_missed", "other"] },
        tools: { type: "array", items: { type: "string" }, description: "tools exhibiting it" },
        insight: { type: "string" },
      } } },
    findings: { type: "array", description: "confirmed, actionable per-tool issues", items: {
      type: "object", additionalProperties: false, required: ["tool", "kind", "summary"],
      properties: {
        tool: { type: "string", enum: ["eslint", "astgrep", "biome"] },
        kind: { type: "string", enum: ["correctness", "quality", "docs"] },
        summary: { type: "string" },
      } } },
  },
};
const GRAPH_SCHEMA = {
  type: "object", additionalProperties: false, required: ["graph_path", "leaves"],
  properties: {
    graph_path: { type: "string" },
    leaves: { type: "array", items: {
      type: "object", additionalProperties: false, required: ["text", "tool", "kind", "confidence"],
      properties: {
        text: { type: "string" }, tool: { type: "string", enum: ["eslint", "astgrep", "biome", "harness"] },
        kind: { type: "string", enum: ["correctness", "quality", "docs"] }, confidence: { type: "string", enum: ["high", "medium", "low"] },
      } } },
  },
};
const ATTEMPT_SCHEMA = {
  type: "object", additionalProperties: false, required: ["leaf", "outcome", "tests_summary", "commit"],
  properties: {
    leaf: { type: "string" }, outcome: { type: "string", enum: ["green", "blocked", "skipped"] },
    tests_summary: { type: "string" }, commit: { type: ["string", "null"] },
  },
};

const discoverPrompt = () => `FIRST sync the tools repo so the eval uses CURRENT rules (agents push fixes via
worktrees, so ${REPO_DIR}'s working tree can lag origin):
  git -C ${REPO_DIR} fetch -q origin && git -C ${REPO_DIR} checkout -q main && git -C ${REPO_DIR} merge --ff-only origin/main
(If the ff-merge fails due to local changes, report and stop — do not force.)

Then clone ${REPO.url} (${REPO.name}) shallow into ${TMP}/em-${REPO.name}.
Use ripgrep to find source files containing real \`>\`/\`>=\` comparisons (exclude pure-doc files). Return up to ${MAX_FILES}
ABSOLUTE file paths, the most comparison-dense first (prefer a mix: numeric/range-y and TS/generic). Also write
${TMP}/em-${REPO.name}/ngt.config.mjs with EXACTLY this content, and return its absolute path:
---
${ESLINT_CONFIG}
---`;

const scoutPrompt = (file) => `SCOUT one file — predict BEFORE running any tool (you are the independent oracle).
FILE: ${file}
Use \`rg -n '>=?'\` (and read context) to locate every \`>\`/\`>=\` site. For EACH, decide on your own judgment:
should_flag (a real relational comparison? NOT a TS generic \`<T>\`, JSX, bit-shift \`>>\`, string/comment text),
the < / <= rewrite you expect, is_range (part of a two-sided range), side_effecting (an operand calls/mutates).
Do NOT run eslint/ast-grep/biome. Return your predictions only.`;

const verifyPrompt = (file, cfg) => `Run the three tools on ONE file and report what each flags (no judgment).
FILE: ${file}
- eslint:  ${ESLINT_BIN} --no-config-lookup -c ${cfg} --format json ${file}
- ast-grep: ast-grep scan -c ${ASTGREP_CFG} --json=compact ${file}
- biome:   biome lint --config-path ${BIOME_CFG} --reporter=json ${file}
Return each tool's flagged sites {line, code, fix?, rule?}.`;

const judgePrompt = (file, scout, verify) => `JUDGE one file: compare the SCOUT's predictions (independent oracle) to the TOOLS' output. NO Bash/tools.
FILE: ${file}
PREDICTIONS: ${JSON.stringify(scout.predictions)}
TOOLS: ${JSON.stringify({ eslint: verify.eslint, astgrep: verify.astgrep, biome: verify.biome })}
A SURPRISE is any mismatch — especially a FALSE NEGATIVE (you predicted should_flag but a tool missed it). Also note
false_positive, fix_wrong, range_missed. Then distill confirmed, actionable per-tool findings (tool, kind, summary).
Be precise; only report genuine issues (remember \`a>b\` ≡ \`b<a\`; only re-parse breakage or reordering two
side-effecting operands is truly unsafe).`;

const graphPrompt = (findings) => `Update the Mikado graph (nested checkbox outline) at ${GRAPH}.
Read it; fold in these confirmed findings (dedupe; VERIFY against current source — use Read on eslint/rules/*, ast-grep/rules/*,
biome/*.grit — and do NOT list anything already implemented):
${JSON.stringify(findings)}
Write it back. Return graph_path and the ACTIONABLE (verified-not-done) leaves with text, tool, kind, confidence.`;

const attemptPrompt = (leaf) => `Attempt ONE Mikado leaf in your OWN git worktree of ${REPO_DIR}; commit to main if green, else revert.
  git -C ${REPO_DIR} fetch -q origin
  git -C ${REPO_DIR} worktree add --detach ${TMP}/em-wt origin/main && cd ${TMP}/em-wt
LEAF: "${leaf.text}" (tool ${leaf.tool}, ${leaf.kind}/${leaf.confidence})
Make the smallest TDD change (test first). Run that tool's tests (eslint: cd eslint && node --test ; ast-grep: cd ast-grep && ast-grep test).
GREEN -> stage only your files, commit (body ends: Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>),
then: git push origin HEAD:main || (git fetch -q origin && git rebase origin/main && git push origin HEAD:main).
BLOCKED -> git checkout -- . and remove any new files. Then: cd ${REPO_DIR} && git worktree remove --force ${TMP}/em-wt.
No loop. Return leaf, outcome, tests_summary, commit hash or null.`;

phase("Discover");
const disc = await agent(discoverPrompt(), { schema: DISCOVER_SCHEMA, label: `discover:${REPO.name}`, phase: "Discover" });

phase("Scout+Verify+Judge");
const perFile = await pipeline(
  (disc.files || []).slice(0, MAX_FILES),
  (file) => agent(scoutPrompt(file), { schema: SCOUT_SCHEMA, label: `scout:${file.split("/").pop()}`, phase: "Scout+Verify+Judge" }),
  (scout, file) => agent(verifyPrompt(file, disc.config_path), { schema: VERIFY_SCHEMA, label: `verify:${file.split("/").pop()}`, phase: "Scout+Verify+Judge" })
    .then((verify) => agent(judgePrompt(file, scout, verify), { schema: JUDGE_SCHEMA, label: `judge:${file.split("/").pop()}`, phase: "Scout+Verify+Judge" }))
);

const findings = perFile.filter(Boolean).flatMap((j) => j.findings || []);
const surprises = perFile.filter(Boolean).flatMap((j) => (j.surprises || []).map((s) => ({ ...s, file: j.file })));
log(`${surprises.length} surprises, ${findings.length} findings across ${perFile.filter(Boolean).length} files`);

phase("Graph");
const graph = findings.length
  ? await agent(graphPrompt(findings), { schema: GRAPH_SCHEMA, label: "graph", phase: "Graph" })
  : { leaves: [] };

phase("Fix");
const kr = { correctness: 0, quality: 1, docs: 2 }, cr = { high: 0, medium: 1, low: 2 };
const leaf = (graph.leaves || []).filter((l) => l.tool !== "harness")
  .sort((a, b) => (kr[a.kind] - kr[b.kind]) || (cr[a.confidence] - cr[b.confidence]))[0] || null;
const attempt = leaf ? await agent(attemptPrompt(leaf), { schema: ATTEMPT_SCHEMA, label: `fix:${leaf.tool}`, phase: "Fix" }) : null;

phase("Reconcile");
if (attempt) {
  await agent(`Reconcile into ${GRAPH}: leaf "${leaf.text}" -> outcome ${attempt.outcome}${attempt.commit ? " (commit " + attempt.commit + ")" : ""}. Read it, mark [x]/[!] accordingly, write back. One-line confirmation.`, { label: "reconcile", phase: "Reconcile" });
}

return { repo: REPO.name, files: perFile.filter(Boolean).map((j) => j.file), surprises, findings, selected_leaf: leaf, attempt };
