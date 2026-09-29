import { describe, expect, it } from "vitest";
import { coverageGaps } from "./render.ts";
import { draft } from "./test/fixtures.ts";
import type { PrContext } from "./types.ts";

function context(over: Partial<PrContext> = {}): PrContext {
  return {
    repo: "f3r21/ravn-ui-kit", number: 145, title: "t", body: "", author: "f3r21",
    url: "https://github.com/f3r21/ravn-ui-kit/pull/145", baseSha: "a".repeat(40), headSha: "b".repeat(40),
    headRef: "fix/142", state: "MERGED", files: [], excluded: [], claudeMd: null,
    priorFingerprints: [], priorComments: [], diffSource: "diff", localCheckout: null,
    ...over,
  };
}

describe("coverageGaps", () => {
  it("lists a file once when prepare excluded it and the coordinator also reported it as not reviewed", () => {
    // Seen live on ravn-ui-kit#145: dist/index.js appeared twice in the summary.
    const ctx = context({ excluded: [{ path: "dist/index.js", reason: "build output in dist/" }] });
    const d = draft([], { notReviewed: [{ path: "dist/index.js", reason: "build output in dist/, excluded from review" }] });

    expect(coverageGaps(d, ctx)).toEqual(["`dist/index.js`: skipped (build output in dist/)"]);
  });

  it("keeps a not-reviewed file that prepare did not exclude", () => {
    const d = draft([], { notReviewed: [{ path: "src/big.ts", reason: "security finder failed twice" }] });

    expect(coverageGaps(d, context())).toEqual(["`src/big.ts`: not reviewed (security finder failed twice)"]);
  });
});
