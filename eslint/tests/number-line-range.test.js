"use strict";

const { RuleTester } = require("eslint");
const { test } = require("node:test");
const rule = require("../rules/number-line-range");

const ruleTester = new RuleTester({
  languageOptions: { ecmaVersion: 2022, sourceType: "module" },
});

test("number-line-range (RuleTester)", () => {
  ruleTester.run("number-line-range", rule, {
    valid: [
      // already canonical
      "5 < x && x < 10;",
      "x < 5 || 10 < x;",
      // not a relational compound at all
      "a > b;",
      // no shared operand -> not a range
      "x > 5 && y < 10;",
      // both bounds on the same side -> not a number-line range
      "x > 5 && x > 10;",
      "x < 5 && x < 10;",
      // not relational binary expressions
      "a && b;",
    ],
    invalid: [
      // --- between (&&): canonical is lo < x && x < hi ---
      {
        code: "x > 5 && x < 10;",
        output: "5 < x && x < 10;",
        errors: [{ messageId: "range" }],
      },
      {
        code: "x < 10 && x > 5;",
        output: "5 < x && x < 10;",
        errors: [{ messageId: "range" }],
      },
      {
        code: "x >= 5 && x <= 10;",
        output: "5 <= x && x <= 10;",
        errors: [{ messageId: "range" }],
      },
      {
        code: "10 > x && 5 < x;",
        output: "5 < x && x < 10;",
        errors: [{ messageId: "range" }],
      },
      // --- outside (||): canonical is x < lo || hi < x ---
      {
        code: "x < 5 || x > 10;",
        output: "x < 5 || 10 < x;",
        errors: [{ messageId: "range" }],
      },
      {
        code: "x > 10 || x < 5;",
        output: "x < 5 || 10 < x;",
        errors: [{ messageId: "range" }],
      },
      // --- member expression as the shared operand ---
      {
        code: "obj.n > 5 && obj.n < 10;",
        output: "5 < obj.n && obj.n < 10;",
        errors: [{ messageId: "range" }],
      },
      // --- side effects + default (autofixSafeOnly) -> suggestion, no autofix ---
      {
        code: "f() > 5 && f() < 10;",
        output: null,
        errors: [
          {
            messageId: "range",
            suggestions: [
              { messageId: "reorder", output: "5 < f() && f() < 10;" },
            ],
          },
        ],
      },
      // --- side effects + autofixSafeOnly:false -> autofix anyway ---
      {
        code: "f() > 5 && f() < 10;",
        options: [{ autofixSafeOnly: false }],
        output: "5 < f() && f() < 10;",
        errors: [{ messageId: "range" }],
      },
    ],
  });
});
