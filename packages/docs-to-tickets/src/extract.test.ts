import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { ToolError } from "./errors.ts";
import { buildUserMessage, extractTickets, loadSystemPrompt, type ExtractionModel, type ModelReply, type ModelTurn } from "./extract.ts";
import { APPROVAL, DARK_MODE, REQUIREMENTS, ticket } from "./test-fixtures.ts";

const agentFile = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "agents", "ticket-extractor.md");

class ScriptedModel implements ExtractionModel {
  readonly id = "scripted";
  readonly calls: ModelTurn[][] = [];
  private readonly replies: Partial<ModelReply>[];
  constructor(replies: Partial<ModelReply>[]) {
    this.replies = replies;
  }
  async complete(_system: string, turns: readonly ModelTurn[]): Promise<ModelReply> {
    this.calls.push([...turns]);
    const r = this.replies.shift() ?? {};
    return { json: r.json ?? null, raw: r.raw ?? JSON.stringify(r.json ?? null), stopReason: r.stopReason ?? "end_turn", inputTokens: 10, outputTokens: 5 };
  }
}

const clean = { tickets: [ticket(), APPROVAL, DARK_MODE], out_of_scope: [] };
const run = (model: ExtractionModel, retryOnViolations = true) =>
  extractTickets({ model, system: "s", briefText: "brief", requirements: REQUIREMENTS, retryOnViolations });

describe("extractTickets", () => {
  it("accepts a clean first answer without a retry", async () => {
    const model = new ScriptedModel([{ json: clean }]);
    const result = await run(model);
    expect(result).toMatchObject({ attempts: 1, finalViolations: [], inputTokens: 10 });
  });

  it("retries once with the specific violations and keeps the corrected answer", async () => {
    const wrong = { tickets: [ticket({ source_refs: ["toolbar.1", "toolbar.9"] }), APPROVAL, DARK_MODE], out_of_scope: [] };
    const model = new ScriptedModel([{ json: wrong }, { json: clean }]);
    const result = await run(model);
    expect(result.attempts).toBe(2);
    expect(result.firstViolations.join()).toMatch(/toolbar\.9/);
    expect(result.finalViolations).toEqual([]);
    const feedback = model.calls[1]!.at(-1)!;
    expect(feedback.role).toBe("user");
    expect(feedback.content).toMatch(/cites "toolbar.9"/);
  });

  it("never retries a second time; remaining violations are passed on", async () => {
    const wrong = { tickets: [ticket(), APPROVAL], out_of_scope: [] };
    const model = new ScriptedModel([{ json: wrong }, { json: wrong }, { json: clean }]);
    const result = await run(model);
    expect(model.calls).toHaveLength(2);
    expect(result.finalViolations.join()).toMatch(/extras\.1/);
  });

  it("the single-pass baseline does not retry", async () => {
    const model = new ScriptedModel([{ json: { tickets: [ticket()], out_of_scope: [] } }]);
    const result = await run(model, false);
    expect(model.calls).toHaveLength(1);
    expect(result.finalViolations.length).toBeGreaterThan(0);
  });

  it("falls back to the first answer when the retry breaks the schema", async () => {
    const wrong = { tickets: [ticket(), APPROVAL], out_of_scope: [] };
    const result = await run(new ScriptedModel([{ json: wrong }, { json: { nope: true } }]));
    expect(result.extraction.tickets).toHaveLength(2);
  });

  it("escalates when neither answer matches the schema", async () => {
    await expect(run(new ScriptedModel([{ json: null, raw: "not json" }, { json: null }]))).rejects.toMatchObject({
      body: { failure_mode: "DT-EXTRACT-SCHEMA", retryable: false },
    });
  });

  it("treats refusal as terminal and truncation as retryable", async () => {
    const refused = await run(new ScriptedModel([{ stopReason: "refusal" }])).catch((e: ToolError) => e.body);
    expect(refused).toMatchObject({ failure_mode: "DT-EXTRACT-REFUSED", retryable: false });
    const truncated = await run(new ScriptedModel([{ stopReason: "max_tokens" }])).catch((e: ToolError) => e.body);
    expect(truncated).toMatchObject({ failure_mode: "DT-EXTRACT-TRUNCATED", retryable: true });
  });
});

describe("prompt", () => {
  it("puts the brief before the requirement list and the instruction", () => {
    const message = buildUserMessage("THE BRIEF", REQUIREMENTS);
    expect(message.indexOf("THE BRIEF")).toBeLessThan(message.indexOf("- toolbar.1 [Toolbar]: Add the export icon."));
    expect(message).toMatch(/- extras\.1 \[Extras\] \(optional\)/);
  });

  it("shares the agent file's body, with three examples that can be stripped for the baseline", () => {
    const withExamples = loadSystemPrompt(agentFile, true);
    expect(withExamples).not.toMatch(/^---/);
    expect(withExamples.match(/<example>/g)).toHaveLength(3);
    expect(loadSystemPrompt(agentFile, false)).not.toMatch(/<example/);
  });

  it("few-shot examples are not taken from the eval brief", () => {
    const examples = loadSystemPrompt(agentFile, true).slice(loadSystemPrompt(agentFile, true).indexOf("<examples>"));
    expect(examples).not.toMatch(/createTask|updateTask|deleteTask|task card|notification icon/i);
  });
});
