"use strict";

const noGreaterThan = require("./rules/no-greater-than");

const plugin = {
  meta: {
    name: "eslint-plugin-no-greater-than",
    version: "0.1.0",
  },
  rules: {
    "no-greater-than": noGreaterThan,
  },
};

// Flat-config preset: spread `...plugin.configs.recommended` to enable the rule.
plugin.configs = {
  recommended: {
    plugins: { "no-greater-than": plugin },
    rules: { "no-greater-than/no-greater-than": "warn" },
  },
};

module.exports = plugin;
