import type { JSONSchema } from "../snapshot/types.js";
import type { Change, ChangeCategory } from "./types.js";

/**
 * Whether a schema describes data the consumer *sends* (`input`) or *receives*
 * (`output`). Breaking-change variance inverts between the two: narrowing an
 * accepted input breaks callers, whereas narrowing a produced output is safe —
 * it is broadening the output that breaks readers.
 */
export type Role = "input" | "output";

interface Ctx {
  category: ChangeCategory;
  role: Role;
}

/**
 * Recursively diff two JSON Schemas, emitting typed, pre-classified changes.
 *
 * The comparison is intentionally focused on the JSON Schema subset MCP servers
 * use in practice: `type`, `enum`, object `properties`/`required`, array
 * `items`, and the common numeric/string/array constraints.
 */
export function diffSchema(
  path: string,
  base: JSONSchema | undefined,
  revision: JSONSchema | undefined,
  ctx: Ctx,
): Change[] {
  if (base == null && revision == null) return [];
  const b = base ?? {};
  const r = revision ?? {};
  const changes: Change[] = [];

  diffType(path, b, r, ctx, changes);
  diffEnum(path, b, r, ctx, changes);
  diffConstraints(path, b, r, ctx, changes);
  diffProperties(path, b, r, ctx, changes);

  const bItems = asSchema(b.items);
  const rItems = asSchema(r.items);
  if (bItems || rItems) {
    changes.push(...diffSchema(`${path}[]`, bItems, rItems, ctx));
  }

  return changes;
}

function diffType(
  path: string,
  b: JSONSchema,
  r: JSONSchema,
  ctx: Ctx,
  out: Change[],
): void {
  const bt = typeSet(b);
  const rt = typeSet(r);
  if (setEqual(bt, rt)) return;

  const narrower = isSubset(rt, bt); // revision permits fewer types
  const broader = isSubset(bt, rt); // revision permits more types

  if (ctx.role === "input") {
    if (narrower) {
      push(out, ctx, "T-TYPE-NARROW", path, true, `input type narrowed`, b.type, r.type);
    } else if (broader) {
      push(out, ctx, "T-TYPE-WIDEN", path, false, `input type widened`, b.type, r.type);
    } else {
      push(out, ctx, "T-TYPE-CHANGE", path, true, `input type changed`, b.type, r.type);
    }
  } else {
    if (broader) {
      push(
        out,
        ctx,
        "T-OUT-TYPE-CHANGE",
        path,
        true,
        `output type broadened`,
        b.type,
        r.type,
      );
    } else if (narrower) {
      push(
        out,
        ctx,
        "T-OUT-TYPE-NARROW",
        path,
        false,
        `output type narrowed`,
        b.type,
        r.type,
      );
    } else {
      push(
        out,
        ctx,
        "T-OUT-TYPE-CHANGE",
        path,
        true,
        `output type changed`,
        b.type,
        r.type,
      );
    }
  }
}

