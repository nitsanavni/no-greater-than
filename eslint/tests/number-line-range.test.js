"use strict";

const { RuleTester } = require("eslint");
const { describe, it } = require("node:test");
const rule = require("../rules/number-line-range");

RuleTester.describe = describe;
RuleTester.it = it;

const ruleTester = new RuleTester({
  languageOptions: { ecmaVersion: 2022, sourceType: "module" },
});

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
      // BUG 1 (false positive): the only shared operand is a *literal* (0),
      // not a real variable. `start`/`end` are distinct, so this is NOT a range.
      "start > 0 || end < 0;",
      "a > 1 && b < 10;",
      // shared literal across distinct variables must not pose as the variable
      "p < 0 && q > 0;",
      // a buried range that is already in canonical order -> nothing to fix
      "a && lo < x && x < hi;",
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
      // --- BUG 2 (false negative): range buried in a longer && chain ---
      // `a && lo <= x && x <= hi` parses as `(a && lo<=x) && x<=hi`; the two
      // halves are not children of one node. Reorder the pair in place,
      // preserving the other conjunct.
      {
        code: "a && x <= hi && lo <= x;",
        output: "a && lo <= x && x <= hi;",
        errors: [{ messageId: "range" }],
      },
      // halves split across an unrelated conjunct `mid`; reorder lo/hi into
      // canonical slots (lower bound at the earlier slot, upper at the later),
      // leaving `mid` untouched.
      {
        code: "x < hi && mid && lo < x;",
        output: "lo < x && mid && x < hi;",
        errors: [{ messageId: "range" }],
      },
      // outside range buried in an || chain
      {
        code: "a || x > hi || x < lo;",
        output: "a || x < lo || hi < x;",
        errors: [{ messageId: "range" }],
      },
    ],
});
