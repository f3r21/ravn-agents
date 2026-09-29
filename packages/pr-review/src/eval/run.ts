/**
 * Replays items through each variant (research doc 3.5, step 5): check out the PR's head commit,
 * prepare the run directory, run the reviewer headless, and store the routed findings. Nothing is
 * posted: the skill runs in its default dry-run mode.
 */

import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { parseDiff } from "../diff.ts";
import { prepare } from "../pipeline.ts";
import { route } from "../policy.ts";
import type { Draft, Finding, Routing } from "../types.ts";
import type { Item, Variant, VariantResult } from "./items.ts";

export interface ProcResult {
  code: number;
  stdout: string;
  stderr: string;
}

export type Proc = (cmd: string, args: string[], opts?: { cwd?: string; input?: string; timeoutMs?: number }) => Promise<ProcResult>;

export const spawnProc: Proc = (cmd, args, opts = {}) =>
  new Promise((done) => {
    const child = spawn(cmd, args, { cwd: opts.cwd, stdio: ["pipe", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    const timer = opts.timeoutMs ? setTimeout(() => child.kill("SIGTERM"), opts.timeoutMs) : null;
    child.stdout.on("data", (d) => (stdout += d));
    child.stderr.on("data", (d) => (stderr += d));
    child.on("error", (e) => {
      if (timer) clearTimeout(timer);
      done({ code: 127, stdout, stderr: `${stderr}${e.message}` });
    });
    child.on("close", (code, signal) => {
      if (timer) clearTimeout(timer);
      done({ code: code ?? (signal ? 124 : 1), stdout, stderr: signal ? `${stderr}\nkilled by ${signal}` : stderr });
    });
    child.stdin.end(opts.input ?? "");
  });

export interface RunOptions {
  /** labs repo root: loaded with --plugin-dir so the run uses this working tree's plugin. */
  pluginDir: string;
  /** Local clone per repo, e.g. { "f3r21/ravn-ui-kit": "/tmp/ravn-ui-kit" }. */
  clones: Record<string, string>;
  outDir: string;
  budgetUsdPerItem: number;
  timeoutMinutes: number;
  mainModel: string;
  sonnetSubagentModel: string;
  proc?: Proc;
}

/** Fields of Claude Code's `--output-format json` result that the harness reads. */
interface ClaudeResult {
  is_error?: boolean;
  subtype?: string;
  result?: string;
  structured_output?: unknown;
  total_cost_usd?: number;
  usage?: { input_tokens?: number; output_tokens?: number; cache_read_input_tokens?: number; cache_creation_input_tokens?: number };
}

export function parseClaudeResult(stdout: string): ClaudeResult | null {
  try {
    return JSON.parse(stdout) as ClaudeResult;
  } catch {
    const last = stdout.trim().split("\n").pop();
    try {
      return last ? (JSON.parse(last) as ClaudeResult) : null;
    } catch {
      return null;
    }
  }
}

function tokens(r: ClaudeResult | null): { input: number | null; output: number | null } {
  const u = r?.usage;
  if (!u) return { input: null, output: null };
  return { input: (u.input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0), output: u.output_tokens ?? 0 };
}

async function checkout(proc: Proc, clone: string, sha: string, dir: string): Promise<void> {
  if (existsSync(dir)) return;
  const fetch = await proc("git", ["-C", clone, "fetch", "--quiet", "origin", sha]);
  if (fetch.code !== 0) await proc("git", ["-C", clone, "fetch", "--quiet", "origin", "+refs/pull/*/head:refs/remotes/pr/*"]);
  const wt = await proc("git", ["-C", clone, "worktree", "add", "--detach", dir, sha]);
  if (wt.code !== 0) throw new Error(`git worktree add ${sha}: ${wt.stderr}`);
}

const SINGLE_PROMPT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["findings"],
  properties: {
    findings: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["path", "line", "side", "severity", "confidence", "category", "title", "body"],
        properties: {
          path: { type: "string" },
          line: { type: "integer" },
          side: { enum: ["LEFT", "RIGHT"] },
          severity: { enum: ["critical", "high", "medium", "low"] },
          confidence: { enum: ["high", "medium", "low"] },
          category: { enum: ["correctness", "security", "tests", "conventions"] },
          title: { type: "string" },
          body: { type: "string" },
        },
      },
    },
  },
};

/** The single-prompt baseline's findings become a draft with no verifier, routed by the same code. */
export function baselineDraft(findings: Omit<Finding, "id" | "verification">[]): Draft {
  return {
    schemaVersion: 1,
    mode: "self",
    selection: { ran: [], skipped: [], rationale: "single-prompt baseline" },
    finders: [],
    verifier: { status: "ok", model: "none" },
    findings: findings.map((f, i) => ({ ...f, id: `baseline-${i + 1}`, verification: { verdict: "confirmed", evidence: ["unverified baseline"], reason: "baseline has no verifier" } })),
    notReviewed: [],
    summary: "",
  };
}

