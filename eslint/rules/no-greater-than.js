"use strict";

/**
 * Operand types whose precedence is at or below a relational operator.
 * When one of these is moved to the other side of `<`/`<=`, it must be
 * parenthesized so the expression doesn't re-associate.
 *
 * Example: `a > b > c` parses as `(a > b) > c`. Naively rewriting the outer
 * node to `c < a > b` would re-parse as `(c < a) > b` — wrong. Wrapping the
 * moved operand gives `c < (a > b)`, which is correct.
 */
const NEEDS_PARENS = new Set([
  "BinaryExpression",
  "LogicalExpression",
  "ConditionalExpression",
  "AssignmentExpression",
  "SequenceExpression",
  "YieldExpression",
]);

/**
 * Allowlist of `Global.method` calls that are pure: deterministic and free of
 * observable side effects, given side-effect-free arguments. Calling one and
 * reordering it relative to the other operand cannot change observable
 * behavior, so it is safe to autofix.
 *
 * Conservative on purpose. We list only standard built-ins whose static
 * methods are spec-pure. We deliberately exclude e.g. `Math.random`
 * (non-deterministic) and `Date.now` (clock-dependent — reordering two clock
 * reads is observable). Membership is matched on the syntactic `Object.method`
 * text only; if a user shadows `Math`/`Date`/etc., this rule assumes they did not.
 */
const PURE_STATIC_CALLS = new Set([
  "Math.abs", "Math.ceil", "Math.floor", "Math.round", "Math.trunc",
  "Math.sign", "Math.min", "Math.max", "Math.pow", "Math.sqrt", "Math.cbrt",
  "Math.log", "Math.log2", "Math.log10", "Math.exp", "Math.hypot",
  "Number.parseInt", "Number.parseFloat", "Number.isInteger",
  "Number.isFinite", "Number.isNaN", "Number.isSafeInteger",
  "Date.parse", "Date.UTC",
  "String.fromCharCode", "String.fromCodePoint",
]);

/**
 * Is `node` a call to a known-pure global static method (e.g. `Date.parse`)
 * with side-effect-free arguments? Such calls can be safely reordered.
 */
function isPureStaticCall(node) {
  if (node.type !== "CallExpression" || node.optional) return false;
  const callee = node.callee;
  if (
    callee.type !== "MemberExpression" ||
    callee.computed ||
    callee.optional ||
    callee.object.type !== "Identifier" ||
    callee.property.type !== "Identifier"
  ) {
    return false;
  }
  const key = `${callee.object.name}.${callee.property.name}`;
  if (!PURE_STATIC_CALLS.has(key)) return false;
  // Spread args (e.g. Math.max(...xs)) could hide side effects in iteration;
  // require plain, individually-pure arguments.
  return node.arguments.every(
    (arg) => arg.type !== "SpreadElement" && isSideEffectFree(arg)
  );
}

/**
 * Is evaluating `node` guaranteed to have no observable side effects?
 * Swapping operands changes evaluation order, so we only autofix when both
 * sides are side-effect-free. Conservative: anything we're unsure about is
 * treated as unsafe.
 */
function isSideEffectFree(node) {
  switch (node.type) {
    case "Literal":
    case "Identifier":
    case "ThisExpression":
    case "Super":
      return true;
    case "TemplateLiteral":
      return node.expressions.every(isSideEffectFree);
    case "UnaryExpression":
      // `delete` mutates; everything else is pure if its argument is.
      return node.operator !== "delete" && isSideEffectFree(node.argument);
    case "MemberExpression":
      // Treat property access as pure (the common convention). A getter could
      // technically have side effects, but flagging every member access would
      // make the rule unusable.
      return (
        isSideEffectFree(node.object) &&
        (!node.computed || isSideEffectFree(node.property))
      );
    case "BinaryExpression":
    case "LogicalExpression":
      return isSideEffectFree(node.left) && isSideEffectFree(node.right);
    case "ArrayExpression":
      return node.elements.every((el) => el == null || isSideEffectFree(el));
    case "CallExpression":
      // Most calls are opaque, but a small allowlist of pure global static
      // methods (e.g. Date.parse, Math.max) is safe to reorder.
      return isPureStaticCall(node);
    default:
      // NewExpression, UpdateExpression (x++), AssignmentExpression, etc.
      return false;
  }
}

function operandText(node, sourceCode) {
  const text = sourceCode.getText(node);
  return NEEDS_PARENS.has(node.type) ? `(${text})` : text;
}

/** Build the `<`/`<=` rewrite for a `>`/`>=` node. */
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
