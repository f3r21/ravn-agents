import { readFileSync } from "node:fs";
import { stripFrontmatter } from "./brief.ts";
import { ToolError } from "./errors.ts";
import { retryFeedback } from "./plan.ts";
import { checkShape } from "./ticket-schema.ts";
import type { Extraction, Requirement } from "./types.ts";
import { validateExtraction, type ValidateOptions } from "./validate.ts";

export const EXTRACTION_MODEL_ID = "claude-opus-5-5";

export interface ModelTurn {
  role: "user" | "assistant";
  content: string;
}

export interface ModelReply {
  /** Parsed JSON, or null when the text did not parse. */
  json: unknown;
  raw: string;
  stopReason: string;
  inputTokens: number;
  outputTokens: number;
}

/** One structured-output call. The API adapter lives in extract-api.ts; tests pass a fake. */
export interface ExtractionModel {
  readonly id: string;
  complete(system: string, turns: readonly ModelTurn[]): Promise<ModelReply>;
}

/** The extractor's instructions: the agent file's body, so the subagent and the API path share one prompt. */
export function loadSystemPrompt(agentFile: string, withExamples = true): string {
  const body = stripFrontmatter(readFileSync(agentFile, "utf8")).trim();
  return withExamples ? body : body.replace(/<examples>[\s\S]*?<\/examples>\s*/g, "").trim();
}

/** Brief first (long documents go above the instructions), then the id list the tickets must cite. */
export function buildUserMessage(briefText: string, requirements: readonly Requirement[]): string {
  const list = requirements.map((r) => `- ${r.id} [${r.section}]${r.optional ? " (optional)" : ""}: ${r.text}`).join("\n");
  return [
    "<brief>",
    briefText.trim(),
    "</brief>",
    "",
    "<requirements>",
    list,
    "</requirements>",
    "",
    "Turn this brief into tickets following your instructions. Cite only ids from <requirements>. Every id must appear in exactly one of: some ticket's source_refs, or out_of_scope.",
  ].join("\n");
}

export interface ExtractionRun {
  extraction: Extraction;
  attempts: number;
  firstViolations: string[];
  finalViolations: string[];
  inputTokens: number;
  outputTokens: number;
}

export interface ExtractOptions {
  model: ExtractionModel;
  system: string;
  briefText: string;
  requirements: readonly Requirement[];
  /** When false the first answer is final (the single-pass baseline). */
  retryOnViolations: boolean;
  validate?: ValidateOptions;
}

function check(json: unknown, requirements: readonly Requirement[], options: ValidateOptions | undefined) {
  const shape = checkShape(json);
  if (!shape.ok) return { extraction: null, violations: shape.errors.map((e) => `Schema: ${e}`) };
  const report = validateExtraction(shape.value, requirements, options);
  return { extraction: shape.value, violations: report.violations.map((v) => v.message) };
}

function stopFailure(reply: ModelReply): ToolError | null {
  if (reply.stopReason === "refusal") {
    return new ToolError({
      category: "business",
      retryable: false,
      failure_mode: "DT-EXTRACT-REFUSED",
      what_failed: "The extraction model refused the request.",
      what_was_done: "No tickets were produced.",
      next_step: "Show the user the refusal; do not retry with the same brief.",
    });
  }
  if (reply.stopReason === "max_tokens") {
    return new ToolError({
      category: "transient",
      retryable: true,
      failure_mode: "DT-EXTRACT-TRUNCATED",
      what_failed: `Extraction stopped at max_tokens after ${reply.outputTokens} output tokens; the JSON is incomplete.`,
      what_was_done: "No tickets were produced.",
      next_step: "Retry with a larger max_tokens, or split the brief by section and extract each part.",
    });
  }
  return null;
}

/**
 * Extraction with a code gate: schema check, semantic validation, and at most one targeted retry
 * that lists the specific violations. Remaining violations become review reasons downstream.
 */
export async function extractTickets(options: ExtractOptions): Promise<ExtractionRun> {
  const turns: ModelTurn[] = [{ role: "user", content: buildUserMessage(options.briefText, options.requirements) }];
  const first = await options.model.complete(options.system, turns);
  const stop1 = stopFailure(first);
  if (stop1) throw stop1;
  const checked1 = check(first.json, options.requirements, options.validate);
  let usage = { inputTokens: first.inputTokens, outputTokens: first.outputTokens };

  if (checked1.violations.length === 0 || !options.retryOnViolations) {
    if (!checked1.extraction) throw schemaFailure(checked1.violations, 1);
    return { extraction: checked1.extraction, attempts: 1, firstViolations: checked1.violations, finalViolations: checked1.violations, ...usage };
  }

  turns.push({ role: "assistant", content: first.raw }, { role: "user", content: retryFeedback(checked1.violations) });
  const second = await options.model.complete(options.system, turns);
  usage = { inputTokens: usage.inputTokens + second.inputTokens, outputTokens: usage.outputTokens + second.outputTokens };
  const checked2 = stopFailure(second) ? null : check(second.json, options.requirements, options.validate);
  const final = checked2?.extraction ? checked2 : checked1;
  if (!final.extraction) throw schemaFailure(checked2?.violations ?? checked1.violations, 2);
  return {
    extraction: final.extraction,
    attempts: 2,
    firstViolations: checked1.violations,
    finalViolations: final.violations,
    ...usage,
  };
}

function schemaFailure(violations: string[], attempts: number): ToolError {
  return new ToolError({
    category: "validation",
    retryable: false,
    failure_mode: "DT-EXTRACT-SCHEMA",
    what_failed: `Extraction output did not match the schema after ${attempts} attempt(s): ${violations.slice(0, 5).join("; ")}`,
    what_was_done: "No tickets were produced.",
    next_step: "Escalate to the user with the raw output; do not retry a third time.",
  });
}
