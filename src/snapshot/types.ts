/**
 * The canonical, transport-agnostic model of an MCP server's surface.
 *
 * A {@link Snapshot} is what mcpdiff actually compares. It can be produced by
 * introspecting a live server (see `capture`) or read from a committed JSON file,
 * which decouples introspection from diffing and makes CI runs reproducible.
 */

/** A JSON Schema object, kept as an opaque tree that the schema differ walks. */
export type JSONSchema = Record<string, unknown>;

export interface ServerInfo {
  name: string;
  version?: string;
}

/**
 * Tool behaviour hints. These form a *safety contract*: weakening them (e.g.
 * flipping `readOnlyHint` from true to false) is a breaking change with no
 * REST/OpenAPI analog.
 */
export interface ToolAnnotations {
  title?: string;
  readOnlyHint?: boolean;
  destructiveHint?: boolean;
  idempotentHint?: boolean;
  openWorldHint?: boolean;
}

export interface Tool {
  name: string;
  title?: string;
  description?: string;
  inputSchema?: JSONSchema;
  outputSchema?: JSONSchema;
  annotations?: ToolAnnotations;
}

export interface Resource {
  uri: string;
  name?: string;
  title?: string;
  description?: string;
  mimeType?: string;
}

export interface ResourceTemplate {
  uriTemplate: string;
  name?: string;
  title?: string;
  description?: string;
  mimeType?: string;
}

export interface PromptArgument {
  name: string;
  description?: string;
  required?: boolean;
}

export interface Prompt {
  name: string;
  title?: string;
  description?: string;
  arguments?: PromptArgument[];
}

export interface Snapshot {
  /** Snapshot schema version, bumped on breaking changes to this model. */
  mcpdiffVersion: "1";
  capturedAt?: string;
  serverInfo?: ServerInfo;
  protocolVersion?: string;
  capabilities?: Record<string, unknown>;
  instructions?: string;
  tools: Tool[];
  resources: Resource[];
  resourceTemplates: ResourceTemplate[];
  prompts: Prompt[];
}

/** An empty, well-formed snapshot. Useful as a diff base ("everything is new"). */
export function emptySnapshot(): Snapshot {
  return {
    mcpdiffVersion: "1",
    tools: [],
    resources: [],
    resourceTemplates: [],
    prompts: [],
  };
}
