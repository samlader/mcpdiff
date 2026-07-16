import { describe, expect, it } from "vitest";
import { applyConfig, globToRegExp, parseConfig } from "../src/config.js";
import type { Change } from "../src/diff/types.js";

function change(over: Partial<Change>): Change {
  return {
    ruleId: "T-REQ-ADD",
    category: "tool",
    op: "modified",
    path: "tools/search/input.tenant_id",
    breaking: true,
    message: "new required input property added",
    ...over,
  };
}

describe("applyConfig", () => {
  it("drops changes matching an ignore glob", () => {
    const changes = [change({}), change({ path: "tools/debug_dump" })];
    const result = applyConfig(changes, { ignore: ["tools/debug_*"] });
    expect(result).toHaveLength(1);
    expect(result[0]?.path).toBe("tools/search/input.tenant_id");
  });

  it("downgrades a rule to warn", () => {
    const result = applyConfig([change({})], { rules: { "T-REQ-ADD": "warn" } });
    expect(result[0]?.breaking).toBe(false);
    expect(result[0]?.drift).toBe("high");
  });

  it("turns a rule off entirely", () => {
    expect(applyConfig([change({})], { rules: { "T-REQ-ADD": "off" } })).toHaveLength(0);
  });

  it("escalates a non-breaking rule to breaking", () => {
    const c = change({ ruleId: "T-ADDED", breaking: false });
    expect(applyConfig([c], { rules: { "T-ADDED": "breaking" } })[0]?.breaking).toBe(
      true,
    );
  });

  it("does not mutate the input", () => {
    const input = [change({})];
    applyConfig(input, { rules: { "T-REQ-ADD": "warn" } });
    expect(input[0]?.breaking).toBe(true);
  });
});

describe("globToRegExp", () => {
  it("matches with wildcards", () => {
    expect(globToRegExp("tools/debug_*").test("tools/debug_dump")).toBe(true);
    expect(globToRegExp("tools/debug_*").test("tools/search")).toBe(false);
    expect(globToRegExp("tools/?").test("tools/x")).toBe(true);
  });
});

describe("parseConfig", () => {
  it("parses yaml", () => {
    const cfg = parseConfig("rules:\n  T-REQ-ADD: warn\nignore:\n  - tools/x\n");
    expect(cfg.rules?.["T-REQ-ADD"]).toBe("warn");
    expect(cfg.ignore).toEqual(["tools/x"]);
  });

  it("returns empty config for empty input", () => {
    expect(parseConfig("")).toEqual({});
  });
});
