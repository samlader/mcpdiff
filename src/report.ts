import type { Change, ChangeSet, Severity } from "./diff/types.js";
import { severityOf, summarize } from "./diff/types.js";

export type OutputFormat = "text" | "json" | "markdown" | "github";

export interface RenderOptions {
  /** Only show changes at or above breaking severity (used by `breaking`). */
  breakingOnly?: boolean;
  color?: boolean;
}

/** Render a change set in the requested format. */
export function render(
  cs: ChangeSet,
  format: OutputFormat,
  opts: RenderOptions = {},
): string {
  const changes = sortChanges(
    opts.breakingOnly ? cs.changes.filter((c) => severityOf(c) !== "info") : cs.changes,
  );
  switch (format) {
    case "json":
      return renderJson(cs, changes);
    case "markdown":
      return renderMarkdown(cs, changes);
    case "github":
      return renderGithub(changes);
    case "text":
      return renderText(cs, changes, opts.color ?? false);
  }
}

const SEVERITY_ORDER: Record<Severity, number> = { breaking: 0, warning: 1, info: 2 };

function sortChanges(changes: Change[]): Change[] {
  return [...changes].sort((a, b) => {
    const s = SEVERITY_ORDER[severityOf(a)] - SEVERITY_ORDER[severityOf(b)];
    return s !== 0 ? s : a.path.localeCompare(b.path);
  });
}

function countsLine(changes: Change[]): string {
  const c = summarize(changes);
  return `${changes.length} change${changes.length === 1 ? "" : "s"}: ${c.breaking} breaking, ${c.warning} warning, ${c.info} info`;
}

// --- text ----------------------------------------------------------------

const COLORS: Record<Severity, string> = {
  breaking: "\x1b[31m", // red
  warning: "\x1b[33m", // yellow
  info: "\x1b[90m", // grey
};
const RESET = "\x1b[0m";

function renderText(cs: ChangeSet, changes: Change[], color: boolean): string {
  const paint = (sev: Severity, s: string) => (color ? `${COLORS[sev]}${s}${RESET}` : s);
  const header = `${labelFor(cs)}\n${countsLine(changes)}`;
  if (changes.length === 0) return `${header}\n\nNo changes.`;

  const lines = changes.map((c) => {
    const sev = severityOf(c);
    const tag = paint(sev, sev.toUpperCase().padEnd(8));
    return `${tag}  ${c.path.padEnd(40)}  ${c.message}  [${c.ruleId}]`;
  });
  return `${header}\n\n${lines.join("\n")}`;
}

function labelFor(cs: ChangeSet): string {
  const b = `${cs.base.name ?? "base"}${cs.base.version ? `@${cs.base.version}` : ""}`;
  const r = `${cs.revision.name ?? "revision"}${cs.revision.version ? `@${cs.revision.version}` : ""}`;
  return `${b} → ${r}`;
}

// --- json ----------------------------------------------------------------

function renderJson(cs: ChangeSet, changes: Change[]): string {
  return (
    JSON.stringify(
      {
        base: cs.base,
        revision: cs.revision,
        summary: summarize(changes),
        changes: changes.map((c) => ({ severity: severityOf(c), ...c })),
      },
      null,
      2,
    ) + "\n"
  );
}

// --- markdown ------------------------------------------------------------

function renderMarkdown(cs: ChangeSet, changes: Change[]): string {
  const c = summarize(changes);
  const out = [
    `# mcpdiff: ${labelFor(cs)}`,
    "",
    `**${changes.length} changes** — 🔴 ${c.breaking} breaking · 🟡 ${c.warning} warning · ⚪ ${c.info} info`,
    "",
  ];
  if (changes.length === 0) {
    out.push("No changes.");
    return out.join("\n") + "\n";
  }
  out.push("| Severity | Change | Path | Rule |", "| --- | --- | --- | --- |");
  for (const change of changes) {
    const sev = severityOf(change);
    const icon = sev === "breaking" ? "🔴" : sev === "warning" ? "🟡" : "⚪";
    out.push(
      `| ${icon} ${sev} | ${escapeCell(change.message)} | \`${escapeCell(change.path)}\` | \`${change.ruleId}\` |`,
    );
  }
  return out.join("\n") + "\n";
}

function escapeCell(s: string): string {
  return s.replace(/\|/g, "\\|");
}

// --- github --------------------------------------------------------------

/** GitHub Actions workflow-command annotations for inline PR feedback. */
function renderGithub(changes: Change[]): string {
  return (
    changes
      .filter((c) => severityOf(c) !== "info")
      .map((c) => {
        const level = severityOf(c) === "breaking" ? "error" : "warning";
        return `::${level} title=mcpdiff ${c.ruleId}::${c.path}: ${c.message}`;
      })
      .join("\n") + "\n"
  );
}

/** Decide whether a change set should fail a CI gate. */
export function shouldFail(changes: Change[], failOnDrift = false): boolean {
  return changes.some((c) => {
    const sev = severityOf(c);
    return sev === "breaking" || (failOnDrift && sev === "warning");
  });
}
