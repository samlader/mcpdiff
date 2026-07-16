import type {
  Prompt,
  PromptArgument,
  Resource,
  ResourceTemplate,
  Snapshot,
  Tool,
  ToolAnnotations,
} from "../snapshot/types.js";
import { diffSchema } from "./schema.js";
import type { Change, ChangeCategory, ChangeSet, Drift } from "./types.js";

export * from "./types.js";
export { diffSchema } from "./schema.js";

/** Compare two snapshots and return every typed change between them. */
export function diffSnapshots(base: Snapshot, revision: Snapshot): ChangeSet {
  const changes: Change[] = [];
  diffServer(base, revision, changes);
  diffTools(base.tools, revision.tools, changes);
  diffResources(base.resources, revision.resources, changes);
  diffResourceTemplates(base.resourceTemplates, revision.resourceTemplates, changes);
  diffPrompts(base.prompts, revision.prompts, changes);
  return {
    base: { name: base.serverInfo?.name, version: base.serverInfo?.version },
    revision: { name: revision.serverInfo?.name, version: revision.serverInfo?.version },
    changes,
  };
}

// --- server metadata -----------------------------------------------------

function diffServer(base: Snapshot, rev: Snapshot, out: Change[]): void {
  const bv = base.serverInfo?.version;
  const rv = rev.serverInfo?.version;
  if (bv !== rv) {
    out.push(
      change(
        "S-VERSION",
        "server",
        "modified",
        "serverInfo/version",
        false,
        `server version ${bv ?? "?"} → ${rv ?? "?"}`,
        bv,
        rv,
      ),
    );
  }

  const bp = base.protocolVersion;
  const rp = rev.protocolVersion;
  if (bp && rp && bp !== rp) {
    const downgrade = rp < bp;
    out.push(
      change(
        "S-PROTO",
        "server",
        "modified",
        "protocolVersion",
        downgrade,
        `protocol version ${bp} → ${rp}`,
        bp,
        rp,
      ),
    );
  }

  const baseCaps = Object.keys(base.capabilities ?? {});
  const revCaps = new Set(Object.keys(rev.capabilities ?? {}));
  const baseCapSet = new Set(baseCaps);
  for (const cap of baseCaps) {
    if (!revCaps.has(cap))
      out.push(
        change(
          "S-CAP-REMOVE",
          "server",
          "removed",
          `capabilities/${cap}`,
          true,
          `capability '${cap}' removed`,
        ),
      );
  }
  for (const cap of revCaps) {
    if (!baseCapSet.has(cap))
      out.push(
        change(
          "S-CAP-ADD",
          "server",
          "added",
          `capabilities/${cap}`,
          false,
          `capability '${cap}' added`,
        ),
      );
  }

  driftChange(
    out,
    "server",
    "S-INSTRUCTIONS-DRIFT",
    "instructions",
    base.instructions,
    rev.instructions,
    "server instructions changed",
  );
}

// --- tools ---------------------------------------------------------------

function diffTools(base: Tool[], rev: Tool[], out: Change[]): void {
  matchBy(base, rev, (t) => t.name, {
    removed: (t) =>
      out.push(
        change(
          "T-REMOVED",
          "tool",
          "removed",
          `tools/${t.name}`,
          true,
          `tool '${t.name}' removed`,
        ),
      ),
    added: (t) =>
      out.push(
        change(
          "T-ADDED",
          "tool",
          "added",
          `tools/${t.name}`,
          false,
          `tool '${t.name}' added`,
        ),
      ),
    both: (b, r) => {
      const p = `tools/${b.name}`;
      driftChange(
        out,
        "tool",
        "T-DESC-DRIFT",
        `${p}/description`,
        b.description,
        r.description,
        `tool '${b.name}' description changed`,
      );
      out.push(
        ...diffSchema(`${p}/input`, b.inputSchema, r.inputSchema, {
          category: "tool",
          role: "input",
        }),
      );
      out.push(
        ...diffSchema(`${p}/output`, b.outputSchema, r.outputSchema, {
          category: "tool",
          role: "output",
        }),
      );
      diffAnnotations(p, b.annotations, r.annotations, out);
    },
  });
}

