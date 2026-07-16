export type ChangeCategory =
  "tool" | "resource" | "resourceTemplate" | "prompt" | "server";

export type ChangeOp = "added" | "removed" | "modified";

/** How strongly a change affects an existing consumer. */
export type Severity = "breaking" | "warning" | "info";

/** Semantic drift level for description/instruction text changes. */
export type Drift = "none" | "low" | "high";

/**
 * A single typed difference between two snapshots.
 *
 * `breaking` is computed structurally by the diff engine (which knows request
 * vs response variance); the classifier may later downgrade it via config.
 */
export interface Change {
  /** Stable rule identifier, e.g. `T-REQ-ADD`. Used for config overrides. */
  ruleId: string;
  category: ChangeCategory;
  op: ChangeOp;
  /** Human path to the element, e.g. `tools/search` or `tools/search/input.query`. */
  path: string;
  /** Whether this breaks an existing consumer of the base snapshot. */
  breaking: boolean;
  /** Present for text-only changes that may alter model behaviour. */
  drift?: Drift;
  message: string;
  before?: unknown;
  after?: unknown;
}

export interface ChangeSet {
  base: { name?: string; version?: string };
  revision: { name?: string; version?: string };
  changes: Change[];
}

export function severityOf(change: Change): Severity {
  if (change.breaking) return "breaking";
  if (change.drift === "high") return "warning";
  return "info";
}

export function summarize(changes: Change[]): Record<Severity, number> {
  const counts: Record<Severity, number> = { breaking: 0, warning: 0, info: 0 };
  for (const c of changes) counts[severityOf(c)]++;
  return counts;
}
