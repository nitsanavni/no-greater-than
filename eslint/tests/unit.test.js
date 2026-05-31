"use strict";

const { RuleTester } = require("eslint");
const { describe, it } = require("node:test");
const rule = require("../rules/no-greater-than");

RuleTester.describe = describe;
RuleTester.it = it;

const ruleTester = new RuleTester({
  languageOptions: { ecmaVersion: 2022, sourceType: "module" },
});

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

      // --- known-pure global static calls -> safe to autofix ---
      {
        code: "after >= Date.parse('2024-01-01');",
        output: "Date.parse('2024-01-01') <= after;",
        errors: 1,
      },
      { code: "x > Math.max(a, b);", output: "Math.max(a, b) < x;", errors: 1 },
      {
        code: "x >= Number.parseInt(s);",
        output: "Number.parseInt(s) <= x;",
        errors: 1,
      },
      // --- non-deterministic / clock / spread builtins stay suggestion-only ---
      {
        code: "x > Math.random();",
        output: null,
        errors: [{ messageId: "noGreaterThan", suggestions: [{ messageId: "flip", output: "Math.random() < x;" }] }],
      },
      {
        code: "x > Date.now();",
        output: null,
        errors: [{ messageId: "noGreaterThan", suggestions: [{ messageId: "flip", output: "Date.now() < x;" }] }],
      },
      {
        code: "x > Math.max(...xs);",
        output: null,
        errors: [{ messageId: "noGreaterThan", suggestions: [{ messageId: "flip", output: "Math.max(...xs) < x;" }] }],
      },

      // --- known-pure instance accessors -> safe to autofix ---
      {
        code: "a.getTime() >= b.getTime();",
        output: "b.getTime() <= a.getTime();",
        errors: 1,
      },
      {
        code: "_date.getTime() >= startOfNextYear.getTime();",
        output: "startOfNextYear.getTime() <= _date.getTime();",
        errors: 1,
      },
      { code: "d.valueOf() > 0;", output: "0 < d.valueOf();", errors: 1 },
      {
        code: "a.getFullYear() > b.getFullYear();",
        output: "b.getFullYear() < a.getFullYear();",
        errors: 1,
      },
      // --- pure Array/String read methods -> safe to autofix ---
      {
        code: "urls.indexOf(x) >= urls.length - 1;",
        output: "(urls.length - 1) <= urls.indexOf(x);",
        errors: 1,
      },
      {
        code: "s.lastIndexOf('/') > 0;",
        output: "0 < s.lastIndexOf('/');",
        errors: 1,
      },
      { code: "arr.includes(v) > flag;", output: "flag < arr.includes(v);", errors: 1 },
      { code: "s.charAt(0) > 'm';", output: "'m' < s.charAt(0);", errors: 1 },
      { code: "s.slice(1) > t;", output: "t < s.slice(1);", errors: 1 },
      // arg has side effects -> stays suggestion-only
      {
        code: "urls.indexOf(pop()) > 0;",
        output: null,
        errors: [{ messageId: "noGreaterThan", suggestions: [{ messageId: "flip", output: "0 < urls.indexOf(pop());" }] }],
      },
      // mutating sibling (splice) is not on the allowlist -> suggestion-only
      {
        code: "arr.splice(0, 1) > x;",
        output: null,
        errors: [{ messageId: "noGreaterThan", suggestions: [{ messageId: "flip", output: "x < arr.splice(0, 1);" }] }],
      },

      // --- unknown / mutating instance methods stay suggestion-only ---
      {
        code: "d.setTime(t) > x;",
        output: null,
        errors: [{ messageId: "noGreaterThan", suggestions: [{ messageId: "flip", output: "x < d.setTime(t);" }] }],
      },
      {
        code: "obj.compute() > x;",
        output: null,
        errors: [{ messageId: "noGreaterThan", suggestions: [{ messageId: "flip", output: "x < obj.compute();" }] }],
      },
      // receiver itself has side effects -> not safe even with pure accessor name
      {
        code: "make().getTime() > x;",
        output: null,
        errors: [{ messageId: "noGreaterThan", suggestions: [{ messageId: "flip", output: "x < make().getTime();" }] }],
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
