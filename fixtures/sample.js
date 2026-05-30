// Shared sample file scanned by all three implementations.
// Each `>` / `>=` below should be flagged. The trailing comment shows the
// expected < / <= rewrite. Lines without > / >= must NOT be flagged.

// --- simple (autofixable) ---
const a1 = a > b;            // b < a
const a2 = a >= b;           // b <= a
const a3 = x > 5;            // 5 < x
const a4 = foo.bar > 10;     // 10 < foo.bar
const a5 = arr[i] >= count;  // count <= arr[i]

// --- precedence (autofixable, needs parens) ---
const p1 = a + 1 > b * 2;    // (b * 2) < (a + 1)
const p2 = (a || b) > c;     // c < (a || b)
const p3 = a > b > c;        // c < (a > b)   (+ inner a > b flagged separately)

// --- range (autofixable) ---
const r1 = 5 < x && x > 1;   // 5 < x && 1 < x

// --- side effects (flag/suggest only, do NOT auto-rewrite) ---
const s1 = foo() > b;        // b < foo()
const s2 = count++ > limit;  // limit < count++

// --- must NOT be flagged ---
const n1 = a < b;
const n2 = a <= b;
const n3 = 5 < x && x < 10;
const n4 = a === b;
const n5 = a !== b;
const n6 = a >> b;
const n7 = a >>> b;
let n8 = a; n8 >>= b;
