#!/usr/bin/env node
import { readFileSync, writeFileSync } from "node:fs";
import { Command, Option } from "commander";
import { loadSnapshot } from "./capture.js";
import type { CaptureOptions } from "./capture.js";
import { renderChangelog } from "./changelog.js";
import { applyConfig, loadConfig, parseConfig } from "./config.js";
import type { Config } from "./config.js";
import { diffSnapshots, summarize } from "./diff/index.js";
import type { ChangeSet } from "./diff/types.js";
import { RULES } from "./classify/rules.js";
import { render, shouldFail } from "./report.js";
import type { OutputFormat } from "./report.js";
import { stringify } from "./snapshot/canonical.js";
import { VERSION } from "./version.js";

// Exit quietly when a downstream pipe (e.g. `| head`) closes early.
process.stdout.on("error", (err: NodeJS.ErrnoException) => {
  if (err.code === "EPIPE") process.exit(0);
  throw err;
});

const FORMATS: OutputFormat[] = ["text", "json", "markdown", "github"];

const program = new Command();
program
  .name("mcpdiff")
  .description("Diff two MCP servers and detect breaking changes.")
  .version(VERSION, "-v, --version");

program
  .command("capture")
  .argument("<source>", "stdio:<cmd>, http(s)://…, or a snapshot .json path")
  .description("Introspect an MCP server into a canonical snapshot JSON")
  .option("-o, --output <file>", "write snapshot to a file instead of stdout")
  .option(
    "--header <header...>",
    "HTTP header for http(s) sources, e.g. 'Authorization: Bearer x'",
  )
  .action(async (source: string, opts: { output?: string; header?: string[] }) => {
    const snapshot = await loadSnapshot(source, captureOptions(opts.header));
    const json = stringify(snapshot);
    if (opts.output) {
      writeFileSync(opts.output, json);
      process.stderr.write(`wrote ${opts.output}\n`);
    } else {
      process.stdout.write(json);
    }
  });

for (const name of ["diff", "breaking", "changelog", "summary"] as const) {
  const cmd = program
    .command(name)
    .argument("<base>", "base source (older version)")
    .argument("<revision>", "revision source (newer version)")
    .option("--header <header...>", "HTTP header for http(s) sources")
    .option(
      "-c, --config <file>",
      "path to a config file (defaults to nearest .mcpdiff.yaml)",
    )
    .option("--fail-on-drift", "treat high semantic drift as a failing change", false);

  if (name === "diff" || name === "breaking") {
    cmd.addOption(
      new Option("-f, --format <format>", "output format")
        .choices(FORMATS)
        .default("text"),
    );
    cmd.option("--no-color", "disable ANSI colours");
  }

  cmd.description(describe(name));
  cmd.action((base: string, revision: string, opts: DiffOpts) =>
    runDiff(name, base, revision, opts),
  );
}

program
  .command("checks")
  .description("List every breaking-change rule and its default classification")
  .addOption(
    new Option("-f, --format <format>", "output format")
      .choices(["text", "json"])
      .default("text"),
  )
  .action((opts: { format: "text" | "json" }) => {
    if (opts.format === "json") {
      process.stdout.write(JSON.stringify(RULES, null, 2) + "\n");
      return;
    }
    for (const r of RULES) {
      process.stdout.write(`${r.id.padEnd(22)} ${r.default.padEnd(12)} ${r.title}\n`);
    }
  });

program
  .command("validate")
  .argument("<source>", "server or snapshot to validate")
  .option("--header <header...>", "HTTP header for http(s) sources")
  .description("Check that a server or snapshot is reachable and well-formed")
  .action(async (source: string, opts: { header?: string[] }) => {
    const s = await loadSnapshot(source, captureOptions(opts.header));
    process.stdout.write(
      `OK: ${s.serverInfo?.name ?? "server"}${s.serverInfo?.version ? `@${s.serverInfo.version}` : ""} — ` +
        `${s.tools.length} tools, ${s.resources.length} resources, ` +
        `${s.resourceTemplates.length} templates, ${s.prompts.length} prompts\n`,
    );
  });

interface DiffOpts {
  header?: string[];
  config?: string;
  failOnDrift?: boolean;
  format?: OutputFormat;
  color?: boolean;
}

async function runDiff(
  name: "diff" | "breaking" | "changelog" | "summary",
  baseSource: string,
  revSource: string,
  opts: DiffOpts,
): Promise<void> {
  const capture = captureOptions(opts.header);
  const [base, revision] = await Promise.all([
    loadSnapshot(baseSource, capture),
    loadSnapshot(revSource, capture),
  ]);

  const config = resolveConfig(opts.config);
  const cs: ChangeSet = diffSnapshots(base, revision);
  cs.changes = applyConfig(cs.changes, config);

  const failOnDrift = opts.failOnDrift ?? config.failOnDrift ?? false;

  if (name === "changelog") {
    process.stdout.write(renderChangelog(cs));
  } else if (name === "summary") {
    const c = summarize(cs.changes);
    process.stdout.write(
      `${cs.changes.length} changes: ${c.breaking} breaking, ${c.warning} warning, ${c.info} info\n`,
    );
  } else {
    const color =
      opts.color !== false && Boolean(process.stdout.isTTY) && !process.env.NO_COLOR;
    process.stdout.write(
      render(cs, opts.format ?? "text", { breakingOnly: name === "breaking", color }) +
        "\n",
    );
  }

  if (name === "breaking" && shouldFail(cs.changes, failOnDrift)) {
    process.exitCode = 1;
  }
}

function describe(name: string): string {
  switch (name) {
    case "diff":
      return "Show every change between two MCP servers";
    case "breaking":
      return "Show only breaking changes; exit 1 if any are found";
    case "changelog":
      return "Generate a human, consumer-facing changelog";
    default:
      return "Print a one-line count of changes by severity";
  }
}

function resolveConfig(path: string | undefined): Config {
  return path ? parseConfig(readFileSync(path, "utf8")) : loadConfig();
}

function captureOptions(headers: string[] | undefined): CaptureOptions {
  if (!headers || headers.length === 0) return {};
  const parsed: Record<string, string> = {};
  for (const h of headers) {
    const idx = h.indexOf(":");
    if (idx < 0) throw new Error(`invalid --header '${h}', expected 'Name: value'`);
    parsed[h.slice(0, idx).trim()] = h.slice(idx + 1).trim();
  }
  return { headers: parsed };
}

program.parseAsync(process.argv).catch((err: unknown) => {
  process.stderr.write(`mcpdiff: ${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(2);
});
