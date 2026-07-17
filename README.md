# mcpdiff

[![CI](https://github.com/samlader/mcpdiff/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/samlader/mcpdiff/actions)
[![npm](https://img.shields.io/npm/v/mcpdiff.svg)](https://www.npmjs.com/package/mcpdiff)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)

Command-line tool to compare and detect breaking changes in [MCP](https://modelcontextprotocol.io) servers.

Detects both **hard contract breaks** (a removed tool, a new required argument, a narrowed enum) and **semantic drift** (a reworded description that changes how the model calls a tool, with no schema change at all).

Run it locally, in CI to gate pull requests on breaking changes, or embed the library in your own tooling.

## Installation

### Install with npm

```bash
npm install -g mcpdiff
```

### Run with npx (no install)

```bash
npx mcpdiff <command> <base> <revision>
```

### Build from source

```bash
git clone https://github.com/samlader/mcpdiff
cd mcpdiff && npm install && npm run build
```

## Documentation

### Commands

The top-level subcommands. `<base>` and `<revision>` are each a [source](#inputs).

- `capture` introspect a live server into a canonical [snapshot](#the-snapshot) you can commit and diff later
- `diff` full diff of the server's surface, including documentation-only edits (output text, json, markdown, or github)
- `summary` high-level count of changes between two servers
- `breaking` only the changes that break existing MCP clients; exits non-zero when any are found
- `changelog` changes that can affect MCP clients, breaking or not, in human-readable form
- `validate` check that a server or snapshot is reachable and well-formed
- `checks` list the rules mcpdiff uses to classify changes ([customize them](#configuration))

### Inputs

Where a server's surface comes from. Every command accepts these forms for both `base` and `revision`:

- **Live server over stdio**
- **Live server over HTTP**
- **Snapshot file**
- **Git revision**

### Comparison

- **Identity matching**: tools by `name`, resources by `uri`, resource templates by `uriTemplate`, prompts by `name`; unmatched-in-base is an addition, unmatched-in-revision a removal
- **Request/response variance**: narrowing an accepted _input_ breaks callers, while it's _broadening_ an _output_ that breaks readers; mcpdiff applies the correct variance per field role
- **Safety annotations**: weakening `readOnlyHint`, `destructiveHint`, or `idempotentHint` is treated as breaking
- **Semantic drift**: a changed `description` or `instructions` with no schema change is reported as a first-class change class, so meaning changes don't slip through silently

### Output

Shape the report for humans or automation. `diff` and `breaking` accept `--format`:

- `text` (default): colorized terminal report
- `json` machine-readable, one object per change with `severity`, `ruleId`, and `path`
- `markdown` a table for pull-request comments
- `github` GitHub Actions `::error` / `::warning` annotations for inline PR feedback

Every finding carries a stable rule ID (`T-REQ-ADD`, `T-ENUM-REMOVE`, `P-ARG-REQ-ADD`, …) so you can suppress or re-classify individual rules.

### How to run

- [Continuous integration](#ci): gate pull requests on breaking changes
- [Configuration file](#configuration): `.mcpdiff.yaml` for per-rule overrides and ignore globs
- [Use as a library](#library): everything the CLI does is exported from the npm package

## CI

Gate pull requests on breaking changes. Commit `mcp.snapshot.json`, then diff the PR's server against the base branch's snapshot:

```yaml
name: mcp-contract
on: pull_request
jobs:
  mcpdiff:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with: { fetch-depth: 0 }
      - uses: actions/setup-node@v4
        with: { node-version: 20 }
      - run: |
          npx mcpdiff breaking \
            git:origin/${{ github.base_ref }}:mcp.snapshot.json \
            'stdio:node dist/server.js' \
            --format github
```

`breaking` exits non-zero when a breaking change is found, failing the check.

## Configuration

Drop a `.mcpdiff.yaml` at your repo root (discovered upward from the working directory). See [`.mcpdiff.example.yaml`](./.mcpdiff.example.yaml).

```yaml
# Re-classify individual rules by their stable ID (see `mcpdiff checks`).
rules:
  T-DESC-DRIFT: info # off | info | warn | breaking
  T-ADDED: info

# Drop changes whose path matches a glob.
ignore:
  - tools/debug_*

# Fail the `breaking` gate on high semantic drift too.
failOnDrift: false
```

## Library

Everything the CLI does is exported from the package:

```ts
import { loadSnapshot, diffSnapshots, render, shouldFail } from "mcpdiff";

const base = await loadSnapshot("mcp.snapshot.json");
const revision = await loadSnapshot("stdio:node dist/server.js");
const changeset = diffSnapshots(base, revision);

console.log(render(changeset, "markdown"));
if (shouldFail(changeset.changes)) process.exit(1);
```

## Contributions

Contributions and bug reports are welcome! Feel free to open issues, submit pull requests or contact me if you need any support.

## License

This project is licensed under the [MIT License](LICENSE).
