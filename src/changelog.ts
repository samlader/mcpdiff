import type { Change, ChangeSet } from "./diff/types.js";
import { severityOf } from "./diff/types.js";

/**
 * Render a human, consumer-facing changelog grouped by impact — the narrative
 * counterpart to the structured `diff` output.
 */
export function renderChangelog(cs: ChangeSet): string {
  const breaking = cs.changes.filter((c) => c.breaking);
  const additions = cs.changes.filter((c) => c.op === "added" && !c.breaking);
  const other = cs.changes.filter((c) => !c.breaking && c.op !== "added");

  const b = `${cs.base.name ?? "base"}${cs.base.version ? ` ${cs.base.version}` : ""}`;
  const r = `${cs.revision.name ?? "revision"}${cs.revision.version ? ` ${cs.revision.version}` : ""}`;

  const out: string[] = [`# Changelog: ${b} → ${r}`, ""];
  if (cs.changes.length === 0) {
    out.push("No changes.", "");
    return out.join("\n");
  }

  section(out, "⚠️ Breaking Changes", breaking);
  section(out, "✨ Additions", additions);
  section(out, "🔧 Other Changes", other);
  return out.join("\n");
}

function section(out: string[], title: string, changes: Change[]): void {
  if (changes.length === 0) return;
  out.push(`## ${title}`, "");
  for (const c of [...changes].sort((a, b) => a.path.localeCompare(b.path))) {
    const drift = severityOf(c) === "warning" ? " _(semantic drift)_" : "";
    out.push(`- ${capitalize(c.message)}${drift}`);
  }
  out.push("");
}

function capitalize(s: string): string {
  return s.length ? s[0]!.toUpperCase() + s.slice(1) : s;
}
