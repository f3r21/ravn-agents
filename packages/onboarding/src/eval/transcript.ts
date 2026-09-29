/**
 * Reads a `claude -p --output-format stream-json --verbose` transcript into the numbers the
 * eval reports. Subagent turns are included: they are part of what the answer cost.
 */

export interface RunMetrics {
  finalText: string;
  inputTokens: number;
  outputTokens: number;
  toolCalls: number;
  toolsByName: Record<string, number>;
  costUsd: number | undefined;
  wallSeconds: number | undefined;
  turns: number | undefined;
  isError: boolean;
  errorDetail?: string;
}

interface Usage {
  input_tokens?: number;
  output_tokens?: number;
  cache_creation_input_tokens?: number;
  cache_read_input_tokens?: number;
}

interface ContentBlock {
  type?: string;
  id?: string;
  name?: string;
  text?: string;
}

interface StreamEvent {
  type?: string;
  subtype?: string;
  parent_tool_use_id?: string | null;
  message?: { id?: string; content?: ContentBlock[]; usage?: Usage };
  result?: string;
  is_error?: boolean;
  total_cost_usd?: number;
  duration_ms?: number;
  num_turns?: number;
  modelUsage?: Record<string, ModelUsage>;
}

interface ModelUsage {
  inputTokens?: number;
  outputTokens?: number;
  cacheReadInputTokens?: number;
  cacheCreationInputTokens?: number;
}

export function parseTranscript(jsonl: string): RunMetrics {
  const usageByMessage = new Map<string, Usage>();
  const toolIds = new Set<string>();
  const toolsByName: Record<string, number> = {};
  let lastMainText = "";
  let result: StreamEvent | undefined;
  let resultCount = 0;
  let durationMs = 0;

  for (const line of jsonl.split("\n")) {
    if (line.trim() === "") continue;
    let event: StreamEvent;
    try {
      event = JSON.parse(line) as StreamEvent;
    } catch {
      // Tool output can carry raw control characters; retry leniently by escaping them.
      try {
        event = JSON.parse(line.replace(/[\u0000-\u001f]/g, (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, "0")}`)) as StreamEvent;
      } catch {
        continue;
      }
    }
    // A headless session that waits on background subagents emits one result per wake-up;
    // the last one carries the final answer and the cumulative usage.
    if (event.type === "result") {
      result = event;
      resultCount++;
      durationMs += event.duration_ms ?? 0;
      continue;
    }
    if (event.type !== "assistant" || !event.message) continue;
    const { id, usage, content = [] } = event.message;
    // The same message can be streamed as several events; its usage is cumulative, keep the last.
    if (id && usage) usageByMessage.set(id, usage);
    for (const block of content) {
      if (block.type === "tool_use" && block.id && !toolIds.has(block.id)) {
        toolIds.add(block.id);
        const name = block.name ?? "unknown";
        toolsByName[name] = (toolsByName[name] ?? 0) + 1;
      }
      if (block.type === "text" && block.text && !event.parent_tool_use_id) lastMainText = block.text;
    }
  }

  let inputTokens = 0;
  let outputTokens = 0;
  if (result?.modelUsage) {
    // Cumulative for the session across every model, subagents included.
    for (const usage of Object.values(result.modelUsage)) {
      inputTokens += (usage.inputTokens ?? 0) + (usage.cacheReadInputTokens ?? 0) + (usage.cacheCreationInputTokens ?? 0);
      outputTokens += usage.outputTokens ?? 0;
    }
  } else {
    for (const usage of usageByMessage.values()) {
      inputTokens += (usage.input_tokens ?? 0) + (usage.cache_creation_input_tokens ?? 0) + (usage.cache_read_input_tokens ?? 0);
      outputTokens += usage.output_tokens ?? 0;
    }
  }
  const isError = result === undefined || result.is_error === true || (result.subtype !== undefined && result.subtype !== "success");
  return {
    finalText: typeof result?.result === "string" && result.result !== "" ? result.result : lastMainText,
    inputTokens,
    outputTokens,
    toolCalls: toolIds.size,
    toolsByName,
    costUsd: result?.total_cost_usd,
    // Summed active time across results; the harness replaces it with measured wall-clock time.
    wallSeconds: resultCount === 0 ? undefined : durationMs / 1000,
    turns: result?.num_turns,
    isError,
    ...(isError ? { errorDetail: result ? `result subtype ${result.subtype ?? "unknown"}` : "no result event (killed or crashed)" } : {}),
  };
}
