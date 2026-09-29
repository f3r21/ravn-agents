import { describe, expect, it } from "vitest";
import { GitHub, parsePrRef, type Runner } from "./github.ts";

describe("parsePrRef", () => {
  it.each([
    ["https://github.com/f3r21/ravn-ui-kit/pull/145", undefined, { repo: "f3r21/ravn-ui-kit", number: 145 }],
    ["f3r21/ravn-ui-kit#145", undefined, { repo: "f3r21/ravn-ui-kit", number: 145 }],
    ["145", "f3r21/ravn-ui-kit", { repo: "f3r21/ravn-ui-kit", number: 145 }],
  ])("%s", (arg, repo, expected) => {
    expect(parsePrRef(arg, repo)).toEqual(expected);
  });

  it("rejects a bare number without a repo, and junk", () => {
    expect(() => parsePrRef("145")).toThrow(/--repo/);
    expect(() => parsePrRef("not-a-pr")).toThrow(/Not a PR reference/);
  });
});

describe("postReview", () => {
  it("retries a rate limit serially, waiting what GitHub asked, then succeeds", async () => {
    const waits: number[] = [];
    let calls = 0;
    const run: Runner = async () => {
      calls++;
      return calls < 3 ? { code: 1, stdout: "", stderr: "HTTP 429\nretry-after: 7" } : { code: 0, stdout: '{"id":1,"html_url":"u"}', stderr: "" };
    };
    const res = await new GitHub(run).postReview({ repo: "o/r", number: 1 }, { commit_id: "x", event: "COMMENT", body: "b", comments: [] }, { sleep: async (s) => void waits.push(s) });
    expect(res.html_url).toBe("u");
    expect(waits).toEqual([7, 7]);
  });

  it("gives up after the attempt budget with the typed error", async () => {
    const run: Runner = async () => ({ code: 1, stdout: "", stderr: "HTTP 502" });
    await expect(
      new GitHub(run).postReview({ repo: "o/r", number: 1 }, { commit_id: "x", event: "COMMENT", body: "b", comments: [] }, { sleep: async () => {} }),
    ).rejects.toMatchObject({ kind: "server_error", retryable: true });
  });
});
