export const meta = {
  name: "no-greater-than-stress-test",
  description:
    "Run the 3 no-greater-than implementations across open-source repos; collect tool disagreements and edge cases; synthesize proposed new fixtures.",
  whenToUse:
    "Scale-verification for the no-greater-than lint rule. Fan out one agent per repo (clone + run eslint/ast-grep/biome + diff findings), then synthesize edge cases.",
  phases: [
    { title: "Scan", detail: "one agent per repo: clone, run all 3 tools, diff findings" },
    { title: "Synthesize", detail: "cluster disagreements into proposed fixtures" },
  ],
};

// --- absolute locations of the three built implementations (this machine) ---
const ESLINT_DIR = "/Users/nitsanavni/code/no-greater-than/eslint";
const ASTGREP_DIR = "/Users/nitsanavni/code/no-greater-than/ast-grep";
const BIOME_DIR = "/Users/nitsanavni/code/no-greater-than/biome";
const TMP = "/Users/nitsanavni/.claude/jobs/23be6a4b/tmp";

// Default repos: a mix of JS-heavy (many numeric comparisons) and TS/TSX-heavy
// (generics / JSX, which probe parser edge cases). Override via `args`:
// an array of "owner/name" strings or {name,url} objects.
const DEFAULT_REPOS = [
  { name: "lodash", url: "https://github.com/lodash/lodash" },
  { name: "express", url: "https://github.com/expressjs/express" },
  { name: "ky", url: "https://github.com/sindresorhus/ky" },
  { name: "zod", url: "https://github.com/colinhacks/zod" },
  { name: "preact", url: "https://github.com/preactjs/preact" },
  { name: "chalk", url: "https://github.com/chalk/chalk" },
];

function normalizeRepos(input) {
  if (!Array.isArray(input) || input.length === 0) return DEFAULT_REPOS;
  return input.map((r) => {
    if (typeof r === "string") {
      const slug = r.replace(/^https?:\/\/github\.com\//, "").replace(/\.git$/, "");
      return { name: slug.split("/").pop(), url: `https://github.com/${slug}` };
    }
    return r;
  });
}

const REPOS = normalizeRepos(args);

const REPO_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["repo", "scanned", "counts", "tool_errors", "disagreements", "eslint_fix_safe", "notes"],
  properties: {
    repo: { type: "string" },
    scanned: {
      type: "object",
      additionalProperties: false,
      required: ["description", "file_count"],
      properties: {
        description: { type: "string", description: "which dirs/globs were scanned" },
        file_count: { type: "number" },
      },
    },
    counts: {
      type: "object",
      additionalProperties: false,
      required: ["eslint", "astgrep", "biome"],
      properties: {
        eslint: { type: ["number", "null"], description: "flagged sites; null if tool errored out entirely" },
        astgrep: { type: ["number", "null"] },
        biome: { type: ["number", "null"] },
      },
    },
    tool_errors: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["tool", "summary"],
        properties: {
          tool: { type: "string", enum: ["eslint", "astgrep", "biome"] },
          summary: { type: "string" },
          example: { type: "string" },
        },
      },
    },
    disagreements: {
      type: "array",
      description: "sites flagged by some tools but not all (the edge-case signal); cap ~15",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["file", "line", "code", "flagged_by", "not_flagged_by", "likely_cause"],
        properties: {
          file: { type: "string" },
          line: { type: "number" },
          code: { type: "string", description: "the source line (trimmed)" },
          flagged_by: { type: "array", items: { type: "string" } },
          not_flagged_by: { type: "array", items: { type: "string" } },
          likely_cause: { type: "string" },
        },
      },
    },
    eslint_fix_safe: {
      type: "object",
      additionalProperties: false,
      required: ["js_files_checked", "reparse_failures"],
      properties: {
        js_files_checked: { type: "number" },
        reparse_failures: { type: "number" },
        examples: { type: "array", items: { type: "string" } },
      },
    },
    notes: { type: "string" },
  },
};

const SYNTH_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["edge_cases", "framework_gaps", "recommended_fixtures", "summary"],
  properties: {
    edge_cases: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["snippet", "language", "expected", "handling"],
        properties: {
          snippet: { type: "string" },
          language: { type: "string", enum: ["js", "ts", "tsx"] },
          expected: { type: "string", description: "what a correct tool should do" },
          handling: {
            type: "object",
            additionalProperties: false,
            required: ["eslint", "astgrep", "biome"],
            properties: {
              eslint: { type: "string" },
              astgrep: { type: "string" },
              biome: { type: "string" },
            },
          },
        },
      },
    },
    framework_gaps: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["tool", "gap", "evidence"],
        properties: {
          tool: { type: "string", enum: ["eslint", "astgrep", "biome"] },
          gap: { type: "string" },
          evidence: { type: "string" },
        },
      },
    },
    recommended_fixtures: {
      type: "array",
      description: "concrete cases to add to fixtures/cases.json",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["name", "code", "category", "note"],
        properties: {
          name: { type: "string" },
          code: { type: "string" },
          category: { type: "string" },
          note: { type: "string" },
        },
      },
    },
    summary: { type: "string" },
  },
};