/** A hint whose weakening loosens the tool's safety contract. */
const SAFETY_HINTS: { key: keyof ToolAnnotations; breakingFrom: boolean }[] = [
  { key: "readOnlyHint", breakingFrom: true }, // true → false weakens
  { key: "destructiveHint", breakingFrom: false }, // false → true weakens
  { key: "idempotentHint", breakingFrom: true }, // true → false weakens
];

function diffAnnotations(
  toolPath: string,
  base: ToolAnnotations | undefined,
  rev: ToolAnnotations | undefined,
  out: Change[],
): void {
  for (const { key, breakingFrom } of SAFETY_HINTS) {
    const bv = base?.[key] as boolean | undefined;
    const rv = rev?.[key] as boolean | undefined;
    if (bv === rv) continue;
    const weakened = bv === breakingFrom && rv === !breakingFrom;
    out.push(
      change(
        weakened ? "T-ANN-WEAKEN" : "T-ANN-CHANGE",
        "tool",
        "modified",
        `${toolPath}/annotations.${key}`,
        weakened,
        `annotation '${key}' ${bv ?? "unset"} → ${rv ?? "unset"}`,
        bv,
        rv,
      ),
    );
  }
}

// --- resources -----------------------------------------------------------

function diffResources(base: Resource[], rev: Resource[], out: Change[]): void {
  matchBy(base, rev, (r) => r.uri, {
    removed: (r) =>
      out.push(
        change(
          "R-REMOVED",
          "resource",
          "removed",
          `resources/${r.uri}`,
          true,
          `resource '${r.uri}' removed`,
        ),
      ),
    added: (r) =>
      out.push(
        change(
          "R-ADDED",
          "resource",
          "added",
          `resources/${r.uri}`,
          false,
          `resource '${r.uri}' added`,
        ),
      ),
    both: (b, r) => {
      const p = `resources/${b.uri}`;
      if (b.mimeType !== r.mimeType)
        out.push(
          change(
            "R-MIME-CHANGE",
            "resource",
            "modified",
            `${p}/mimeType`,
            true,
            `mimeType ${b.mimeType ?? "?"} → ${r.mimeType ?? "?"}`,
            b.mimeType,
            r.mimeType,
          ),
        );
      driftChange(
        out,
        "resource",
        "R-DESC-DRIFT",
        `${p}/description`,
        b.description,
        r.description,
        `resource '${b.uri}' description changed`,
      );
    },
  });
}

function diffResourceTemplates(
  base: ResourceTemplate[],
  rev: ResourceTemplate[],
  out: Change[],
): void {
  matchBy(base, rev, (r) => r.uriTemplate, {
    removed: (r) =>
      out.push(
        change(
          "RT-REMOVED",
          "resourceTemplate",
          "removed",
          `resourceTemplates/${r.uriTemplate}`,
          true,
          `resource template '${r.uriTemplate}' removed`,
        ),
      ),
    added: (r) =>
      out.push(
        change(
          "RT-ADDED",
          "resourceTemplate",
          "added",
          `resourceTemplates/${r.uriTemplate}`,
          false,
          `resource template '${r.uriTemplate}' added`,
        ),
      ),
    both: (b, r) => {
      const p = `resourceTemplates/${b.uriTemplate}`;
      if (b.mimeType !== r.mimeType)
        out.push(
          change(
            "RT-MIME-CHANGE",
            "resourceTemplate",
            "modified",
            `${p}/mimeType`,
            true,
            `mimeType ${b.mimeType ?? "?"} → ${r.mimeType ?? "?"}`,
            b.mimeType,
            r.mimeType,
          ),
        );
      driftChange(
        out,
        "resourceTemplate",
        "RT-DESC-DRIFT",
        `${p}/description`,
        b.description,
        r.description,
        `resource template '${b.uriTemplate}' description changed`,
      );
    },
  });
}

// --- prompts -------------------------------------------------------------

function diffPrompts(base: Prompt[], rev: Prompt[], out: Change[]): void {
  matchBy(base, rev, (p) => p.name, {
    removed: (p) =>
      out.push(
        change(
          "P-REMOVED",
          "prompt",
          "removed",
          `prompts/${p.name}`,
          true,
          `prompt '${p.name}' removed`,
        ),
      ),
    added: (p) =>
      out.push(
        change(
          "P-ADDED",
          "prompt",
          "added",
          `prompts/${p.name}`,
          false,
          `prompt '${p.name}' added`,
        ),
      ),
    both: (b, r) => {
      const p = `prompts/${b.name}`;
      driftChange(
        out,
        "prompt",
        "P-DESC-DRIFT",
        `${p}/description`,
        b.description,
        r.description,
        `prompt '${b.name}' description changed`,
      );
      diffPromptArgs(p, b.arguments ?? [], r.arguments ?? [], out);
    },
  });
}

