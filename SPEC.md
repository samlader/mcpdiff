# mcpdiff — Specification

> Diff two MCP servers and detect breaking changes.
> The [oasdiff](https://github.com/oasdiff/oasdiff) of the Model Context Protocol.

## 1. Motivation

[oasdiff](https://github.com/oasdiff/oasdiff) compares two OpenAPI specs and tells you
what changed, what broke, and produces a consumer-facing changelog. It has become the
standard governance gate for REST APIs in CI/CD.

MCP servers have the same problem, one layer up. An MCP server exposes **tools**,
**resources**, and **prompts** to an LLM agent. When a server's surface changes, it can
silently break every agent that depends on it:

- A tool is removed or renamed → agent calls fail.
- A new **required** input parameter appears → every existing tool call is now invalid.
- A parameter's type narrows (`string` → `enum`) → previously valid arguments rejected.
- A tool description changes meaning → the model calls it wrong (a _semantic_ break with
  no schema change).
- A resource URI template changes → resource reads 404.

Unlike REST, the _primary consumer of an MCP surface is an LLM_, so mcpdiff must reason
about both **hard contract breaks** (schema-level, machine-detectable) and **semantic
drift** (prompt/description changes that change model behavior).

**Goal:** a CLI + library + CI action that diffs two MCP server surfaces and classifies
every change as `added`, `removed`, `modified`, and (for the `breaking` view) `breaking`
vs `non-breaking`.

## 2. Scope

### In scope (v1)

- Diffing the three server-offered feature sets: **tools**, **resources** (+ resource
  templates), **prompts**.
- Diffing server metadata: `serverInfo` (name/version), declared `capabilities`,
  `instructions`.
- Deep JSON Schema diffing of tool `inputSchema` / `outputSchema` and prompt `arguments`.
- Breaking-change classification with a customizable rule set.
- Multiple output formats and CI integration.

### Out of scope (v1, candidate for later)

- Runtime/behavioral testing (actually _calling_ tools and comparing responses).
- Diffing sampling / roots / elicitation (client-offered features).
- Auth/transport config diffing beyond capability flags.

## 3. Inputs — how a "spec" is obtained

An MCP server has no static spec file like OpenAPI. mcpdiff must acquire the surface by
one of these source types (a `base` and a `revision`, each independently addressable):

| Source                     | Syntax                                      | Notes                                                                                                                                          |
| -------------------------- | ------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| **Live server (stdio)**    | `--base 'stdio:npx -y @scope/server@1.2.0'` | Spawns the server, runs the MCP handshake, calls `tools/list`, `resources/list`, `resources/templates/list`, `prompts/list`, paginating fully. |
| **Live server (HTTP/SSE)** | `--base 'https://host/mcp'`                 | Streamable HTTP transport; supports auth headers.                                                                                              |
| **Captured snapshot**      | `--base ./v1.snapshot.json`                 | A canonical JSON dump of a previous introspection (see §4). Enables offline & CI diffing without spinning up the server.                       |
| **Git revision**           | `--base 'git:HEAD~1:snapshot.json'`         | Reads a committed snapshot from a git ref, mirroring oasdiff's revision inputs.                                                                |

The introspection step ("**capture**") and the diff step are decoupled: you can
`mcpdiff capture` a running server into a snapshot, commit it, and diff snapshots forever
after. This is the recommended CI pattern.

## 4. The snapshot format

A stable, canonical, transport-agnostic serialization of everything mcpdiff compares.
Deterministic ordering (sorted keys, sorted lists by identity) so snapshots are
diff-friendly in git and reproducible.

```jsonc
{
  "mcpdiffVersion": "1",
  "capturedAt": "2026-07-17T00:00:00Z",
  "serverInfo": { "name": "acme-server", "version": "1.2.0" },
  "protocolVersion": "2025-06-18",
  "capabilities": { "tools": { "listChanged": true }, "resources": {}, "prompts": {} },
  "instructions": "Use the search tool before answering...",
  "tools": [
    {
      "name": "search",
      "title": "Search Documents",
      "description": "Full-text search over the knowledge base.",
      "inputSchema": {
        "type": "object",
        "properties": { "query": { "type": "string" } },
        "required": ["query"],
      },
      "outputSchema": { "type": "object", "properties": { "hits": { "type": "array" } } },
      "annotations": {
        "readOnlyHint": true,
        "destructiveHint": false,
        "idempotentHint": true,
        "openWorldHint": true,
      },
    },
  ],
  "resources": [
    {
      "uri": "file:///docs/readme.md",
      "name": "readme",
      "title": "README",
      "mimeType": "text/markdown",
    },
  ],
  "resourceTemplates": [
    { "uriTemplate": "db://users/{id}", "name": "user", "mimeType": "application/json" },
  ],
  "prompts": [
    {
      "name": "summarize",
      "description": "Summarize a document",
      "arguments": [
        { "name": "doc_id", "description": "ID of the doc", "required": true },
      ],
    },
  ],
}
```

## 5. Identity & matching

Before diffing, each element is matched between `base` and `revision` by a stable
identity key. Non-matched-in-base = **added**; non-matched-in-revision = **removed**;
matched = candidate for **modified**.

| Element           | Identity key                        |
| ----------------- | ----------------------------------- |
| Tool              | `name`                              |
| Resource          | `uri`                               |
| Resource template | `uriTemplate` (fallback `name`)     |
| Prompt            | `name`                              |
| Schema property   | JSON Pointer path within the schema |

**Rename detection (heuristic, opt-in `--detect-renames`):** if a tool is removed and
another added with a highly similar `inputSchema` + description embedding, report a
`renamed` change instead of remove+add. Off by default (mirrors oasdiff's caution around
endpoint matching).

## 6. What counts as a breaking change

The consumer is an **existing agent/integration** that was working against `base`. A
change is **breaking** if a call, read, or prompt render that was valid against `base` can
now fail or behave incorrectly against `revision`.

### 6.1 Tools

| Change                                                                                           | Classification                                                     |
| ------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------ |
| Tool removed                                                                                     | **breaking**                                                       |
| Tool renamed (without alias)                                                                     | **breaking**                                                       |
| New tool added                                                                                   | non-breaking                                                       |
| Input: new **required** property                                                                 | **breaking**                                                       |
| Input: required property removed                                                                 | **breaking** (agent may still send it → depends; default breaking) |
| Input: optional→required                                                                         | **breaking**                                                       |
| Input: required→optional                                                                         | non-breaking                                                       |
| Input: property removed entirely                                                                 | **breaking**                                                       |
| Input: property added (optional)                                                                 | non-breaking                                                       |
| Input: type narrowed (`string`→`integer`, widened `enum`→fixed)                                  | **breaking**                                                       |
| Input: type widened (`integer`→`number`, `enum`→`string`)                                        | non-breaking                                                       |
| Input: enum value **removed**                                                                    | **breaking**                                                       |
| Input: enum value **added**                                                                      | non-breaking                                                       |
| Input: constraint tightened (`maxLength` ↓, `minimum` ↑, new `pattern`)                          | **breaking**                                                       |
| Input: constraint loosened                                                                       | non-breaking                                                       |
| Output: property removed / type changed                                                          | **breaking** (consumer parses output)                              |
| Output: property added                                                                           | non-breaking                                                       |
| Annotation: `readOnlyHint` true→false, `destructiveHint` false→true, `idempotentHint` true→false | **breaking** (safety contract weakened)                            |
| Description changed                                                                              | **non-breaking** but flagged as **semantic drift** (see §6.4)      |

_Note: input vs output invert the usual variance rules — narrowing an accepted input is
breaking, whereas narrowing a produced output is breaking too, because the consumer relied
on the wider guarantee. mcpdiff applies request/response variance correctly per field
role, exactly as oasdiff does for OpenAPI request vs response schemas._

### 6.2 Resources

| Change                                                   | Classification |
| -------------------------------------------------------- | -------------- |
| Resource removed                                         | **breaking**   |
| Resource `uri` changed                                   | **breaking**   |
| `mimeType` changed                                       | **breaking**   |
| Resource template `uriTemplate` variable removed/renamed | **breaking**   |
| New resource / template added                            | non-breaking   |
| `title` / `description` changed                          | semantic drift |

### 6.3 Prompts

| Change                          | Classification |
| ------------------------------- | -------------- |
| Prompt removed                  | **breaking**   |
| New **required** argument added | **breaking**   |
| Argument removed                | **breaking**   |
| Argument optional→required      | **breaking**   |
| New optional argument           | non-breaking   |
| Argument description changed    | semantic drift |

### 6.4 Semantic drift (mcpdiff-specific, novel vs oasdiff)

Because the consumer is a language model, a change to a `description`, `instructions`, or
prompt text can change agent behavior with **zero schema change**. mcpdiff treats these as
a first-class change class:

- Reported as `modified` with `driftSeverity: none | low | high`.
- Optional `--semantic` mode uses an embedding model to score description similarity;
  large drops flag `high`.
- Never counted as a _hard_ break (won't fail `breaking` gate by default) but can be
  surfaced with `--fail-on-drift` for strict governance.

### 6.5 Server-level

| Change                                                     | Classification                               |
| ---------------------------------------------------------- | -------------------------------------------- |
| Capability removed (e.g. server drops `tools.listChanged`) | **breaking**                                 |
| Capability added                                           | non-breaking                                 |
| `protocolVersion` downgraded                               | **breaking**                                 |
| `serverInfo.version` change                                | informational (feeds changelog semver check) |

## 7. Commands

Mirrors oasdiff's command surface.

```
mcpdiff capture   <source>                 # introspect a server → snapshot JSON
mcpdiff diff      <base> <revision>         # full structured diff, all changes
mcpdiff breaking  <base> <revision>         # only breaking changes; exit code drives CI
mcpdiff changelog <base> <revision>         # human/consumer-facing change summary
mcpdiff summary   <base> <revision>         # counts by category
mcpdiff checks                              # list all breaking-change rules + IDs
mcpdiff validate  <source>                  # sanity-check a server/snapshot conforms to MCP
```

`<base>`/`<revision>` accept any source type from §3.

### Exit codes (for `breaking`)

- `0` — no breaking changes.
- `1` — breaking changes found.
- `2` — usage / connection / parse error.

Configurable: `--fail-on WARN|ERR` and per-rule severity overrides, like oasdiff's
`--level` and rule config.

## 8. Output formats

`--format` supports: `text` (default, colorized), `json`, `yaml`, `markdown`, `html`,
`junit` (for CI test reporting), `github` (GitHub Actions annotations / step summary).

Example `breaking` text output:

```
5 changes: 2 breaking, 3 non-breaking

BREAKING  tools/search        input.required   added required property 'tenant_id'      [T-REQ-ADD]
BREAKING  tools/delete_file   removed          tool no longer exposed                    [T-REMOVED]
warning   tools/search        description       semantic drift (similarity 0.61)          [DRIFT-HIGH]
info      tools/summarize     added             new tool
info      prompts/summarize   arguments         new optional argument 'style'
```

Every finding carries a stable **rule ID** (`T-REQ-ADD`, `T-REMOVED`, `R-URI-CHANGED`,
`P-ARG-REQ-ADD`, …) so teams can suppress or re-classify individual rules via config.

## 9. Configuration

A `.mcpdiff.yaml` config file (discovered upward from CWD), matching oasdiff's config-file
ergonomics:

```yaml
breaking:
  # downgrade a rule from breaking to warning
  T-INPUT-REQ-REMOVED: warn
  # ignore documentation-only tools entirely
  ignore:
    - tools/debug_*
semantic:
  enabled: true
  driftThreshold: 0.75 # cosine similarity below this = high drift
  model: text-embedding-3-small
detectRenames: true
```

## 10. CI/CD integration

1. **GitHub Action** (`mcpdiff/mcpdiff-action`):

   ```yaml
   - uses: mcpdiff/mcpdiff-action@v1
     with:
       base: git:origin/main:mcp.snapshot.json
       revision: stdio:node dist/server.js
       fail-on: breaking
   ```

   Posts a PR comment with the changelog + a commit status check (mirrors oasdiff.com's
   PR approve/reject workflow).

2. **Docker image** `ghcr.io/mcpdiff/mcpdiff` for hermetic runs.

3. **Pre-commit hook** to regenerate + validate the committed snapshot so the surface is
   reviewed like code.

4. **git diff driver** (`mcpdiff git-diff-driver`) so `git log -p` renders snapshot diffs
   as readable changelogs instead of raw JSON.

## 11. Architecture

```
┌──────────────┐   capture    ┌──────────────┐   diff engine   ┌──────────────┐
│  Source      │ ───────────▶ │  Snapshot    │ ──────────────▶ │  ChangeSet   │
│  (stdio/http │  (MCP client │  (canonical  │  (match + deep  │  (typed diff │
│   /file/git) │   handshake) │   model)     │   schema diff)  │   nodes)     │
└──────────────┘              └──────────────┘                 └──────┬───────┘
                                                                       │
                     ┌─────────────────────────────────────────────┬──┴─────────────┐
                     ▼                       ▼                      ▼                 ▼
              classifier (rules)      changelog gen         reporters          exit code
              breaking/non-breaking   (consumer prose)   text/json/html/…    (CI gate)
```

**Components**

- **Introspector** — an MCP client (stdio + streamable-HTTP transports) that performs the
  handshake and paginated `*/list` calls. Reuse an existing MCP SDK.
- **Canonicalizer** — normalizes to the snapshot model; stable sort; resolves `$ref`s and
  optionally flattens `allOf` in JSON Schema (parallels oasdiff's `flatten`).
- **Schema differ** — recursive JSON Schema diff with request/response variance awareness.
  This is the crux and hardest part; treat JSON Schema as the equivalent of oasdiff's
  OpenAPI schema diffing.
- **Classifier** — pure, data-driven rule table (§6) keyed by rule ID; fully overridable.
- **Reporters** — one per output format.

**Language:** Go is the natural choice for parity with oasdiff (single static binary,
great CI story). TypeScript is the pragmatic alternative given the reference MCP SDK and
JSON Schema tooling live in the TS ecosystem. **Recommendation: TypeScript for v1** —
first-class MCP client SDK, native JSON Schema, easy `npx mcpdiff` distribution; revisit
Go if binary size / speed matters.

## 12. Key differences from oasdiff (design notes)

1. **No static spec.** The surface must be introspected from a live server; hence the
   `capture` step and snapshot format are load-bearing, not incidental.
2. **The consumer is an LLM.** Semantic drift in descriptions/instructions is a real
   failure mode with no OpenAPI analog → first-class `driftSeverity` change class.
3. **Three feature types, not one.** Tools/resources/prompts each have their own identity
   and rule set, versus OpenAPI's single path/operation tree.
4. **Annotations are a safety contract.** `readOnlyHint`/`destructiveHint`/`idempotentHint`
   weakening is breaking in a way that has no REST equivalent.
5. **Non-determinism.** A server may return tools in unstable order or gate them by
   auth/roots; canonicalization + explicit auth context are required for reproducible
   diffs.

## 13. Milestones

- **M1 — capture + snapshot + `diff` (structural add/remove/modify)** across tools,
  resources, prompts. JSON output.
- **M2 — schema differ + `breaking` classifier + rule IDs + exit codes.** text/json/junit.
- **M3 — `changelog`, `summary`, config file, git revision source, git-diff-driver.**
- **M4 — GitHub Action, Docker, HTML report.**
- **M5 — `--semantic` drift detection, rename detection, hosted PR-review service.**

## 14. Open questions

- **Auth-gated surfaces:** how to capture the _full_ tool set when tools are filtered by
  the caller's roots/permissions? (Likely: capture per-persona and diff within persona.)
- **Runtime behavior:** should v2 actually invoke tools with golden inputs and diff
  responses (contract testing), or stay purely static?
- **Semantic drift model:** local embedding model vs pluggable provider; how to keep CI
  hermetic and cheap.
- **Snapshot canonicalization of JSON Schema:** how aggressively to resolve `$ref`/`allOf`
  before diffing without losing authorial intent.
