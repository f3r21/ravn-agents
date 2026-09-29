/**
 * Typed failures. Each kind maps to a failure-mode id in FAILURE-MODES.md, and `retryable` is
 * decided here from the signal, never by reading prose later.
 */

export type ErrorKind =
  | "gh_missing"
  | "gh_auth"
  | "not_found"
  | "rate_limited"
  | "server_error"
  | "diff_too_large"
  | "line_not_in_diff"
  | "validation_failed"
  | "invalid_draft"
  | "invalid_input"
  | "network"
  | "head_moved"
  | "unknown";

export class ReviewError extends Error {
  readonly kind: ErrorKind;
  readonly retryable: boolean;
  /** Seconds to wait before a retry, from `retry-after` or `x-ratelimit-reset`. */
  readonly retryAfter: number | null;
  readonly detail: unknown;

  constructor(kind: ErrorKind, message: string, opts: { retryable?: boolean; retryAfter?: number | null; detail?: unknown } = {}) {
    super(message);
    this.name = "ReviewError";
    this.kind = kind;
    this.retryable = opts.retryable ?? false;
    this.retryAfter = opts.retryAfter ?? null;
    this.detail = opts.detail;
  }

  toJSON(): Record<string, unknown> {
    return { error: this.kind, retryable: this.retryable, retryAfter: this.retryAfter, message: this.message, detail: this.detail };
  }
}

/** Exit codes the skill branches on. */
export const EXIT = {
  ok: 0,
  terminal: 2,
  invalidDraft: 3,
  retryable: 4,
} as const;

export function exitCodeFor(err: ReviewError): number {
  if (err.kind === "invalid_draft") return EXIT.invalidDraft;
  return err.retryable ? EXIT.retryable : EXIT.terminal;
}

/**
 * Classifies a failed `gh` invocation from its stderr. `gh api` prints `HTTP <status>` and, with
 * `--include`, the response headers; both are used when present.
 */
export function classifyGhFailure(stderr: string, stdout = ""): ReviewError {
  const text = `${stderr}\n${stdout}`;
  const status = Number(/HTTP (\d{3})/.exec(text)?.[1] ?? /^HTTP\/[\d.]+ (\d{3})/m.exec(text)?.[1] ?? NaN);
  const retryAfterHeader = /retry-after:\s*(\d+)/i.exec(text)?.[1];
  const resetHeader = /x-ratelimit-reset:\s*(\d+)/i.exec(text)?.[1];
  const remaining = /x-ratelimit-remaining:\s*(\d+)/i.exec(text)?.[1];
  const retryAfter = retryAfterHeader
    ? Number(retryAfterHeader)
    : resetHeader
      ? Math.max(0, Number(resetHeader) - Math.floor(Date.now() / 1000))
      : null;
  const msg = stderr.trim().split("\n").slice(-3).join(" ").slice(0, 500) || `gh failed (HTTP ${status})`;

  if (/gh: command not found|ENOENT/.test(text)) return new ReviewError("gh_missing", "The GitHub CLI (gh) is not installed or not on PATH.");
  if (/auth login|not logged in|authentication required/i.test(text) || status === 401) {
    return new ReviewError("gh_auth", "gh is not authenticated for this host. Run `gh auth login`.");
  }
  if (status === 406 || /too_large|diff is taking too long|maximum number of (lines|files)/i.test(text)) {
    return new ReviewError("diff_too_large", "GitHub refused to render the diff (too large).", { detail: msg });
  }
  if (status === 429 || (status === 403 && (/rate limit|secondary rate/i.test(text) || remaining === "0" || retryAfterHeader))) {
    return new ReviewError("rate_limited", `GitHub rate limit: ${msg}`, { retryable: true, retryAfter: retryAfter ?? 60 });
  }
  if (status === 404 || /Could not resolve to a (PullRequest|Repository)/i.test(text)) {
    return new ReviewError("not_found", `Not found: ${msg}`);
  }
  if (status === 422) {
    if (/line must be part of the diff|pull_request_review_thread\.(line|start_line)|could not be resolved|is outside the diff/i.test(text)) {
      return new ReviewError("line_not_in_diff", `GitHub rejected an inline comment position: ${msg}`, { detail: msg });
    }
    return new ReviewError("validation_failed", `GitHub validation failed: ${msg}`, { detail: msg });
  }
  if (status >= 500 && status < 600) return new ReviewError("server_error", `GitHub server error ${status}`, { retryable: true, retryAfter: 5 });
  if (/ECONNRESET|ETIMEDOUT|EAI_AGAIN|connection reset|timeout/i.test(text)) {
    return new ReviewError("network", `Network failure talking to GitHub: ${msg}`, { retryable: true, retryAfter: 5 });
  }
  return new ReviewError("unknown", `gh failed: ${msg}`, { detail: msg });
}
