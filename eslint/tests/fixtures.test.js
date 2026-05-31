"use strict";

// Drives the ESLint rule from the repo-wide shared fixtures (../../fixtures/cases.json),
// so all three implementations are exercised against the same canonical cases.

const { Linter } = require("eslint");
const { test } = require("node:test");
const assert = require("node:assert");
const plugin = require("../index.js");
const cases = require("../../fixtures/cases.json");

const linter = new Linter();
const config = [
  {
    plugins: { ngt: plugin },
    rules: { "ngt/no-greater-than": "error" },
    languageOptions: { ecmaVersion: 2022, sourceType: "module" },
  },
];

test("shouldFlag cases are detected", () => {
  for (const c of cases.shouldFlag) {
    const messages = linter.verify(c.code, config);
    assert.ok(
      messages.length >= 1,
      `expected "${c.code}" to be flagged, got none`
    );
    for (const m of messages) {
      assert.equal(m.ruleId, "ngt/no-greater-than", `unexpected rule for "${c.code}"`);
    }
  }
});

test("autofixable cases rewrite to the expected form", () => {
  for (const c of cases.shouldFlag) {
    if (!c.autofixable) continue;
    const messages = linter.verify(c.code, config);
    const { output, fixed } = linter.verifyAndFix(c.code, config);
    assert.ok(fixed, `expected "${c.code}" to be autofixed`);
    // Single-operator cases settle on exactly the documented rewrite.
    // The nested `a > b > c` case produces multiple fixes across passes;
    // we only assert that it gets fixed (above), not the exact final text.
    if (messages.length === 1) {
      assert.equal(output, c.expected, `rewrite mismatch for "${c.code}"`);
    }
  }
});

test("side-effect cases are flagged but NOT autofixed; a suggestion is offered", () => {
  for (const c of cases.shouldFlag) {
    if (c.autofixable) continue;
    const messages = linter.verify(c.code, config);
    assert.equal(messages.length, 1, `expected one message for "${c.code}"`);
    const { fixed } = linter.verifyAndFix(c.code, config);
    assert.ok(!fixed, `expected NO autofix for side-effecting "${c.code}"`);
    const suggestions = messages[0].suggestions || [];
    assert.equal(suggestions.length, 1, `expected one suggestion for "${c.code}"`);
    assert.equal(
      suggestions[0].fix.text,
      c.expected,
      `suggestion mismatch for "${c.code}"`
    );
  }
});

test("shouldNotFlag cases produce no reports", () => {
  for (const c of cases.shouldNotFlag) {
    const messages = linter.verify(c.code, config);
    assert.equal(messages.length, 0, `expected "${c.code}" to be clean, got: ${JSON.stringify(messages)}`);
  }
});

// Separate flat config enabling ONLY number-line-range, so it doesn't fire
// alongside no-greater-than (which would also flag the bare `>` operands).
const rangeConfig = [
  {
    plugins: { ngt: plugin },
    rules: { "ngt/number-line-range": "error" },
    languageOptions: { ecmaVersion: 2022, sourceType: "module" },
  },
];

test("ranges cases are flagged by number-line-range", () => {
  for (const c of cases.ranges) {
    const messages = linter.verify(c.code, rangeConfig);
    assert.ok(
      messages.length >= 1,
      `expected "${c.code}" to be flagged, got none`
    );
    for (const m of messages) {
      assert.equal(
        m.ruleId,
        "ngt/number-line-range",
        `unexpected rule for "${c.code}"`
      );
    }
  }
});

test("autofixable ranges rewrite to the expected number-line order", () => {
  for (const c of cases.ranges) {
    if (!c.autofixable) continue;
    const { output, fixed } = linter.verifyAndFix(c.code, rangeConfig);
    assert.ok(fixed, `expected "${c.code}" to be autofixed`);
    assert.equal(output, c.expected, `range rewrite mismatch for "${c.code}"`);
  }
});

test("side-effecting ranges are NOT autofixed; a suggestion is offered", () => {
  for (const c of cases.ranges) {
    if (c.autofixable) continue;
    const messages = linter.verify(c.code, rangeConfig);
    assert.equal(messages.length, 1, `expected one message for "${c.code}"`);
    const { fixed } = linter.verifyAndFix(c.code, rangeConfig);
    assert.ok(!fixed, `expected NO autofix for side-effecting "${c.code}"`);
    const suggestions = messages[0].suggestions || [];
    assert.equal(suggestions.length, 1, `expected one suggestion for "${c.code}"`);
    assert.equal(
      suggestions[0].fix.text,
      c.expected,
      `suggestion mismatch for "${c.code}"`
    );
  }
});

test("rangesOk cases produce no number-line-range reports", () => {
  for (const c of cases.rangesOk) {
    const messages = linter.verify(c.code, rangeConfig);
    assert.equal(
      messages.length,
      0,
      `expected "${c.code}" to be clean, got: ${JSON.stringify(messages)}`
    );
  }
});
