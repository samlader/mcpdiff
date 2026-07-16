import { describe, expect, it } from "vitest";
import { diffSchema } from "../src/diff/schema.js";
import type { JSONSchema } from "../src/snapshot/types.js";

type Ctx = { category: "tool"; role: "input" | "output" };
const input: Ctx = { category: "tool", role: "input" };
const output: Ctx = { category: "tool", role: "output" };

function ids(base: JSONSchema, rev: JSONSchema, ctx: Ctx = input): string[] {
  return diffSchema("t", base, rev, ctx).map((c) => c.ruleId);
}

function breaking(base: JSONSchema, rev: JSONSchema, ctx: Ctx = input) {
  return diffSchema("t", base, rev, ctx).filter((c) => c.breaking);
}

describe("input schema variance", () => {
  it("flags a new required property as breaking", () => {
    const base = {
      type: "object",
      properties: { a: { type: "string" } },
      required: ["a"],
    };
    const rev = {
      type: "object",
      properties: { a: { type: "string" }, b: { type: "string" } },
      required: ["a", "b"],
    };
    expect(ids(base, rev)).toContain("T-REQ-ADD");
    expect(breaking(base, rev)).toHaveLength(1);
  });

  it("treats a new optional property as non-breaking", () => {
    const base = { type: "object", properties: { a: { type: "string" } } };
    const rev = {
      type: "object",
      properties: { a: { type: "string" }, b: { type: "string" } },
    };
    expect(ids(base, rev)).toEqual(["T-PROP-ADD"]);
    expect(breaking(base, rev)).toHaveLength(0);
  });

  it("flags removing an input enum value as breaking", () => {
    const base = { enum: ["a", "b", "c"] };
    const rev = { enum: ["a", "b"] };
    expect(ids(base, rev)).toEqual(["T-ENUM-REMOVE"]);
    expect(breaking(base, rev)).toHaveLength(1);
  });

  it("treats adding an input enum value as non-breaking", () => {
    const base = { enum: ["a"] };
    const rev = { enum: ["a", "b"] };
    expect(breaking(base, rev)).toHaveLength(0);
  });

  it("narrowing a type is breaking; widening is not", () => {
    expect(breaking({ type: ["string", "number"] }, { type: "string" })).toHaveLength(1);
    expect(breaking({ type: "string" }, { type: ["string", "number"] })).toHaveLength(0);
  });

  it("tightening a numeric constraint is breaking", () => {
    expect(breaking({ minimum: 0 }, { minimum: 5 })).toHaveLength(1);
    expect(breaking({ minimum: 5 }, { minimum: 0 })).toHaveLength(0);
    expect(breaking({ maxLength: 100 }, { maxLength: 10 })).toHaveLength(1);
  });

  it("optional → required is breaking", () => {
    const base = { type: "object", properties: { a: {} }, required: [] };
    const rev = { type: "object", properties: { a: {} }, required: ["a"] };
    expect(ids(base, rev)).toContain("T-OPT-TO-REQ");
  });
});

describe("output schema variance inverts", () => {
  it("removing an output property is breaking", () => {
    const base = { type: "object", properties: { a: {}, b: {} } };
    const rev = { type: "object", properties: { a: {} } };
    expect(breaking(base, rev, output)).toHaveLength(1);
    expect(ids(base, rev, output)).toEqual(["T-OUT-PROP-REMOVE"]);
  });

  it("adding an output property is non-breaking", () => {
    const base = { type: "object", properties: { a: {} } };
    const rev = { type: "object", properties: { a: {}, b: {} } };
    expect(breaking(base, rev, output)).toHaveLength(0);
  });

  it("adding an output enum value is breaking", () => {
    expect(breaking({ enum: ["a"] }, { enum: ["a", "b"] }, output)).toHaveLength(1);
  });
});

describe("nested schemas", () => {
  it("recurses into nested object properties", () => {
    const base = {
      type: "object",
      properties: {
        outer: { type: "object", properties: { inner: { type: "string" } } },
      },
    };
    const rev = {
      type: "object",
      properties: {
        outer: { type: "object", properties: { inner: { type: "number" } } },
      },
    };
    const changes = diffSchema("t", base, rev, input);
    expect(changes[0]?.path).toBe("t.outer.inner");
    expect(changes[0]?.breaking).toBe(true);
  });

  it("recurses into array items", () => {
    const base = { type: "array", items: { type: "string" } };
    const rev = { type: "array", items: { type: "number" } };
    expect(diffSchema("t", base, rev, input)[0]?.path).toBe("t[]");
  });
});
