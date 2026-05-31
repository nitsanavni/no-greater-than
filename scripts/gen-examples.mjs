#!/usr/bin/env node
// Generate EXAMPLES.md (a "before -> better" table) from the single source of
// truth, fixtures/cases.json — the same file that drives the tests.
//   node scripts/gen-examples.mjs
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const cases = JSON.parse(readFileSync(join(root, "fixtures/cases.json"), "utf8"));

const esc = (s) => "`" + s.replace(/\|/g, "\\|") + "`";

const lines = [
  "# Examples: before → better",
  "",
  "> Generated from [`fixtures/cases.json`](fixtures/cases.json) by `scripts/gen-examples.mjs` — do not edit by hand.",
  "> The same cases drive the test suites, so these examples are guaranteed to match real behavior.",
  "",
  "## Flagged — flip to read like a number line",
  "",
  "| Before | Better | Auto-fixed? | Note |",
  "| --- | --- | --- | --- |",
];

for (const c of cases.shouldFlag) {
  const auto = c.autofixable ? "yes" : "suggestion only";
  lines.push(`| ${esc(c.code)} | ${esc(c.expected)} | ${auto} | ${c.note || ""} |`);
}

lines.push(
  "",
  "“suggestion only” means an operand has a side effect, so the tools that guard for it",
  "(eslint, ast-grep) report the rewrite but don't apply it automatically.",
  "",
  "## Left as-is — correctly NOT flagged",
  "",
  "| Code | Why |",
  "| --- | --- |"
);

for (const c of cases.shouldNotFlag) {
  lines.push(`| ${esc(c.code)} | ${c.note || ""} |`);
}

lines.push(
  "",
  "## Ranges — order like a number line",
  "",
  "| Before | Better | Auto-fixed? | Note |",
  "| --- | --- | --- | --- |"
);

for (const c of cases.ranges) {
  const auto = c.autofixable ? "yes" : "suggestion only";
  lines.push(`| ${esc(c.code)} | ${esc(c.expected)} | ${auto} | ${c.note || ""} |`);
}

lines.push(
  "",
  "## Ranges already in number-line order (not flagged)",
  "",
  "| Code | Why |",
  "| --- | --- |"
);

for (const c of cases.rangesOk) {
  lines.push(`| ${esc(c.code)} | ${c.note || ""} |`);
}

lines.push("");
writeFileSync(join(root, "EXAMPLES.md"), lines.join("\n"));
console.log(
  `EXAMPLES.md generated: ${cases.shouldFlag.length} flagged + ${cases.shouldNotFlag.length} not-flagged + ${cases.ranges.length} range + ${cases.rangesOk.length} range-ok cases.`
);
