import { describe, expect, it } from "vitest";
import { loadSnapshot, normalizeSnapshot, splitArgs } from "../src/capture.js";

describe("splitArgs", () => {
  it("splits on whitespace", () => {
    expect(splitArgs("npx -y @scope/server")).toEqual(["npx", "-y", "@scope/server"]);
  });

  it("honours quotes", () => {
    expect(splitArgs(`node server.js --flag "a b" 'c d'`)).toEqual([
      "node",
      "server.js",
      "--flag",
      "a b",
      "c d",
    ]);
  });
});

describe("normalizeSnapshot", () => {
  it("fills in missing collections", () => {
    const s = normalizeSnapshot({ serverInfo: { name: "x" } }, "test");
    expect(s.tools).toEqual([]);
    expect(s.prompts).toEqual([]);
    expect(s.mcpdiffVersion).toBe("1");
  });

  it("rejects non-objects", () => {
    expect(() => normalizeSnapshot(42, "test")).toThrow();
  });
});

describe("loadSnapshot", () => {
  it("reads a snapshot from a file path", async () => {
    const s = await loadSnapshot("examples/weather-v1.json");
    expect(s.serverInfo?.name).toBe("weather");
    expect(s.tools).toHaveLength(2);
  });

  it("throws on an unresolvable source", async () => {
    await expect(loadSnapshot("nope://whatever")).rejects.toThrow();
  });
});