function diffPromptArgs(
  promptPath: string,
  base: PromptArgument[],
  rev: PromptArgument[],
  out: Change[],
): void {
  matchBy(base, rev, (a) => a.name, {
    removed: (a) =>
      out.push(
        change(
          "P-ARG-REMOVE",
          "prompt",
          "removed",
          `${promptPath}/args.${a.name}`,
          true,
          `argument '${a.name}' removed`,
        ),
      ),
    added: (a) =>
      out.push(
        a.required
          ? change(
              "P-ARG-REQ-ADD",
              "prompt",
              "added",
              `${promptPath}/args.${a.name}`,
              true,
              `new required argument '${a.name}' added`,
            )
          : change(
              "P-ARG-ADD",
              "prompt",
              "added",
              `${promptPath}/args.${a.name}`,
              false,
              `new optional argument '${a.name}' added`,
            ),
      ),
    both: (b, r) => {
      const ap = `${promptPath}/args.${b.name}`;
      if (!!b.required !== !!r.required) {
        out.push(
          r.required
            ? change(
                "P-ARG-OPT-TO-REQ",
                "prompt",
                "modified",
                ap,
                true,
                `argument '${b.name}' became required`,
              )
            : change(
                "P-ARG-REQ-TO-OPT",
                "prompt",
                "modified",
                ap,
                false,
                `argument '${b.name}' became optional`,
              ),
        );
      }
      driftChange(
        out,
        "prompt",
        "P-ARG-DESC-DRIFT",
        `${ap}/description`,
        b.description,
        r.description,
        `argument '${b.name}' description changed`,
      );
    },
  });
}

// --- helpers -------------------------------------------------------------

interface MatchHandlers<T> {
  removed: (item: T) => void;
  added: (item: T) => void;
  both: (base: T, revision: T) => void;
}

/** Match two lists by an identity key and dispatch add/remove/both handlers. */
function matchBy<T>(
  base: T[],
  rev: T[],
  key: (item: T) => string,
  handlers: MatchHandlers<T>,
): void {
  const baseByKey = new Map(base.map((item) => [key(item), item]));
  const revByKey = new Map(rev.map((item) => [key(item), item]));
  for (const [k, item] of baseByKey) {
    const other = revByKey.get(k);
    if (other === undefined) handlers.removed(item);
    else handlers.both(item, other);
  }
  for (const [k, item] of revByKey) {
    if (!baseByKey.has(k)) handlers.added(item);
  }
}

function change(
  ruleId: string,
  category: ChangeCategory,
  op: Change["op"],
  path: string,
  breaking: boolean,
  message: string,
  before?: unknown,
  after?: unknown,
): Change {
  return { ruleId, category, op, path, breaking, message, before, after };
}

/** Emit a text-drift change if two description-like strings differ. */
function driftChange(
  out: Change[],
  category: ChangeCategory,
  ruleId: string,
  path: string,
  before: string | undefined,
  after: string | undefined,
  message: string,
): void {
  const b = (before ?? "").trim();
  const a = (after ?? "").trim();
  if (b === a) return;
  const drift = driftLevel(b, a);
  out.push({
    ruleId,
    category,
    op: "modified",
    path,
    breaking: false,
    drift,
    message,
    before,
    after,
  });
}

/**
 * Built-in, dependency-free drift heuristic: token Jaccard similarity. A large
 * drop in shared vocabulary signals the description's *meaning* likely changed,
 * which can silently alter how a model uses the tool. The `--semantic` embedding
 * mode (future) refines this.
 */
function driftLevel(before: string, after: string): Drift {
  if (before === "" || after === "") return "high";
  const sim = jaccard(tokens(before), tokens(after));
  if (sim < 0.5) return "high";
  if (sim < 0.85) return "low";
  return "none";
}

function tokens(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter(Boolean),
  );
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 1;
  let intersection = 0;
  for (const x of a) if (b.has(x)) intersection++;
  return intersection / (a.size + b.size - intersection);
}
