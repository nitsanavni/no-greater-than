"use strict";

const { isSideEffectFree, operandText } = require("./_shared");

/** Build the `<`/`<=` rewrite for a `>`/`>=` node (flip the operands). */
function buildRewrite(node, sourceCode) {
  const newOp = node.operator === ">" ? "<" : "<=";
  const left = operandText(node.left, sourceCode);
  const right = operandText(node.right, sourceCode);
  return `${right} ${newOp} ${left}`;
}

/** @type {import('eslint').Rule.RuleModule} */
module.exports = {
  meta: {
    type: "suggestion",
    docs: {
      description:
        "Disallow `>` and `>=`; rewrite as `<`/`<=` so comparisons read like a number line.",
      recommended: false,
      url: "https://github.com/nitsanavni/no-greater-than/tree/main/eslint",
    },
    fixable: "code",
    hasSuggestions: true,
    schema: [
      {
        type: "object",
        properties: {
          // When true (default), only autofix if both operands are
          // side-effect-free; otherwise offer a manual suggestion so the
          // human decides whether the eval-order change is acceptable.
          // Set false to autofix unconditionally.
          autofixSafeOnly: { type: "boolean" },
        },
        additionalProperties: false,
      },
    ],
    messages: {
      noGreaterThan:
        "Use '{{newOp}}' instead of '{{op}}' so the comparison reads like a number line. Rewrite as: {{rewrite}}",
      flip: "Flip to '{{rewrite}}'",
    },
  },

  create(context) {
    const sourceCode = context.sourceCode || context.getSourceCode();
    const options = context.options[0] || {};
    const autofixSafeOnly = options.autofixSafeOnly !== false; // default true

    function check(node) {
      if (node.operator !== ">" && node.operator !== ">=") return;

      const rewrite = buildRewrite(node, sourceCode);
      const newOp = node.operator === ">" ? "<" : "<=";
      const safe = isSideEffectFree(node.left) && isSideEffectFree(node.right);
      const shouldAutofix = safe || !autofixSafeOnly;

      const operatorToken = sourceCode.getTokenAfter(
        node.left,
        (t) => t.type === "Punctuator" && t.value === node.operator
      );

      const applyFix = (fixer) => fixer.replaceText(node, rewrite);

      context.report({
        node,
        loc: operatorToken ? operatorToken.loc : node.loc,
        messageId: "noGreaterThan",
        data: { op: node.operator, newOp, rewrite },
        fix: shouldAutofix ? applyFix : null,
        // When we won't autofix (side effects + safe-only mode), still offer
        // the rewrite as an opt-in suggestion.
        suggest: shouldAutofix
          ? undefined
          : [{ messageId: "flip", data: { rewrite }, fix: applyFix }],
      });
    }

    return { BinaryExpression: check };
  },
};
