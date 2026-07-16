import type { Prompt, Resource, ResourceTemplate, Snapshot, Tool } from "./types.js";

/**
 * Produce a deterministic, diff-friendly serialization of a snapshot:
 * elements are sorted by identity and object keys are sorted recursively, so
 * two captures of the same server always yield byte-identical output. This is
 * what makes committed snapshots reviewable in git.
 */
export function canonicalize(snapshot: Snapshot): Snapshot {
  return {
    mcpdiffVersion: snapshot.mcpdiffVersion,
    capturedAt: snapshot.capturedAt,
    serverInfo: snapshot.serverInfo,
    protocolVersion: snapshot.protocolVersion,
    capabilities: snapshot.capabilities,
    instructions: snapshot.instructions,
    tools: [...snapshot.tools].sort(byKey<Tool>((t) => t.name)),
    resources: [...snapshot.resources].sort(byKey<Resource>((r) => r.uri)),
    resourceTemplates: [...snapshot.resourceTemplates].sort(
      byKey<ResourceTemplate>((r) => r.uriTemplate),
    ),
    prompts: [...snapshot.prompts].sort(byKey<Prompt>((p) => p.name)),
  };
}

/** Serialize a snapshot to canonical, stably-keyed JSON with a trailing newline. */
export function stringify(snapshot: Snapshot): string {
  return JSON.stringify(sortKeysDeep(canonicalize(snapshot)), null, 2) + "\n";
}

function byKey<T>(key: (item: T) => string): (a: T, b: T) => number {
  return (a, b) => key(a).localeCompare(key(b));
}

/** Recursively sort object keys so JSON output is order-independent. */
export function sortKeysDeep(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortKeysDeep);
  }
  if (value !== null && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      const v = (value as Record<string, unknown>)[key];
      if (v !== undefined) out[key] = sortKeysDeep(v);
    }
    return out;
  }
  return value;
}