function diffEnum(
  path: string,
  b: JSONSchema,
  r: JSONSchema,
  ctx: Ctx,
  out: Change[],
): void {
  const be = enumSet(b);
  const re = enumSet(r);
  if (!be && !re) return;

  const input = ctx.role === "input";

  // Introducing an enum where none existed restricts the domain.
  if (!be && re) {
    if (input)
      push(
        out,
        ctx,
        "T-ENUM-RESTRICT",
        path,
        true,
        `enum constraint added to input`,
        undefined,
        [...re],
      );
    else
      push(
        out,
        ctx,
        "T-OUT-ENUM-RESTRICT",
        path,
        false,
        `enum constraint added to output`,
        undefined,
        [...re],
      );
    return;
  }
  if (be && !re) {
    if (input)
      push(
        out,
        ctx,
        "T-ENUM-RELAX",
        path,
        false,
        `enum constraint removed from input`,
        [...be],
        undefined,
      );
    else
      push(
        out,
        ctx,
        "T-OUT-ENUM-RELAX",
        path,
        true,
        `enum constraint removed from output`,
        [...be],
        undefined,
      );
    return;
  }
  if (!be || !re) return;

  const removed = [...be].filter((v) => !re.has(v));
  const added = [...re].filter((v) => !be.has(v));

  if (removed.length) {
    if (input)
      push(
        out,
        ctx,
        "T-ENUM-REMOVE",
        path,
        true,
        `enum value(s) removed from input: ${removed.join(", ")}`,
        removed,
      );
    else
      push(
        out,
        ctx,
        "T-OUT-ENUM-REMOVE",
        path,
        false,
        `enum value(s) removed from output: ${removed.join(", ")}`,
        removed,
      );
  }
  if (added.length) {
    if (input)
      push(
        out,
        ctx,
        "T-ENUM-ADD",
        path,
        false,
        `enum value(s) added to input: ${added.join(", ")}`,
        undefined,
        added,
      );
    else
      push(
        out,
        ctx,
        "T-OUT-ENUM-ADD",
        path,
        true,
        `enum value(s) added to output: ${added.join(", ")}`,
        undefined,
        added,
      );
  }
}

interface ConstraintDef {
  key: string;
  /** For numeric bounds: a higher value tightens the constraint. */
  higherIsTighter: boolean;
}

const NUMERIC_CONSTRAINTS: ConstraintDef[] = [
  { key: "minimum", higherIsTighter: true },
  { key: "exclusiveMinimum", higherIsTighter: true },
  { key: "maximum", higherIsTighter: false },
  { key: "exclusiveMaximum", higherIsTighter: false },
  { key: "minLength", higherIsTighter: true },
  { key: "maxLength", higherIsTighter: false },
  { key: "minItems", higherIsTighter: true },
  { key: "maxItems", higherIsTighter: false },
];

const KEYWORD_CONSTRAINTS = ["pattern", "format", "multipleOf"];

function diffConstraints(
  path: string,
  b: JSONSchema,
  r: JSONSchema,
  ctx: Ctx,
  out: Change[],
): void {
  const input = ctx.role === "input";
  const emit = (tighter: boolean, key: string, before: unknown, after: unknown) => {
    // For inputs, tightening rejects previously-valid arguments (breaking).
    // For outputs we report constraint moves as informational to avoid noise.
    if (input) {
      if (tighter)
        push(
          out,
          ctx,
          "T-CONSTRAINT-TIGHTEN",
          path,
          true,
          `input constraint '${key}' tightened`,
          before,
          after,
        );
      else
        push(
          out,
          ctx,
          "T-CONSTRAINT-LOOSEN",
          path,
          false,
          `input constraint '${key}' loosened`,
          before,
          after,
        );
    } else {
      push(
        out,
        ctx,
        "T-OUT-CONSTRAINT",
        path,
        false,
        `output constraint '${key}' changed`,
        before,
        after,
      );
    }
  };

  for (const { key, higherIsTighter } of NUMERIC_CONSTRAINTS) {
    const bv = numeric(b[key]);
    const rv = numeric(r[key]);
    if (bv === rv) continue;
    if (bv === undefined && rv !== undefined) emit(true, key, undefined, rv);
    else if (bv !== undefined && rv === undefined) emit(false, key, bv, undefined);
    else if (bv !== undefined && rv !== undefined)
      emit(higherIsTighter ? rv > bv : rv < bv, key, bv, rv);
  }

  for (const key of KEYWORD_CONSTRAINTS) {
    const bv = b[key];
    const rv = r[key];
    if (JSON.stringify(bv) === JSON.stringify(rv)) continue;
    // Adding or changing one of these keywords tightens; removing loosens.
    const tighter = rv !== undefined;
    emit(tighter, key, bv, rv);
  }
}

