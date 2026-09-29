/**
 * One error shape for every failure the tools report. The category follows the transient /
 * validation / business / permission split; `retryable` tells the agent whether trying again
 * can help, and `next_step` is the recovery hint the model reads.
 */
export type ErrorCategory = "transient" | "validation" | "business" | "permission";

export interface ToolErrorBody {
  category: ErrorCategory;
  retryable: boolean;
  retry_after_s?: number;
  /** Failure-mode id from FAILURE-MODES.md. */
  failure_mode: string;
  what_failed: string;
  what_was_done: string;
  next_step: string;
}

export class ToolError extends Error {
  readonly body: ToolErrorBody;
  constructor(body: ToolErrorBody) {
    super(body.what_failed);
    this.name = "ToolError";
    this.body = body;
  }
}

/** MCP tool result: JSON in the text block, because the text is what the model reads. */
export interface ToolResult {
  [key: string]: unknown;
  content: { type: "text"; text: string }[];
  isError?: boolean;
}

export function ok(data: unknown): ToolResult {
  return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
}

export function fail(body: ToolErrorBody): ToolResult {
  return { content: [{ type: "text", text: JSON.stringify({ error: body }, null, 2) }], isError: true };
}

/** Converts anything a handler throws into a typed tool error; unknown errors are not retried. */
export function toFailure(error: unknown, whatWasDone: string): ToolResult {
  if (error instanceof ToolError) return fail({ ...error.body, what_was_done: error.body.what_was_done || whatWasDone });
  const message = error instanceof Error ? error.message : String(error);
  return fail({
    category: "business",
    retryable: false,
    failure_mode: "DT-UNEXPECTED",
    what_failed: `Unexpected error: ${message}`,
    what_was_done: whatWasDone,
    next_step: "Stop the batch and report this error to the user with the manifest; do not retry blindly.",
  });
}
