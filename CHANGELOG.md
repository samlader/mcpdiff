# Changelog

All notable changes to this project are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Initial release.
- `capture` — introspect an MCP server (stdio / streamable-HTTP) into a canonical snapshot.
- `diff`, `breaking`, `changelog`, `summary`, `checks`, `validate` commands.
- Source resolution for `stdio:`, `http(s)://`, `git:<ref>:<path>`, and snapshot files.
- JSON Schema differ with correct request/response breaking-change variance.
- Breaking-change rule catalogue across tools, resources, resource templates, prompts, and
  server metadata, each with a stable rule ID.
- Semantic-drift detection for description/instruction changes.
- `.mcpdiff.yaml` configuration with per-rule overrides and ignore globs.
- `text`, `json`, `markdown`, and `github` output formats.
