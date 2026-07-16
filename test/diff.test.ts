import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { normalizeSnapshot } from "../src/capture.js";
import { diffSnapshots, summarize } from "../src/diff/index.js";
import type { Snapshot } from "../src/snapshot/types.js";

function load(name: string): Snapshot {
  return normalizeSnapshot(JSON.parse(readFileSync(`examples/${name}`, "utf8")), name);
}

describe("diffSnapshots on the weather example", () => {
  const cs = diffSnapshots(load("weather-v1.json"), load("weather-v2.json"));
  const byRule = (id: string) => cs.changes.filter((c) => c.ruleId === id);

  it("detects each expected breaking change", () => {
    expect(byRule("T-REQ-ADD")).toHaveLength(1); // api_key
    expect(byRule("T-ENUM-REMOVE")).toHaveLength(1); // fahrenheit
    expect(byRule("T-ANN-WEAKEN")).toHaveLength(1); // readOnlyHint true→false
    expect(byRule("T-REMOVED")).toHaveLength(1); // list_alerts
    expect(byRule("P-ARG-REQ-ADD")).toHaveLength(1); // days
  });

  it("counts exactly five breaking changes", () => {
    expect(summarize(cs.changes).breaking).toBe(5);
  });

  it("classifies additions as non-breaking", () => {
    expect(byRule("T-ADDED")).toHaveLength(1); // get_history
    expect(byRule("R-ADDED")).toHaveLength(1); // radar
    expect(byRule("S-VERSION")[0]?.breaking).toBe(false);
  });

  it("reports description rewording as drift, not a break", () => {
    const drift = byRule("T-DESC-DRIFT");
    expect(drift).toHaveLength(1);
    expect(drift[0]?.breaking).toBe(false);
    expect(drift[0]?.drift).toBeDefined();
  });

  it("is symmetric in reverse for additions/removals", () => {
    const rev = diffSnapshots(load("weather-v2.json"), load("weather-v1.json"));
    // list_alerts comes back as an addition; get_history/radar as removals.
    expect(rev.changes.filter((c) => c.ruleId === "T-ADDED")).toHaveLength(1);
    expect(rev.changes.filter((c) => c.ruleId === "R-REMOVED")).toHaveLength(1);
  });
});

describe("empty diff", () => {
  it("reports no changes for identical snapshots", () => {
    const snap = load("weather-v1.json");
    expect(diffSnapshots(snap, snap).changes).toHaveLength(0);
  });
});
