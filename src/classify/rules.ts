import type { ChangeCategory } from "../diff/types.js";

export type DefaultSeverity = "breaking" | "info" | "drift" | "conditional";

export interface RuleSpec {
  id: string;
  category: ChangeCategory;
  default: DefaultSeverity;
  title: string;
}

/**
 * The catalogue of every change rule mcpdiff can emit. It is the single source
 * of truth for `mcpdiff checks` and for validating config overrides. Keep it in
 * sync with the emitters in `diff/`.
 */
export const RULES: RuleSpec[] = [
  // Server
  {
    id: "S-VERSION",
    category: "server",
    default: "info",
    title: "Server version changed",
  },
  {
    id: "S-PROTO",
    category: "server",
    default: "conditional",
    title: "Protocol version changed (breaking on downgrade)",
  },
  {
    id: "S-CAP-REMOVE",
    category: "server",
    default: "breaking",
    title: "Server capability removed",
  },
  {
    id: "S-CAP-ADD",
    category: "server",
    default: "info",
    title: "Server capability added",
  },
  {
    id: "S-INSTRUCTIONS-DRIFT",
    category: "server",
    default: "drift",
    title: "Server instructions changed",
  },

  // Tools (element level)
  { id: "T-REMOVED", category: "tool", default: "breaking", title: "Tool removed" },
  { id: "T-ADDED", category: "tool", default: "info", title: "Tool added" },
  {
    id: "T-DESC-DRIFT",
    category: "tool",
    default: "drift",
    title: "Tool description changed",
  },
  {
    id: "T-ANN-WEAKEN",
    category: "tool",
    default: "breaking",
    title: "Tool safety annotation weakened",
  },
  {
    id: "T-ANN-CHANGE",
    category: "tool",
    default: "info",
    title: "Tool annotation changed",
  },

  // Tools (input/output schema)
  {
    id: "T-REQ-ADD",
    category: "tool",
    default: "breaking",
    title: "New required input property",
  },
  {
    id: "T-PROP-ADD",
    category: "tool",
    default: "info",
    title: "New optional input property",
  },
  {
    id: "T-PROP-REMOVE",
    category: "tool",
    default: "breaking",
    title: "Input property removed",
  },
  {
    id: "T-OPT-TO-REQ",
    category: "tool",
    default: "breaking",
    title: "Input property became required",
  },
  {
    id: "T-REQ-TO-OPT",
    category: "tool",
    default: "info",
    title: "Input property became optional",
  },
  {
    id: "T-TYPE-NARROW",
    category: "tool",
    default: "breaking",
    title: "Input type narrowed",
  },
  { id: "T-TYPE-WIDEN", category: "tool", default: "info", title: "Input type widened" },
  {
    id: "T-TYPE-CHANGE",
    category: "tool",
    default: "breaking",
    title: "Input type changed",
  },
  {
    id: "T-ENUM-REMOVE",
    category: "tool",
    default: "breaking",
    title: "Input enum value removed",
  },
  {
    id: "T-ENUM-ADD",
    category: "tool",
    default: "info",
    title: "Input enum value added",
  },
  {
    id: "T-ENUM-RESTRICT",
    category: "tool",
    default: "breaking",
    title: "Enum constraint added to input",
  },
  {
    id: "T-ENUM-RELAX",
    category: "tool",
    default: "info",
    title: "Enum constraint removed from input",
  },
  {
    id: "T-CONSTRAINT-TIGHTEN",
    category: "tool",
    default: "breaking",
    title: "Input constraint tightened",
  },
  {
    id: "T-CONSTRAINT-LOOSEN",
    category: "tool",
    default: "info",
    title: "Input constraint loosened",
  },
  {
    id: "T-OUT-PROP-REMOVE",
    category: "tool",
    default: "breaking",
    title: "Output property removed",
  },
  {
    id: "T-OUT-PROP-ADD",
    category: "tool",
    default: "info",
    title: "Output property added",
  },
  {
    id: "T-OUT-REQ-REMOVE",
    category: "tool",
    default: "breaking",
    title: "Guaranteed output property became optional",
  },
  {
    id: "T-OUT-REQ-ADD",
    category: "tool",
    default: "info",
    title: "Output property became guaranteed",
  },
  {
    id: "T-OUT-TYPE-CHANGE",
    category: "tool",
    default: "breaking",
    title: "Output type broadened or changed",
  },
  {
    id: "T-OUT-TYPE-NARROW",
    category: "tool",
    default: "info",
    title: "Output type narrowed",
  },
  {
    id: "T-OUT-ENUM-ADD",
    category: "tool",
    default: "breaking",
    title: "Output enum value added",
  },
  {
    id: "T-OUT-ENUM-REMOVE",
    category: "tool",
    default: "info",
    title: "Output enum value removed",
  },
  {
    id: "T-OUT-ENUM-RESTRICT",
    category: "tool",
    default: "info",
    title: "Enum constraint added to output",
  },
  {
    id: "T-OUT-ENUM-RELAX",
    category: "tool",
    default: "breaking",
    title: "Enum constraint removed from output",
  },
  {
    id: "T-OUT-CONSTRAINT",
    category: "tool",
    default: "info",
    title: "Output constraint changed",
  },

  // Resources
  {
    id: "R-REMOVED",
    category: "resource",
    default: "breaking",
    title: "Resource removed",
  },
  { id: "R-ADDED", category: "resource", default: "info", title: "Resource added" },
  {
    id: "R-MIME-CHANGE",
    category: "resource",
    default: "breaking",
    title: "Resource mimeType changed",
  },
  {
    id: "R-DESC-DRIFT",
    category: "resource",
    default: "drift",
    title: "Resource description changed",
  },

  // Resource templates
  {
    id: "RT-REMOVED",
    category: "resourceTemplate",
    default: "breaking",
    title: "Resource template removed",
  },
  {
    id: "RT-ADDED",
    category: "resourceTemplate",
    default: "info",
    title: "Resource template added",
  },
  {
    id: "RT-MIME-CHANGE",
    category: "resourceTemplate",
    default: "breaking",
    title: "Resource template mimeType changed",
  },
  {
    id: "RT-DESC-DRIFT",
    category: "resourceTemplate",
    default: "drift",
    title: "Resource template description changed",
  },

  // Prompts
  { id: "P-REMOVED", category: "prompt", default: "breaking", title: "Prompt removed" },
  { id: "P-ADDED", category: "prompt", default: "info", title: "Prompt added" },
  {
    id: "P-DESC-DRIFT",
    category: "prompt",
    default: "drift",
    title: "Prompt description changed",
  },
  {
    id: "P-ARG-REMOVE",
    category: "prompt",
    default: "breaking",
    title: "Prompt argument removed",
  },
  {
    id: "P-ARG-REQ-ADD",
    category: "prompt",
    default: "breaking",
    title: "New required prompt argument",
  },
  {
    id: "P-ARG-ADD",
    category: "prompt",
    default: "info",
    title: "New optional prompt argument",
  },
  {
    id: "P-ARG-OPT-TO-REQ",
    category: "prompt",
    default: "breaking",
    title: "Prompt argument became required",
  },
  {
    id: "P-ARG-REQ-TO-OPT",
    category: "prompt",
    default: "info",
    title: "Prompt argument became optional",
  },
  {
    id: "P-ARG-DESC-DRIFT",
    category: "prompt",
    default: "drift",
    title: "Prompt argument description changed",
  },
];

export const RULE_BY_ID: ReadonlyMap<string, RuleSpec> = new Map(
  RULES.map((r) => [r.id, r]),
);

export function isKnownRule(id: string): boolean {
  return RULE_BY_ID.has(id);
}
