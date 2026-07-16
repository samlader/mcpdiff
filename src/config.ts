import { readFileSync } from "node:fs";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { parse as parseYaml } from "yaml";
import type { Change } from "./diff/types.js";

export type RuleOverride = "off" | "info" | "warn" | "breaking";

export interface Config {
  /** Per-rule severity overrides, keyed by rule ID (e.g. `T-REQ-ADD: warn`). */
  rules?: Record<string, RuleOverride>;
  /** Glob patterns; matching change paths are dropped entirely. */
  ignore?: string[];
  /** When true, high semantic drift alone fails the breaking gate. */
  failOnDrift?: boolean;
}

const CONFIG_NAMES = [".mcpdiff.yaml", ".mcpdiff.yml", ".mcpdiff.json"];

/** Search from `startDir` upward for a config file and load it, if any. */
export function loadConfig(startDir = process.cwd()): Config {
  let dir = resolve(startDir);
  for (;;) {
    for (const name of CONFIG_NAMES) {
      const candidate = join(dir, name);
      if (existsSync(candidate)) return parseConfig(readFileSync(candidate, "utf8"));
    }
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return {};
}

export function parseConfig(text: string): Config {
  const raw = parseYaml(text) ?? {};
  if (typeof raw !== "object") return {};
  return raw as Config;
}

/**
 * Apply config overrides to a change list: drop ignored/`off` changes and
 * re-classify the rest. Returns a new array; the input is not mutated.
 */
export function applyConfig(changes: Change[], config: Config): Change[] {
  const ignore = (config.ignore ?? []).map(globToRegExp);
  const out: Change[] = [];

  for (const change of changes) {
    if (ignore.some((re) => re.test(change.path))) continue;

    const override = config.rules?.[change.ruleId];
    if (override === "off") continue;

    if (override === undefined) {
      out.push(change);
      continue;
    }

    out.push(reclassify(change, override));
  }
  return out;
}

function reclassify(change: Change, override: RuleOverride): Change {
  switch (override) {
    case "breaking":
      return { ...change, breaking: true };
    case "warn":
      return { ...change, breaking: false, drift: "high" };
    case "info":
      return { ...change, breaking: false, drift: undefined };
    default:
      return change;
  }
}

/** Minimal glob: `*` matches any run of characters, `?` matches one. */
export function globToRegExp(pattern: string): RegExp {
  const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, "\\$&");
  const body = escaped.replace(/\*/g, ".*").replace(/\?/g, ".");
  return new RegExp(`^${body}$`);
}
