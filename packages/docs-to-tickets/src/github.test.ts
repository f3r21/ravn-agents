import { describe, expect, it } from "vitest";
import { classifyGitHubError, GitHubHttpError, GitHubNetworkError, parseRepo } from "./github.ts";
import { Pacer } from "./pacer.ts";

const http = (status: number, headers: Record<string, string> = {}, message = "x") => new GitHubHttpError(status, headers, message);

describe("classifyGitHubError", () => {
  const now = 1_000_000;

  it("primary rate limit waits until the reset time", () => {
    const c = classifyGitHubError(http(403, { "x-ratelimit-remaining": "0", "x-ratelimit-reset": String(now + 120) }), now);
    expect(c).toMatchObject({ category: "transient", retryable: true, retry_after_s: 120, failure_mode: "DT-GH-PRIMARY-RATE-LIMIT" });
  });

  it("secondary rate limit honours retry-after, else waits a minute", () => {
    expect(classifyGitHubError(http(403, { "retry-after": "30" }), now)).toMatchObject({ retry_after_s: 30, failure_mode: "DT-GH-SECONDARY-RATE-LIMIT" });
    expect(classifyGitHubError(http(403, {}, "You have exceeded a secondary rate limit"), now)).toMatchObject({ retry_after_s: 60 });
  });

  it("maps statuses to the taxonomy", () => {
    expect(classifyGitHubError(http(401), now)).toMatchObject({ category: "permission", failure_mode: "DT-GH-AUTH" });
    expect(classifyGitHubError(http(403), now)).toMatchObject({ category: "permission", retryable: false });
    expect(classifyGitHubError(http(404), now)).toMatchObject({ category: "permission", retryable: false });
    expect(classifyGitHubError(http(410), now)).toMatchObject({ category: "business", failure_mode: "DT-GH-ISSUES-DISABLED" });
    expect(classifyGitHubError(http(422), now)).toMatchObject({ category: "validation", retryable: false });
    expect(classifyGitHubError(http(502), now)).toMatchObject({ category: "transient", retryable: true });
    expect(classifyGitHubError(new GitHubNetworkError("timeout"), now)).toMatchObject({ category: "transient", failure_mode: "DT-GH-NETWORK" });
    expect(classifyGitHubError(new Error("boom"), now)).toMatchObject({ category: "business", retryable: false });
  });
});

describe("parseRepo", () => {
  it("accepts owner/name only", () => {
    expect(parseRepo("f3r21/ravn-ui-kit")).toEqual({ owner: "f3r21", repo: "ravn-ui-kit" });
    expect(parseRepo("https://github.com/a/b")).toBeNull();
    expect(parseRepo("a/b/c")).toBeNull();
  });
});

describe("Pacer", () => {
  it("runs calls one at a time, at least the gap apart", async () => {
    let clock = 0;
    const sleeps: number[] = [];
    const pacer = new Pacer(1000, () => clock, async (ms) => {
      sleeps.push(ms);
      clock += ms;
    });
    const starts: number[] = [];
    const call = () =>
      pacer.run(async () => {
        starts.push(clock);
        clock += 100;
      });
    await Promise.all([call(), call(), call()]);
    expect(starts).toEqual([0, 1100, 2200]);
    expect(sleeps).toEqual([1000, 1000]);
  });

  it("keeps pacing after a failed call", async () => {
    let clock = 0;
    const pacer = new Pacer(1000, () => clock, async (ms) => {
      clock += ms;
    });
    await expect(pacer.run(async () => Promise.reject(new Error("x")))).rejects.toThrow("x");
    await pacer.run(async () => undefined);
    expect(clock).toBe(1000);
  });
});
