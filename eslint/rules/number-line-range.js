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

/**
 * Is `node` an operand that can legitimately be the *variable* of a range?
 * A range bounds a value against two limits; the value must be a real
 * expression (identifier, member access, `this`, a call, ...), never a bare
 * literal. BUG 1: when the only operand shared by the two halves is a literal
 * (e.g. `0` in `start > 0 || end < 0`), the old code mistook that literal for
 * the variable and produced a false positive. A literal is never the variable.
 */
function isVariableLike(node) {
  return node.type !== "Literal";
}

/**
 * Among the operands of one comparison, the texts that may stand for the
 * bounded variable — i.e. excluding bare literals.
 */
function variableTexts(cmp, sourceCode) {
  const out = [];
  if (isVariableLike(cmp.left)) out.push(sourceCode.getText(cmp.left));
  if (isVariableLike(cmp.right)) out.push(sourceCode.getText(cmp.right));
  return out;
}

/**
 * The one *variable* operand text common to both comparisons, or null.
 * Literals are excluded so a literal appearing on both sides can never be
 * mistaken for the variable (BUG 1).
 */
function sharedOperand(a, b, sourceCode) {
  const aTexts = variableTexts(a, sourceCode);
  const bTexts = variableTexts(b, sourceCode);
  const common = [...new Set(aTexts.filter((t) => bTexts.includes(t)))];
  return common.length === 1 ? common[0] : null;
}

/**
 * Flatten a left-associative `&&`/`||` chain rooted at `node` into its full
 * list of operands. `a && b && c` parses as `(a && b) && c`, so without this
 * the two halves of a range can land in different LogicalExpression nodes
 * (BUG 2). Only descends through nodes whose operator matches `op`.
 */
function flattenChain(node, op) {
  const out = [];
  (function walk(n) {
    if (n.type === "LogicalExpression" && n.operator === op) {
      walk(n.left);
      walk(n.right);
    } else {
      out.push(n);
    }
  })(node);
  return out;
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

    /**
     * Find a lo/hi range pair among the operands of one flattened chain.
     * Returns { i, j, less, greater } with i < j (the chain indices of the two
     * range halves), or null. Each `less`/`greater` is the `classify` result.
     */
    function findRangePair(ops) {
      // Pre-classify candidates: relational comparisons keyed by their
      // variable text. A pair is a range iff the two halves share one variable
      // and sit on opposite sides (one `less`, one `greater`).
      const rels = ops.map((n, idx) =>
        n.type === "BinaryExpression" && REL.has(n.operator) ? idx : -1
      );
      for (let a = 0; a < ops.length; a++) {
        if (rels[a] !== a) continue;
        for (let b = a + 1; b < ops.length; b++) {
          if (rels[b] !== b) continue;
          const S = sharedOperand(ops[a], ops[b], sourceCode);
          if (!S) continue;
          const ca = classify(ops[a], S, sourceCode);
          const cb = classify(ops[b], S, sourceCode);
          if (!ca || !cb) continue;
          if (ca.side === "less" && cb.side === "greater") {
            return { i: a, j: b, less: ca, greater: cb };
          }
          if (ca.side === "greater" && cb.side === "less") {
            return { i: a, j: b, less: cb, greater: ca };
          }
          // both-less / both-greater: not a range; keep scanning.
        }
      }
      return null;
    }

    function check(node) {
      if (node.operator !== "&&" && node.operator !== "||") return;
      // Only inspect a chain from its top: skip nodes whose parent is the same
      // logical operator (they are interior links of one flattened chain).
      if (
        node.parent &&
        node.parent.type === "LogicalExpression" &&
        node.parent.operator === node.operator
      ) {
        return;
      }

      const ops = flattenChain(node, node.operator);
      const pair = findRangePair(ops);
      if (!pair) return;
      const { i, j, less, greater } = pair;

      const x = operandText(less.varNode, sourceCode);
      const lessBound = operandText(less.boundNode, sourceCode); // x < hi  -> hi
      const greaterBound = operandText(greater.boundNode, sourceCode); // x > lo -> lo

      // Canonical renderings of the two halves. For `&&` (between) the lower
      // bound reads `lo < x` and the upper `x < hi`; for `||` (outside) they
      // read `x < lo` and `hi < x`. We place the lower-bound half at the
      // earlier chain slot (i) and the upper-bound half at the later slot (j),
      // preserving every other conjunct in its original position.
      let loSlot, hiSlot;
      if (node.operator === "&&") {
        loSlot = `${greaterBound} ${flipOp(greater.op)} ${x}`; // lo < x
        hiSlot = `${x} ${less.op} ${lessBound}`; // x < hi
      } else {
        loSlot = `${x} ${less.op} ${lessBound}`; // x < lo
        hiSlot = `${greaterBound} ${flipOp(greater.op)} ${x}`; // hi < x
      }

      const parts = ops.map((n) => operandText(n, sourceCode));
      parts[i] = loSlot;
      parts[j] = hiSlot;
      const rewrite = parts.join(` ${node.operator} `);

      if (rewrite === sourceCode.getText(node)) return; // already canonical

      // Safe to autofix only when nothing observable can change. Besides the
      // range operands, reordering the two halves moves them relative to every
      // conjunct *between* slots i and j, so those must be side-effect-free too.
      let safe =
        isSideEffectFree(less.varNode) &&
        isSideEffectFree(less.boundNode) &&
        isSideEffectFree(greater.boundNode);
      for (let k = i; k <= j && safe; k++) {
        if (!isSideEffectFree(ops[k])) safe = false;
      }
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
