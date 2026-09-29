import { describe, expect, it } from "vitest";
import { EXIT, classifyGhFailure, exitCodeFor } from "./errors.ts";

describe("classifyGhFailure", () => {
  it.each([
    ["HTTP 406: Sorry, the diff exceeded the maximum number of lines (20000) (too_large)", "diff_too_large", false],
    ["HTTP 429: API rate limit exceeded\nretry-after: 30", "rate_limited", true],
    ["HTTP 403: You have exceeded a secondary rate limit", "rate_limited", true],
    ["HTTP 422: Validation Failed (pull_request_review_thread.line must be part of the diff)", "line_not_in_diff", false],
    ["HTTP 422: Validation Failed", "validation_failed", false],
    ["HTTP 502: Bad Gateway", "server_error", true],
    ["GraphQL: Could not resolve to a PullRequest with the number of 9.", "not_found", false],
    ["To get started with GitHub CLI, please run:  gh auth login", "gh_auth", false],
  ])("%s -> %s", (stderr, kind, retryable) => {
    const e = classifyGhFailure(stderr);
    expect(e.kind).toBe(kind);
    expect(e.retryable).toBe(retryable);
  });

  it("uses retry-after when GitHub sends it", () => {
    expect(classifyGhFailure("HTTP 429\nretry-after: 17").retryAfter).toBe(17);
  });

  it("maps kinds to the exit codes the skill branches on", () => {
    expect(exitCodeFor(classifyGhFailure("HTTP 502"))).toBe(EXIT.retryable);
    expect(exitCodeFor(classifyGhFailure("HTTP 406 too_large"))).toBe(EXIT.terminal);
  });
});
