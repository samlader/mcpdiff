import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import { VERSION } from "./version.js";
import { canonicalize } from "./snapshot/canonical.js";
import { emptySnapshot } from "./snapshot/types.js";
import type {
  Prompt,
  Resource,
  ResourceTemplate,
  Snapshot,
  Tool,
} from "./snapshot/types.js";

export interface CaptureOptions {
  /** Extra HTTP headers (e.g. Authorization) for the streamable-HTTP transport. */
  headers?: Record<string, string>;
}

/**
 * Resolve a source string to a {@link Snapshot}. Supported forms:
 *
 * - `stdio:<command> [args...]` — spawn a server over stdio and introspect it
 * - `http://…` / `https://…`    — introspect a streamable-HTTP server
 * - `git:<ref>:<path>`          — read a committed snapshot from a git revision
 * - `<path>.json`               — read a snapshot file from disk
 */
export async function loadSnapshot(
  source: string,
  options: CaptureOptions = {},
): Promise<Snapshot> {
  if (source.startsWith("stdio:")) {
    const [command, ...args] = splitArgs(source.slice("stdio:".length));
    if (!command) throw new Error(`empty stdio command in source: ${source}`);
    return captureLive(new StdioClientTransport({ command, args }));
  }

  if (source.startsWith("http://") || source.startsWith("https://")) {
    const transport = new StreamableHTTPClientTransport(new URL(source), {
      requestInit: options.headers ? { headers: options.headers } : undefined,
    });
    return captureLive(transport);
  }

  if (source.startsWith("git:")) {
    return readSnapshotFromGit(source.slice("git:".length));
  }

  if (existsSync(source)) {
    return normalizeSnapshot(JSON.parse(readFileSync(source, "utf8")), source);
  }

  throw new Error(
    `cannot resolve source '${source}'. Use stdio:<cmd>, http(s)://…, git:<ref>:<path>, or a path to a snapshot .json`,
  );
}

/** Connect to a live MCP server and introspect its full surface. */
export async function captureLive(transport: Transport): Promise<Snapshot> {
  const client = new Client({ name: "mcpdiff", version: VERSION }, { capabilities: {} });

  await client.connect(transport);
  try {
    const capabilities = client.getServerCapabilities() ?? {};
    const info = client.getServerVersion();
    const snapshot: Snapshot = {
      ...emptySnapshot(),
      capturedAt: new Date().toISOString(),
      serverInfo: info ? { name: info.name, version: info.version } : undefined,
      protocolVersion: (transport as { protocolVersion?: string }).protocolVersion,
      capabilities: capabilities as Record<string, unknown>,
      instructions: client.getInstructions(),
    };

    if (capabilities.tools) snapshot.tools = await listTools(client);
    if (capabilities.resources) {
      snapshot.resources = await listResources(client);
      snapshot.resourceTemplates = await listResourceTemplates(client);
    }
    if (capabilities.prompts) snapshot.prompts = await listPrompts(client);

    return canonicalize(snapshot);
  } finally {
    await client.close();
  }
}

async function listTools(client: Client): Promise<Tool[]> {
  return paginate((cursor) => client.listTools({ cursor }), "tools", mapTool);
}

async function listResources(client: Client): Promise<Resource[]> {
  return paginate((cursor) => client.listResources({ cursor }), "resources", mapResource);
}

async function listResourceTemplates(client: Client): Promise<ResourceTemplate[]> {
  // Not every server implements templates even when it supports resources.
  try {
    return await paginate(
      (cursor) => client.listResourceTemplates({ cursor }),
      "resourceTemplates",
      mapResourceTemplate,
    );
  } catch {
    return [];
  }
}

async function listPrompts(client: Client): Promise<Prompt[]> {
  return paginate((cursor) => client.listPrompts({ cursor }), "prompts", mapPrompt);
}

/** Drain a cursor-paginated MCP list method into a mapped array. */
async function paginate<T>(
  fetchPage: (cursor: string | undefined) => Promise<Record<string, unknown>>,
  field: string,
  map: (raw: any) => T,
): Promise<T[]> {
  const items: T[] = [];
  let cursor: string | undefined;
  do {
    const page = await fetchPage(cursor);
    const list = (page[field] as unknown[] | undefined) ?? [];
    for (const raw of list) items.push(map(raw));
    cursor = page.nextCursor as string | undefined;
  } while (cursor);
  return items;
}

function mapTool(raw: any): Tool {
  return prune({
    name: raw.name,
    title: raw.title,
    description: raw.description,
    inputSchema: raw.inputSchema,
    outputSchema: raw.outputSchema,
    annotations: raw.annotations
      ? prune({
          title: raw.annotations.title,
          readOnlyHint: raw.annotations.readOnlyHint,
          destructiveHint: raw.annotations.destructiveHint,
          idempotentHint: raw.annotations.idempotentHint,
          openWorldHint: raw.annotations.openWorldHint,
        })
      : undefined,
  });
}

function mapResource(raw: any): Resource {
  return prune({
    uri: raw.uri,
    name: raw.name,
    title: raw.title,
    description: raw.description,
    mimeType: raw.mimeType,
  });
}

function mapResourceTemplate(raw: any): ResourceTemplate {
  return prune({
    uriTemplate: raw.uriTemplate,
    name: raw.name,
    title: raw.title,
    description: raw.description,
    mimeType: raw.mimeType,
  });
}

function mapPrompt(raw: any): Prompt {
  return prune({
    name: raw.name,
    title: raw.title,
    description: raw.description,
    arguments: Array.isArray(raw.arguments)
      ? raw.arguments.map((a: any) =>
          prune({ name: a.name, description: a.description, required: a.required }),
        )
      : undefined,
  });
}

function readSnapshotFromGit(spec: string): Snapshot {
  const sep = spec.lastIndexOf(":");
  if (sep < 0) throw new Error(`git source must be git:<ref>:<path>, got git:${spec}`);
  const ref = spec.slice(0, sep);
  const path = spec.slice(sep + 1);
  const json = execFileSync("git", ["show", `${ref}:${path}`], { encoding: "utf8" });
  return normalizeSnapshot(JSON.parse(json), `git:${spec}`);
}

/** Coerce arbitrary parsed JSON into a well-formed snapshot. */
export function normalizeSnapshot(raw: any, source: string): Snapshot {
  if (raw == null || typeof raw !== "object") {
    throw new Error(`source '${source}' is not a valid snapshot object`);
  }
  return {
    mcpdiffVersion: "1",
    capturedAt: raw.capturedAt,
    serverInfo: raw.serverInfo,
    protocolVersion: raw.protocolVersion,
    capabilities: raw.capabilities,
    instructions: raw.instructions,
    tools: Array.isArray(raw.tools) ? raw.tools : [],
    resources: Array.isArray(raw.resources) ? raw.resources : [],
    resourceTemplates: Array.isArray(raw.resourceTemplates) ? raw.resourceTemplates : [],
    prompts: Array.isArray(raw.prompts) ? raw.prompts : [],
  };
}

/** Drop undefined-valued keys so snapshots stay clean and canonical. */
function prune<T extends Record<string, unknown>>(obj: T): T {
  for (const key of Object.keys(obj)) {
    if (obj[key] === undefined) delete obj[key];
  }
  return obj;
}

/** Split a command line into argv, honouring single and double quotes. */
export function splitArgs(input: string): string[] {
  const args: string[] = [];
  const re = /"([^"]*)"|'([^']*)'|(\S+)/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(input)) !== null) {
    args.push(match[1] ?? match[2] ?? match[3] ?? "");
  }
  return args;
}
