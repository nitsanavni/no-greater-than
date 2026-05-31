"use strict";

// Helpers shared by the `no-greater-than` (operator flip) and
// `number-line-range` (range reorder) rules.

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
 * Allowlist of instance-method names that are pure accessors (read-only on
 * every built-in that defines the name). Matched on property name only, so it
 * is necessarily heuristic.
 */
const PURE_INSTANCE_METHODS = new Set([
  "getTime", "valueOf",
  "getFullYear", "getMonth", "getDate", "getDay",
  "getHours", "getMinutes", "getSeconds", "getMilliseconds",
  "getUTCFullYear", "getUTCMonth", "getUTCDate", "getUTCDay",
  "getUTCHours", "getUTCMinutes", "getUTCSeconds", "getUTCMilliseconds",
  "getTimezoneOffset",
  "indexOf", "lastIndexOf", "includes", "charAt", "slice",
]);

/** Is `node` a call to a known-pure global static method (e.g. `Date.parse`)? */
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
  return node.arguments.every(
    (arg) => arg.type !== "SpreadElement" && isSideEffectFree(arg)
  );
}

/** Is `node` a call to a known-pure instance accessor (e.g. `a.getTime()`)? */
function isPureInstanceCall(node) {
  if (node.type !== "CallExpression" || node.optional) return false;
  const callee = node.callee;
  if (
    callee.type !== "MemberExpression" ||
    callee.computed ||
    callee.optional ||
    callee.property.type !== "Identifier"
  ) {
    return false;
  }
  if (!PURE_INSTANCE_METHODS.has(callee.property.name)) return false;
  if (
    !node.arguments.every(
      (arg) => arg.type !== "SpreadElement" && isSideEffectFree(arg)
    )
  ) {
    return false;
  }
  return isSideEffectFree(callee.object);
}

/**
 * Is evaluating `node` guaranteed to have no observable side effects?
 * Conservative: anything we're unsure about is treated as unsafe.
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
      return node.operator !== "delete" && isSideEffectFree(node.argument);
    case "MemberExpression":
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
      return isPureStaticCall(node) || isPureInstanceCall(node);
    default:
      // NewExpression, UpdateExpression (x++), AssignmentExpression, etc.
      return false;
  }
}

/** Source text of `node`, parenthesized if its precedence requires it when moved. */
function operandText(node, sourceCode) {
  const text = sourceCode.getText(node);
  return NEEDS_PARENS.has(node.type) ? `(${text})` : text;
}

const FLIP = { "<": ">", "<=": ">=", ">": "<", ">=": "<=" };
/** The mirror of a relational operator (`a op b` ≡ `b flip(op) a`). */
function flipOp(op) {
  return FLIP[op];
}

module.exports = { NEEDS_PARENS, isSideEffectFree, operandText, flipOp };
