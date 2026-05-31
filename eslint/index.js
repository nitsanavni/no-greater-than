"use strict";

const noGreaterThan = require("./rules/no-greater-than");
const numberLineRange = require("./rules/number-line-range");

const plugin = {
  meta: {
    name: "eslint-plugin-no-greater-than",
    version: "0.1.0",
  },
  rules: {
    "no-greater-than": noGreaterThan,
    "number-line-range": numberLineRange,
  },
};

// Flat-config preset: spread `...plugin.configs.recommended` to enable the rule.
plugin.configs = {
  recommended: {
    plugins: { "no-greater-than": plugin },
    rules: {
      "no-greater-than/no-greater-than": "warn",
      "no-greater-than/number-line-range": "warn",
    },
  },
};

module.exports = plugin;