function diffProperties(
  path: string,
  b: JSONSchema,
  r: JSONSchema,
  ctx: Ctx,
  out: Change[],
): void {
  const bProps = props(b);
  const rProps = props(r);
  if (!bProps && !rProps) return;

  const bRequired = requiredSet(b);
  const rRequired = requiredSet(r);
  const names = new Set([...Object.keys(bProps ?? {}), ...Object.keys(rProps ?? {})]);
  const input = ctx.role === "input";

  for (const name of names) {
    const childPath = `${path}.${name}`;
    const inBase = bProps ? name in bProps : false;
    const inRev = rProps ? name in rProps : false;

    if (inBase && !inRev) {
      if (input)
        push(out, ctx, "T-PROP-REMOVE", childPath, true, `input property removed`);
      else
        push(out, ctx, "T-OUT-PROP-REMOVE", childPath, true, `output property removed`);
      continue;
    }
    if (!inBase && inRev) {
      const req = rRequired.has(name);
      if (input) {
        if (req)
          push(
            out,
            ctx,
            "T-REQ-ADD",
            childPath,
            true,
            `new required input property added`,
          );
        else
          push(
            out,
            ctx,
            "T-PROP-ADD",
            childPath,
            false,
            `new optional input property added`,
          );
      } else {
        push(out, ctx, "T-OUT-PROP-ADD", childPath, false, `new output property added`);
      }
      continue;
    }

    // Present in both: recurse, then compare required transition.
    out.push(
      ...diffSchema(childPath, asSchema(bProps![name]), asSchema(rProps![name]), ctx),
    );

    const wasReq = bRequired.has(name);
    const nowReq = rRequired.has(name);
    if (wasReq === nowReq) continue;
    if (input) {
      if (!wasReq && nowReq)
        push(out, ctx, "T-OPT-TO-REQ", childPath, true, `input property became required`);
      else
        push(
          out,
          ctx,
          "T-REQ-TO-OPT",
          childPath,
          false,
          `input property became optional`,
        );
    } else {
      if (wasReq && !nowReq)
        push(
          out,
          ctx,
          "T-OUT-REQ-REMOVE",
          childPath,
          true,
          `guaranteed output property became optional`,
        );
      else
        push(
          out,
          ctx,
          "T-OUT-REQ-ADD",
          childPath,
          false,
          `output property became guaranteed`,
        );
    }
  }
}

// --- helpers -------------------------------------------------------------

function push(
  out: Change[],
  ctx: Ctx,
  ruleId: string,
  path: string,
  breaking: boolean,
  message: string,
  before?: unknown,
  after?: unknown,
): void {
  out.push({
    ruleId,
    category: ctx.category,
    op: "modified",
    path,
    breaking,
    message,
    before,
    after,
  });
}

function asSchema(value: unknown): JSONSchema | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as JSONSchema)
    : undefined;
}

function typeSet(schema: JSONSchema): Set<string> | null {
  const t = schema.type;
  if (t === undefined) return null;
  return new Set(Array.isArray(t) ? (t as string[]) : [t as string]);
}

function enumSet(schema: JSONSchema): Set<string> | null {
  const e = schema.enum;
  if (!Array.isArray(e)) return null;
  return new Set(e.map((v) => JSON.stringify(v)));
}

function props(schema: JSONSchema): Record<string, unknown> | null {
  const p = schema.properties;
  return p && typeof p === "object" ? (p as Record<string, unknown>) : null;
}

function requiredSet(schema: JSONSchema): Set<string> {
  const req = schema.required;
  return new Set(Array.isArray(req) ? (req as string[]) : []);
}

function numeric(v: unknown): number | undefined {
  return typeof v === "number" ? v : undefined;
}

function setEqual(a: Set<string> | null, b: Set<string> | null): boolean {
  if (a === null || b === null) return a === b;
  if (a.size !== b.size) return false;
  for (const x of a) if (!b.has(x)) return false;
  return true;
}

/** null represents the universal set ("any type"), so everything is a subset of it. */
function isSubset(a: Set<string> | null, b: Set<string> | null): boolean {
  if (b === null) return true;
  if (a === null) return false;
  for (const x of a) if (!b.has(x)) return false;
  return true;
}
