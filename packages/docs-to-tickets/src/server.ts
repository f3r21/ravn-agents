import path from "node:path";
import { fileURLToPath } from "node:url";
import { McpServer, ResourceTemplate } from "@modelcontextprotocol/server";
import { StdioServerTransport } from "@modelcontextprotocol/server/stdio";
import * as z from "zod/v4";
import { configFromEnv } from "./config.ts";
import { toFailure } from "./errors.ts";
import { FetchGitHubClient } from "./github.ts";
import { IssueService } from "./issue-service.ts";
import { ManifestStore } from "./manifest.ts";
import { Pacer, realSleep } from "./pacer.ts";
import { loadThresholds } from "./routing.ts";
import { CONFIDENCE_LEVELS } from "./types.ts";

const confidence = z.enum(CONFIDENCE_LEVELS);

const createInput = z.object({
  repo: z.string().describe("Target repository as owner/name."),
  title: z.string().min(1).describe("Issue title, exactly as the plan printed it."),
  body: z.string().describe("Issue body (description, acceptance criteria, source) exactly as the plan printed it."),
  source_refs: z.array(z.string()).min(1).describe("Requirement ids from the brief that this ticket covers, e.g. header.2."),
  idempotency_key: z.string().describe("The 16-hex-character key the plan printed for this ticket."),
  field_confidence: z
    .object({ source_refs: confidence, type: confidence, priority: confidence, acceptance_criteria: confidence })
    .describe("Per-field confidence from extraction. The server, not the caller, turns it into the review decision."),
  labels: z.array(z.string()).default([]).describe("Proposed labels; ones the repository does not have are left off."),
  review_reasons: z
    .array(z.string())
    .default([])
    .describe("Validation findings the plan attached to this ticket; any finding routes it to needs-review."),
});

const listInput = z.object({ repo: z.string().describe("Repository as owner/name.") });

export function buildServer(service: IssueService): McpServer {
  const server = new McpServer({ name: "ravn-tickets", version: "0.1.0" });

  server.registerTool(
    "github_issue_create",
    {
      description: [
        "Creates one GitHub issue from one planned ticket of a docs-to-tickets batch, idempotently.",
        "Use it only after the user has confirmed the batch preview, once per ticket, in plan order, with the arguments the plan printed; do not use it for ad-hoc issues or edits.",
        "The server decides whether the issue gets the needs-review label from field_confidence and review_reasons, creates requests at least one second apart, and reads the issue back to confirm the label stuck.",
        "If an issue with the same idempotency_key already exists it returns created: false with the existing number instead of creating a duplicate; skip it and continue.",
        "By default the server is in dry-run mode and returns the issue it would create without calling GitHub.",
        "Failures return isError with a JSON error {category, retryable, retry_after_s, failure_mode, what_failed, what_was_done, next_step}; follow next_step and never retry a non-retryable error.",
      ].join(" "),
      inputSchema: createInput,
    },
    async (args) => service.create(args),
  );

  server.registerTool(
    "github_issue_list_created",
    {
      description: [
        "Lists the issues docs-to-tickets has created in one repository, keyed by idempotency_key, plus the batch manifest summary (created, skipped as duplicate, failed with category, not attempted).",
        "Use it before planning a batch to see what already exists, and after a batch or an interruption to report results and decide where to resume.",
        "It only covers issues this tool created (found by the body marker on issues opened by the token's user); it is not a general issue search.",
        "In dry-run mode it reads the local manifest only. A listing failure is returned as isError, never as an empty list.",
      ].join(" "),
      inputSchema: listInput,
    },
    async ({ repo }) => service.listCreated(repo),
  );

  server.registerResource(
    "created-issues",
    new ResourceTemplate("ravn-tickets://{owner}/{repo}/created", { list: undefined }),
    {
      title: "Issues created by docs-to-tickets",
      description: "Catalog of the issues this tool created in owner/repo, with the batch manifest summary.",
      mimeType: "application/json",
    },
    async (uri, { owner, repo }) => ({
      contents: [
        {
          uri: uri.href,
          mimeType: "application/json",
          text: JSON.stringify(await service.listCreatedData(`${String(owner)}/${String(repo)}`), null, 2),
        },
      ],
    }),
  );

  return server;
}

async function main(): Promise<void> {
  const config = configFromEnv(process.env, path.dirname(fileURLToPath(import.meta.url)));
  const service = new IssueService({
    live: config.live,
    github: config.token ? new FetchGitHubClient(config.token) : null,
    thresholds: loadThresholds(config.thresholdsFile),
    manifests: config.stateBase ? ManifestStore.underBase(config.stateBase) : null,
    pacer: new Pacer(1000, () => Date.now(), realSleep),
    sleep: realSleep,
    nowS: () => Date.now() / 1000,
  });
  await buildServer(service).connect(new StdioServerTransport());
  // stdout carries the protocol; the mode goes to stderr so the user can see it in logs.
  console.error(
    `ravn-tickets MCP server started in ${config.live ? "LIVE" : "dry-run"} mode; ` +
      (config.stateBase ? `state in ${config.stateBase}` : "CLAUDE_PLUGIN_DATA is not set, every tool call will fail"),
  );
}

main().catch((error: unknown) => {
  console.error(JSON.stringify(toFailure(error, "Server failed to start.")));
  process.exit(1);
});
