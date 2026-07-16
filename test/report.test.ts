import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { normalizeSnapshot } from "../src/capture.js";
import { renderChangelog } from "../src/changelog.js";
import { canonicalize, stringify } from "../src/snapshot/canonical.js";
import { diffSnapshots } from "../src/diff/index.js";
import { render, shouldFail } from "../src/report.js";
import type { Snapshot } from "../src/snapshot/types.js";

function load(name: string): Snapshot {
  return normalizeSnapshot(JSON.parse(readFileSync(`examples/${name}`, "utf8")), name);
}

const cs = diffSnapshots(load("weather-v1.json"), load("weather-v2.json"));

describe("render", () => {
  it("emits valid JSON with a summary", () => {
    const parsed = JSON.parse(render(cs, "json"));
    expect(parsed.summary.breaking).toBe(5);
    expect(parsed.changes.every((c: { severity: string }) => c.severity)).toBe(true);
  });

  it("breakingOnly hides info changes", () => {
    const parsed = JSON.parse(render(cs, "json", { breakingOnly: true }));
    expect(parsed.changes.some((c: { severity: string }) => c.severity === "info")).toBe(
      false,
    );
  });

  it("markdown contains a table", () => {
    expect(render(cs, "markdown")).toContain("| Severity |");
  });

  it("github format emits workflow annotations", () => {
    expect(render(cs, "github")).toMatch(/^::error /m);
  });
});

describe("shouldFail", () => {
  it("fails when there are breaking changes", () => {
    expect(shouldFail(cs.changes)).toBe(true);
  });

  it("passes a drift-only change unless failOnDrift is set", () => {
    const driftOnly = cs.changes.filter((c) => c.drift === "high" && !c.breaking);
    expect(shouldFail(driftOnly)).toBe(false);
    if (driftOnly.length > 0) expect(shouldFail(driftOnly, true)).toBe(true);
  });
});

describe("changelog", () => {
  it("groups breaking changes under a heading", () => {
    const md = renderChangelog(cs);
    expect(md).toContain("## ⚠️ Breaking Changes");
    expect(md).toContain("## ✨ Additions");
  });
});

describe("canonical serialization", () => {
  it("is stable regardless of input ordering", () => {
    const a = load("weather-v1.json");
    const b: Snapshot = { ...a, tools: [...a.tools].reverse() };
    expect(stringify(a)).toBe(stringify(b));
  });

  it("sorts tools by name", () => {
    const c = canonicalize(load("weather-v2.json"));
    expect(c.tools.map((t) => t.name)).toEqual(["get_forecast", "get_history"]);
  });
});