function scanPrompt(repo) {
  return `You are stress-testing three implementations of a "no greater-than" lint rule
(flag \`>\` and \`>=\` comparisons) against a real open-source repo, to find where the
tools DISAGREE — disagreement points to parser/edge-case differences worth harvesting.

REPO: ${repo.url}  (name: ${repo.name})

SETUP (use Bash; do NOT reinstall anything — the tools are already built):
1. Shallow clone: git clone --depth 1 ${repo.url} ${TMP}/ngt-${repo.name}
2. cd ${TMP}/ngt-${repo.name}

THREE TOOLS (absolute paths on this machine):

• ESLint — binary: ${ESLINT_DIR}/node_modules/.bin/eslint ; plugin: ${ESLINT_DIR}/index.js
  Write ./ngt.config.mjs in the repo:
    import { createRequire } from "node:module";
    const ngt = createRequire(import.meta.url)("${ESLINT_DIR}/index.js");
    export default [{ plugins:{ngt}, rules:{"ngt/no-greater-than":"warn"},
      languageOptions:{ecmaVersion:2022,sourceType:"module"} }];
  Run with: ${ESLINT_DIR}/node_modules/.bin/eslint --no-config-lookup -c ./ngt.config.mjs --format json <glob>
  IMPORTANT: this config uses the default (espree) parser, so .ts/.tsx files will
  likely throw parse errors — that is itself a FINDING (capture it under tool_errors),
  not a fatal. You may run the clean pass on JS-only globs and note TS failures separately.

• ast-grep — Run: ast-grep scan -c ${ASTGREP_DIR}/sgconfig.yml --json=compact <path>
  (the rules declare language: JavaScript — note how it behaves on .ts/.tsx files.)

• Biome — Run: biome lint --config-path ${BIOME_DIR}/biome.json --reporter=json <path>
  (Biome parses TS/TSX natively. The plugin is detect-only.)

SCOPE: pick a bounded, representative set of source files (e.g. the main src/lib dir and
some .ts/.tsx if present). Report EXACTLY what you scanned (dirs + file count). No silent
truncation — if you cap, say so in notes.

PRODUCE (return the structured object only):
- scanned: what you ran against.
- counts: flagged-site count per tool (null if a tool errored entirely).
- tool_errors: crashes / parse failures, each with a representative example.
- disagreements: up to 15 sites flagged by some tools but not others. For each: file, line,
  the trimmed source line, which tools flagged vs not, and your best-guess cause
  (e.g. "TS generic Array<T> parsed as comparison", "JSX", ".ts file espree cannot parse",
  "type predicate x is T", "right-shift >>", "arrow generic <T,>()=>").
- eslint_fix_safe: copy a sample of JS files, run \`eslint --fix\` on the copies, then
  \`node --check\` each; report js_files_checked, reparse_failures, and examples of any failures.
- notes: anything else interesting.`;
}

function synthPrompt(scans) {
  return `You are given JSON findings from stress-testing three implementations of a
"no greater-than" lint rule across open-source repos:
- eslint  = programmatic ESLint rule (full autofix; espree parser, no TS support configured)
- astgrep = ast-grep YAML rules (language: JavaScript; template fix)
- biome   = Biome GritQL plugin (detect-only; native TS/TSX)

FINDINGS:
${JSON.stringify(scans, null, 2)}

Do the following and return ONLY the structured object:
1. edge_cases: cluster the disagreements/errors into DISTINCT minimal reproducible snippets.
   For each: the snippet, language, what a correct tool SHOULD do (flag real >/>= comparisons;
   ignore TS generics, JSX, shifts, type predicates), and how each tool actually handled it.
2. framework_gaps: systematic gaps (e.g. "eslint config lacks a TS parser so it cannot lint
   .ts/.tsx at all", "ast-grep rule language=JavaScript misparses TS generics as comparisons").
   Each with concrete evidence from the findings.
3. recommended_fixtures: concrete new cases to add to fixtures/cases.json (name, code, category,
   note) that would lock in the edge cases discovered.
4. summary: 3-5 sentences on the headline findings.`;
}

phase("Scan");
const scans = (
  await parallel(
    REPOS.map((r) => () =>
      agent(scanPrompt(r), { schema: REPO_SCHEMA, phase: "Scan", label: `scan:${r.name}` })
    )
  )
).filter(Boolean);

log(`scanned ${scans.length}/${REPOS.length} repos; synthesizing edge cases`);

phase("Synthesize");
const synthesis = await agent(synthPrompt(scans), {
  schema: SYNTH_SCHEMA,
  phase: "Synthesize",
  label: "synthesize",
});

return { repos: REPOS.map((r) => r.name), scans, synthesis };
