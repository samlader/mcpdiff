# Contributing to mcpdiff

Thanks for your interest! mcpdiff aims to be a small, well-tested, dependency-light tool.

## Getting started

```bash
git clone https://github.com/samlader/mcpdiff
cd mcpdiff
npm install
npm test
```

## Project layout

```
src/
  snapshot/   Canonical MCP surface model + deterministic serialization
  capture.ts  MCP client introspection + source-string resolution
  diff/       Element matching (index.ts) and JSON Schema diffing (schema.ts)
  classify/   The rule catalogue (rules.ts) backing `mcpdiff checks`
  config.ts   .mcpdiff.yaml loading + rule overrides
  report.ts   text / json / markdown / github renderers
  changelog.ts Consumer-facing changelog
  cli.ts      commander entrypoint (the bin)
test/         vitest specs; examples/ holds fixture snapshots
```

## Adding or changing a rule

1. Emit the change with a new stable `ruleId` in `src/diff/`.
2. Register it in `src/classify/rules.ts` (this powers `mcpdiff checks` and config
   validation). Keep IDs stable — users reference them in `.mcpdiff.yaml`.
3. Add a focused test in `test/schema.test.ts` or `test/diff.test.ts`.

Rule IDs are namespaced by category: `T-` tool, `R-` resource, `RT-` resource template,
`P-` prompt, `S-` server. Output-schema rules are prefixed `T-OUT-`.

## Before opening a PR

```bash
npm run typecheck
npm run lint
npm run format:check
npm test
```

All four run in CI. Please add tests for behaviour changes and keep the public API in
`src/index.ts` documented.

## Design principles

- **Determinism.** Two captures of the same server must produce byte-identical snapshots.
- **Correct variance.** Input vs output breaking-change rules invert; get this right.
- **Low dependencies.** New runtime dependencies need a good reason.
- **The consumer is a model.** Semantic drift is a first-class concern, not noise.
