/**
 * mcpdiff — diff two MCP servers and detect breaking changes.
 *
 * Public library surface. The CLI (`mcpdiff`) is a thin wrapper over these.
 */
export * from "./snapshot/types.js";
export { canonicalize, stringify, sortKeysDeep } from "./snapshot/canonical.js";
export { loadSnapshot, captureLive, normalizeSnapshot, splitArgs } from "./capture.js";
export type { CaptureOptions } from "./capture.js";
export { diffSnapshots, diffSchema } from "./diff/index.js";
export * from "./diff/types.js";
export { render, shouldFail } from "./report.js";
export type { OutputFormat, RenderOptions } from "./report.js";
export { renderChangelog } from "./changelog.js";
export { RULES, RULE_BY_ID, isKnownRule } from "./classify/rules.js";
export type { RuleSpec, DefaultSeverity } from "./classify/rules.js";
export { loadConfig, parseConfig, applyConfig, globToRegExp } from "./config.js";
export type { Config, RuleOverride } from "./config.js";
export { VERSION } from "./version.js";