export async function runVariant(item: Item, variant: Variant, opts: RunOptions): Promise<VariantResult> {
  const proc = opts.proc ?? spawnProc;
  const clone = opts.clones[item.repo];
  const started = Date.now();
  const itemDir = join(opts.outDir, item.id.replace(/[^\w.-]+/g, "_"));
  const runDir = join(itemDir, `${variant}-run`);
  const transcript = join(itemDir, `${variant}.transcript.json`);
  const fail = (failure: string, error: string): VariantResult => ({
    itemId: item.id, variant, ok: false, failure, error, routing: null,
    costUsd: null, inputTokens: null, outputTokens: null, wallSeconds: (Date.now() - started) / 1000, transcript: existsSync(transcript) ? transcript : null,
  });
  if (!clone) return fail("run-failed", `no local clone configured for ${item.repo}`);
  mkdirSync(runDir, { recursive: true });

  const wt = join(resolve(opts.outDir), "..", "checkouts", `${item.id.replace(/[^\w.-]+/g, "_")}`);
  try {
    await checkout(proc, clone, item.headSha, wt);
  } catch (e) {
    return fail("run-failed", (e as Error).message);
  }

  const common = ["--output-format", "json", "--max-budget-usd", String(opts.budgetUsdPerItem), "--no-session-persistence"];
  const timeoutMs = opts.timeoutMinutes * 60_000;

  if (variant === "single-prompt") {
    const { runDir: rd, context } = await prepare({ pr: `${item.repo}#${item.pr}`, out: runDir, cwd: wt });
    const patches = context.files.map((f) => readFileSync(join(rd, f.patch), "utf8")).join("\n\n");
    const instructions = readFileSync(new URL("../../evals/baseline-prompt.md", import.meta.url), "utf8");
    const prompt = `${instructions}\n\n<pr>${context.repo}#${context.number}: ${context.title}</pr>\n<pr_description>\n${context.body}\n</pr_description>\n<diff>\n${patches}\n</diff>`;
    const res = await proc(
      "claude",
      ["-p", "--model", opts.mainModel, "--tools", "Read,Grep,Glob", "--json-schema", JSON.stringify(SINGLE_PROMPT_SCHEMA), ...common],
      { cwd: wt, input: prompt, timeoutMs },
    );
    writeFileSync(transcript, res.stdout || res.stderr);
    const parsed = parseClaudeResult(res.stdout);
    let out = parsed?.structured_output as { findings?: Omit<Finding, "id" | "verification">[] } | undefined;
    if (!out && parsed?.result) {
      try {
        out = JSON.parse(parsed.result);
      } catch {
        /* handled below */
      }
    }
    if (res.code !== 0 || !out?.findings) return fail(res.code === 124 ? "timeout" : "run-failed", res.stderr.slice(-500) || "no structured output");
    const files = parseDiff(readFileSync(join(rd, "diff.patch"), "utf8")).filter((f) => context.files.some((c) => c.path === f.path));
    const routing: Routing = route(baselineDraft(out.findings), files, []);
    const t = tokens(parsed);
    return { itemId: item.id, variant, ok: true, routing, costUsd: parsed?.total_cost_usd ?? null, inputTokens: t.input, outputTokens: t.output, wallSeconds: (Date.now() - started) / 1000, transcript };
  }

  const flags = [`--run-dir ${runDir}`];
  if (variant === "all-finders") flags.push("--all-finders");
  if (variant === "coordinator-sonnet-subagents") flags.push(`--subagent-model ${opts.sonnetSubagentModel}`);
  const res = await proc(
    "claude",
    [
      "-p", `/ravn-agents:review-pr ${item.repo}#${item.pr} ${flags.join(" ")}`,
      "--plugin-dir", opts.pluginDir,
      "--model", opts.mainModel,
      "--add-dir", runDir,
      "--allowedTools", "Bash(node */packages/pr-review/dist/cli.js *) Read Write Grep Glob Agent",
      ...common,
    ],
    { cwd: wt, timeoutMs },
  );
  writeFileSync(transcript, res.stdout || res.stderr);
  const parsed = parseClaudeResult(res.stdout);
  const t = tokens(parsed);
  const routingPath = join(runDir, "routing.json");
  if (!existsSync(routingPath)) {
    const failure = res.code === 124 ? "timeout" : existsSync(join(runDir, "draft.json")) ? "invalid-draft" : parsed?.subtype === "error_max_budget_usd" ? "budget-exceeded" : "run-failed";
    return { ...fail(failure, (parsed?.result ?? res.stderr).slice(-500)), costUsd: parsed?.total_cost_usd ?? null, inputTokens: t.input, outputTokens: t.output };
  }
  const draft = JSON.parse(readFileSync(join(runDir, "draft.json"), "utf8")) as Draft;
  return {
    itemId: item.id, variant, ok: true,
    routing: JSON.parse(readFileSync(routingPath, "utf8")) as Routing,
    selection: { ran: draft.selection.ran, mode: draft.mode },
    costUsd: parsed?.total_cost_usd ?? null, inputTokens: t.input, outputTokens: t.output,
    wallSeconds: (Date.now() - started) / 1000, transcript,
  };
}
