"use strict";

const { isSideEffectFree, operandText, flipOp } = require("./_shared");

const REL = new Set(["<", "<=", ">", ">="]);

/**
 * Classify one comparison relative to the shared operand text `S` (the variable
 * being bounded), normalized to "x on the left" form. Returns
 * { side: 'less'|'greater', op, boundNode, varNode } or null if it isn't a
 * relational comparison involving `S`.
 *   x < hi / x <= hi -> { side: 'less',    op, bound: hi }
 *   x > lo / x >= lo -> { side: 'greater', op, bound: lo }
 */
function classify(cmp, S, sourceCode) {
  if (cmp.type !== "BinaryExpression" || !REL.has(cmp.operator)) return null;
  const leftText = sourceCode.getText(cmp.left);
  const rightText = sourceCode.getText(cmp.right);
  let op, boundNode, varNode;
  if (leftText === S) {
    op = cmp.operator;
    boundNode = cmp.right;
    varNode = cmp.left;
  } else if (rightText === S) {
    op = flipOp(cmp.operator); // x was on the right; mirror to x-on-left form
    boundNode = cmp.left;
    varNode = cmp.right;
  } else {
    return null;
  }
  const side = op === "<" || op === "<=" ? "less" : "greater";
  return { side, op, boundNode, varNode };
}

/** The one operand text common to both comparisons (the variable), or null. */
function sharedOperand(a, b, sourceCode) {
  const aTexts = [sourceCode.getText(a.left), sourceCode.getText(a.right)];
  const bTexts = [sourceCode.getText(b.left), sourceCode.getText(b.right)];
  const common = [...new Set(aTexts.filter((t) => bTexts.includes(t)))];
  return common.length === 1 ? common[0] : null;
}

/** @type {import('eslint').Rule.RuleModule} */
module.exports = {
  meta: {
    type: "suggestion",
    docs: {
      description:
        "Order a two-sided range like a number line: `lo < x && x < hi` (between) or `x < lo || hi < x` (outside).",
      recommended: false,
      url: "https://github.com/nitsanavni/no-greater-than/tree/main/eslint",
    },
    fixable: "code",
    hasSuggestions: true,
    schema: [
      {
        type: "object",
        properties: {
          // Like no-greater-than: only autofix when reordering can't change
          // evaluation order (all operands side-effect-free). Default true.
          autofixSafeOnly: { type: "boolean" },
        },
        additionalProperties: false,
      },
    ],
    messages: {
      range: "Order this range like a number line. Rewrite as: {{rewrite}}",
      reorder: "Reorder to '{{rewrite}}'",
    },
  },

  create(context) {
    const sourceCode = context.sourceCode || context.getSourceCode();
    const options = context.options[0] || {};
    const autofixSafeOnly = options.autofixSafeOnly !== false; // default true

    function check(node) {
      if (node.operator !== "&&" && node.operator !== "||") return;
      const { left, right } = node;
      if (left.type !== "BinaryExpression" || right.type !== "BinaryExpression") return;
      if (!REL.has(left.operator) || !REL.has(right.operator)) return;

      const S = sharedOperand(left, right, sourceCode);
      if (!S) return;
      const cl = classify(left, S, sourceCode);
      const cr = classify(right, S, sourceCode);
      if (!cl || !cr) return;

      // A real range needs exactly one lower bound and one upper bound.
      let less, greater;
      if (cl.side === "less" && cr.side === "greater") {
        less = cl;
        greater = cr;
      } else if (cl.side === "greater" && cr.side === "less") {
        less = cr;
        greater = cl;
      } else {
        return; // both-less / both-greater: not a number-line range
      }

      const x = operandText(less.varNode, sourceCode);
      const lessBound = operandText(less.boundNode, sourceCode); // x < hi  -> hi
      const greaterBound = operandText(greater.boundNode, sourceCode); // x > lo -> lo

      let rewrite;
      if (node.operator === "&&") {
        // between: lo < x && x < hi  (variable in the middle, bounds ascending)
        rewrite = `${greaterBound} ${flipOp(greater.op)} ${x} && ${x} ${less.op} ${lessBound}`;
      } else {
        // outside: x < lo || hi < x  (variable on the outer edges)
        rewrite = `${x} ${less.op} ${lessBound} || ${greaterBound} ${flipOp(greater.op)} ${x}`;
      }

      if (rewrite === sourceCode.getText(node)) return; // already canonical

      const safe =
        isSideEffectFree(less.varNode) &&
        isSideEffectFree(less.boundNode) &&
        isSideEffectFree(greater.boundNode);
      const shouldAutofix = safe || !autofixSafeOnly;
      const applyFix = (fixer) => fixer.replaceText(node, rewrite);

      context.report({
        node,
        messageId: "range",
        data: { rewrite },
        fix: shouldAutofix ? applyFix : null,
        suggest: shouldAutofix
          ? undefined
          : [{ messageId: "reorder", data: { rewrite }, fix: applyFix }],
      });
    }

    return { LogicalExpression: check };
  },
};
