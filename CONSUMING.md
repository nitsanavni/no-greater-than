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

The plugin lives in the `eslint/` **subdirectory**, so a plain
`npm i -D github:nitsanavni/no-greater-than` does **not** work (npm looks for a root
`package.json`, and the popular `gitpkg` subdir shim is now offline — it returns
HTTP 402). The reliable no-publish path is to **vendor the subdir with [degit](https://github.com/Rich-Harris/degit)**
and install it as a local `file:` dependency.

```bash
# 1. Vendor just the eslint/ subdir (no .git, no node_modules pulled in)
npx degit nitsanavni/no-greater-than/eslint vendor/eslint-plugin-no-greater-than

# 2. Install it as a local dependency, plus eslint itself
npm i -D ./vendor/eslint-plugin-no-greater-than eslint
```

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

Verified output:

```
sample.js
  2:7  warning  Use '<' instead of '>' so the comparison reads like a number line. Rewrite as: b < a   no-greater-than/no-greater-than
  3:7  warning  Use '<=' instead of '>=' ...                                                            no-greater-than/no-greater-than
```

`--fix` rewrote `if (a > b)` → `if (b < a)` and `if (a >= b)` → `if (b <= a)`.

To update later: re-run the `degit` command (it overwrites the vendored copy).

> Want it without vendoring (`npm i -D github:...`)? That requires the plugin at a
> repo root — see [Recommendation](#recommendation).

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

**For ESLint, splitting the plugin into its own dedicated repo is worth it.** Because
the plugin sits in `eslint/`, the one-liner most users expect —

```bash
npm i -D github:nitsanavni/eslint-plugin-no-greater-than
```

— cannot work here (no root `package.json`), and the subdir shim `gitpkg` is now
offline (HTTP 402). The degit-vendor path above is reliable but is two steps and a
`file:` dependency.

This was tested: pushing `eslint/`'s contents to a repo *root* makes the clean
one-liner work directly — `npm i -D github:<owner>/<repo>` resolved and linted with
zero extra steps, autofix included.

So: **if the ESLint plugin gets meaningful external use, mirror `eslint/` into a
standalone `eslint-plugin-no-greater-than` repo** (this monorepo can stay the source
of truth and push to it). Until then, the degit instructions above are the
no-publish answer.
