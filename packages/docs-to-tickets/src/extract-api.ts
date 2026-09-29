import Anthropic from "@anthropic-ai/sdk";
import { EXTRACTION_MODEL_ID, type ExtractionModel, type ModelReply, type ModelTurn } from "./extract.ts";
import { EXTRACTION_SCHEMA } from "./ticket-schema.ts";

/**
 * Extraction over the Messages API with structured outputs (`output_config.format`). No forced
 * `tool_choice`: Opus 5.5 rejects it with a 400.
 */
export class AnthropicExtractionModel implements ExtractionModel {
  readonly id: string;
  private readonly client: Anthropic;
  private readonly maxTokens: number;

  constructor(options: { client?: Anthropic; model?: string; maxTokens?: number } = {}) {
    this.client = options.client ?? new Anthropic();
    this.id = options.model ?? EXTRACTION_MODEL_ID;
    this.maxTokens = options.maxTokens ?? 32_000;
  }

  async complete(system: string, turns: readonly ModelTurn[]): Promise<ModelReply> {
    const message = await this.client.messages
      .stream({
        model: this.id,
        max_tokens: this.maxTokens,
        system,
        messages: turns.map((t) => ({ role: t.role, content: t.content })),
        output_config: { format: { type: "json_schema", schema: EXTRACTION_SCHEMA as unknown as Record<string, unknown> } },
      })
      .finalMessage();
    const raw = message.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("");
    let json: unknown = null;
    try {
      json = JSON.parse(raw);
    } catch {
      json = null;
    }
    return {
      json,
      raw,
      stopReason: message.stop_reason ?? "unknown",
      inputTokens: message.usage.input_tokens,
      outputTokens: message.usage.output_tokens,
    };
  }
}
