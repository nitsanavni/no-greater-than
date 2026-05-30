"use strict";

const { RuleTester } = require("eslint");
const { test } = require("node:test");
const rule = require("../rules/no-greater-than");

const ruleTester = new RuleTester({
  languageOptions: { ecmaVersion: 2022, sourceType: "module" },
});

test("no-greater-than (RuleTester)", () => {
  ruleTester.run("no-greater-than", rule, {
    valid: [
      "a < b;",
      "a <= b;",
      "5 < x && x < 10;",
      "x < 5 || 10 < x;",
      "a === b;",
      "a !== b;",
      "a >> b;",
      "a >>> b;",
    ],
    invalid: [
      // --- simple, both operands safe -> autofix ---
      { code: "a > b;", output: "b < a;", errors: [{ messageId: "noGreaterThan" }] },
      { code: "a >= b;", output: "b <= a;", errors: [{ messageId: "noGreaterThan" }] },
      { code: "x > 5;", output: "5 < x;", errors: [{ messageId: "noGreaterThan" }] },
      { code: "foo.bar > 10;", output: "10 < foo.bar;", errors: 1 },
      { code: "arr[i] >= count;", output: "count <= arr[i];", errors: 1 },

      // --- precedence: moved operand must be parenthesized ---
      { code: "a + 1 > b * 2;", output: "(b * 2) < (a + 1);", errors: 1 },
      { code: "(a || b) > c;", output: "c < (a || b);", errors: 1 },

      // --- part of a compound range condition ---
      { code: "5 < x && x > 1;", output: "5 < x && 1 < x;", errors: 1 },

      // --- side effects + default (autofixSafeOnly) -> suggestion, no autofix ---
      {
        code: "foo() > b;",
        output: null,
        errors: [
          {
            messageId: "noGreaterThan",
            suggestions: [{ messageId: "flip", output: "b < foo();" }],
          },
        ],
      },
      {
        code: "count++ > limit;",
        output: null,
        errors: [
          {
            messageId: "noGreaterThan",
            suggestions: [{ messageId: "flip", output: "limit < count++;" }],
          },
        ],
      },

      // --- side effects + autofixSafeOnly:false -> autofix anyway ---
      {
        code: "foo() > b;",
        options: [{ autofixSafeOnly: false }],
        output: "b < foo();",
        errors: 1,
      },
    ],
  });
});
