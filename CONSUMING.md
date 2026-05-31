# Consuming these rules (no npm publish needed)

This repo is **not published to the npm registry** — by design. Everything below
installs/runs straight from the **public GitHub repo**. Each path is copy-pasteable
and was verified end-to-end against a sample file:

```js
const a = 1, b = 2, x = 5;
if (a > b) console.log("gt");
if (a >= b) console.log("gte");
```

Each tool flags `a > b` and `a >= b` and teaches the number-line rewrite (`b < a`, `b <= a`).

---

## ESLint

**One-step install (verified):**

```bash
npm i -D eslint github:nitsanavni/eslint-plugin-no-greater-than
```

The plugin lives in the `eslint/` **subdirectory** here, so a `github:` install off
*this* repo can't work (npm needs a root `package.json`). Instead, `eslint/` is
mirrored to its own standalone public repo —
[`nitsanavni/eslint-plugin-no-greater-than`](https://github.com/nitsanavni/eslint-plugin-no-greater-than)
— whose root **is** the package, so the clean one-liner above resolves directly
(plain JS, `main: index.js`, no build step or extra peer deps). This monorepo stays
the source of truth; the mirror is regenerated with
[`scripts/sync-eslint-mirror.sh`](scripts/sync-eslint-mirror.sh) (one command:
re-runs the subtree split, re-banners the mirror README, and force-pushes the
mirror's `main`).

Then enable the bundled flat-config preset (`eslint.config.mjs`):

```js
import ngt from "eslint-plugin-no-greater-than";

export default [ngt.configs.recommended];
```

Run it:

```bash
npx eslint .          # report (warnings)
npx eslint . --fix    # auto-rewrite >/>= to </<= where safe
```

Verified end-to-end (`sample.js` containing `a > b;` and `x > 5 && x < 10;`):

```
sample.js
  1:3  warning  Use '<' instead of '>' ... Rewrite as: b < a            no-greater-than/no-greater-than
  2:1  warning  Order this range like a number line. Rewrite as: 5 < x && x < 10   no-greater-than/number-line-range
  2:3  warning  Use '<' instead of '>' ... Rewrite as: 5 < x            no-greater-than/no-greater-than
```

`--fix` rewrote `a > b;` → `b < a;` and `x > 5 && x < 10;` → `5 < x && x < 10;`.

### Fallback: vendor the subdir with degit

If you'd rather not install from GitHub directly, **vendor the subdir with
[degit](https://github.com/Rich-Harris/degit)** and install it as a local `file:`
dependency:

```bash
# 1. Vendor just the eslint/ subdir (no .git, no node_modules pulled in)
npx degit nitsanavni/no-greater-than/eslint vendor/eslint-plugin-no-greater-than

# 2. Install it as a local dependency, plus eslint itself
npm i -D ./vendor/eslint-plugin-no-greater-than eslint
```

To update later: re-run the `degit` command (it overwrites the vendored copy).

---

## ast-grep

No install of the rules needed — `ast-grep scan` just needs the rule config. Clone
the repo (or add it as a submodule) and point `-c` at its `sgconfig.yml`. The
`ruleDirs:`/`testDir:` paths resolve relative to that config file, so it works from
any directory.

```bash
# 1. Get the rules (shallow clone is fine; or `git submodule add`)
git clone --depth 1 https://github.com/nitsanavni/no-greater-than.git

# 2. Scan your code against the bundled config
ast-grep scan -c no-greater-than/ast-grep/sgconfig.yml path/to/your/code
```

Verified output (run against the sample):

```
warning[no-greater-than]: Use '<' so the comparison reads like a number line.
3 │-if (a > b) ...
3 │+if ((b) < (a)) ...
warning[no-greater-or-equal]: Use '<=' so the comparison reads like a number line.
```

Apply fixes in place with `-U`:

```bash
ast-grep scan -c no-greater-than/ast-grep/sgconfig.yml -U path/to/your/code
```

Alternatively, **vendor** `ast-grep/rules/` + `ast-grep/sgconfig.yml` into your own
repo and run a plain `ast-grep scan` from there — same result, no clone at scan time.

> ast-grep maps each language to its own parser, so the config ships JS / TS / TSX
> rule variants. Use the bundled `sgconfig.yml` (it loads all of them) rather than
> a single `--rule` file, or `.ts`/`.tsx` comparisons go unflagged.

---

## Biome (GritQL plugins)

Biome v2 loads GritQL plugins from local `.grit` files referenced in `biome.json`.
**Vendor the two `.grit` files** and reference them.

```bash
# 1. Vendor just the biome/ .grit plugins
npx degit nitsanavni/no-greater-than/biome vendor/ngt-biome
cp vendor/ngt-biome/*.grit .
```

Add them to your `biome.json`:

```json
{
  "$schema": "https://biomejs.dev/schemas/2.4.12/schema.json",
  "plugins": ["./no-greater-than.grit", "./number-line-range.grit"],
  "linter": { "enabled": true, "rules": { "recommended": false } }
}
```

Run it:

```bash
npx @biomejs/biome lint .
```

Verified output:

```
sample.js:2:5 plugin
  × Flip it to read like a number line — before: `a > b`  →  better: `b < a`
sample.js:3:5 plugin
  × Flip it to read like a number line — before: `a >= b`  →  better: `b <= a`
```

> Biome GritQL plugins are **detection-only** (no autofix in v2). The diagnostic
> message teaches the rewrite; let `eslint --fix`, `ast-grep -U`, or an agent apply it.

---

## Recommendation

For ast-grep and Biome, the consumer naturally vendors/clones a few config files —
that is already the idiomatic, frictionless path, so no repo change is warranted.

**For ESLint, the plugin now has its own dedicated repo** — done because the plugin
sits in `eslint/`, so the one-liner most users expect cannot resolve off this repo
(no root `package.json`; the old subdir shim `gitpkg` is offline, HTTP 402). The fix:
mirror `eslint/`'s contents to the *root* of a standalone public repo,
[`nitsanavni/eslint-plugin-no-greater-than`](https://github.com/nitsanavni/eslint-plugin-no-greater-than).

This was verified end-to-end: `npm i -D github:nitsanavni/eslint-plugin-no-greater-than`
resolves with zero extra steps and both rules lint + autofix correctly (see the
ESLint section above). The monorepo stays the source of truth; regenerate the mirror
with [`scripts/sync-eslint-mirror.sh`](scripts/sync-eslint-mirror.sh). The degit path
above remains as a no-GitHub-install fallback.
